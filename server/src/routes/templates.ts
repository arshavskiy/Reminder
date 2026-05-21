import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { getDb } from "../db/db";
import { getDataDir } from "../settings";
import { loadAllTemplates, loadTemplate } from "../templates/seedTemplates";
import { loadEmailTemplate } from "../templates/seedEmailTemplates";
import { renderTemplate, listTemplateVars } from "../templates/renderEmail";
import { previewReminderEmail } from "../reminders/emailSender";
import { generateTemplateFromText, toDraft } from "../templates/generateTemplate";
import { parsePdf } from "../pipeline/pdfParser";
import { ocrFile } from "../pipeline/ocrParser";
import { parseDocx } from "../pipeline/docxParser";
import { parseXlsx } from "../pipeline/xlsxParser";
import type { DocTemplate, EmailTemplate, ReminderWithContext } from "../../src/shared/types.js";

export function registerTemplateRoutes(
  router: Map<string, (req: Request) => Promise<Response>>
) {
  // ── Document templates ─────────────────────────────────────────────────────
  router.set("GET /api/doc-templates", async () => {
    return json(loadAllTemplates(getDb()));
  });

  router.set("GET /api/doc-templates/:id", async (req) => {
    const id = parseInt(new URL(req.url).pathname.replace("/api/doc-templates/", ""));
    const tpl = loadTemplate(getDb(), id);
    if (!tpl) return notFound();
    return json(tpl);
  });

  router.set("POST /api/doc-templates", async (req) => {
    const body = (await req.json()) as Partial<DocTemplate>;
    if (!body.name) return badRequest("name required");
    const db = getDb();
    const r = db.prepare(
      `INSERT INTO doc_templates (name, description, match_keywords, fields, expiry_field, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      body.name,
      body.description ?? null,
      JSON.stringify(body.match_keywords ?? []),
      JSON.stringify(body.fields ?? []),
      body.expiry_field ?? null,
      body.is_default ?? 0
    );
    return json(loadTemplate(db, Number(r.lastInsertRowid)));
  });

  router.set("PUT /api/doc-templates/:id", async (req) => {
    const id = parseInt(new URL(req.url).pathname.replace("/api/doc-templates/", ""));
    const body = (await req.json()) as Partial<DocTemplate>;
    const db = getDb();
    db.prepare(
      `UPDATE doc_templates SET
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         match_keywords = COALESCE(?, match_keywords),
         fields = COALESCE(?, fields),
         expiry_field = COALESCE(?, expiry_field),
         is_default = COALESCE(?, is_default),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      body.name ?? null,
      body.description ?? null,
      body.match_keywords ? JSON.stringify(body.match_keywords) : null,
      body.fields ? JSON.stringify(body.fields) : null,
      body.expiry_field ?? null,
      body.is_default ?? null,
      id
    );
    return json(loadTemplate(db, id));
  });

  router.set("DELETE /api/doc-templates/:id", async (req) => {
    const id = parseInt(new URL(req.url).pathname.replace("/api/doc-templates/", ""));
    const db = getDb();
    const row = db.prepare("SELECT is_builtin FROM doc_templates WHERE id = ?").get(id) as
      | { is_builtin: number } | null;
    if (row?.is_builtin) return badRequest("cannot delete builtin template");
    db.prepare("DELETE FROM doc_templates WHERE id = ?").run(id);
    return json({ ok: true });
  });

  // ── Generate template from a sample raw text ──────────────────────────────
  router.set("POST /api/doc-templates/generate-from-text", async (req) => {
    const { text } = (await req.json()) as { text: string };
    if (!text || text.trim().length < 50) {
      return badRequest("text required (at least 50 chars)");
    }
    const run = await generateTemplateFromText(text);
    if (!run.template || run.error) {
      return serverError(run.error ?? "AI failed to generate a template");
    }
    return json({
      draft: toDraft(run.template),
      usage: run.usage,
      model: run.model,
      exec_ms: run.execMs,
    });
  });

  // ── Generate template from an uploaded sample document ────────────────────
  // Same idea but takes a file (PDF/DOCX/XLSX/image), extracts the raw text,
  // and pipes it to the generator. Convenient: drag-drop a representative
  // document, get a starter template back.
  router.set("POST /api/doc-templates/generate-from-file", async (req) => {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return badRequest("file required");

      const tmpDir = join(getDataDir(), "template_samples");
      mkdirSync(tmpDir, { recursive: true });
      const ext = extname(file.name).toLowerCase();
      const safeName = file.name.replace(/[^a-zA-Z0-9א-ת._-]/g, "_");
      const tmpPath = join(tmpDir, `${Date.now()}_${safeName}`);
      await Bun.write(tmpPath, await file.arrayBuffer());

      let text = "";
      const mime = file.type || "";
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
          text = await Bun.file(tmpPath).text();
        }
      } catch (err) {
        return serverError(`Failed to extract text from sample: ${err}`);
      }

      if (text.trim().length < 50) {
        return badRequest("could not extract enough text from the document");
      }

      const run = await generateTemplateFromText(text);
      if (!run.template || run.error) {
        return serverError(run.error ?? "AI failed to generate a template");
      }
      return json({
        draft: toDraft(run.template),
        sample_text_preview: text.slice(0, 500),
        usage: run.usage,
        model: run.model,
        exec_ms: run.execMs,
      });
    } catch (err) {
      return serverError(String(err));
    }
  });

  // ── Email templates ────────────────────────────────────────────────────────
  router.set("GET /api/email-templates", async () => {
    const rows = getDb().prepare("SELECT * FROM email_templates ORDER BY name ASC").all();
    return json(rows);
  });

  router.set("GET /api/email-templates/:id", async (req) => {
    const id = parseInt(new URL(req.url).pathname.replace("/api/email-templates/", ""));
    const t = loadEmailTemplate(getDb(), id);
    if (!t) return notFound();
    return json(t);
  });

  router.set("POST /api/email-templates", async (req) => {
    const body = (await req.json()) as Partial<EmailTemplate>;
    if (!body.name || !body.html) return badRequest("name + html required");
    const db = getDb();
    const r = db.prepare(
      `INSERT INTO email_templates (name, doc_template_id, subject, html, logo_path, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      body.name,
      body.doc_template_id ?? null,
      body.subject ?? "[תזכורת] {{title}}",
      body.html,
      body.logo_path ?? null,
      body.is_default ?? 0
    );
    return json(loadEmailTemplate(db, Number(r.lastInsertRowid)));
  });

  router.set("PUT /api/email-templates/:id", async (req) => {
    const id = parseInt(new URL(req.url).pathname.replace("/api/email-templates/", ""));
    const body = (await req.json()) as Partial<EmailTemplate>;
    const db = getDb();
    db.prepare(
      `UPDATE email_templates SET
         name = COALESCE(?, name),
         doc_template_id = COALESCE(?, doc_template_id),
         subject = COALESCE(?, subject),
         html = COALESCE(?, html),
         logo_path = COALESCE(?, logo_path),
         is_default = COALESCE(?, is_default),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      body.name ?? null,
      body.doc_template_id ?? null,
      body.subject ?? null,
      body.html ?? null,
      body.logo_path ?? null,
      body.is_default ?? null,
      id
    );
    return json(loadEmailTemplate(db, id));
  });

  router.set("DELETE /api/email-templates/:id", async (req) => {
    const id = parseInt(new URL(req.url).pathname.replace("/api/email-templates/", ""));
    getDb().prepare("DELETE FROM email_templates WHERE id = ?").run(id);
    return json({ ok: true });
  });

  // Detect variables present in an email template body
  router.set("POST /api/email-templates/vars", async (req) => {
    const { html } = (await req.json()) as { html: string };
    return json({ vars: listTemplateVars(html ?? "") });
  });

  // Render a preview with sample data — used by the editor's "Preview" tab
  router.set("POST /api/email-templates/preview", async (req) => {
    const { html, subject, vars } = (await req.json()) as {
      html: string;
      subject: string;
      vars: Record<string, unknown>;
    };
    const safeVars = vars as Record<string, string | number | null | undefined>;
    return json({
      subject: renderTemplate(subject ?? "", safeVars, { escape: false }),
      html: renderTemplate(html ?? "", safeVars, { escape: false }),
    });
  });

  // Render a real reminder's email HTML for preview (no send)
  router.set("GET /api/reminders/:id/preview-email", async (req) => {
    const id = parseInt(
      new URL(req.url).pathname.replace("/api/reminders/", "").replace("/preview-email", "")
    );
    const db = getDb();
    const r = db.prepare(
      `SELECT r.*, c.display_name AS client_name, d.file_name AS document_name
       FROM reminders r
       LEFT JOIN clients c ON c.id = r.client_id
       LEFT JOIN documents d ON d.id = r.document_id
       WHERE r.id = ?`
    ).get(id) as ReminderWithContext | null;
    if (!r) return notFound();
    return json(previewReminderEmail(r));
  });

  // ── Logo upload ────────────────────────────────────────────────────────────
  router.set("POST /api/assets/logo", async (req) => {
    try {
      const fd = await req.formData();
      const file = fd.get("logo") as File | null;
      if (!file) return badRequest("logo file required");
      const ext = extname(file.name).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".svg", ".gif"].includes(ext)) {
        return badRequest("only png/jpg/svg/gif allowed");
      }
      const assetsDir = join(getDataDir(), "assets");
      mkdirSync(assetsDir, { recursive: true });
      const fileName = `logo_${Date.now()}${ext}`;
      const dest = join(assetsDir, fileName);
      await Bun.write(dest, await file.arrayBuffer());
      return json({ logo_path: fileName });
    } catch (err) {
      return serverError(String(err));
    }
  });

  // Serve an uploaded asset (for the UI preview)
  router.set("GET /api/assets/:name", async (req) => {
    const name = new URL(req.url).pathname.replace("/api/assets/", "");
    if (name.includes("/") || name.includes("..")) return badRequest("invalid name");
    const file = join(getDataDir(), "assets", name);
    if (!existsSync(file)) return notFound();
    return new Response(Bun.file(file));
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function notFound() { return json({ error: "Not found" }, 404); }
function badRequest(msg: string) { return json({ error: msg }, 400); }
function serverError(msg: string) { return json({ error: msg }, 500); }
