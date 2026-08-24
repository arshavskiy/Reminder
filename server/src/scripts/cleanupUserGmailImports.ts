/**
 * Clean a single user's Gmail import state so they can import again.
 *
 * Dry-run by default:
 *   npx tsx src/scripts/cleanupUserGmailImports.ts --user-id <id>
 *
 * Apply:
 *   npx tsx src/scripts/cleanupUserGmailImports.ts --user-id <id> --apply
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { existsSync, unlinkSync } from "fs";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { deleteFromSpaces } from "../storage/spaces";

type Usage = {
  documents: number;
  reminders: number;
  scannedDocuments: number;
  gmailDocuments: number;
  gmailInvoices: number;
};

const apply = process.argv.includes("--apply");
const userId = readArg("--user-id");
const dbName = process.env.MONGODB_DB || "reminder-app";
const uri = process.env.MONGODB_URI || process.env.MONGODB_LOCAL_URI || "mongodb://127.0.0.1:27017";

if (!userId) {
  console.error("Missing --user-id");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();

try {
  const db = client.db(dbName);
  const user = await db.collection("users").findOne(userIdFilter(userId), {
    projection: { email: 1, usage: 1 },
  });
  if (!user) {
    console.error(`User not found: ${userId}`);
    process.exit(1);
  }

  const beforeUsage = normalizeUsage(user.usage);
  const gmailImports = await db.collection("gmail_imports")
    .find({ user_id: userId }, { projection: { message_id: 1, files: 1 } })
    .toArray();
  const gmailDocumentIds = [...new Set(
    gmailImports.flatMap((item) => ((item.files ?? []) as Array<{ document_id?: unknown }>)
      .map((file) => String(file.document_id ?? "").trim())
      .filter((id) => ObjectId.isValid(id))),
  )];
  const gmailObjectIds = gmailDocumentIds.map((id) => new ObjectId(id));
  const gmailDocs = gmailObjectIds.length
    ? await db.collection("documents").find(
      { user_id: userId, _id: { $in: gmailObjectIds } },
      { projection: { _id: 1, file_name: 1, file_path: 1, spaces_key: 1, thumbnail_key: 1 } },
    ).toArray()
    : [];

  const docIdValues = [
    ...gmailDocumentIds,
    ...gmailObjectIds,
  ];
  const derivedCounts = docIdValues.length ? {
    extractions: await db.collection("extractions").countDocuments({ document_id: { $in: docIdValues } }),
    tasks: await db.collection("tasks").countDocuments({ user_id: userId, document_id: { $in: docIdValues } }),
    invoices: await db.collection("invoices").countDocuments({ user_id: userId, document_id: { $in: docIdValues } }),
    document_clients: await db.collection("document_clients").countDocuments({ document_id: { $in: docIdValues } }),
    reminders: await db.collection("reminders").countDocuments({ user_id: userId, document_id: { $in: docIdValues } }),
    contracts: await db.collection("contracts").countDocuments({ user_id: userId, document_id: { $in: docIdValues } }),
    equipment: await db.collection("equipment").countDocuments({ user_id: userId, document_id: { $in: docIdValues } }),
  } : {
    extractions: 0,
    tasks: 0,
    invoices: 0,
    document_clients: 0,
    reminders: 0,
    contracts: 0,
    equipment: 0,
  };

  const afterUsage = await computeUsageAfterCleanup(db, userId, new Set(gmailDocumentIds));
  const safeUri = uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
  const summary = {
    applied: apply,
    user_id: userId,
    email: user.email ?? null,
    db: dbName,
    uri: safeUri,
    gmail_import_messages: gmailImports.length,
    gmail_document_refs: gmailDocumentIds.length,
    gmail_documents_found: gmailDocs.length,
    derivedCounts,
    usage_before: beforeUsage,
    usage_after: afterUsage,
    sample_documents: gmailDocs.slice(0, 20).map((doc) => ({
      id: doc._id.toString(),
      file_name: doc.file_name ?? null,
      spaces_key: doc.spaces_key ?? null,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to delete these Gmail import records and reset counters.");
    process.exit(0);
  }

  for (const doc of gmailDocs) {
    if (typeof doc.spaces_key === "string" && doc.spaces_key) {
      await deleteFromSpaces(doc.spaces_key).catch(() => {});
    }
    if (typeof doc.thumbnail_key === "string" && doc.thumbnail_key) {
      await deleteFromSpaces(doc.thumbnail_key).catch(() => {});
    }
    if (typeof doc.file_path === "string" && existsSync(doc.file_path)) {
      try { unlinkSync(doc.file_path); } catch {}
    }
  }

  if (docIdValues.length) {
    await Promise.all([
      db.collection("extractions").deleteMany({ document_id: { $in: docIdValues } }),
      db.collection("tasks").deleteMany({ user_id: userId, document_id: { $in: docIdValues } }),
      db.collection("invoices").deleteMany({ user_id: userId, document_id: { $in: docIdValues } }),
      db.collection("document_clients").deleteMany({ document_id: { $in: docIdValues } }),
      db.collection("timeline_events").deleteMany({ source_type: "document", source_id: { $in: gmailDocumentIds } }),
      db.collection("reminders").deleteMany({ user_id: userId, document_id: { $in: docIdValues } }),
      db.collection("contracts").deleteMany({ user_id: userId, document_id: { $in: docIdValues } }),
      db.collection("equipment").deleteMany({ user_id: userId, document_id: { $in: docIdValues } }),
      db.collection("documents").deleteMany({ user_id: userId, _id: { $in: gmailObjectIds } }),
    ]);
  }

  await db.collection("gmail_imports").deleteMany({ user_id: userId });
  await db.collection("users").updateOne(
    userIdFilter(userId),
    { $set: { usage: afterUsage, updated_at: new Date() } },
  );

  console.log("\nCleanup applied.");
} finally {
  await client.close();
}

async function computeUsageAfterCleanup(db: Db, ownerUserId: string, removedGmailDocIds: Set<string>): Promise<Usage> {
  const [documents, invoices, reminders] = await Promise.all([
    db.collection("documents").find(
      { user_id: ownerUserId, document_kind: { $ne: "certificate" } },
      { projection: { _id: 1, document_kind: 1, invoice_saved: 1, invoice_rejected: 1 } },
    ).toArray(),
    db.collection("invoices").find({ user_id: ownerUserId }, { projection: { document_id: 1 } }).toArray(),
    db.collection("reminders").countDocuments({ user_id: ownerUserId }),
  ]);

  const invoiceDocumentIds = new Set(
    invoices.map((invoice) => String(invoice.document_id ?? "").trim()).filter(Boolean),
  );

  let scannedDocuments = 0;
  let gmailDocuments = 0;
  let gmailInvoices = 0;

  for (const doc of documents) {
    const id = doc._id.toString();
    if (removedGmailDocIds.has(id)) continue;
    const isInvoice = doc.document_kind === "invoice"
      || doc.invoice_saved === true
      || doc.invoice_rejected === true
      || invoiceDocumentIds.has(id);
    if (isInvoice) {
      scannedDocuments += 1;
    } else {
      scannedDocuments += 1;
    }
  }

  return {
    documents: scannedDocuments + gmailDocuments + gmailInvoices,
    reminders,
    scannedDocuments,
    gmailDocuments,
    gmailInvoices,
  };
}

function normalizeUsage(raw: unknown): Usage {
  const usage = raw && typeof raw === "object" ? raw as Partial<Usage> : {};
  return {
    documents: nonNeg(usage.documents),
    reminders: nonNeg(usage.reminders),
    scannedDocuments: nonNeg(usage.scannedDocuments),
    gmailDocuments: nonNeg(usage.gmailDocuments),
    gmailInvoices: nonNeg(usage.gmailInvoices),
  };
}

function userIdFilter(id: string): Record<string, unknown> {
  return ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}

function nonNeg(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
