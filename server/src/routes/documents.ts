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
import {loadAllTemplates, loadTemplate, pickTemplate} from "../templates/seedTemplates";
import multer from "multer";
import {logger} from "../logger";

const upload = multer({ storage: multer.memoryStorage() });

function readNonNegativeIntEnv(name: string, fallback: number, max = 60_000): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.min(Math.floor(value), max);
}

const RESCAN_START_STAGGER_MS = readNonNegativeIntEnv("DOCUMENT_RESCAN_START_STAGGER_MS", 250);
const UPLOAD_START_STAGGER_MS = readNonNegativeIntEnv("DOCUMENT_UPLOAD_START_STAGGER_MS", 0);

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

    const [rows, total, totalAll, statusCounts] = await Promise.all([
      col("documents")
        .find(filter)
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      col("documents").countDocuments(filter),
      status ? col("documents").countDocuments(baseFilter) : Promise.resolve(-1),
      col("documents").aggregate([
        { $match: baseFilter },
        { $group: { _id: "$processing_status", count: { $sum: 1 } } },
      ]).toArray(),
    ]);

    // Enrich with linked client + reminder status so the documents list can
    // display operational state without extra round-trips.
    const docIds = rows.map((r) => r._id);
    const docIdStrings = docIds.map((id) => id.toString());
    const links = docIds.length
      ? await col("document_clients").find({ document_id: { $in: docIdStrings } } as any).toArray()
      : [];
    const clientIds = [...new Set(links.map((l: any) => l.client_id).filter(Boolean))];
    const [clients, reminders, contracts] = await Promise.all([
      clientIds.length
        ? col("clients").find({ _id: { $in: clientIds.map((id) => new ObjectId(String(id))) } } as any).toArray()
        : [],
      docIds.length
        ? col("reminders").find(
          {
            user_id: userId,
            $or: [
              { document_id: { $in: docIdStrings } },
              { document_id: { $in: docIds } },
            ],
          } as any,
          { projection: { _id: 1, document_id: 1, trigger_date: 1, status: 1 } } as any,
        ).toArray()
        : [],
      docIds.length
        ? col("contracts").find(
          {
            user_id: userId,
            $or: [
              { document_id: { $in: docIdStrings } },
              { document_id: { $in: docIds } },
            ],
          } as any,
          { projection: { _id: 1, document_id: 1, expiry_date: 1, status: 1 } } as any,
        ).toArray()
        : [],
    ]);
    const clientMap = new Map(clients.map((c: any) => [c._id.toString(), c]));
    const linkMap = new Map<string, any>();
    for (const link of links) {
      const cid = String((link as any).client_id);
      const client = clientMap.get(cid);
      if (client) linkMap.set(String((link as any).document_id), { id: cid, name: (client as any).display_name });
    }
    const reminderMap = new Map<string, any[]>();
    for (const reminder of reminders as any[]) {
      const documentId = reminder.document_id?.toString?.() ?? reminder.document_id;
      if (!documentId) continue;
      const key = String(documentId);
      const list = reminderMap.get(key) ?? [];
      list.push(reminder);
      reminderMap.set(key, list);
    }
    const contractMap = new Map<string, any>();
    for (const contract of contracts as any[]) {
      const documentId = contract.document_id?.toString?.() ?? contract.document_id;
      if (documentId) contractMap.set(String(documentId), contract);
    }

    const enriched = rows.map((r) => {
      const link = linkMap.get(r._id.toString());
      const documentReminders = reminderMap.get(r._id.toString()) ?? [];
      const contract = contractMap.get(r._id.toString());
      return {
        ...flatDoc(r),
        client_id: link?.id ?? null,
        client_name: link?.name ?? null,
        reminder_count: documentReminders.length,
        reminder_status: getDocumentReminderStatus(r, documentReminders),
        reminder_date: getDocumentReminderDate(r, contract, documentReminders),
        contract_status: contract?.status ?? null,
      };
    });

    const countsByStatus: Record<string, number> = {};
    for (const g of statusCounts as any[]) {
      if (g._id) countsByStatus[g._id] = g.count;
    }
    const allCount = (totalAll === -1 ? total : totalAll);
    const counts = {
      all: allCount,
      done: countsByStatus["done"] ?? 0,
      in_progress: (countsByStatus["queued"] ?? 0) + (countsByStatus["processing"] ?? 0),
      error: countsByStatus["error"] ?? 0,
    };
    res.json({ rows: enriched, total, totalAll: allCount, counts });
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
      const duplicates: string[] = [];
      for (const [index, file] of files.entries()) {
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
        const beforeCount = await col("documents").countDocuments({ user_id: userId });
        const id = await importFile(destPath, undefined, userId, displayName, {
          ...pipelineOptions,
          startDelayMs: index * UPLOAD_START_STAGGER_MS,
        });
        const afterCount = await col("documents").countDocuments({ user_id: userId });
        ids.push(String(id));
        if (afterCount === beforeCount) duplicates.push(String(id));
      }

      res.json({ ids, duplicates });
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
        logger.warn("document_signed_url_failed", { document_id: req.params.id, user_id: userId, error: err });
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

    const doc = await col("documents").findOne({ ...idFilter(req.params.id), user_id: userId }) as any;
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    await col("documents").deleteOne({ _id: doc._id });

    if (doc.spaces_key) {
      const { deleteFromSpaces } = await import("../storage/spaces.js");
      deleteFromSpaces(doc.spaces_key).catch((err) =>
        logger.warn("document_s3_delete_failed", { document_id: req.params.id, spaces_key: doc.spaces_key, error: err })
      );
    }

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
      .project({ _id: 1, spaces_key: 1 })
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

    // Fire-and-forget S3 cleanup for all corrupt docs that had a spaces_key
    const { deleteFromSpaces } = await import("../storage/spaces.js");
    for (const d of errorDocs as any[]) {
      if (d.spaces_key) {
        deleteFromSpaces(d.spaces_key).catch((err) =>
          logger.warn("document_s3_delete_failed", { spaces_key: d.spaces_key, error: err })
        );
      }
    }

    logger.warn("corrupt_documents_deleted", { user_id: userId, deleted_count: ids.length });
    res.json({ deleted: ids.length });
  });

  // POST /api/documents/rescan — by default reprocess error docs and completed
  // docs that did not create a reminder. Pass { all: true } or ?all=true to
  // intentionally rebuild every completed/error non-certificate document for
  // the user, including its derived contracts and reminders.
  app.post("/api/documents/rescan", async (req, res) => {
    let userId: string;
    let isAdmin = false;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
      isAdmin = ctx.user.role === "admin";
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const body = (req.body ?? {}) as { all?: boolean; mode?: string; limit?: number | string };
    const rescanAll = req.query.all === "true" || body.all === true || body.mode === "all";
    if (rescanAll && !isAdmin) {
      res.status(403).json({ error: "Admin role required for full rescan" });
      return;
    }
    const rawLimit = Number(req.query.limit ?? body.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 1000)
      : null;

    const candidateDocs = await col("documents")
      .find({ user_id: userId, processing_status: { $in: ["error", "done"] }, document_kind: { $ne: "certificate" } })
      .sort({ import_date: -1, _id: -1 } as any)
      .limit(limit ?? 0)
      .toArray();
    const candidateIds = candidateDocs.map((d: any) => d._id?.toString()).filter(Boolean);
    const candidateObjectIds = candidateDocs.map((d: any) => d._id).filter(Boolean);
    const existingReminderIds = candidateIds.length
      ? await col("reminders")
        .find({
          user_id: userId,
          $or: [
            { document_id: { $in: candidateIds } },
            { document_id: { $in: candidateObjectIds } },
          ],
        } as any, { projection: { document_id: 1 } } as any)
        .toArray()
      : [];
    const docsWithReminder = new Set(existingReminderIds.map((r: any) => String(r.document_id)));
    const rescanDocs = rescanAll
      ? candidateDocs as any[]
      : (candidateDocs as any[]).filter((doc) => {
          const id = doc._id?.toString();
          return doc.processing_status === "error" || (doc.processing_status === "done" && id && !docsWithReminder.has(id));
        });

    const rescanIds = rescanDocs.map((doc: any) => doc._id?.toString()).filter(Boolean);

    if (rescanDocs.length === 0) {
      res.json({ queued: 0, ids: [], mode: rescanAll ? "all" : "missing", candidates: candidateDocs.length });
      return;
    }

    for (const [index, doc] of (rescanDocs as any[]).entries()) {
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
          extracted_fields: null,
          template_id: null,
          document_type: null,
          document_number: null,
          updated_at: new Date(),
        },
      });

      let filePath: string;
      try {
        filePath = await resolveDocumentFilePath(doc);
      } catch (err) {
        logger.error("document_rescan_file_unavailable", { document_id: id, user_id: userId, error: err });
        await col("documents").updateOne(idFilter(id), {
          $set: { processing_status: "error", error_message: String(err), updated_at: new Date() },
        });
        continue;
      }
      const ext = extname(filePath);
      setTimeout(() => {
        processDocument(id, filePath, doc.mime_type, ext, undefined, userId).catch(async (err) => {
          logger.error("document_rescan_failed", { document_id: id, user_id: userId, error: err });
          await col("documents").updateOne(docIdFilter, {
            $set: { processing_status: "error", error_message: String(err), updated_at: new Date() },
          });
        });
      }, index * RESCAN_START_STAGGER_MS);
    }

    logger.info("document_rescan_queued", {
      user_id: userId,
      queued_count: rescanDocs.length,
      mode: rescanAll ? "all" : "missing",
      candidates: candidateDocs.length,
    });
    res.json({ queued: rescanDocs.length, ids: rescanIds, mode: rescanAll ? "all" : "missing", candidates: candidateDocs.length });
  });

  // GET /api/documents/:id/raw-text — debug: dump stored raw text
  app.get("/api/documents/:id/raw-text", async (req, res) => {
    let userId: string;
    try { userId = (await requireAuth(req.headers.cookie)).userId; } catch (e) { const err = e as HTTPException; res.status(err.status ?? 401).json({ error: err.message }); return; }
    const doc = await col("documents").findOne({ ...idFilter(req.params.id), user_id: userId }) as any;
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    res.type("text/plain; charset=utf-8").send(doc.raw_text ?? "(empty)");
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
    if (!template) template = await pickTemplate(rawText, userId);
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

      // Rebuild derived records from the fresh extraction. This keeps the
      // document fields as the source of truth when AI extraction changes a
      // client, contract number, dates, or reminder schedule.
      try {
        await clearDerivedDocumentData(id, userId);
        await saveTemplateEntitiesForDoc(id, template, normalizedFields, userId);
      } catch (e) {
        logger.error("document_extract_entities_failed", { document_id: id, user_id: userId, error: e });
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

    const fields = await resolveCurrentExtractionFields(doc, userId);
    res.json({ fields });
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
      logger.error("document_reprocess_failed", { document_id: id, user_id: userId, error: err });
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

    // Keep the audit row roughly in sync for diagnostics; the client reads documents.extracted_fields.
    await col("extractions").updateOne(
      { document_id: id },
      { $set: { fields: merged, updated_at: new Date() } },
      { sort: { created_at: -1 } } as any,
    );

    // Propagate all field changes to linked entities (client, contract, equipment)
    // Resolve the document's template (stored by id, or fall back to first match)
    let template = null;
    if (doc.template_id) {
      const all = await loadAllTemplates(userId);
      template = all.find((t) => String(t.id) === String(doc.template_id)) ?? null;
    }
    if (!template && doc.file_text) {
      template = await pickTemplate(doc.file_text, userId);
    }

    if (template) {
      // skipReminders=true: reminder regeneration is handled explicitly below
      await saveTemplateEntitiesForDoc(id, template, merged as any, userId, true);
    }

    // Propagate flat equipment fields edited directly by the user.
    // saveTemplateEntitiesForDoc only processes _equipment rows; when the user
    // edits top-level keys (serial_number, manufacturer, model, etc.) those
    // changes need to reach the equipment record matched by document_id.
    const EQUIPMENT_FLAT_FIELDS = [
      "equipment_description", "serial_number", "manufacturer", "model",
      "load_capacity", "load_capacity_test", "load_radius",
    ] as const;
    const equipUpdate: Record<string, unknown> = {};
    for (const f of EQUIPMENT_FLAT_FIELDS) {
      if (sanitized[f] !== undefined) {
        equipUpdate[f === "equipment_description" ? "name" : f] = sanitized[f];
      }
    }
    if (Object.keys(equipUpdate).length) {
      await col("equipment").updateOne(
        { document_id: id },
        { $set: { ...equipUpdate, updated_at: new Date() } },
      );
      logger.info("document_equipment_fields_updated", {
        document_id: id,
        user_id: userId,
        fields: Object.keys(equipUpdate),
      });
    }

    // Refresh pending reminders from the rebuilt contract so client/date/title
    // changes made in the document fields are reflected without a full rescan.
    let oid: ObjectId | null = null;
    try { oid = new ObjectId(id); } catch {}
    const contracts = await col("contracts").find({
      $or: [
        { document_id: id, user_id: userId },
        ...(oid ? [{ document_id: oid, user_id: userId }] : []),
      ],
    }).toArray();

    if (contracts.length > 0) {
      const { generateContractReminders } = await import("../reminders/scheduler.js");
      for (const c of contracts) {
        const cid = (c._id as ObjectId).toString();
        const expiryDate = String((c as any).expiry_date ?? "");
        if (expiryDate) {
          await generateContractReminders(cid, (c as any).client_id ?? null, id, expiryDate, userId);
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

async function clearDerivedDocumentData(id: string, userId: string): Promise<void> {
  const objectId = (() => {
    try { return new ObjectId(id); } catch { return null; }
  })();
  const documentIds = [id, ...(objectId ? [objectId] : [])];
  const contracts = await col("contracts")
    .find({ user_id: userId, document_id: { $in: documentIds } } as any)
    .project({ _id: 1 })
    .toArray();
  const contractIds = contracts.map((contract: any) => contract._id?.toString()).filter(Boolean);

  if (contractIds.length > 0) {
    await col("reminders").deleteMany({
      user_id: userId,
      source_type: "contract_expiry",
      source_id: { $in: contractIds },
    } as any);
  }

  await Promise.all([
    col("tasks").deleteMany({ user_id: userId, document_id: { $in: documentIds } } as any),
    col("document_clients").deleteMany({ document_id: { $in: documentIds } } as any),
    col("timeline_events").deleteMany({ source_type: "document", source_id: id } as any),
    col("reminders").deleteMany({ user_id: userId, document_id: { $in: documentIds } } as any),
    col("contracts").deleteMany({ user_id: userId, document_id: { $in: documentIds } } as any),
    col("equipment").deleteMany({ user_id: userId, document_id: { $in: documentIds } } as any),
  ]);
}

function flatDoc(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}

function getDocumentReminderStatus(doc: any, reminders: any[]): "pending" | "assigned" | "missing" | "error" {
  if (doc.processing_status === "queued" || doc.processing_status === "processing") return "pending";
  if (doc.processing_status === "error") return "error";
  if (reminders.length > 0) return "assigned";
  return "missing";
}

function getDocumentReminderDate(doc: any, contract: any, reminders: any[]): string | null {
  const fields = parseObjectJson(doc?.extracted_fields);
  return String(
    contract?.expiry_date ??
    fields?.expiry_date ??
    fields?.next_inspection_date ??
    fields?.next_action_date ??
    reminders[0]?.trigger_date ??
    ""
  ) || null;
}

async function resolveCurrentExtractionFields(doc: any, userId: string): Promise<Record<string, unknown> | null> {
  const fields = parseObjectJson(doc?.extracted_fields);
  if (!fields) return null;

  const rawText = typeof doc?.raw_text === "string" ? doc.raw_text : "";
  if (!rawText.trim()) return fields;

  let template = null;
  if (doc?.template_id) {
    template = await loadTemplate(String(doc.template_id));
  }
  if (!template) {
    template = await pickTemplate(rawText, userId);
  }
  if (!template) return fields;

  return normalizeExtractionFieldsForTemplate(rawText, template, fields as any) ?? fields;
}

function parseObjectJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

