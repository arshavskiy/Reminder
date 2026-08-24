/**
 * Remove failed/rejected Gmail-import artifacts for one user.
 *
 * Dry-run by default:
 *   npx tsx src/scripts/cleanupRejectedGmailImports.ts --user-id <id>
 *
 * Apply:
 *   npx tsx src/scripts/cleanupRejectedGmailImports.ts --user-id <id> --apply
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { existsSync, unlinkSync } from "fs";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { deleteFromSpaces } from "../storage/spaces";

type GmailImportRow = {
  _id: ObjectId;
  user_id: string;
  message_id: string;
  files?: Array<{ filename?: string; document_id?: unknown; error?: unknown }>;
};

type DocumentRow = {
  _id: ObjectId;
  file_name?: string | null;
  file_path?: string | null;
  spaces_key?: string | null;
  thumbnail_key?: string | null;
  processing_status?: string | null;
  invoice_rejected?: boolean;
};

const REJECTED_INVOICE_STATUSES = new Set([
  "missing_required_fields",
  "missing_invoice_number_and_amount",
]);

const apply = process.argv.includes("--apply");
const userId = readArg("--user-id");
const dbName = process.env.MONGODB_DB || "reminder-app";
const uri = process.env.MONGODB_URI || process.env.MONGODB_LOCAL_URI || "mongodb://127.0.0.1:27017";

if (!userId) {
  console.error("Missing --user-id. This cleanup is intentionally scoped to one user.");
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

  const gmailImports = await db.collection<GmailImportRow>("gmail_imports")
    .find({ user_id: userId }, { projection: { user_id: 1, message_id: 1, files: 1 } })
    .toArray();
  const documentIds = [...new Set(gmailImports.flatMap((row) => documentIdsFromFiles(row.files)))];
  const documents = documentIds.length
    ? await db.collection<DocumentRow>("documents").find(
      { user_id: userId, _id: { $in: documentIds.map((id) => new ObjectId(id)) } },
      { projection: { _id: 1, file_name: 1, file_path: 1, spaces_key: 1, thumbnail_key: 1, processing_status: 1, invoice_rejected: 1 } },
    ).toArray()
    : [];
  const invoices = documentIds.length
    ? await db.collection("invoices").find(
      { user_id: userId, document_id: { $in: documentIdQueryValues(documentIds) } },
      { projection: { _id: 1, document_id: 1, possible_not_invoice: 1, invoice_validation_status: 1, missing_required_fields: 1 } },
    ).toArray()
    : [];

  const documentMap = new Map(documents.map((doc) => [doc._id.toString(), doc]));
  const rejectedDocumentIds = new Set<string>();
  for (const doc of documents) {
    if (isRejectedDocument(doc)) rejectedDocumentIds.add(doc._id.toString());
  }
  for (const invoice of invoices as Array<Record<string, unknown>>) {
    const documentId = String(invoice.document_id ?? "").trim();
    if (ObjectId.isValid(documentId) && isRejectedInvoice(invoice)) {
      rejectedDocumentIds.add(documentId);
    }
  }

  const importUpdates = gmailImports.map((row) => {
    const files = row.files ?? [];
    const keptFiles = files.filter((file) => isSuccessfulFile(file, documentMap, rejectedDocumentIds));
    const removedFiles = files.filter((file) => !keptFiles.includes(file));
    return { row, keptFiles, removedFiles };
  }).filter((entry) => entry.removedFiles.length > 0);

  const importRowsToDelete = importUpdates.filter((entry) => entry.keptFiles.length === 0).map((entry) => entry.row._id);
  const importRowsToTrim = importUpdates.filter((entry) => entry.keptFiles.length > 0);
  const docsToDelete = [...rejectedDocumentIds].filter((id) => documentMap.has(id));
  const docIdValues = documentIdQueryValues(docsToDelete);

  const derivedCounts = docsToDelete.length ? {
    extractions: await db.collection("extractions").countDocuments({ document_id: { $in: docIdValues } }),
    tasks: await db.collection("tasks").countDocuments({ user_id: userId, document_id: { $in: docIdValues } }),
    invoices: await db.collection("invoices").countDocuments({ user_id: userId, document_id: { $in: docIdValues } }),
    document_clients: await db.collection("document_clients").countDocuments({ document_id: { $in: docIdValues } }),
    timeline_events: await db.collection("timeline_events").countDocuments({ source_type: "document", source_id: { $in: docsToDelete } }),
    reminders: await db.collection("reminders").countDocuments({ user_id: userId, document_id: { $in: docIdValues } }),
    contracts: await db.collection("contracts").countDocuments({ user_id: userId, document_id: { $in: docIdValues } }),
    equipment: await db.collection("equipment").countDocuments({ user_id: userId, document_id: { $in: docIdValues } }),
  } : emptyDerivedCounts();

  const beforeUsage = normalizeUsage(user.usage);
  const liveUsageAfter = await computeLiveUsageAfter(db, userId, new Set(docsToDelete), new Set(importRowsToDelete.map(String)));
  const summary = {
    applied: apply,
    user_id: userId,
    email: user.email ?? null,
    db: dbName,
    uri: uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@"),
    gmail_import_messages_scanned: gmailImports.length,
    gmail_import_messages_deleted: importRowsToDelete.length,
    gmail_import_messages_trimmed: importRowsToTrim.length,
    files_removed_from_history: importUpdates.reduce((sum, entry) => sum + entry.removedFiles.length, 0),
    rejected_documents_deleted: docsToDelete.length,
    derivedCounts,
    usage_before: beforeUsage,
    live_usage_after_cleanup: liveUsageAfter,
    sample_documents: docsToDelete.slice(0, 20).map((id) => {
      const doc = documentMap.get(id);
      return {
        id,
        file_name: doc?.file_name ?? null,
        processing_status: doc?.processing_status ?? null,
        invoice_rejected: doc?.invoice_rejected ?? null,
        spaces_key: doc?.spaces_key ?? null,
      };
    }),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to delete rejected Gmail artifacts.");
    process.exit(0);
  }

  for (const id of docsToDelete) {
    const doc = documentMap.get(id);
    if (!doc) continue;
    if (doc.spaces_key) await deleteFromSpaces(doc.spaces_key).catch(() => {});
    if (doc.thumbnail_key) await deleteFromSpaces(doc.thumbnail_key).catch(() => {});
    if (doc.file_path && existsSync(doc.file_path)) {
      try { unlinkSync(doc.file_path); } catch {}
    }
  }

  if (docsToDelete.length) {
    await Promise.all([
      db.collection("extractions").deleteMany({ document_id: { $in: docIdValues } }),
      db.collection("tasks").deleteMany({ user_id: userId, document_id: { $in: docIdValues } }),
      db.collection("invoices").deleteMany({ user_id: userId, document_id: { $in: docIdValues } }),
      db.collection("document_clients").deleteMany({ document_id: { $in: docIdValues } }),
      db.collection("timeline_events").deleteMany({ source_type: "document", source_id: { $in: docsToDelete } }),
      db.collection("reminders").deleteMany({ user_id: userId, document_id: { $in: docIdValues } }),
      db.collection("contracts").deleteMany({ user_id: userId, document_id: { $in: docIdValues } }),
      db.collection("equipment").deleteMany({ user_id: userId, document_id: { $in: docIdValues } }),
      db.collection("documents").deleteMany({ user_id: userId, _id: { $in: docsToDelete.map((id) => new ObjectId(id)) } }),
    ]);
  }

  if (importRowsToDelete.length) {
    await db.collection("gmail_imports").deleteMany({ user_id: userId, _id: { $in: importRowsToDelete } });
  }
  for (const entry of importRowsToTrim) {
    await db.collection("gmail_imports").updateOne(
      { _id: entry.row._id, user_id: userId },
      { $set: { files: entry.keptFiles } },
    );
  }

  console.log("\nCleanup applied.");
} finally {
  await client.close();
}

function documentIdsFromFiles(files: GmailImportRow["files"]): string[] {
  return (files ?? [])
    .map((file) => String(file.document_id ?? "").trim())
    .filter((id) => ObjectId.isValid(id));
}

function documentIdQueryValues(ids: string[]): Array<string | ObjectId> {
  return [
    ...ids,
    ...ids.map((id) => new ObjectId(id)),
  ];
}

function isRejectedDocument(doc: DocumentRow): boolean {
  return doc.processing_status === "error" || doc.invoice_rejected === true;
}

function isRejectedInvoice(invoice: Record<string, unknown>): boolean {
  if (invoice.possible_not_invoice === true) return true;
  const status = String(invoice.invoice_validation_status ?? "").trim();
  if (REJECTED_INVOICE_STATUSES.has(status)) return true;
  return Array.isArray(invoice.missing_required_fields) && invoice.missing_required_fields.length > 0;
}

function isSuccessfulFile(
  file: { document_id?: unknown; error?: unknown },
  documentMap: Map<string, DocumentRow>,
  rejectedDocumentIds: Set<string>,
): boolean {
  if (file.error) return false;
  const documentId = String(file.document_id ?? "").trim();
  if (!ObjectId.isValid(documentId)) return false;
  if (rejectedDocumentIds.has(documentId)) return false;
  const doc = documentMap.get(documentId);
  return Boolean(doc);
}

async function computeLiveUsageAfter(
  db: Db,
  ownerUserId: string,
  removedDocumentIds: Set<string>,
  removedImportRowIds: Set<string>,
) {
  const [gmailImports, documents, invoices, reminders] = await Promise.all([
    db.collection("gmail_imports").find({ user_id: ownerUserId }, { projection: { _id: 1, files: 1 } }).toArray(),
    db.collection("documents").find(
      { user_id: ownerUserId, document_kind: { $ne: "certificate" } },
      { projection: { _id: 1, document_kind: 1, invoice_saved: 1, invoice_rejected: 1 } },
    ).toArray(),
    db.collection("invoices").find({ user_id: ownerUserId }, { projection: { document_id: 1 } }).toArray(),
    db.collection("reminders").countDocuments({ user_id: ownerUserId }),
  ]);

  const gmailDocumentIds = new Set<string>();
  for (const item of gmailImports as Array<{ _id: ObjectId; files?: Array<{ document_id?: unknown }> }>) {
    if (removedImportRowIds.has(item._id.toString())) continue;
    for (const file of item.files ?? []) {
      const id = String(file.document_id ?? "").trim();
      if (ObjectId.isValid(id) && !removedDocumentIds.has(id)) gmailDocumentIds.add(id);
    }
  }

  const invoiceDocumentIds = new Set(
    invoices
      .map((invoice) => String(invoice.document_id ?? "").trim())
      .filter((id) => ObjectId.isValid(id) && !removedDocumentIds.has(id)),
  );

  let scannedDocuments = 0;
  let gmailDocuments = 0;
  let gmailInvoices = 0;

  for (const doc of documents as Array<{ _id: ObjectId; document_kind?: string; invoice_saved?: boolean; invoice_rejected?: boolean }>) {
    const id = doc._id.toString();
    if (removedDocumentIds.has(id)) continue;
    const isInvoice = doc.document_kind === "invoice"
      || doc.invoice_saved === true
      || doc.invoice_rejected === true
      || invoiceDocumentIds.has(id);
    if (gmailDocumentIds.has(id)) {
      if (isInvoice) gmailInvoices += 1;
      else gmailDocuments += 1;
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

function emptyDerivedCounts() {
  return {
    extractions: 0,
    tasks: 0,
    invoices: 0,
    document_clients: 0,
    timeline_events: 0,
    reminders: 0,
    contracts: 0,
    equipment: 0,
  };
}

function normalizeUsage(raw: unknown) {
  const usage = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
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
