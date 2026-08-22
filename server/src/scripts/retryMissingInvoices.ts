import {extname} from "path";
import {config} from "dotenv";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb} from "../db/db";
import {resolveDocumentFilePath} from "../documents/fileResolver";
import {processDocument} from "../pipeline/importer";

type InvoiceRow = Record<string, any>;

config();

const apply = process.argv.includes("--apply");
const limit = readNumberArg("--limit");
const userId = readArg("--user-id");

if (apply && !process.env.OPENAI_LOCAL_API_KEY) {
  console.error("OPENAI_LOCAL_API_KEY is required before retrying missing invoice extraction.");
  process.exit(1);
}

await connectDb();

try {
  const invoiceFilter: Record<string, unknown> = {
    $or: [
      {possible_not_invoice: true},
      {invoice_validation_status: "missing_required_fields"},
      {missing_required_fields: {$exists: true, $ne: []}},
    ],
  };
  if (userId) invoiceFilter.user_id = userId;

  const invoices = await col("invoices")
    .find(invoiceFilter as any)
    .sort({updated_at: -1, created_at: -1} as any)
    .limit(limit ?? 500)
    .toArray() as InvoiceRow[];

  const candidates = invoices
    .map((invoice) => ({
      invoiceId: invoice._id?.toString?.() ?? String(invoice._id),
      documentId: String(invoice.document_id ?? ""),
      userId: String(invoice.user_id ?? ""),
    }))
    .filter((row) => ObjectId.isValid(row.documentId) && row.userId);

  let retried = 0;
  let failed = 0;
  const errors: Array<{ document_id: string; error: string }> = [];

  if (apply) {
    for (const candidate of candidates) {
      try {
        await retryDocument(candidate.documentId, candidate.userId);
        retried += 1;
      } catch (err) {
        failed += 1;
        errors.push({document_id: candidate.documentId, error: String(err)});
      }
    }
  }

  console.log(JSON.stringify({
    candidates: candidates.length,
    retried,
    failed,
    applied: apply,
    limit: limit ?? null,
    user_id: userId ?? null,
    errors: errors.slice(0, 20),
  }, null, 2));
} finally {
  await closeDb();
}

async function retryDocument(documentId: string, ownerUserId: string): Promise<void> {
  const filter = {_id: new ObjectId(documentId), user_id: ownerUserId};
  const doc = await col("documents").findOne(filter as any) as Record<string, any> | null;
  if (!doc) throw new Error("document_not_found");
  if (doc.document_source === "generated") throw new Error("generated_document_not_supported");
  const previousInvoice = await col("invoices").findOne({document_id: documentId} as any) as Record<string, any> | null;

  try {
    await col("extractions").deleteMany({document_id: documentId});
    await col("tasks").deleteMany({document_id: documentId});
    await col("invoices").deleteMany({document_id: documentId});
    await col("contracts").deleteMany({document_id: documentId});
    await col("reminders").deleteMany({document_id: documentId});
    await col("document_clients").deleteMany({document_id: documentId});
    await col("timeline_events").deleteMany({source_type: "document", source_id: documentId});

    await col("documents").updateOne(
      {_id: new ObjectId(documentId)} as any,
      {
        $set: {
          processing_status: "queued",
          error_message: null,
          raw_text: null,
          document_type: null,
          document_number: null,
          invoice_saved: false,
          invoice_rejected: false,
          invoice_rejection_reason: null,
          invoice_missing_fields: [],
          updated_at: new Date(),
        },
      } as any,
    );

    const filePath = await resolveDocumentFilePath(doc);
    await processDocument(documentId, filePath, doc.mime_type, extname(filePath), undefined, ownerUserId, {
      skipReminders: true,
      templateId: stringValue(doc.template_id) ?? undefined,
    });
  } catch (err) {
    if (previousInvoice) {
      const {_id, ...invoiceBody} = previousInvoice;
      await col("invoices").updateOne(
        {_id} as any,
        {$set: {...invoiceBody, updated_at: new Date()}} as any,
        {upsert: true},
      );
    }
    throw err;
  }
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}

function readNumberArg(name: string): number | null {
  const raw = readArg(name);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function stringValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  return text || null;
}
