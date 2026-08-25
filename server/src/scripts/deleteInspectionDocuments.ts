import "./loadEnv"; // must precede ../db/db — see loadEnv.ts
import {existsSync, unlinkSync} from "fs";
import {join} from "path";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb} from "../db/db";
import {deleteFromSpaces, spacesEnabled} from "../storage/spaces";
import {resolveDriveToken, trashDriveFile} from "../storage/gdrive";
import {getDataDir} from "../settings";

/**
 * Deletes a user's inspection_report documents and everything derived from
 * them, mirroring what DELETE /api/documents/:id does per document:
 * derived rows, S3 object, S3 thumbnail, Drive file (trashed), managed local
 * copy, and the queued processing job.
 *
 * Documents currently being processed are skipped by default: deleting one
 * mid-run leaves the worker writing to a row that no longer exists.
 *
 *   --user-id ID          required, scopes every query
 *   --apply               perform the deletion (default is a dry run)
 *   --include-processing  also delete documents in processing state
 */

const userId = readArg("--user-id");
const apply = process.argv.includes("--apply");
const includeProcessing = process.argv.includes("--include-processing");

if (!userId) {
  console.error("--user-id is required.");
  process.exit(1);
}

await connectDb();

try {
  const filter: Record<string, unknown> = {user_id: userId, document_kind: "inspection_report"};
  if (!includeProcessing) filter.processing_status = {$ne: "processing"};

  const docs = await col("documents").find(filter as any)
    .project({file_name: 1, spaces_key: 1, thumbnail_key: 1, thumbnail_path: 1, drive_file_id: 1, file_path: 1, processing_status: 1})
    .toArray() as Array<Record<string, any>>;

  if (!docs.length) {
    console.log(JSON.stringify({matched: 0, note: "nothing to delete"}, null, 2));
    process.exit(0);
  }

  const ids = docs.map((d) => String(d._id));
  const oids = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));

  // Reminders attach to contracts by source_id, so the contract ids have to be
  // resolved before the contracts themselves are removed.
  const contracts = await col("contracts").find({document_id: {$in: ids}} as any)
    .project({_id: 1}).toArray() as Array<Record<string, any>>;
  const contractIds = contracts.map((c) => String(c._id));

  const skipped = await col("documents").countDocuments({
    user_id: userId, document_kind: "inspection_report", processing_status: "processing",
  } as any);

  const plan = {
    user_id: userId,
    matched_documents: docs.length,
    skipped_processing: includeProcessing ? 0 : skipped,
    contracts: contractIds.length,
    contract_reminders: contractIds.length
      ? await col("reminders").countDocuments({source_type: "contract_expiry", source_id: {$in: contractIds}} as any)
      : 0,
    document_reminders: await col("reminders").countDocuments({document_id: {$in: ids}} as any),
    equipment: await col("equipment").countDocuments({document_id: {$in: ids}} as any),
    extractions: await col("extractions").countDocuments({document_id: {$in: ids}} as any),
    document_clients: await col("document_clients").countDocuments({document_id: {$in: ids}} as any),
    tasks: await col("tasks").countDocuments({document_id: {$in: ids}} as any),
    timeline_events: await col("timeline_events").countDocuments({source_type: "document", source_id: {$in: ids}} as any),
    processing_jobs: await col("document_processing_jobs").countDocuments({document_id: {$in: ids}} as any),
    s3_objects: docs.filter((d) => d.spaces_key).length,
    s3_thumbnails: docs.filter((d) => d.thumbnail_key).length,
    drive_files: docs.filter((d) => d.drive_file_id).length,
  };

  if (!apply) {
    console.log(JSON.stringify({...plan, applied: false}, null, 2));
    console.log("\nSample of documents that would be deleted:");
    for (const d of docs.slice(0, 10)) {
      console.log(`  [${d.processing_status}] ${String(d.file_name).slice(0, 60)}`);
    }
    if (docs.length > 10) console.log(`  ...and ${docs.length - 10} more`);
    console.log("\nDry run. Re-run with --apply to delete.");
    process.exit(0);
  }

  // Derived rows first, so a failure partway leaves documents present rather
  // than a set of rows pointing at documents that no longer exist.
  if (contractIds.length) {
    await col("reminders").deleteMany({source_type: "contract_expiry", source_id: {$in: contractIds}} as any);
  }
  await Promise.all([
    col("reminders").deleteMany({document_id: {$in: ids}} as any),
    col("contracts").deleteMany({document_id: {$in: ids}} as any),
    col("equipment").deleteMany({document_id: {$in: ids}} as any),
    col("extractions").deleteMany({document_id: {$in: ids}} as any),
    col("document_clients").deleteMany({document_id: {$in: ids}} as any),
    col("tasks").deleteMany({document_id: {$in: ids}} as any),
    col("invoices").deleteMany({document_id: {$in: ids}} as any),
    col("timeline_events").deleteMany({source_type: "document", source_id: {$in: ids}} as any),
    col("document_processing_jobs").deleteMany({document_id: {$in: ids}} as any),
  ]);

  const deleted = await col("documents").deleteMany({_id: {$in: oids}} as any);

  // External storage last: the rows are already gone, so a failure here leaves
  // recoverable garbage rather than a document pointing at a deleted object.
  const driveToken = docs.some((d) => d.drive_file_id) ? await resolveDriveToken(userId) : null;
  const docsDir = join(getDataDir(), "documents");
  let s3Deleted = 0, driveTrashed = 0, localDeleted = 0;
  const errors: Array<{document_id: string; error: string}> = [];

  for (const doc of docs) {
    const documentId = String(doc._id);
    if (spacesEnabled()) {
      for (const key of [doc.spaces_key, doc.thumbnail_key].filter(Boolean)) {
        try {
          await deleteFromSpaces(String(key));
          s3Deleted += 1;
        } catch (err) {
          errors.push({document_id: documentId, error: `s3 ${key}: ${err}`});
        }
      }
    }
    if (doc.drive_file_id && driveToken) {
      try {
        if (await trashDriveFile(driveToken, String(doc.drive_file_id))) driveTrashed += 1;
      } catch (err) {
        errors.push({document_id: documentId, error: `drive: ${err}`});
      }
    }
    for (const path of [doc.file_path, doc.thumbnail_path].filter(Boolean)) {
      const local = String(path);
      // Only the managed directory; never an arbitrary stored path.
      if (!local.startsWith(docsDir) && !local.includes("thumbnails")) continue;
      if (!existsSync(local)) continue;
      try {
        unlinkSync(local);
        localDeleted += 1;
      } catch { /* best effort */ }
    }
  }

  console.log(JSON.stringify({
    ...plan,
    applied: true,
    documents_deleted: deleted.deletedCount,
    s3_objects_deleted: s3Deleted,
    drive_files_trashed: driveTrashed,
    local_files_deleted: localDeleted,
    errors: errors.slice(0, 20),
    error_count: errors.length,
  }, null, 2));
} finally {
  await closeDb();
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}
