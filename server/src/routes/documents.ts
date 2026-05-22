import express from "express";
import { extname } from "path";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { col } from "../db/db";
import { ObjectId } from "mongodb";
import { importFile, processDocument } from "../pipeline/importer";
import { getDataDir } from "../settings";
import multer from "multer";
import type { WsEvent } from "../../src/shared/types.js";

const upload = multer({ storage: multer.memoryStorage() });

export function registerDocumentRoutes(
  app: express.Application,
  push: (e: WsEvent) => void
) {
  // GET /api/documents
  app.get("/api/documents", async (req, res) => {
    const status = req.query.status as string | undefined;
    const limit = parseInt((req.query.limit as string) ?? "50");
    const offset = parseInt((req.query.offset as string) ?? "0");

    const filter: Record<string, any> = {};
    if (status) filter.processing_status = status;

    const [rows, total] = await Promise.all([
      col("documents")
        .find(filter)
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      col("documents").countDocuments(filter),
    ]);

    res.json({ rows: rows.map(flatDoc), total });
  });

  // GET /api/documents/:id
  app.get("/api/documents/:id", async (req, res) => {
    const filter = idFilter(req.params.id);
    const doc = await col("documents").findOne(filter);
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(flatDoc(doc));
  });

  // POST /api/documents/import
  app.post("/api/documents/import", async (req, res) => {
    const body = req.body as { filePath?: string };
    if (!body.filePath) {
      res.status(400).json({ error: "filePath required" });
      return;
    }
    try {
      const id = await importFile(body.filePath, push);
      res.json({ id });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/documents/upload — receives multipart file upload from browser
  app.post("/api/documents/upload", upload.array("files"), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: "no files" });
        return;
      }

      const uploadDir = join(getDataDir(), "uploads");
      mkdirSync(uploadDir, { recursive: true });

      const ids: string[] = [];
      for (const file of files) {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9א-ת._-]/g, "_");
        const destPath = join(uploadDir, `${Date.now()}_${safeName}`);
        writeFileSync(destPath, file.buffer);
        const id = await importFile(destPath, push);
        ids.push(String(id));
      }

      res.json({ ids });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // DELETE /api/documents/:id
  app.delete("/api/documents/:id", async (req, res) => {
    await col("documents").deleteOne(idFilter(req.params.id));
    res.json({ ok: true });
  });

  // GET /api/documents/:id/extractions
  app.get("/api/documents/:id/extractions", async (req, res) => {
    const rows = await col("extractions")
      .find({ document_id: req.params.id })
      .sort({ created_at: -1 })
      .toArray();
    res.json(rows.map(flatDoc));
  });

  // POST /api/documents/:id/reprocess
  app.post("/api/documents/:id/reprocess", async (req, res) => {
    const id = req.params.id;
    const filter = idFilter(id);

    const doc = (await col("documents").findOne(filter)) as any;
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Wipe all derived data for a clean re-process
    await col("extractions").deleteMany({ document_id: id });
    await col("tasks").deleteMany({ document_id: id });

    // Find contracts linked to this document and delete related reminders
    const contracts = await col("contracts").find({ document_id: id }).toArray();
    const contractIds = contracts.map((c: any) => c._id?.toString());
    if (contractIds.length > 0) {
      await col("reminders").deleteMany({
        source_type: "contract_expiry",
        source_id: { $in: contractIds },
      });
    }
    await col("reminders").deleteMany({ document_id: id });
    await col("contracts").deleteMany({ document_id: id });
    await col("document_clients").deleteMany({ document_id: id });
    await col("timeline_events").deleteMany({ source_type: "document", source_id: id });

    // Reset processing status
    await col("documents").updateOne(filter, {
      $set: {
        processing_status: "queued",
        error_message: null,
        raw_text: null,
        document_type: null,
        document_number: null,
        updated_at: new Date(),
      },
    });

    const ext = extname(doc.file_path);
    processDocument(id, doc.file_path, doc.mime_type, ext, push).catch(async (err) => {
      console.error(`[reprocess] doc ${id} failed:`, err);
      await col("documents").updateOne(filter, {
        $set: {
          processing_status: "error",
          error_message: String(err),
          updated_at: new Date(),
        },
      });
    });

    res.json({ ok: true });
  });
}

function idFilter(id: string): Record<string, any> {
  try {
    return { _id: new ObjectId(id) };
  } catch {
    return { _id: id };
  }
}

function flatDoc(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}
