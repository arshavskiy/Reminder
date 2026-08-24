/**
 * Backfill lifetime usage counters on users from current DB rows.
 * Counters only increase going forward — deletes never free quota.
 *
 * Usage:
 *   npx tsx src/scripts/backfillUsageCounters.ts
 *   npx tsx src/scripts/backfillUsageCounters.ts --dry-run
 *   npx tsx src/scripts/backfillUsageCounters.ts --local-only
 *   npx tsx src/scripts/backfillUsageCounters.ts --atlas-only
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { MongoClient, ObjectId, type Db } from "mongodb";

type Usage = {
  documents: number;
  reminders: number;
  scannedDocuments: number;
  gmailDocuments: number;
  gmailInvoices: number;
};

const dryRun = process.argv.includes("--dry-run");
const localOnly = process.argv.includes("--local-only");
const atlasOnly = process.argv.includes("--atlas-only");
const dbName = process.env.MONGODB_DB || "reminder-app";

const atlasUri = process.env.MONGODB_URI ?? "";
const localUri = process.env.MONGODB_LOCAL_URI
  || (process.env.MONGODB_URI?.includes("127.0.0.1") || process.env.MONGODB_URI?.includes("localhost")
    ? process.env.MONGODB_URI
    : "mongodb://127.0.0.1:27017");

function empty(): Usage {
  return { documents: 0, reminders: 0, scannedDocuments: 0, gmailDocuments: 0, gmailInvoices: 0 };
}

function mergeFloor(a: Usage, b: Usage): Usage {
  return {
    documents: Math.max(a.documents, b.documents),
    reminders: Math.max(a.reminders, b.reminders),
    scannedDocuments: Math.max(a.scannedDocuments, b.scannedDocuments),
    gmailDocuments: Math.max(a.gmailDocuments, b.gmailDocuments),
    gmailInvoices: Math.max(a.gmailInvoices, b.gmailInvoices),
  };
}

async function computeLive(db: Db, userId: string): Promise<Usage> {
  const [gmailImports, documents, invoices, reminders] = await Promise.all([
    db.collection("gmail_imports").find({ user_id: userId }, { projection: { files: 1 } }).toArray(),
    db.collection("documents").find(
      { user_id: userId, document_kind: { $ne: "certificate" } },
      { projection: { _id: 1, document_kind: 1, invoice_saved: 1, invoice_rejected: 1 } },
    ).toArray(),
    db.collection("invoices").find({ user_id: userId }, { projection: { document_id: 1 } }).toArray(),
    db.collection("reminders").countDocuments({ user_id: userId }),
  ]);

  const gmailDocumentIds = new Set<string>();
  for (const item of gmailImports) {
    for (const file of (item.files as Array<{ document_id?: unknown }> | undefined) ?? []) {
      const id = String(file.document_id ?? "").trim();
      if (id) gmailDocumentIds.add(id);
    }
  }

  const invoiceDocumentIds = new Set(
    invoices.map((invoice) => String(invoice.document_id ?? "").trim()).filter(Boolean),
  );

  let scannedDocuments = 0;
  let gmailDocuments = 0;
  let gmailInvoices = 0;

  for (const doc of documents) {
    const id = doc._id.toString();
    const isInvoice = doc.document_kind === "invoice"
      || doc.invoice_saved === true
      || doc.invoice_rejected === true
      || invoiceDocumentIds.has(id);
    const fromGmail = gmailDocumentIds.has(id);
    if (fromGmail) {
      if (isInvoice) gmailInvoices += 1;
      else gmailDocuments += 1;
    } else {
      scannedDocuments += 1;
    }
  }

  return {
    documents: documents.length,
    reminders,
    scannedDocuments,
    gmailDocuments,
    gmailInvoices,
  };
}

async function backfillDb(label: string, uri: string): Promise<void> {
  const safeUri = uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
  console.log(`\n=== ${label} ===`);
  console.log(`uri: ${safeUri}`);
  console.log(`db:  ${dbName}`);

  const client = new MongoClient(uri);
  try {
    await client.connect();
  } catch (err) {
    console.error(`FAILED to connect (${label}):`, err instanceof Error ? err.message : err);
    return;
  }

  try {
    const db = client.db(dbName);
    const users = await db.collection("users").find({}, { projection: { email: 1, usage: 1, plan: 1, role: 1 } }).toArray();
    console.log(`users: ${users.length}${dryRun ? " (dry-run)" : ""}`);

    let updated = 0;
    for (const user of users) {
      const userId = user._id.toString();
      const live = await computeLive(db, userId);
      const existing = {
        documents: Number(user.usage?.documents ?? 0) || 0,
        reminders: Number(user.usage?.reminders ?? 0) || 0,
        scannedDocuments: Number(user.usage?.scannedDocuments ?? 0) || 0,
        gmailDocuments: Number(user.usage?.gmailDocuments ?? 0) || 0,
        gmailInvoices: Number(user.usage?.gmailInvoices ?? 0) || 0,
      };
      const next = mergeFloor(existing, live);
      const changed = JSON.stringify(existing) !== JSON.stringify(next);
      console.log(
        `  ${user.email ?? userId} plan=${user.plan ?? user.role ?? "?"} `
        + `docs=${next.documents} rem=${next.reminders} `
        + `scan=${next.scannedDocuments} gmailDoc=${next.gmailDocuments} gmailInv=${next.gmailInvoices}`
        + (changed ? " *" : ""),
      );
      if (!changed || dryRun) continue;
      await db.collection("users").updateOne(
        { _id: user._id instanceof ObjectId ? user._id : new ObjectId(userId) },
        { $set: { usage: next, updated_at: new Date() } },
      );
      updated += 1;
    }
    console.log(`updated: ${updated}`);
  } finally {
    await client.close();
  }
}

const targets: Array<{ label: string; uri: string }> = [];
if (!atlasOnly) targets.push({ label: "local", uri: localUri });
if (!localOnly && atlasUri && !atlasUri.includes("127.0.0.1") && !atlasUri.includes("localhost")) {
  targets.push({ label: "atlas", uri: atlasUri });
} else if (!localOnly && atlasUri && targets.every((t) => t.uri !== atlasUri)) {
  targets.push({ label: "primary", uri: atlasUri });
}

if (!targets.length) {
  console.error("No Mongo URIs configured");
  process.exit(1);
}

for (const target of targets) {
  await backfillDb(target.label, target.uri);
}

console.log("\nDone.");
