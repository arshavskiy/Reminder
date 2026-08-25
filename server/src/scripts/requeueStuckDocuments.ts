import "./loadEnv"; // must precede ../db/db — see loadEnv.ts
import {extname} from "path";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb} from "../db/db";

/**
 * Recovers documents left in `queued`/`processing` with no matching row in
 * document_processing_jobs — orphaned when the worker died or the server
 * restarted mid-run. Re-inserts a queued job so the worker picks them up.
 *
 * Non-destructive: does not delete invoices/contracts/reminders. Use
 * retryMissingInvoices.ts instead when a full re-extract is wanted.
 */

const apply = process.argv.includes("--apply");
const limit = readNumberArg("--limit");
const userId = readArg("--user-id");

await connectDb();

try {
  const filter: Record<string, unknown> = {
    processing_status: {$in: ["queued", "processing"]},
    document_source: {$ne: "generated"},
  };
  if (userId) filter.user_id = userId;

  // Full documents are needed here: spaces_key / file_hash / mime_type all feed
  // the run-time file resolution, so a narrow projection hides them.
  const documents = await col("documents")
    .find(filter as any)
    .project({raw_text: 0} as any)
    .sort({created_at: 1} as any)
    .limit(limit ?? 1000)
    .toArray() as Array<Record<string, any>>;

  const documentIds = documents.map((doc) => String(doc._id));
  const existingJobs = documentIds.length
    ? await col("document_processing_jobs")
      .find({document_id: {$in: documentIds}} as any)
      .project({document_id: 1})
      .toArray() as Array<Record<string, any>>
    : [];
  const hasJob = new Set(existingJobs.map((job) => String(job.document_id)));

  const orphans = documents.filter((doc) => !hasJob.has(String(doc._id)));

  let requeued = 0;
  let unresolvable = 0;
  const errors: Array<{document_id: string; error: string}> = [];

  for (const doc of orphans) {
    const documentId = String(doc._id);

    // Never resolve a concrete path here. This script may run from a developer
    // machine against a shared database, and an absolute path is only valid in
    // the environment that produced it — writing one into the job row sends the
    // server looking for a file it cannot see. The worker resolves from
    // spaces_key at run time instead, so only require that the file is locatable
    // in principle.
    if (!doc.spaces_key && !doc.file_hash) {
      unresolvable += 1;
      errors.push({document_id: documentId, error: "no spaces_key and no file_hash"});
      continue;
    }

    try {
      if (!apply) {
        requeued += 1;
        continue;
      }
      const now = new Date();
      await col("document_processing_jobs").updateOne(
        {document_id: documentId} as any,
        {
          $setOnInsert: {
            user_id: doc.user_id ?? null,
            document_id: documentId,
            attempts: 0,
            max_attempts: 3,
            created_at: now,
          },
          $set: {
            // Left null on purpose — see the note above. The worker resolves
            // the real path from the document's spaces_key when it runs.
            file_path: null,
            mime_type: doc.mime_type ?? "application/pdf",
            ext: extname(String(doc.file_name ?? "")) || ".pdf",
            status: "queued",
            locked_at: null,
            locked_by: null,
            error_code: null,
            error_message: null,
            completed_at: null,
            next_run_at: now,
            updated_at: now,
          },
        } as any,
        {upsert: true},
      );
      await col("documents").updateOne(
        {_id: new ObjectId(documentId)} as any,
        {$set: {processing_status: "queued", updated_at: now}},
      );
      requeued += 1;
    } catch (err) {
      errors.push({document_id: documentId, error: String(err)});
    }
  }

  console.log(JSON.stringify({
    stuck_documents: documents.length,
    already_have_job: documents.length - orphans.length,
    orphans: orphans.length,
    requeued,
    unresolvable,
    applied: apply,
    errors: errors.slice(0, 20),
  }, null, 2));

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to enqueue, then restart the server so the worker drains the queue.");
  }
} finally {
  await closeDb();
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
