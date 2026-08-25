import "./loadEnv"; // must precede ../db/db — see loadEnv.ts
import {existsSync, readdirSync, statSync, unlinkSync} from "fs";
import {join} from "path";
import {closeDb, col, connectDb} from "../db/db";
import {fileExistsInSpaces, spacesEnabled} from "../storage/spaces";
import {getDataDir} from "../settings";

/**
 * Reclaims the managed local document cache under {dataDir}/documents.
 *
 * That directory is only needed while importing (the S3 upload, the OCR/PDF
 * binaries and the Drive upload all take a filesystem path). Nothing evicted it,
 * so it accumulated one copy of every file ever imported. Readers go through
 * resolveDocumentFilePath(), which falls back to object storage, so removing a
 * file whose bytes are confirmed in the bucket is safe.
 *
 * A file is deleted only when a document row references it AND its spaces_key is
 * confirmed present in object storage. Unreferenced or unconfirmed files are
 * reported, never removed.
 *
 *   --apply       perform the deletion (default is a dry run)
 *   --limit N     examine at most N files
 */

const apply = process.argv.includes("--apply");
const limit = readNumberArg("--limit");

if (!spacesEnabled()) {
  console.error("Object storage is not configured — the local files are the only copy. Refusing to prune.");
  process.exit(1);
}

await connectDb();

try {
  const docsDir = join(getDataDir(), "documents");
  if (!existsSync(docsDir)) {
    console.log(JSON.stringify({docs_dir: docsDir, note: "directory does not exist"}, null, 2));
    process.exit(0);
  }

  const files = readdirSync(docsDir)
    .filter((name) => !name.endsWith(".thumb.png"))
    .slice(0, limit ?? Number.MAX_SAFE_INTEGER);

  // hash -> spaces_key, for every document that has one.
  const docs = await col("documents")
    .find({spaces_key: {$nin: [null, ""]}, file_hash: {$nin: [null, ""]}} as any)
    .project({file_hash: 1, spaces_key: 1})
    .toArray() as Array<Record<string, any>>;
  const keyByHash = new Map(docs.map((doc) => [String(doc.file_hash), String(doc.spaces_key)]));

  let deleted = 0;
  let bytesFreed = 0;
  let unreferenced = 0;
  let notInStorage = 0;
  const errors: Array<{file: string; error: string}> = [];

  for (const name of files) {
    const full = join(docsDir, name);
    const hash = name.replace(/\.[^.]+$/, "");
    const key = keyByHash.get(hash);

    if (!key) {
      // No document row points at this file — it may predate hashing or belong
      // to a deleted document. Left alone; deleting it is not this tool's job.
      unreferenced += 1;
      continue;
    }

    try {
      if (!await fileExistsInSpaces(key)) {
        notInStorage += 1;
        continue;
      }
      const size = statSync(full).size;
      if (apply) unlinkSync(full);
      deleted += 1;
      bytesFreed += size;
    } catch (err) {
      errors.push({file: name, error: String(err)});
    }
  }

  console.log(JSON.stringify({
    docs_dir: docsDir,
    files_examined: files.length,
    deleted,
    mb_freed: Number((bytesFreed / 1024 / 1024).toFixed(1)),
    unreferenced_kept: unreferenced,
    not_in_storage_kept: notInStorage,
    applied: apply,
    errors: errors.slice(0, 20),
  }, null, 2));

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to delete the confirmed-in-storage copies.");
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
