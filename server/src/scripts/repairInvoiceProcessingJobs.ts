import "./loadEnv"; // must precede ../db/db — see loadEnv.ts
import {extname} from "path";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb} from "../db/db";

/**
 * Repairs document_processing_jobs rows that were written with a local
 * filesystem path and no pipeline config.
 *
 * requeueStuckDocuments.ts resolved file paths on the machine it ran from and
 * wrote them into the shared database, so jobs created from a dev machine point
 * at paths the server cannot see (E:\...). Those rows also carried no pipeline,
 * so even a readable file would be processed as a generic document rather than
 * an invoice.
 *
 * This clears file_path (the worker re-resolves from spaces_key via
 * resolveDocumentFilePath) and restores the invoice pipeline config.
 *
 *   --apply              perform the repair (default is a dry run)
 *   --template-id ID     invoice template to attach (default: detected)
 *   --limit N            process at most N jobs
 */

const apply = process.argv.includes("--apply");
const limit = readNumberArg("--limit");
const templateIdArg = readArg("--template-id");

await connectDb();

try {
  // Jobs whose file_path is a Windows/dev absolute path, or that carry no
  // pipeline at all — both signatures of the bad requeue.
  const suspect = {
    $or: [
      {file_path: {$regex: "^[A-Za-z]:[\\\\/]"}},
      {pipeline: null},
      {pipeline: {$exists: false}},
    ],
  };

  const jobs = await col("document_processing_jobs")
    .find(suspect as any)
    .limit(limit ?? 5000)
    .toArray() as Array<Record<string, any>>;

  if (!jobs.length) {
    console.log(JSON.stringify({suspect_jobs: 0, note: "nothing to repair"}, null, 2));
    process.exit(0);
  }

  const templateId = templateIdArg ?? await detectInvoiceTemplateId();
  if (!templateId) {
    console.error("Could not detect an invoice template id — pass --template-id explicitly.");
    process.exit(1);
  }

  const documentIds = jobs.map((job) => String(job.document_id));
  const docs = await col("documents")
    .find({_id: {$in: documentIds.map(toObjectId).filter(Boolean)}} as any)
    .project({_id: 1, spaces_key: 1, file_name: 1, mime_type: 1, document_kind: 1})
    .toArray() as Array<Record<string, any>>;
  const docMap = new Map(docs.map((doc) => [String(doc._id), doc]));

  let repaired = 0;
  let missingDoc = 0;
  let missingKey = 0;

  for (const job of jobs) {
    const documentId = String(job.document_id);
    const doc = docMap.get(documentId);
    if (!doc) {
      missingDoc += 1;
      continue;
    }
    if (!doc.spaces_key) {
      // Without a storage key there is no environment-independent way to
      // locate the file; leave the row alone rather than guess.
      missingKey += 1;
      continue;
    }

    if (!apply) {
      repaired += 1;
      continue;
    }

    const ext = extname(String(doc.spaces_key)) || extname(String(doc.file_name ?? "")) || ".pdf";
    await col("document_processing_jobs").updateOne(
      {_id: job._id} as any,
      {
        $set: {
          // Cleared because it holds a path from whichever machine enqueued the
          // job. runDocumentProcessingJob now resolves from the document's
          // spaces_key at run time, so this field is only a last-resort
          // fallback and a stale value would be actively misleading.
          file_path: null,
          mime_type: doc.mime_type ?? "application/pdf",
          ext,
          pipeline: {
            templateId,
            gmailImport: true,
            usageKind: "gmail_invoice",
            storageKeyPrefix: "invoices/gmail",
            processingJobContext: {source: "repair"},
          },
          status: "queued",
          locked_at: null,
          locked_by: null,
          error_code: null,
          error_message: null,
          completed_at: null,
          next_run_at: new Date(),
          updated_at: new Date(),
        },
      } as any,
    );
    await col("documents").updateOne(
      {_id: toObjectId(documentId)} as any,
      {$set: {file_path: null, processing_status: "queued", updated_at: new Date()}},
    );
    repaired += 1;
  }

  console.log(JSON.stringify({
    suspect_jobs: jobs.length,
    repaired,
    missing_document: missingDoc,
    missing_spaces_key: missingKey,
    template_id: templateId,
    applied: apply,
  }, null, 2));

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to repair, then restart the server so the worker drains the queue.");
  }
} finally {
  await closeDb();
}

async function detectInvoiceTemplateId(): Promise<string | null> {
  const row = await col<any>("documents").aggregate([
    {$match: {spaces_key: {$regex: "/invoices/gmail/"}, template_id: {$nin: [null, ""]}}},
    {$group: {_id: "$template_id", n: {$sum: 1}}},
    {$sort: {n: -1}},
    {$limit: 1},
  ] as any).toArray();
  return row[0]?._id ? String(row[0]._id) : null;
}

function toObjectId(value: string): ObjectId | null {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function readNumberArg(name: string): number | null {
  const raw = readArg(name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
