import {ObjectId} from "mongodb";
import {MongoClient} from "mongodb";
import dotenv from "dotenv";

dotenv.config({path: ".env.local"});
dotenv.config();

const apply = process.argv.includes("--apply");
const atlas = process.argv.includes("--atlas");
const userId = readArg("--user-id");
const dbName = process.env.MONGODB_DB || "reminder-app";
const uri = atlas
  ? process.env.MONGODB_URI
  : process.env.MONGODB_LOCAL_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";

if (!uri) {
  console.error(atlas ? "Missing MONGODB_URI" : "Missing MongoDB connection string");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();

try {
  const db = client.db(dbName);
  const invoiceFilter: Record<string, unknown> = {
    $or: [
      {possible_not_invoice: true},
      {invoice_validation_status: {$exists: true, $nin: [null, "", "valid"]}},
      {missing_required_fields: {$exists: true, $ne: []}},
    ],
  };
  if (userId) invoiceFilter.user_id = userId;

  const documentFilter: Record<string, unknown> = {
    $or: [
      {invoice_rejected: true},
      {invoice_rejection_reason: {$exists: true, $nin: [null, ""]}},
      {invoice_missing_fields: {$exists: true, $ne: []}},
    ],
  };
  if (userId) documentFilter.user_id = userId;

  const [invoices, documents] = await Promise.all([
    db.collection("invoices").find(invoiceFilter as any, {
      projection: {_id: 1, invoice_validation_status: 1, missing_required_fields: 1},
    } as any).toArray(),
    db.collection("documents").find(documentFilter as any, {
      projection: {_id: 1, invoice_rejection_reason: 1, invoice_missing_fields: 1},
    } as any).toArray(),
  ]);

  let invoiceUpdates = 0;
  let documentUpdates = 0;
  if (apply) {
    for (const invoice of invoices as Array<Record<string, any>>) {
      const reason = stringValue(invoice.invoice_validation_status) ?? "missing_required_fields";
      const label = invoiceRejectionLabel(reason, arrayOfStrings(invoice.missing_required_fields));
      await db.collection("invoices").updateOne({_id: invoice._id} as any, {$set: {invoice_rejection_label: label, updated_at: new Date()}} as any);
      invoiceUpdates += 1;
    }
    for (const doc of documents as Array<Record<string, any>>) {
      const reason = stringValue(doc.invoice_rejection_reason) ?? "missing_required_fields";
      const label = invoiceRejectionLabel(reason, arrayOfStrings(doc.invoice_missing_fields));
      await db.collection("documents").updateOne({_id: doc._id} as any, {$set: {invoice_rejection_label: label, updated_at: new Date()}} as any);
      documentUpdates += 1;
    }
  }

  console.log(JSON.stringify({
    applied: apply,
    atlas,
    db: dbName,
    uri: uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@"),
    user_id: userId ?? null,
    invoice_candidates: invoices.length,
    document_candidates: documents.length,
    invoice_updates: invoiceUpdates,
    document_updates: documentUpdates,
    sample_invoice_labels: (invoices as Array<Record<string, any>>).slice(0, 10).map((invoice) => ({
      id: objectIdString(invoice._id),
      label: invoiceRejectionLabel(stringValue(invoice.invoice_validation_status) ?? "missing_required_fields", arrayOfStrings(invoice.missing_required_fields)),
    })),
    sample_document_labels: (documents as Array<Record<string, any>>).slice(0, 10).map((doc) => ({
      id: objectIdString(doc._id),
      label: invoiceRejectionLabel(stringValue(doc.invoice_rejection_reason) ?? "missing_required_fields", arrayOfStrings(doc.invoice_missing_fields)),
    })),
  }, null, 2));

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write invoice_rejection_label.");
  }
} finally {
  await client.close();
}

function invoiceRejectionLabel(reason: string, missingFields: string[] = []): string {
  const labels: Record<string, string> = {
    missing_invoice_number_and_amount: "חסר מספר חשבונית וסכום - כנראה לא חשבונית",
    missing_required_fields: "חסרים שדות חובה לחשבונית",
    not_invoice: "המסמך לא זוהה כחשבונית",
    rejected: "החשבונית נדחתה",
  };
  const base = labels[reason] ?? "המסמך נדחה כחשבונית";
  return missingFields.length ? `${base}: ${missingFields.join(", ")}` : base;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

function stringValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function objectIdString(value: unknown): string {
  if (value instanceof ObjectId) return value.toString();
  return String(value ?? "");
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}
