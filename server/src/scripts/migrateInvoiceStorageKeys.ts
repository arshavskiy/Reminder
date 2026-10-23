import "./loadEnv"; // must precede ../db/db — see loadEnv.ts
import {extname} from "path";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb} from "../db/db";
import {copyWithinSpaces, deleteFromSpaces, fileExistsInSpaces, spacesEnabled} from "../storage/spaces";

/**
 * Migrates legacy object-storage keys to the tenant-first layout:
 *
 *   gmail/invoices/{category}/{provider}/{user_id}/{hash}.pdf
 *     -> {user_id}/invoices/gmail/{hash}.pdf
 *   documents/{user_id}/{hash}.pdf
 *     -> {user_id}/documents/{hash}.pdf        (only with --include-documents)
 *
 * Per object: copy -> verify target exists -> update DB -> delete source.
 * The DB is updated before the source is removed, so an interruption leaves a
 * readable duplicate rather than a dangling spaces_key.
 *
 *   --apply              perform the migration (default is a dry run)
 *   --include-documents  also move the documents/ prefix, not just invoices
 *   --keep-source        copy and repoint without deleting the old object
 *   --limit N            process at most N documents
 *   --user-id ID         restrict to one user
 */

const apply = process.argv.includes("--apply");
const includeDocuments = process.argv.includes("--include-documents");
const keepSource = process.argv.includes("--keep-source");
const limit = readNumberArg("--limit");
const userId = readArg("--user-id");

if (!spacesEnabled()) {
  console.error("Object storage is not configured — check .env.local (ENDPOINT / BUCKET / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).");
  process.exit(1);
}

await connectDb();

try {
  const filter: Record<string, unknown> = {spaces_key: {$nin: [null, ""]}};
  if (userId) filter.user_id = userId;

  const docs = await col("documents")
    .find(filter as any)
    .project({_id: 1, user_id: 1, spaces_key: 1, thumbnail_key: 1, file_hash: 1, file_name: 1, mime_type: 1})
    .toArray() as Array<Record<string, any>>;

  let migrated = 0;
  let alreadyCurrent = 0;
  let skipped = 0;
  let sourceMissing = 0;
  let thumbnailsMoved = 0;
  const errors: Array<{document_id: string; key: string; error: string}> = [];
  const planned: Array<{from: string; to: string}> = [];

  for (const doc of docs) {
    if (limit && migrated + skipped >= limit) break;

    const documentId = String(doc._id);
    const sourceKey = String(doc.spaces_key);
    const owner = String(doc.user_id ?? "");

    const targetKey = targetKeyFor(sourceKey, owner, doc);
    if (targetKey === null) {
      skipped += 1;
      continue;
    }
    if (targetKey === sourceKey) {
      alreadyCurrent += 1;
      continue;
    }

    if (!apply) {
      planned.push({from: sourceKey, to: targetKey});
      migrated += 1;
      continue;
    }

    try {
      const copied = await copyWithinSpaces(sourceKey, targetKey);
      if (!copied) {
        sourceMissing += 1;
        errors.push({document_id: documentId, key: sourceKey, error: "source_missing"});
        continue;
      }
      // Verify before repointing the DB, so a silent copy failure cannot
      // leave spaces_key pointing at an object that does not exist.
      if (!await fileExistsInSpaces(targetKey)) {
        errors.push({document_id: documentId, key: sourceKey, error: "target_missing_after_copy"});
        continue;
      }

      // The legacy path is the only record of which provider matched at import
      // time (that match saw the email from/subject, which read-time matching
      // does not). Persist it as data before discarding the path.
      // Thumbnails are stored beside their PDF (see thumbnailStorageKey in
      // documents/pdfThumbnail.ts), so they have to move too or they orphan.
      const sourceThumb = String(doc.thumbnail_key ?? "");
      let targetThumb: string | null = null;
      if (sourceThumb) {
        targetThumb = `${targetKey.replace(/\.[^./]+$/, "")}.thumb.png`;
        try {
          if (await copyWithinSpaces(sourceThumb, targetThumb)) {
            if (!keepSource) await deleteFromSpaces(sourceThumb);
            thumbnailsMoved += 1;
          } else {
            targetThumb = null; // source thumbnail gone; leave the field alone
          }
        } catch (err) {
          targetThumb = null;
          errors.push({document_id: documentId, key: sourceThumb, error: `thumbnail: ${err}`});
        }
      }

      const legacy = legacyProviderFrom(sourceKey);
      await col("documents").updateOne(
        {_id: new ObjectId(documentId)} as any,
        {
          $set: {
            spaces_key: targetKey,
            ...(targetThumb ? {thumbnail_key: targetThumb} : {}),
            ...(legacy ? {gmail_provider_id: legacy.provider, gmail_provider_category: legacy.category} : {}),
            updated_at: new Date(),
          },
          // spaces_url and download_url embed the old key — download_url is a
          // signed URL over the source object, which 403s once it is deleted.
          // Clearing them forces a refresh against the new key on next access.
          $unset: {spaces_url: "", download_url: "", signed_url_expires_at: ""},
        },
      );
      // Invoice rows carry a denormalized copy of the key.
      await col("invoices").updateMany(
        {document_id: {$in: [documentId, new ObjectId(documentId)]}} as any,
        {$set: {spaces_key: targetKey, updated_at: new Date()}},
      );

      if (!keepSource) await deleteFromSpaces(sourceKey);
      migrated += 1;
    } catch (err) {
      errors.push({document_id: documentId, key: sourceKey, error: String(err)});
    }
  }

  console.log(JSON.stringify({
    documents_with_keys: docs.length,
    migrated,
    thumbnails_moved: thumbnailsMoved,
    already_current: alreadyCurrent,
    skipped_unrecognized: skipped,
    source_missing: sourceMissing,
    applied: apply,
    kept_source: keepSource,
    included_documents_prefix: includeDocuments,
    errors: errors.slice(0, 20),
    error_count: errors.length,
  }, null, 2));

  if (!apply) {
    console.log("\nSample of planned moves:");
    for (const move of planned.slice(0, 15)) console.log(`  ${move.from}\n    -> ${move.to}`);
    console.log("\nDry run. Re-run with --apply to perform the migration.");
  }
} finally {
  await closeDb();
}

