import express from "express";
import {extname, join} from "path";
import {mkdirSync, writeFileSync} from "fs";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {
    importFile,
    type PipelineOptions,
    processDocument,
    saveExtractionEntities,
    saveTemplateEntities
} from "../pipeline/importer";
import {getDataDir, getSettings} from "../settings";
import {HTTPException, requireAuth} from "../auth/middleware";
import {resolveDocumentFilePath} from "../documents/fileResolver";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

async function getUserPipelineOpts(userId: string): Promise<PipelineOptions> {
  const s = await col("user_settings").findOne({ user_id: userId }) as any;
  return {
    ocr:      s?.pipeline_ocr      ?? true,
    ai:       s?.pipeline_ai       ?? true,
    s3:       s?.pipeline_s3       ?? true,
    entities: s?.pipeline_entities ?? true,
  };
}

export function registerDocumentRoutes(app: express.Application) {
  // GET /api/documents
  app.get("/api/documents", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const status = req.query.status as string | undefined;
    const limit = parseInt((req.query.limit as string) ?? "50");
    const offset = parseInt((req.query.offset as string) ?? "0");

    // Claim any legacy documents that were imported before auth existed
    await col("documents").updateMany(
      { user_id: { $exists: false } },
      { $set: { user_id: userId, updated_at: new Date() } }
    );

    const baseFilter: Record<string, any> = { user_id: userId };
    const filter: Record<string, any> = { ...baseFilter };
    if (status) filter.processing_status = status;

    const [rows, total, userSettingsDoc] = await Promise.all([
      col("documents")
        .find(filter)
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      col("documents").countDocuments(filter),
      col("user_settings").findOne({ user_id: userId }) as Promise<any>,
    ]);

    const scannedCount: number = userSettingsDoc?.scanned_count ?? 0;
    const documentLimit: number = userSettingsDoc?.document_limit ?? getSettings().userDocumentLimit;

    res.json({ rows: rows.map(flatDoc), total, totalAll: scannedCount, documentLimit });
  });

  // GET /api/documents/:id
  app.get("/api/documents/:id", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const filter = { ...idFilter(req.params.id), user_id: userId };
    const doc = await col("documents").findOne(filter);
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(flatDoc(doc));
  });

  // GET /api/documents/:id/download — returns a presigned URL or streams the local file
  app.get("/api/documents/:id/download", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const doc = await col("documents").findOne({ ...idFilter(req.params.id), user_id: userId }) as any;
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    // If stored in S3 return a presigned URL (redirect)
    if (doc.spaces_key) {
      const { getSpacesSignedUrl } = await import("../storage/spaces.js");
      const url = await getSpacesSignedUrl(doc.spaces_key, 3600);
      res.redirect(url);
      return;
    }

    // Fall back to streaming local file
    try {
      const filePath = await resolveDocumentFilePath(doc);
      const { createReadStream } = await import("fs");
      res.setHeader("Content-Type", doc.mime_type ?? "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.file_name)}"`);
      createReadStream(filePath).pipe(res);
    } catch {
      res.status(404).json({ error: "File not found on disk" });
    }
  });

  // POST /api/documents/import
  app.post("/api/documents/import", async (req, res) => {
    let userId: string;
    let userRole: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
      userRole = ctx.user.role;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    if (userRole === "user") {
      const userSettingsDoc = await col("user_settings").findOne({ user_id: userId }) as any;
      const scannedCount: number = userSettingsDoc?.scanned_count ?? 0;
      if (scannedCount >= getSettings().userDocumentLimit) {
        res.status(403).json({ error: "document_limit_reached" });
        return;
      }
    }

    const body = req.body as { filePath?: string };
    if (!body.filePath) {
      res.status(400).json({ error: "filePath required" });
      return;
    }
    try {
      const pipelineOpts = await getUserPipelineOpts(userId);
      const id = await importFile(body.filePath, undefined, userId, undefined, false, pipelineOpts);
      res.json({ id });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/documents/upload — receives multipart file upload from browser
  app.post("/api/documents/upload", upload.array("files"), async (req, res) => {
    let userId: string;
    let userRole: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
      userRole = ctx.user.role;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: "no files" });
        return;
      }

      const ocrOnly = req.query.ocrOnly === "true";
      const templateId = req.query.templateId ? parseInt(req.query.templateId as string) : undefined;

      const pipelineOpts = { ...await getUserPipelineOpts(userId), ...(templateId ? { templateId } : {}) };

      if (!ocrOnly && pipelineOpts.ai && userRole === "user") {
        const userSettingsDoc = await col("user_settings").findOne({ user_id: userId }) as any;
        const scannedCount: number = userSettingsDoc?.scanned_count ?? 0;
        if (scannedCount + files.length > getSettings().userDocumentLimit) {
          res.status(403).json({ error: "document_limit_reached" });
          return;
        }
      }

      const uploadDir = join(getDataDir(), "uploads");
      mkdirSync(uploadDir, { recursive: true });

      const ids: string[] = [];
      for (const file of files) {
        const ext = extname(file.originalname) || "";
        const destPath = join(uploadDir, `${Date.now()}${ext}`);
        writeFileSync(destPath, file.buffer);
        // Decode originalname: multer receives it as latin1 bytes when the browser
        // sends a UTF-8 filename without RFC 5987 encoding — re-encode it correctly.
        let displayName = file.originalname;
        try {
          displayName = Buffer.from(file.originalname, "latin1").toString("utf8");
          // If the result contains replacement chars, the name was already UTF-8
          if (displayName.includes("�")) displayName = file.originalname;
        } catch { /* keep original */ }
        const id = await importFile(destPath, undefined, userId, displayName, ocrOnly, pipelineOpts);
        ids.push(String(id));
      }

      res.json({ ids });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // DELETE /api/documents/:id
  app.delete("/api/documents/:id", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    await col("documents").deleteOne({ ...idFilter(req.params.id), user_id: userId });
    res.json({ ok: true });
  });

  // DELETE /api/documents/corrupt — delete all error-status docs for the user
  app.delete("/api/documents/corrupt", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const errorDocs = await col("documents")
      .find({ user_id: userId, processing_status: "error" })
      .project({ _id: 1 })
      .toArray();

    const ids = errorDocs.map((d: any) => d._id?.toString());
    if (ids.length === 0) {
      res.json({ deleted: 0 });
      return;
    }

    // Delete all derived data for each corrupt document
    for (const id of ids) {
      await col("extractions").deleteMany({ document_id: id });
      await col("tasks").deleteMany({ document_id: id });
      await col("document_clients").deleteMany({ document_id: id });
      await col("timeline_events").deleteMany({ source_type: "document", source_id: id });

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
    }

    await col("documents").deleteMany({ user_id: userId, processing_status: "error" });

    console.log(`[documents] Deleted ${ids.length} corrupt documents for user ${userId}`);
    res.json({ deleted: ids.length });
  });

  // POST /api/documents/rescan — reprocess all error-status docs for the user
  app.post("/api/documents/rescan", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const errorDocs = await col("documents")
      .find({ user_id: userId, processing_status: "error" })
      .toArray();

    if (errorDocs.length === 0) {
      res.json({ queued: 0 });
      return;
    }

    for (const doc of errorDocs as any[]) {
      const id = doc._id?.toString();
      const docIdFilter = idFilter(id);

      // Wipe derived data for a clean re-process
      await col("extractions").deleteMany({ document_id: id });
      await col("tasks").deleteMany({ document_id: id });
      await col("document_clients").deleteMany({ document_id: id });
      await col("timeline_events").deleteMany({ source_type: "document", source_id: id });

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

      await col("documents").updateOne(docIdFilter, {
        $set: {
          processing_status: "queued",
          error_message: null,
          raw_text: null,
          document_type: null,
          document_number: null,
          updated_at: new Date(),
        },
      });

      let filePath: string;
      try {
        filePath = await resolveDocumentFilePath(doc);
      } catch (err) {
        console.error(`[rescan] doc ${id} file not accessible:`, err);
        await col("documents").updateOne(idFilter(id), {
          $set: { processing_status: "error", error_message: String(err), updated_at: new Date() },
        });
        continue;
      }
      const ext = extname(filePath);
      processDocument(id, filePath, doc.mime_type, ext, undefined, userId).catch(async (err) => {
        console.error(`[rescan] doc ${id} failed:`, err);
        await col("documents").updateOne(docIdFilter, {
          $set: { processing_status: "error", error_message: String(err), updated_at: new Date() },
        });
      });
    }

    console.log(`[documents] Queued ${errorDocs.length} documents for rescan for user ${userId}`);
    res.json({ queued: errorDocs.length });
  });

  // GET /api/documents/:id/extractions
  app.get("/api/documents/:id/extractions", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    // Verify the document belongs to the user
    const doc = await col("documents").findOne({ ...idFilter(req.params.id), user_id: userId });
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const rows = await col("extractions")
      .find({ document_id: req.params.id })
      .sort({ created_at: -1 })
      .toArray();
    res.json(rows.map(flatDoc));
  });

  // POST /api/documents/:id/reprocess
  app.post("/api/documents/:id/reprocess", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const id = req.params.id;
    const filter = { ...idFilter(id), user_id: userId };

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
    await col("documents").updateOne(idFilter(id), {
      $set: {
        processing_status: "queued",
        error_message: null,
        raw_text: null,
        document_type: null,
        document_number: null,
        updated_at: new Date(),
      },
    });

    let filePath: string;
    try {
      filePath = await resolveDocumentFilePath(doc);
    } catch (err) {
      res.status(503).json({ error: `File not accessible: ${err}` });
      return;
    }

    const ext = extname(filePath);
    processDocument(id, filePath, doc.mime_type, ext, undefined, userId).catch(async (err) => {
      console.error(`[reprocess] doc ${id} failed:`, err);
      await col("documents").updateOne(idFilter(id), {
        $set: {
          processing_status: "error",
          error_message: String(err),
          updated_at: new Date(),
        },
      });
    });

    res.json({ ok: true });
  });

  // POST /api/documents/:id/extract — run AI extraction on existing raw_text with a specific template
  app.post("/api/documents/:id/extract", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const id = req.params.id;
    const doc = (await col("documents").findOne({ ...idFilter(id), user_id: userId })) as any;
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    const rawText: string = doc.raw_text ?? "";
    if (!rawText.trim()) {
      res.status(400).json({ error: "no_raw_text" });
      return;
    }

    // Accept either an ad-hoc fields list OR a saved templateId
    const body = req.body as {
      fields?: Array<{ key: string; label_he: string; type?: string }>;
      templateId?: number;
    };
    const { extractDocument, extractWithTemplate } = await import("../pipeline/extractor.js");

    try {
      // Wipe previous extraction data
      await col("extractions").deleteMany({ document_id: id });
      await col("tasks").deleteMany({ document_id: id });
      const prevContracts = await col("contracts").find({ document_id: id }).toArray();
      const prevContractIds = prevContracts.map((c: any) => c._id?.toString());
      if (prevContractIds.length > 0) {
        await col("reminders").deleteMany({ source_type: "contract_expiry", source_id: { $in: prevContractIds } });
      }
      await col("reminders").deleteMany({ document_id: id });
      await col("contracts").deleteMany({ document_id: id });
      await col("document_clients").deleteMany({ document_id: id });
      await col("timeline_events").deleteMany({ source_type: "document", source_id: id });

      // Build an ad-hoc template from inline fields if provided
      let template: import("../shared/types.js").DocTemplate | null = null;
      if (body.fields && body.fields.length > 0) {
        template = {
          id: 0,
          name: "חילוץ מותאם אישית",
          description: null,
          match_keywords: [],
          fields: body.fields.map(f => ({
            key: f.key,
            label_he: f.label_he,
            type: (f.type ?? "text") as import("../shared/types.js").FieldType,
          })),
          expiry_field: null,
          is_default: 0,
          is_builtin: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      } else if (body.templateId) {
        try { template = await col("doc_templates").findOne({ _id: new ObjectId(body.templateId) }) as any; } catch {}
      }

      if (template) {
        const run = await extractWithTemplate(rawText, template, id, doc.file_name);
        await col("extractions").insertOne({ document_id: id, backend: run.backend, model: run.model, result_json: run.rawJson, raw_text: rawText, parsed_ok: run.fields ? 1 : 0, error: run.error ?? null, exec_ms: run.execMs, created_at: new Date() } as any);
        if (run.fields) {
          await col("documents").updateOne(idFilter(id), { $set: { extracted_fields: JSON.stringify(run.fields), document_type: template.name, updated_at: new Date() } });
          await saveTemplateEntities(id, template, run.fields, userId);
        }
      } else {
        const extraction = await extractDocument(rawText, id, doc.file_name);
        await col("extractions").insertOne({ document_id: id, backend: extraction.backend, model: extraction.model, result_json: extraction.rawJson, raw_text: rawText, parsed_ok: extraction.result ? 1 : 0, error: extraction.error ?? null, exec_ms: extraction.execMs, created_at: new Date() } as any);
        if (extraction.result) {
          await saveExtractionEntities(id, extraction.result, userId);
        }
      }

      await col("documents").updateOne(idFilter(id), { $set: { processing_status: "done", updated_at: new Date() } });

      // Count this as a scan since AI extraction ran
      await col("user_settings").updateOne(
        { user_id: userId },
        { $inc: { scanned_count: 1 } }
      );

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
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

