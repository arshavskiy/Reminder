import express from "express";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "fs";
import {extname, join} from "path";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {getDataDir} from "../settings";
import {loadAllTemplates, loadTemplate} from "../templates/seedTemplates";
import {loadEmailTemplate} from "../templates/seedEmailTemplates";
import {loadAuthTemplate, loadReminderTemplate} from "../email-templates/loader";
import {listTemplateVars, renderTemplate} from "../templates/renderEmail";
import {previewReminderEmail} from "../reminders/emailSender";
import {generateTemplateFromText, toDraft} from "../templates/generateTemplate";
import {requireAuth} from "../auth/middleware";
import {parsePdf} from "../pipeline/pdfParser";
import {ocrFile} from "../pipeline/ocrParser";
import {parseDocx} from "../pipeline/docxParser";
import {parseXlsx} from "../pipeline/xlsxParser";
import multer from "multer";
import type {DocTemplate, EmailTemplate, ReminderWithContext} from "../../src/shared/types.js";
import {logger} from "../logger";

const upload = multer({ storage: multer.memoryStorage() });

async function currentUserId(req: express.Request): Promise<string | undefined> {
  const ctx = await requireAuth(req.headers.cookie ?? undefined);
  return ctx.userId;
}

export function registerTemplateRoutes(app: express.Application) {
  // ── Document templates ─────────────────────────────────────────────────────
  app.get("/api/doc-templates", async (req, res) => {
    const userId = await currentUserId(req).catch(() => undefined);
    res.json(await loadAllTemplates(userId));
  });

  // Return all unique document_kind values (builtins + user-defined)
  app.get("/api/doc-templates/kinds", async (req, res) => {
    const userId = await currentUserId(req).catch(() => undefined);
    const builtin = ["inspection_report", "contract", "invoice", "certificate", "unknown"];
    const filter = userId
      ? { $or: [{ is_builtin: 1 }, { user_id: userId }] }
      : { is_builtin: 1 };
    const rows = await col("doc_templates")
      .find(filter, { projection: { document_kind: 1 } })
      .toArray();
    const custom = rows
      .map((r) => (r as any).document_kind as string)
      .filter((k) => k && !builtin.includes(k));
    const all = [...builtin, ...Array.from(new Set(custom))];
    res.json({ kinds: all });
  });

  // AI-suggest a document_kind from template metadata
  app.post("/api/doc-templates/suggest-kind", async (req, res) => {
    try {
      const { name, description, fields, match_keywords } = req.body as {
        name: string;
        description: string;
        fields: { key: string; label_he: string }[];
        match_keywords: string[];
      };

      const { getSettings } = await import("../settings.js");
      const OpenAI = (await import("openai")).default;
      const settings = getSettings();
      const client = settings.aiBackend === "ollama"
        ? new OpenAI({ baseURL: `${settings.ollamaUrl}/v1`, apiKey: "ollama" })
        : new OpenAI({ apiKey: settings.openAiKey });
      const model = settings.aiBackend === "ollama" ? settings.ollamaModel : settings.openAiModel;

      const prompt = [
        `Template name: ${name}`,
        description ? `Description: ${description}` : "",
        match_keywords?.length ? `Keywords: ${match_keywords.join(", ")}` : "",
        fields?.length ? `Fields: ${fields.map((f) => f.label_he || f.key).join(", ")}` : "",
      ].filter(Boolean).join("\n");

      const response = await client.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 60,
        messages: [
          {
            role: "system",
            content: `You classify document templates. Based on the metadata, suggest ONE concise Hebrew document type name (סוג מסמך), 2-4 words max. Use existing kinds if they fit: inspection_report, contract, invoice, certificate, unknown. If none fit, invent a short Hebrew label. Return ONLY valid JSON: {"kind": "..."}`,
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as { kind?: string };
      res.json({ kind: parsed.kind ?? null });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("/api/doc-templates/:id", async (req, res) => {
    const tpl = await loadTemplate(req.params.id);
    if (!tpl) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(tpl);
  });

  app.post("/api/doc-templates", async (req, res) => {
    const body = req.body as Partial<DocTemplate>;
    if (!body.name) {
      res.status(400).json({ error: "name required" });
      return;
    }
    const now = new Date();
    const doc = {
      name: body.name,
      description: body.description ?? null,
      match_keywords: body.match_keywords ?? [],
      fields: body.fields ?? [],
      expiry_field: body.expiry_field ?? null,
      is_default: body.is_default ?? 0,
      is_builtin: 0,
      created_at: now,
      updated_at: now,
    };
    const result = await col("doc_templates").insertOne(doc as any);
    res.json(await loadTemplate(result.insertedId.toString()));
  });

  app.put("/api/doc-templates/:id", async (req, res) => {
    const filter = idFilter(req.params.id);
    const body = req.body as Partial<DocTemplate>;

    const updates: Record<string, any> = { updated_at: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.match_keywords !== undefined) updates.match_keywords = body.match_keywords;
    if (body.document_kind !== undefined) updates.document_kind = body.document_kind;
    if (body.fields !== undefined) updates.fields = body.fields;
    if (body.expiry_field !== undefined) updates.expiry_field = body.expiry_field;
    if (body.is_default !== undefined) updates.is_default = body.is_default;

    // Prompt-affecting fields changed — clear the cache so it's rebuilt on next use.
    const promptInvalidatingFields = ["name", "fields", "expiry_field", "match_keywords"];
    if (promptInvalidatingFields.some((f) => (body as any)[f] !== undefined)) {
      updates.cached_system_prompt = null;
    }

    await col("doc_templates").updateOne(filter, { $set: updates });
    logger.info("document_template_updated", {
      template_id: req.params.id,
      prompt_cache_cleared: updates.cached_system_prompt === null,
    });
    res.json(await loadTemplate(req.params.id));
  });

  app.delete("/api/doc-templates/:id", async (req, res) => {
    const filter = idFilter(req.params.id);
    const row = (await col("doc_templates").findOne(filter)) as any;
    if (row?.is_builtin) {
      res.status(400).json({ error: "cannot delete builtin template" });
      return;
    }
    await col("doc_templates").deleteOne(filter);
    res.json({ ok: true });
  });

  // ── Generate template from raw text ──────────────────────────────────────
  app.post("/api/doc-templates/generate-from-text", async (req, res) => {
    const { text } = req.body as { text: string };
    if (!text || text.trim().length < 50) {
      res.status(400).json({ error: "text required (at least 50 chars)" });
      return;
    }
    const run = await generateTemplateFromText(text);
    if (!run.template || run.error) {
      res.status(500).json({ error: run.error ?? "AI failed to generate a template" });
      return;
    }
    res.json({
      draft: toDraft(run.template),
      usage: run.usage,
      model: run.model,
      exec_ms: run.execMs,
    });
  });

  // ── Generate template from an uploaded sample document ────────────────────
  app.post(
    "/api/doc-templates/generate-from-file",
    upload.single("file"),
    async (req, res) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "file required" });
          return;
        }

        const tmpDir = join(getDataDir(), "template_samples");
        mkdirSync(tmpDir, { recursive: true });
        const ext = extname(file.originalname).toLowerCase();
        const safeName = file.originalname.replace(/[^\p{L}\p{N}._-]/gu, "_");
        const tmpPath = join(tmpDir, `${Date.now()}_${safeName}`);
        writeFileSync(tmpPath, file.buffer);

        let text = "";
        const mime = file.mimetype || "";
        try {
          if (mime === "application/pdf" || ext === ".pdf") {
            const pdf = await parsePdf(tmpPath);
            text = pdf.text;
            if (pdf.needsOcr) text = await ocrFile(tmpPath);
          } else if (
            mime.startsWith("image/") ||
            [".png", ".jpg", ".jpeg", ".tif", ".tiff"].includes(ext)
          ) {
            text = await ocrFile(tmpPath);
          } else if (ext === ".docx") {
            text = await parseDocx(tmpPath);
          } else if (ext === ".xlsx") {
            text = parseXlsx(tmpPath);
          } else {
            text = readFileSync(tmpPath, "utf-8");
          }
        } catch (err) {
          res.status(500).json({ error: `Failed to extract text from sample: ${err}` });
          return;
        }

        if (text.trim().length < 50) {
          res.status(400).json({ error: "could not extract enough text from the document" });
          return;
        }

        const run = await generateTemplateFromText(text);
        if (!run.template || run.error) {
          res.status(500).json({ error: run.error ?? "AI failed to generate a template" });
          return;
        }
        res.json({
          draft: toDraft(run.template),
          sample_text_preview: text.slice(0, 500),
          usage: run.usage,
          model: run.model,
          exec_ms: run.execMs,
        });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    }
  );

  // ── Test extraction against a (possibly unsaved) template ─────────────────
  app.post(
    "/api/doc-templates/test-extract",
    upload.single("file"),
    async (req, res) => {
      try {
        const file = req.file;
        if (!file) { res.status(400).json({ error: "file required" }); return; }

        // Parse template fields from form body
        let fields: DocTemplate["fields"] = [];
        try { fields = JSON.parse(req.body.fields ?? "[]"); } catch {}

        const tmpDir = join(getDataDir(), "template_samples");
        mkdirSync(tmpDir, { recursive: true });
        const ext = extname(file.originalname).toLowerCase();
        const safeName = file.originalname.replace(/[^\p{L}\p{N}._-]/gu, "_");
        const tmpPath = join(tmpDir, `${Date.now()}_${safeName}`);
        writeFileSync(tmpPath, file.buffer);

        const mime = file.mimetype || "";
        let text = "";
        try {
          if (mime === "application/pdf" || ext === ".pdf") {
            const pdf = await parsePdf(tmpPath);
            text = pdf.text;
            if (pdf.needsOcr) text = await ocrFile(tmpPath);
          } else if (mime.startsWith("image/") || [".png", ".jpg", ".jpeg", ".tif", ".tiff"].includes(ext)) {
            text = await ocrFile(tmpPath);
          } else if (ext === ".docx") {
            text = await parseDocx(tmpPath);
          } else if (ext === ".xlsx") {
            text = parseXlsx(tmpPath);
          } else {
            text = readFileSync(tmpPath, "utf-8");
          }
        } catch (err) {
          res.status(500).json({ error: `Failed to extract text: ${err}` }); return;
        }

        if (text.trim().length < 10) {
          res.status(400).json({ error: "could not extract enough text from the document" }); return;
        }

        // Build a temporary template object for extraction
        const { extractWithTemplate } = await import("../pipeline/extractor.js");
        const tpl: DocTemplate = {
          id: 0,
          name: "test",
          description: null,
          match_keywords: [],
          document_kind: (req.body.document_kind as any) ?? "unknown",
          fields,
          expiry_field: req.body.expiry_field ?? null,
          cached_system_prompt: null,
          is_default: 0,
          is_builtin: 0,
          created_at: "",
          updated_at: "",
        };

        const run = await extractWithTemplate(text, tpl, undefined, file.originalname);
        res.json({
          fields: run.fields,
          raw_json: run.rawJson,
          text_preview: text.slice(0, 800),
          model: run.model,
          exec_ms: run.execMs,
          error: run.error,
        });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    }
  );

  // ── Email templates ────────────────────────────────────────────────────────

  // Return the built-in default HTML for a named template (reminder/auth)
  app.get("/api/email-templates/defaults/:name", (req, res) => {
    const { name } = req.params;
    try {
      let html: string;
      if (name === "default" || name === "inspection" || name === "contract" || name === "invoice") {
        html = loadReminderTemplate(name as any);
      } else if (name === "verify-email" || name === "reset-password") {
        html = loadAuthTemplate(name);
      } else {
        res.status(404).json({ error: "Unknown template name" });
        return;
      }
      res.json({ html });
    } catch {
      res.status(500).json({ error: "Failed to load default template" });
    }
  });

  app.get("/api/email-templates", async (_req, res) => {
    const rows = await col("email_templates")
      .find({})
      .sort({ name: 1 })
      .toArray();
    res.json(rows.map(flatDoc));
  });

  app.get("/api/email-templates/:id", async (req, res) => {
    const t = await loadEmailTemplate(req.params.id);
    if (!t) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(t);
  });

  app.post("/api/email-templates", async (req, res) => {
    const body = req.body as Partial<EmailTemplate>;
    if (!body.name || !body.html) {
      res.status(400).json({ error: "name + html required" });
      return;
    }
    const now = new Date();
    const doc = {
      name: body.name,
      doc_template_id: body.doc_template_id ?? null,
      subject: body.subject ?? "[תזכורת] {{title}}",
      html: body.html,
      logo_path: body.logo_path ?? null,
      poster_url: body.poster_url ?? null,
      example_document_url: body.example_document_url ?? null,
      is_default: body.is_default ?? 0,
      created_at: now,
      updated_at: now,
    };
    const result = await col("email_templates").insertOne(doc as any);
    res.json(await loadEmailTemplate(result.insertedId.toString()));
  });

  app.put("/api/email-templates/:id", async (req, res) => {
    const filter = idFilter(req.params.id);
    const body = req.body as Partial<EmailTemplate>;

    const updates: Record<string, any> = { updated_at: new Date() };
    const fields = ["name", "doc_template_id", "subject", "html", "logo_path", "poster_url", "example_document_url", "is_default"];
    for (const f of fields) {
      if ((body as any)[f] !== undefined) updates[f] = (body as any)[f];
    }

    await col("email_templates").updateOne(filter, { $set: updates });
    res.json(await loadEmailTemplate(req.params.id));
  });

  app.delete("/api/email-templates/:id", async (req, res) => {
    await col("email_templates").deleteOne(idFilter(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/email-templates/:id/send-test", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try { auth = await requireAuth(req.headers.cookie ?? undefined); } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    const { to, reminder_id, no_cc } = req.body as { to?: string; reminder_id?: string; no_cc?: boolean };
    if (!to) { res.status(400).json({ error: "to is required" }); return; }
    const { sendTestEmail, sendReminderEmailTo } = await import("../reminders/emailSender.js");
    if (reminder_id) {
      try {
        const { ObjectId } = await import("mongodb");
        let rid: any;
        try { rid = new ObjectId(reminder_id); } catch { rid = Number(reminder_id); }
        const r = await col("reminders").findOne({ _id: rid }) as any;
        if (!r || String(r.user_id) !== String(auth.userId)) {
          res.status(404).json({ error: "Reminder not found" }); return;
        }
        const [clientDoc, documentDoc] = await Promise.all([
          r.client_id ? col("clients").findOne({ _id: tryObjectId(String(r.client_id)) }) : null,
          r.document_id ? col("documents").findOne({ _id: tryObjectId(String(r.document_id)) }) : null,
        ]);
        const reminderCtx = {
          ...r,
          id: r._id?.toString(),
          user_id: r.user_id ?? auth.userId,
          client_name: (clientDoc as any)?.display_name ?? null,
          document_name: (documentDoc as any)?.file_name ?? null,
          email_template_id: req.params.id,
        };
        const result = await sendReminderEmailTo(to, reminderCtx as any, { skipCc: !!no_cc });
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    } else {
      const result = await sendTestEmail(to, req.params.id, auth.userId);
      res.json(result);
    }
  });

  // Detect variables in an email template body
  app.post("/api/email-templates/vars", async (req, res) => {
    const { html } = req.body as { html: string };
    res.json({ vars: listTemplateVars(html ?? "") });
  });

  // Render a preview with sample data
  app.post("/api/email-templates/preview", async (req, res) => {
    const { html, subject, vars } = req.body as {
      html: string;
      subject: string;
      vars: Record<string, unknown>;
    };
    const safeVars = vars as Record<string, string | number | null | undefined>;
    res.json({
      subject: renderTemplate(subject ?? "", safeVars, { escape: false }),
      html: renderTemplate(html ?? "", safeVars, { escape: false }),
    });
  });

  // Render a real reminder's email HTML for preview (no send)
  app.get("/api/reminders/:id/preview-email", async (req, res) => {
    const filter = idFilter(req.params.id);
    const r = (await col("reminders").findOne(filter)) as any;
    if (!r) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [client, document] = await Promise.all([
      r.client_id ? col("clients").findOne({ _id: tryObjectId(r.client_id) }) : null,
      r.document_id ? col("documents").findOne({ _id: tryObjectId(r.document_id) }) : null,
    ]);
    const reminder: ReminderWithContext = {
      ...flatDoc(r),
      client_name: (client as any)?.display_name ?? null,
      document_name: (document as any)?.file_name ?? null,
    } as any;
    res.json(await previewReminderEmail(reminder));
  });

  // ── Logo upload ────────────────────────────────────────────────────────────
  app.post("/api/assets/logo", upload.single("logo"), async (req, res) => {
    try {
      const userId = await currentUserId(req);
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "logo file required" });
        return;
      }
      const ext = extname(file.originalname).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".svg", ".gif"].includes(ext)) {
        res.status(400).json({ error: "only png/jpg/svg/gif allowed" });
        return;
      }
      const {
        publicBucketEnabled,
        uploadBufferToPublicSpaces,
        spacesEnabled,
        uploadBufferToSpaces,
      } = await import("../storage/spaces.js");

      const key = `images/${userId}/logos/template_logo_${Date.now()}${ext}`;
      let url: string;
      if (publicBucketEnabled()) {
        url = await uploadBufferToPublicSpaces(file.buffer, key, file.mimetype);
      } else if (spacesEnabled()) {
        url = await uploadBufferToSpaces(file.buffer, key, file.mimetype);
      } else {
        res.status(500).json({ error: "object_storage_not_configured" });
        return;
      }

      res.json({ logo_path: url, url, key });
    } catch (err) {
      const message = String(err);
      res.status(message.includes("Unauthorized") ? 401 : 500).json({ error: message });
    }
  });

  // Upload a template asset (poster image or example document) to the public
  // bucket so it gets a stable, permanently-public URL that email clients can
  // fetch. Mirrors the company-logo flow in profile.ts.
  app.post("/api/email-templates/asset", upload.single("file"), async (req, res) => {
    let userId: string | undefined;
    try {
      userId = await currentUserId(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "file required" });
      return;
    }
    const kind = (req.body?.kind === "doc" ? "doc" : "poster") as "poster" | "doc";
    const isImage = file.mimetype.startsWith("image/");
    if (kind === "poster" && !isImage) {
      res.status(400).json({ error: "poster must be an image" });
      return;
    }

    const { publicBucketEnabled, uploadBufferToPublicSpaces, spacesEnabled, uploadBufferToSpaces } =
      await import("../storage/spaces.js");

    const ext = extname(file.originalname).toLowerCase() || (isImage ? ".png" : "");
    const base = file.originalname
      .replace(ext, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")   // sanitize non-URL-safe chars
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || kind;
    const key = `images/${userId}/${base}_${Date.now()}${ext}`;

    try {
      let url: string;
      if (publicBucketEnabled()) {
        url = await uploadBufferToPublicSpaces(file.buffer, key, file.mimetype);
      } else if (spacesEnabled()) {
        url = await uploadBufferToSpaces(file.buffer, key, file.mimetype);
      } else if (isImage) {
        res.status(500).json({ error: "object_storage_not_configured" });
        return;
      } else {
        res.status(500).json({ error: "object storage not configured for document upload" });
        return;
      }
      res.json({ url });
    } catch (err) {
      logger.error("template_asset_upload_failed", { kind, error: String(err) });
      res.status(500).json({ error: String(err) });
    }
  });

  // Serve an uploaded asset (for the UI preview)
  app.get("/api/assets/:name", async (req, res) => {
    const name = req.params.name;
    if (name.includes("/") || name.includes("..")) {
      res.status(400).json({ error: "invalid name" });
      return;
    }
    const filePath = join(getDataDir(), "assets", name);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(filePath);
  });
}

function idFilter(id: string): Record<string, any> {
  try {
    return { _id: new ObjectId(id) };
  } catch {
    return { _id: id };
  }
}

function tryObjectId(id: string): any {
  try {
    return new ObjectId(id);
  } catch {
    return id;
  }
}

function flatDoc(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}