/**
 * Returns the tenant-first key for a legacy key, or null when the key is not
 * one this migration understands (left untouched rather than guessed at).
 */
function targetKeyFor(sourceKey: string, owner: string, doc: Record<string, any>): string | null {
  if (!owner) return null;

  const ext = extname(sourceKey) || extname(String(doc.file_name ?? "")) || ".pdf";
  const hash = String(doc.file_hash ?? "") || basenameWithoutExt(sourceKey);
  if (!hash) return null;

  if (sourceKey.startsWith(`${owner}/`)) return sourceKey; // already migrated
  if (sourceKey.startsWith("gmail/invoices/")) return `${owner}/invoices/gmail/${hash}${ext}`;
  if (includeDocuments && sourceKey.startsWith("documents/")) return `${owner}/documents/${hash}${ext}`;
  return null;
}

/**
 * Extracts the provider/category encoded in a legacy Gmail invoice key:
 *   gmail/invoices/{category}/{provider}/{user_id}/{hash}.pdf
 * Returns null for `gmail/invoices/other/...`, which carries no match.
 */
function legacyProviderFrom(sourceKey: string): {category: string; provider: string} | null {
  const parts = sourceKey.split("/");
  if (parts.length < 6) return null;
  if (parts[0] !== "gmail" || parts[1] !== "invoices") return null;
  const [category, provider] = [parts[2], parts[3]];
  if (!category || !provider || category === "other") return null;
  return {category, provider};
}

function basenameWithoutExt(key: string): string {
  const base = key.split("/").pop() ?? "";
  const ext = extname(base);
  return ext ? base.slice(0, -ext.length) : base;
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
