import express from "express";
import {extname, join} from "path";
import {mkdirSync, writeFileSync} from "fs";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {
    importFile,
    normalizeExtractionFieldsForTemplate,
    processDocument,
    saveTemplateEntitiesForDoc
} from "../pipeline/importer";
import {getDataDir, getSettings} from "../settings";
import {HTTPException, requireAuth} from "../auth/middleware";
import {resolveDocumentFilePath} from "../documents/fileResolver";
import {extractWithTemplate} from "../pipeline/extractor";
import {pickTemplate} from "../templates/seedTemplates";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

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
    const clientIdFilter = req.query.clientId as string | undefined;
    const limit = parseInt((req.query.limit as string) ?? "50");
    const offset = parseInt((req.query.offset as string) ?? "0");

    // Claim any legacy documents that were imported before auth existed
    await col("documents").updateMany(
      { user_id: { $exists: false } },
      { $set: { user_id: userId, updated_at: new Date() } }
    );

    // Hide certificate documents from the main documents list — they live
    // in Profile → תעודות והסמכות and shouldn't pollute the inspection view.
    const baseFilter: Record<string, any> = {
      user_id: userId,
      document_kind: { $ne: "certificate" },
    };
    const filter: Record<string, any> = { ...baseFilter };
    if (status) filter.processing_status = status;

    // If client filter set, narrow to document_ids linked to that client first.
    if (clientIdFilter) {
      const links = await col("document_clients")
        .find({ client_id: clientIdFilter } as any)
        .project({ document_id: 1 })
        .toArray();
      const docIds = links.map((l: any) => String(l.document_id)).filter(Boolean);
      if (!docIds.length) {
        res.json({ rows: [], total: 0, totalAll: 0 });
        return;
      }
      filter._id = { $in: docIds.map((id) => new ObjectId(id)) };
    }

    const [rows, total, totalAll] = await Promise.all([
      col("documents")
        .find(filter)
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      col("documents").countDocuments(filter),
      status ? col("documents").countDocuments(baseFilter) : Promise.resolve(-1),
    ]);

    // Enrich with linked client (via document_clients) so the documents list
    // can display the associated client without extra round-trips.
    const docIds = rows.map((r) => r._id);
    const links = docIds.length
      ? await col("document_clients").find({ document_id: { $in: docIds.map((id) => id.toString()) } } as any).toArray()
      : [];
    const clientIds = [...new Set(links.map((l: any) => l.client_id).filter(Boolean))];
    const clients = clientIds.length
      ? await col("clients").find({ _id: { $in: clientIds.map((id) => new ObjectId(String(id))) } } as any).toArray()
      : [];
    const clientMap = new Map(clients.map((c: any) => [c._id.toString(), c]));
    const linkMap = new Map<string, any>();
    for (const link of links) {
      const cid = String((link as any).client_id);
      const client = clientMap.get(cid);
      if (client) linkMap.set(String((link as any).document_id), { id: cid, name: (client as any).display_name });
    }

    const enriched = rows.map((r) => {
      const link = linkMap.get(r._id.toString());
      return {
        ...flatDoc(r),
        client_id: link?.id ?? null,
        client_name: link?.name ?? null,
      };
    });

    res.json({ rows: enriched, total, totalAll: totalAll === -1 ? total : totalAll });
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
      const count = await col("documents").countDocuments({ user_id: userId, ai_extracted: true });
      if (count >= getSettings().userDocumentLimit) {
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
      const id = await importFile(body.filePath, undefined, userId);
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

      const skipAi       = req.query.skipAi       === "true";
      const skipEntities = req.query.skipEntities === "true";
      const skipReminders = req.query.skipReminders === "true";
      const pipelineOptions = { skipAi, skipEntities, skipReminders };

      if (userRole === "user" && !skipAi) {
        const count = await col("documents").countDocuments({ user_id: userId, ai_extracted: true });
        if (count + files.length > getSettings().userDocumentLimit) {
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
          if (displayName.includes("�")) displayName = file.originalname;
        } catch { /* keep original */ }
        const id = await importFile(destPath, undefined, userId, displayName, pipelineOptions);
        ids.push(String(id));
      }

      res.json({ ids });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/documents/:id/download — returns a short-lived signed URL or streams the local file
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

    const doc = (await col("documents").findOne({ ...idFilter(req.params.id), user_id: userId })) as any;
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Prefer S3 signed URL — use cached one if still fresh, otherwise regenerate
    if (doc.spaces_key) {
      try {
        const { getSpacesSignedUrl } = await import("../storage/spaces.js");
        const SIGNED_URL_TTL = 7 * 24 * 3600;
        const expiresAt: Date | null = doc.signed_url_expires_at ? new Date(doc.signed_url_expires_at) : null;
        const needsRefresh = !doc.download_url || !expiresAt || expiresAt.getTime() - Date.now() < 3600_000;
        let url: string = doc.download_url ?? "";
        if (needsRefresh) {
          url = await getSpacesSignedUrl(doc.spaces_key, SIGNED_URL_TTL, doc.file_name ?? undefined);
          const newExpiry = new Date(Date.now() + SIGNED_URL_TTL * 1000);
          await col("documents").updateOne(idFilter(req.params.id), {
            $set: { download_url: url, signed_url_expires_at: newExpiry, updated_at: new Date() },
          });
        }
        res.json({ url, source: "s3" });
        return;
      } catch (err) {
        console.error("[download] signed URL failed, falling back to local:", err);
      }
    }

    // Fall back to local file stream
    try {
      const { resolveDocumentFilePath } = await import("../documents/fileResolver.js");
      const filePath = await resolveDocumentFilePath(doc);
      const fileName = encodeURIComponent(doc.file_name ?? "document");
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${fileName}`);
      res.setHeader("Content-Type", doc.mime_type ?? "application/octet-stream");
      res.sendFile(filePath, { root: "/" });
    } catch (err) {
      res.status(503).json({ error: `File not accessible: ${err}` });
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

  // POST /api/documents/:id/extract — re-run AI extraction with the best-fit template
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
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const rawText: string = doc.raw_text ?? "";
    if (!rawText) {
      res.status(422).json({ error: "Document has no raw text yet" });
      return;
    }

    // Allow caller to request a specific template by id
    const body = req.body as Record<string, unknown>;
    let template = null;
    if (body.templateId) {
      const { loadTemplate } = await import("../templates/seedTemplates.js");
      template = await loadTemplate(String(body.templateId));
    }
    if (!template) template = await pickTemplate(rawText);
    if (!template) {
      res.status(422).json({ error: "No matching template found" });
      return;
    }

    const [engineerProfile, userRow] = await Promise.all([
      col("engineer_profiles").findOne({ user_id: userId }) as Promise<any>,
      col("users").findOne({ _id: new ObjectId(userId) as any }) as Promise<any>,
    ]);
    const inspector = {
      ...(engineerProfile ?? {}),
      personal_phone: userRow?.phone ?? null,
      personal_email: userRow?.email ?? null,
      personal_name: userRow?.name ?? null,
      personal_company_name: userRow?.company_name ?? null,
    };
    const run = await extractWithTemplate(rawText, template, id, doc.file_name, inspector);
    const normalizedFields = normalizeExtractionFieldsForTemplate(rawText, template, run.fields);
    const now = new Date();

    await col("extractions").insertOne({
      document_id: id,
      template_id: template.id ?? null,
      template_name: template.name,
      backend: run.backend,
      model: run.model,
      fields: normalizedFields,
      raw_json: run.rawJson,
      error: run.error ?? null,
      usage: run.usage ?? null,
      exec_ms: run.execMs,
      created_at: now,
    } as any);

    if (normalizedFields) {
      await col("documents").updateOne(idFilter(id), {
        $set: {
          extracted_fields: JSON.stringify(normalizedFields),
          template_id: template.id,
          document_type: template.name,
          updated_at: now,
        },
      });

      // Update contract, client, and equipment records
      try {
        await saveTemplateEntitiesForDoc(id, template, normalizedFields, userId);
      } catch (e) {
        console.error(`[extract] Failed to save extracted entities for doc ${id}:`, e);
      }
    }

    // Return updated document so client can refresh in one round-trip
    const updated = await col("documents").findOne(idFilter(id));
    res.json({ ok: true, fields: normalizedFields ?? null, template: template.name, document: flatDoc(updated) });
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
    try {
      await processDocument(id, filePath, doc.mime_type, ext, undefined, userId);
    } catch (err) {
      console.error(`[reprocess] doc ${id} failed:`, err);
      await col("documents").updateOne(idFilter(id), {
        $set: {
          processing_status: "error",
          error_message: String(err),
          updated_at: new Date(),
        },
      });
      res.status(500).json({ error: String(err) });
      return;
    }

    const updated = await col("documents").findOne(idFilter(id));
    let fields: Record<string, unknown> | null = null;
    if ((updated as any)?.extracted_fields) {
      try {
        fields = JSON.parse((updated as any).extracted_fields);
      } catch {
        fields = null;
      }
    }
    res.json({ ok: true, fields, document: flatDoc(updated) });
  });

  // PUT /api/documents/:id/fields  — save manually-edited extraction fields
  app.put("/api/documents/:id/fields", async (req, res) => {
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
    const doc = await col("documents").findOne({ ...idFilter(id), user_id: userId }) as any;
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    const incoming = req.body as Record<string, unknown>;

    // Strip empty strings so they don't overwrite real values
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (v !== "" && v !== null) sanitized[k] = v;
    }

    // Merge with existing extracted_fields
    let existing: Record<string, unknown> = {};
    if (doc.extracted_fields) {
      try { existing = JSON.parse(doc.extracted_fields); } catch {}
    }
    const merged = { ...existing, ...sanitized };

    await col("documents").updateOne(idFilter(id), {
      $set: { extracted_fields: JSON.stringify(merged), updated_at: new Date() },
    });

    // Also update the latest extraction record so reloadDoc reads the new values
    await col("extractions").updateOne(
      { document_id: id },
      { $set: { fields: merged, updated_at: new Date() } },
      { sort: { created_at: -1 } } as any,
    );

    // Propagate date/type changes to linked contracts
    const CONTRACT_FIELDS = ["expiry_date", "start_date", "contract_number", "contract_type", "counterparty"] as const;
    const contractUpdate: Record<string, unknown> = {};
    for (const f of CONTRACT_FIELDS) {
      if (sanitized[f] !== undefined) contractUpdate[f] = sanitized[f];
    }
    // report_number from inspection documents maps to contract_number
    if (sanitized.report_number !== undefined && contractUpdate.contract_number === undefined) {
      contractUpdate.contract_number = sanitized.report_number;
    }
    // next_inspection_date is an alias for expiry_date
    if (sanitized.next_inspection_date !== undefined && contractUpdate.expiry_date === undefined) {
      contractUpdate.expiry_date = sanitized.next_inspection_date;
    }

    if (Object.keys(contractUpdate).length) {
      // Match contracts by document_id stored as either string or ObjectId
      let oid: ObjectId | null = null;
      try { oid = new ObjectId(id); } catch {}
      const contracts = await col("contracts").find({
        $or: [
          { document_id: id, user_id: userId },
          ...(oid ? [{ document_id: oid, user_id: userId }] : []),
        ],
      }).toArray();

      for (const c of contracts) {
        const cid = (c._id as ObjectId).toString();
        await col("contracts").updateOne(
          { _id: c._id },
          { $set: { ...contractUpdate, updated_at: new Date() } },
        );

        // Regenerate / update reminders when expiry_date or contract_type changed
        if (contractUpdate.expiry_date || contractUpdate.contract_type) {
          const { generateContractReminders } = await import("../reminders/scheduler.js");
          const expiryDate = String(contractUpdate.expiry_date ?? (c as any).expiry_date ?? "");
          if (expiryDate) {
            // Delete existing pending reminders for this contract so they get recreated with updated title/date
            await col("reminders").deleteMany({
              source_type: "contract_expiry",
              source_id: cid,
              status: "pending",
            });
            await generateContractReminders(
              cid,
              (c as any).client_id ?? null,
              id,
              expiryDate,
              userId,
            );
          }
        }
      }
    }

    res.json({ ok: true, fields: merged });
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

