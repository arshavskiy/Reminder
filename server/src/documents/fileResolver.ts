import {existsSync, mkdirSync, writeFileSync} from "fs";
import {extname, join} from "path";
import {getDataDir} from "../settings";
import {getSpacesSignedUrl, spacesEnabled} from "../storage/spaces";

export interface StoredDocumentFile {
  _id?: unknown;
  file_path?: string | null;
  file_hash?: string | null;
  mime_type?: string | null;
  spaces_key?: string | null;
}

export class ObjectStorageDownloadError extends Error {
  code = "object_storage_download_failed";
  status: number;

  constructor(status: number) {
    super(`Object storage download failed: ${status}`);
    this.name = "ObjectStorageDownloadError";
    this.status = status;
  }
}

export function isObjectStorageMissingError(error: unknown): boolean {
  const err = error as { code?: unknown; status?: unknown; message?: unknown } | null;
  return (
    err?.code === "object_storage_download_failed" &&
    err?.status === 404
  ) || /Object storage download failed:\s*404/i.test(String(err?.message ?? error ?? ""));
}

function pathBasename(pathValue: string): string {
  return pathValue.split(/[\\/]/).filter(Boolean).pop() ?? "";
}

function documentExtension(doc: StoredDocumentFile): string {
  return (
    extname(doc.file_path ?? "") ||
    extname(doc.spaces_key ?? "") ||
    (doc.mime_type === "application/pdf" ? ".pdf" : "")
  );
}

export function localDocumentFileCandidates(doc: StoredDocumentFile): string[] {
  const candidates: string[] = [];
  const localPath = doc.file_path ?? "";
  const ext = documentExtension(doc);
  const docsDir = join(getDataDir(), "documents");

  if (localPath) candidates.push(localPath);
  if (doc.file_hash && ext) candidates.push(join(docsDir, `${doc.file_hash}${ext}`));

  const storedName = localPath ? pathBasename(localPath) : "";
  if (storedName) candidates.push(join(docsDir, storedName));

  return [...new Set(candidates)];
}

/**
 * Return a local path to the file, downloading from object storage if the managed
 * copy no longer exists on disk (e.g. after a Railway redeploy).
 */
export async function resolveDocumentFilePath(doc: StoredDocumentFile): Promise<string> {
  const candidates = localDocumentFileCandidates(doc);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  if (spacesEnabled() && doc.spaces_key) {
    const signedUrl = await getSpacesSignedUrl(doc.spaces_key, 300);
    const res = await fetch(signedUrl);
    if (!res.ok) throw new ObjectStorageDownloadError(res.status);

    // Named by document id rather than uniquely, so repeated reads of the same
    // document overwrite one file instead of growing the directory. Cleanup is
    // left to the temp-file sweeper: callers hold this path for varying and
    // overlapping lifetimes (thumbnailing, Drive upload, PDF responses), so
    // unlinking at any one call site would risk pulling the file out from under
    // another in-flight request.
    const ext = extname(doc.spaces_key);
    const tmpDir = join(getDataDir(), "tmp");
    mkdirSync(tmpDir, { recursive: true });
    const tmpPath = join(tmpDir, `${doc._id ?? "doc"}${ext}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(tmpPath, buf);
    return tmpPath;
  }

  const localPath = doc.file_path ?? "";
  const tried = candidates.length > 0 ? ` Tried: ${candidates.join(", ")}` : "";
  throw new Error(
    localPath
      ? `Local file missing and object storage not configured: ${localPath}.${tried}`
      : `No file_path and object storage not configured.${tried}`
  );
}
