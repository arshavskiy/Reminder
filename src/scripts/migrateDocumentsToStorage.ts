import "dotenv/config";
import {existsSync} from "fs";
import {basename, extname} from "path";
import {closeDb, col, connectDb} from "../db/db";
import {spacesEnabled, uploadToSpaces} from "../storage/spaces";

interface DocumentRecord {
  _id: unknown;
  file_path?: string;
  file_hash?: string;
  mime_type?: string;
  spaces_key?: string | null;
  spaces_url?: string | null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function documentId(doc: DocumentRecord): string {
  return String((doc._id as any)?.toString?.() ?? doc._id);
}

function storageKeyFor(doc: DocumentRecord): string {
  if (doc.spaces_key) return doc.spaces_key;
  const ext = extname(doc.file_path ?? "");
  const stem = doc.file_hash || basename(doc.file_path ?? "document", ext);
  return `documents/${stem}${ext}`;
}

async function main() {
  const dryRun = hasFlag("--dry-run") || hasFlag("--dry");
  const force = hasFlag("--force");

  if (!dryRun && !spacesEnabled()) {
    throw new Error(
      "Object storage is not configured. Add Railway bucket variables to the service/env before running."
    );
  }

  await connectDb();

  const query = force
    ? {}
    : { $or: [{ spaces_key: { $exists: false } }, { spaces_key: null }, { spaces_key: "" }] };

  const docs = (await col<DocumentRecord>("documents").find(query).toArray()) as DocumentRecord[];
  console.log(`[migrate] Found ${docs.length} document(s)${force ? " with --force" : " missing object storage keys"}.`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of docs) {
    const id = documentId(doc);
    const localPath = doc.file_path;

    if (!localPath || !existsSync(localPath)) {
      skipped += 1;
      console.warn(`[migrate] Skipping ${id}: local file missing (${localPath ?? "no file_path"}).`);
      continue;
    }

    const key = storageKeyFor(doc);
    const mimeType = doc.mime_type || "application/octet-stream";

    if (dryRun) {
      console.log(`[migrate] Would upload ${id}: ${localPath} -> ${key}`);
      skipped += 1;
      continue;
    }

    try {
      const url = await uploadToSpaces(localPath, key, mimeType);
      await col("documents").updateOne(
        { _id: doc._id } as any,
        { $set: { spaces_key: key, spaces_url: url, updated_at: new Date() } }
      );
      uploaded += 1;
      console.log(`[migrate] Uploaded ${id}: ${key}`);
    } catch (err) {
      failed += 1;
      console.error(`[migrate] Failed ${id}:`, err);
    }
  }

  console.log(`[migrate] Done. uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("[migrate] Fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });


