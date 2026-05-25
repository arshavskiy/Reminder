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
import {parsePdf} from "../pipeline/pdfParser";
import {ocrFile} from "../pipeline/ocrParser";
import {parseDocx} from "../pipeline/docxParser";
import {parseXlsx} from "../pipeline/xlsxParser";
import multer from "multer";
import type {DocTemplate, EmailTemplate, ReminderWithContext} from "../../src/shared/types.js";

const upload = multer({ storage: multer.memoryStorage() });

export function registerTemplateRoutes(app: express.Application) {
  // ── Document templates ─────────────────────────────────────────────────────
  app.get("/api/doc-templates", async (_req, res) => {
    res.json(await loadAllTemplates());
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
    if (body.fields !== undefined) updates.fields = body.fields;
    if (body.expiry_field !== undefined) updates.expiry_field = body.expiry_field;
    if (body.is_default !== undefined) updates.is_default = body.is_default;

    await col("doc_templates").updateOne(filter, { $set: updates });
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
            const docx = await parseDocx(tmpPath);
            text = docx.needsOcr ? await ocrFile(tmpPath) : docx.text;
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
    const fields = ["name", "doc_template_id", "subject", "html", "logo_path", "is_default"];
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
      const assetsDir = join(getDataDir(), "assets");
      mkdirSync(assetsDir, { recursive: true });
      const fileName = `logo_${Date.now()}${ext}`;
      const dest = join(assetsDir, fileName);
      writeFileSync(dest, file.buffer);
      res.json({ logo_path: fileName });
    } catch (err) {
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
