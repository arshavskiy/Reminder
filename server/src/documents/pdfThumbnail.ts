import {execFile as execFileCb} from "child_process";
import {existsSync, mkdirSync, readdirSync, rmSync, statSync} from "fs";
import {tmpdir} from "os";
import {basename, dirname, extname, join, parse, resolve} from "path";
import {promisify} from "util";
import {ObjectId} from "mongodb";
import sharp from "sharp";
import {col} from "../db/db";
import {getDataDir} from "../settings";
import {getSpacesSignedUrl, spacesEnabled, uploadToSpaces} from "../storage/spaces";
import {resolveDocumentFilePath, type StoredDocumentFile} from "./fileResolver";
import {logger} from "../logger";

const execFile = promisify(execFileCb);
const THUMBNAIL_SIZE = 360;

export interface ThumbnailDocument extends StoredDocumentFile {
  _id?: unknown;
  user_id?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  thumbnail_path?: string | null;
  thumbnail_key?: string | null;
}

export async function generatePdfThumbnailForDocument(
  documentId: string,
  options: { filePath?: string; force?: boolean } = {}
): Promise<{ thumbnailPath: string; thumbnailKey: string | null } | null> {
  const doc = await col("documents").findOne(idFilter(documentId)) as ThumbnailDocument | null;
  if (!doc) return null;
  if (!isPdfDocument(doc)) return null;
  const storageEnabled = spacesEnabled();
  if (!options.force && (doc.thumbnail_key || (doc.thumbnail_path && !storageEnabled))) {
    return { thumbnailPath: doc.thumbnail_path ?? "", thumbnailKey: doc.thumbnail_key ?? null };
  }

  const thumbnailDir = join(getDataDir(), "thumbnails");
  mkdirSync(thumbnailDir, { recursive: true });
  const stem = safeStem(String(doc.file_hash ?? doc._id ?? documentId));
  const thumbnailPath = doc.thumbnail_path && !options.force && existsSync(doc.thumbnail_path)
    ? doc.thumbnail_path
    : join(thumbnailDir, `${stem}.png`);

  if (options.force || !existsSync(thumbnailPath)) {
    let sourcePath: string;
    try {
      sourcePath = options.filePath && existsSync(options.filePath)
        ? options.filePath
        : await resolveDocumentFilePath(doc);
    } catch (err) {
      logger.warn("pdf_thumbnail_source_unavailable", { document_id: documentId, error: err });
      return null;
    }

    try {
      await renderFirstPage(sourcePath, thumbnailPath);
    } catch (err) {
      logger.warn("pdf_thumbnail_render_failed", { document_id: documentId, file_name: doc.file_name ?? null, error: err });
      return null;
    }
  }

  let thumbnailKey: string | null = null;
  let thumbnailUrl: string | null = null;
  if (storageEnabled) {
    try {
      thumbnailKey = thumbnailStorageKey(doc, stem);
      thumbnailUrl = await uploadToSpaces(thumbnailPath, thumbnailKey, "image/png");
      logger.info("pdf_thumbnail_uploaded", { document_id: documentId, thumbnail_key: thumbnailKey });
    } catch (err) {
      logger.warn("pdf_thumbnail_upload_failed", { document_id: documentId, error: err });
      thumbnailKey = null;
      thumbnailUrl = null;
    }
  }

  await col("documents").updateOne(idFilter(documentId), {
    $set: {
      thumbnail_path: thumbnailPath,
      thumbnail_key: thumbnailKey,
      thumbnail_url: thumbnailUrl,
      thumbnail_generated_at: new Date(),
      updated_at: new Date(),
    },
  });

  return { thumbnailPath, thumbnailKey };
}

export async function resolveDocumentThumbnail(doc: ThumbnailDocument): Promise<{ path?: string; url?: string } | null> {
  if (doc.thumbnail_key && spacesEnabled()) {
    return { url: await getSpacesSignedUrl(doc.thumbnail_key, 3600, `${safeStem(doc.file_name ?? "thumbnail")}.png`) };
  }
  if (doc.thumbnail_path && existsSync(doc.thumbnail_path)) return { path: doc.thumbnail_path };
  return null;
}

function isPdfDocument(doc: ThumbnailDocument): boolean {
  return doc.mime_type === "application/pdf" ||
    doc.file_name?.toLowerCase().endsWith(".pdf") === true ||
    doc.file_path?.toLowerCase().endsWith(".pdf") === true ||
    doc.spaces_key?.toLowerCase().endsWith(".pdf") === true;
}

async function renderFirstPage(pdfPath: string, thumbnailPath: string): Promise<void> {
  const tempDir = join(tmpdir(), `reminder-pdf-thumb-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
  const prefix = join(tempDir, "page");
  try {
    const pdftoppm = resolvePdftoppm();
    await execFile(
      pdftoppm.command,
      ["-f", "1", "-l", "1", "-singlefile", "-png", "-scale-to", String(THUMBNAIL_SIZE), pdfPath, prefix],
      { env: pdftoppm.env, timeout: 30_000 }
    );
    const rendered = firstRenderedPage(tempDir, "page");
    if (!rendered || !existsSync(rendered) || statSync(rendered).size === 0) {
      throw new Error("pdftoppm did not create a thumbnail image");
    }
    await sharp(rendered)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: "cover",
        position: "top",
      })
      .png({ compressionLevel: 9 })
      .toFile(thumbnailPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function firstRenderedPage(dir: string, prefix: string): string | null {
  const direct = join(dir, `${prefix}.png`);
  if (existsSync(direct)) return direct;
  const page = readdirSync(dir)
    .filter((name) => /^page-\d+\.png$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0))[0];
  return page ? join(dir, page) : null;
}

function resolvePdftoppm(): { command: string; shell: boolean; env: NodeJS.ProcessEnv } {
  const configured = process.env.PDF_THUMBNAIL_PDFTOPPM?.trim();
  if (configured) return { command: configured, shell: false, env: process.env };

  const bundled = resolve(
    process.env.USERPROFILE ?? "",
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "native",
    "poppler",
    "Library",
    "bin",
    "pdftoppm.exe"
  );
  if (process.platform === "win32" && existsSync(bundled)) {
    return {
      command: bundled,
      shell: false,
      env: { ...process.env, PATH: `${dirname(bundled)};${process.env.PATH ?? ""}` },
    };
  }

  return { command: "pdftoppm", shell: process.platform === "win32", env: process.env };
}

function thumbnailStorageKey(doc: ThumbnailDocument, stem: string): string {
  if (doc.spaces_key) {
    const parsed = parse(doc.spaces_key.replace(/\\/g, "/"));
    return `${parsed.dir}/${parsed.name}.thumb.png`.replace(/^\/+/, "");
  }
  const userPart = doc.user_id ? `${safeStem(doc.user_id)}/` : "";
  return `documents/thumbnails/${userPart}${stem}.png`;
}

function safeStem(value: string): string {
  const clean = basename(value, extname(value))
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "document";
}

function idFilter(id: string): Record<string, any> {
  try {
    return { _id: new ObjectId(id) };
  } catch {
    return { _id: id };
  }
}
