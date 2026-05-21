import { extname } from "path";
import { getDb } from "../db/db";
import { importFile, processDocument } from "../pipeline/importer";
import type { WsEvent } from "../../src/shared/types.js";

export function registerDocumentRoutes(
  router: Map<string, (req: Request, push: (e: WsEvent) => void) => Promise<Response>>,
  push: (e: WsEvent) => void
) {
  // GET /api/documents
  router.set("GET /api/documents", async (req) => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const limit = parseInt(url.searchParams.get("limit") ?? "50");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    const db = getDb();

    const where = status ? "WHERE processing_status = ?" : "";
    const params: (string | number)[] = status ? [status, limit, offset] : [limit, offset];
    const countParams: (string | number)[] = status ? [status] : [];

    const rows = db
      .prepare(`SELECT * FROM documents ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params);
    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM documents ${where}`)
      .get(...countParams) as { total: number };

    return json({ rows, total });
  });

  // GET /api/documents/:id
  router.set("GET /api/documents/:id", async (req) => {
    const id = extractId(req.url, "/api/documents/");
    const db = getDb();
    const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
    if (!doc) return notFound();
    return json(doc);
  });

  // POST /api/documents/import
  router.set("POST /api/documents/import", async (req) => {
    const body = (await req.json()) as { filePath: string };
    if (!body.filePath) return badRequest("filePath required");
    try {
      const id = await importFile(body.filePath, push);
      return json({ id });
    } catch (err) {
      return serverError(String(err));
    }
  });

  // POST /api/documents/upload  — receives multipart file upload from browser
  router.set("POST /api/documents/upload", async (req) => {
    try {
      const formData = await req.formData();
      const files = formData.getAll("files") as File[];
      if (!files.length) return badRequest("no files");

      const { mkdirSync } = await import("fs");
      const { join } = await import("path");
      const { getDataDir } = await import("../settings");

      const uploadDir = join(getDataDir(), "uploads");
      mkdirSync(uploadDir, { recursive: true });

      const ids: number[] = [];
      for (const file of files) {
        // Save the uploaded file to disk so importer can read it
        const safeName = file.name.replace(/[^a-zA-Z0-9א-ת._-]/g, "_");
        const destPath = join(uploadDir, `${Date.now()}_${safeName}`);
        await Bun.write(destPath, await file.arrayBuffer());
        const id = await importFile(destPath, push);
        ids.push(id);
      }

      return json({ ids });
    } catch (err) {
      return serverError(String(err));
    }
  });

  // DELETE /api/documents/:id
  router.set("DELETE /api/documents/:id", async (req) => {
    const id = extractId(req.url, "/api/documents/");
    const db = getDb();
    db.prepare("DELETE FROM documents WHERE id = ?").run(id);
    return json({ ok: true });
  });

  // GET /api/documents/:id/extractions
  router.set("GET /api/documents/:id/extractions", async (req) => {
    const id = extractId(req.url, "/api/documents/", "/extractions");
    const rows = getDb()
      .prepare("SELECT * FROM extractions WHERE document_id = ? ORDER BY created_at DESC")
      .all(id);
    return json(rows);
  });

  // POST /api/documents/:id/reprocess
  router.set("POST /api/documents/:id/reprocess", async (req) => {
    const id = extractId(req.url, "/api/documents/", "/reprocess");
    const db = getDb();
    const doc = db
      .prepare("SELECT file_path, mime_type FROM documents WHERE id = ?")
      .get(id) as { file_path: string; mime_type: string } | null;
    if (!doc) return notFound();

    // Wipe all derived data so reprocess gives a clean slate.
    // Documents row itself is kept (it owns the file_hash that identifies the file).
    db.prepare("DELETE FROM extractions WHERE document_id = ?").run(id);
    db.prepare("DELETE FROM tasks WHERE document_id = ?").run(id);
    db.prepare(
      `DELETE FROM reminders WHERE source_type='contract_expiry'
       AND source_id IN (SELECT id FROM contracts WHERE document_id = ?)`
    ).run(id);
    db.prepare("DELETE FROM reminders WHERE document_id = ?").run(id);
    db.prepare("DELETE FROM contracts WHERE document_id = ?").run(id);
    db.prepare("DELETE FROM document_clients WHERE document_id = ?").run(id);
    db.prepare(
      `DELETE FROM timeline_events WHERE source_type='document' AND source_id = ?`
    ).run(id);

    // Reset processing status
    db.prepare(
      `UPDATE documents SET processing_status='queued', error_message=NULL,
                            raw_text=NULL, document_type=NULL, document_number=NULL,
                            updated_at=datetime('now')
       WHERE id=?`
    ).run(id);

    // Run the pipeline directly on the existing row — bypass importFile()'s
    // dedup check (the row's file_hash is the same file by definition).
    const ext = extname(doc.file_path);
    processDocument(id, doc.file_path, doc.mime_type, ext, push).catch((err) => {
      console.error(`[reprocess] doc ${id} failed:`, err);
      db.prepare(
        `UPDATE documents SET processing_status='error', error_message=?, updated_at=datetime('now') WHERE id=?`
      ).run(String(err), id);
    });

    return json({ ok: true });
  });
}

function extractId(url: string, prefix: string, suffix = ""): number {
  const path = new URL(url).pathname;
  const part = path.replace(prefix, "").replace(suffix, "");
  return parseInt(part);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function notFound() {
  return json({ error: "Not found" }, 404);
}
function badRequest(msg: string) {
  return json({ error: msg }, 400);
}
function serverError(msg: string) {
  return json({ error: msg }, 500);
}
