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
    if (!res.ok) throw new Error(`Object storage download failed: ${res.status}`);

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
