import express from "express";
import {extname, join} from "path";
import {mkdirSync, unlinkSync, writeFileSync} from "fs";
import multer from "multer";
import {HTTPException, requireAuth} from "../auth/middleware";
import {effectivePlanId} from "../plans/tierFeatures";
import {parsePdf} from "../pipeline/pdfParser";
import {enrichTextWithPlumberTables} from "../pipeline/pdfPlumberParser";
import {ocrFile} from "../pipeline/ocrParser";
import {parseDocx} from "../pipeline/docxParser";
import {parseXlsx} from "../pipeline/xlsxParser";
import {extractDocument, extractWithTemplate} from "../pipeline/extractor";
import {pickTemplate} from "../templates/seedTemplates";
import {getDataDir, getSettings} from "../settings";
import {
    assertReminderQuota,
    ReminderQuotaError,
    reminderQuotaErrorPayload,
} from "../quotas/reminderQuota";

const upload = multer({ storage: multer.memoryStorage() });

const bodyLabels = {
  he: { contact: "איש קשר", phone: "טלפון", nextCheck: "בדיקה הבאה", targetDate: "תאריך יעד", docType: "סוג מסמך", source: "מקור", daysBefore: "ימים לפני", fallbackTitle: "תזכורת" },
  en: { contact: "Contact", phone: "Phone", nextCheck: "Next check", targetDate: "Target date", docType: "Document type", source: "Source", daysBefore: "days before", fallbackTitle: "Reminder" },
} as const;

const docTypeHeToEn: Record<string, string> = {
  "תסקיר בדיקה": "Inspection Report",
  "תסקיר": "Inspection Report",
  "חוזה": "Contract",
  "חוזה שכירות": "Lease Agreement",
  "חשבונית": "Invoice",
  "אישור": "Certificate",
  "תעודה": "Certificate",
  "תעודת אחריות": "Warranty Certificate",
  "תעודת אחריות מוגבלת": "Limited Warranty",
  "פוליסת ביטוח": "Insurance Policy",
  "פוליסת ביטוח רכב פרטי": "Private Vehicle Insurance",
  "ביטוח": "Insurance",
  "רישיון": "License",
  "היתר": "Permit",
  "הסכם": "Agreement",
  "חוזה שכירות רכב": "Vehicle Lease",
  "הצעת מחיר": "Quote",
  "קבלה": "Receipt",
};

export interface ReminderPreview {
  title: string;
  trigger_date: string;       // ISO YYYY-MM-DD
  expiry_date: string | null; // the raw expiry extracted
  next_check_date: string | null;
  advance_days: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  document_type: string | null;
  source_file: string;
  confidence: "high" | "medium" | "low";
}

export function registerExtractRemindersRoutes(app: express.Application) {
  /**
   * POST /api/extract/reminders
   * Accepts 1+ files (pdf / docx / xlsx / jpg / png / txt).
   * Returns a preview list of reminders — nothing is saved to DB.
   */
  app.post("/api/extract/reminders", upload.array("files"), async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "no files" });
      return;
    }

    const locale = (req.query.locale as string) === "en" ? "en" : "he";
    const settings = getSettings();
    const advanceDays: number[] = settings.reminderAdvanceDays?.length
      ? settings.reminderAdvanceDays
      : [7, 30];

    const tmpDir = join(getDataDir(), "tmp");
    mkdirSync(tmpDir, { recursive: true });

    const allPreviews: ReminderPreview[] = [];
    const errors: { file: string; error: string }[] = [];

    for (const file of files) {
      const ext = extname(file.originalname).toLowerCase() || ".bin";
      let displayName = file.originalname;
      try {
        const decoded = Buffer.from(file.originalname, "latin1").toString("utf8");
        if (!decoded.includes("�")) displayName = decoded;
      } catch { /* keep original */ }

      const tmpPath = join(tmpDir, `extract_${Date.now()}${ext}`);
      writeFileSync(tmpPath, file.buffer);

      try {
        const previews = await extractRemindersFromFile(
          tmpPath, ext, displayName, advanceDays, userId, locale
        );
        allPreviews.push(...previews);
      } catch (err) {
        errors.push({ file: displayName, error: String(err) });
      } finally {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    }

    res.json({ reminders: allPreviews, errors });
  });

  /**
   * POST /api/extract/reminders/save
   * Saves confirmed previews as real pending reminders (no document, no client).
   */
  app.post("/api/extract/reminders/save", async (req, res) => {
    let userId: string;
      let userPlan: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
        userPlan = effectivePlanId(ctx.user);
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const body = req.body as { reminders: ReminderPreview[] };
    if (!Array.isArray(body.reminders) || body.reminders.length === 0) {
      res.status(400).json({ error: "reminders array required" });
      return;
    }

      try {
          await assertReminderQuota(userId, userPlan, body.reminders.length);
      } catch (err) {
          if (err instanceof ReminderQuotaError) {
              res.status(403).json(reminderQuotaErrorPayload(err));
              return;
          }
          throw err;
      }

    const locale = (req.query.locale as string) === "en" ? "en" : "he";
    const lb = bodyLabels[locale];
    const { col } = await import("../db/db.js");
    const now = new Date();
    const inserted: string[] = [];

    for (const preview of body.reminders) {
      if (!preview.trigger_date || !preview.title) continue;

      const emailTo: string[] = [];
      if (preview.contact_email) emailTo.push(preview.contact_email);

      const r = await col("reminders").insertOne({
        user_id: userId,
        source_type: "manual",
        source_id: null,
        client_id: null,
        document_id: null,
        trigger_date: preview.trigger_date,
        expiry_date: preview.expiry_date ?? null,
        advance_days: preview.advance_days,
        title: preview.title,
        body: [
          preview.contact_name ? `${lb.contact}: ${preview.contact_name}` : null,
          preview.contact_phone ? `${lb.phone}: ${preview.contact_phone}` : null,
          preview.next_check_date ? `${lb.nextCheck}: ${preview.next_check_date}` : null,
          preview.expiry_date ? `${lb.targetDate}: ${preview.expiry_date}` : null,
          preview.document_type ? `${lb.docType}: ${preview.document_type}` : null,
          `${lb.source}: ${preview.source_file}`,
        ].filter(Boolean).join("\n"),
        email_to: emailTo.length ? JSON.stringify(emailTo) : null,
        email_template_id: null,
        status: "pending",
        created_at: now,
        updated_at: now,
      } as any);

      inserted.push(r.insertedId.toString());
    }

    if (inserted.length) {
      const { incrementReminderUsage } = await import("../quotas/userUsageCounters.js");
      await incrementReminderUsage(userId, inserted.length);
    }

    res.json({ saved: inserted.length, ids: inserted });
  });
}

async function extractRemindersFromFile(
  filePath: string,
  ext: string,
  displayName: string,
  advanceDays: number[],
  userId: string,
  locale: "en" | "he" = "he"
): Promise<ReminderPreview[]> {
  // ── 1. Extract raw text ──────────────────────────────────────────────────
  let rawText = "";

  if (ext === ".pdf") {
    const pdf = await parsePdf(filePath);
    rawText = pdf.needsOcr ? await ocrFile(filePath) : pdf.text;
    rawText = enrichTextWithPlumberTables(filePath, rawText);
  } else if ([".jpg", ".jpeg", ".png", ".tif", ".tiff"].includes(ext)) {
    rawText = await ocrFile(filePath);
  } else if (ext === ".docx") {
    rawText = await parseDocx(filePath);
  } else if (ext === ".xlsx") {
    rawText = parseXlsx(filePath);
  } else {
    const { readFileSync } = await import("fs");
    rawText = readFileSync(filePath, "utf-8");
  }

  if (!rawText.trim()) return [];

  // ── 2. XLSX: may contain multiple rows — extract row-by-row via AI ───────
  if (ext === ".xlsx") {
    return extractFromXlsx(rawText, displayName, advanceDays, locale);
  }

  // ── 3. Single-document extraction ─────────────────────────────────────────
  return extractFromSingleDoc(rawText, displayName, advanceDays, userId, locale);
}

async function extractFromSingleDoc(
  rawText: string,
  displayName: string,
  advanceDays: number[],
  userId: string,
  locale: "en" | "he" = "he"
): Promise<ReminderPreview[]> {
  // Try template-based extraction first; fall back to generic
  let expiryDate: string | null = null;
  let contactName: string | null = null;
  let contactEmail: string | null = null;
  let contactPhone: string | null = null;
  let documentType: string | null = null;
  let confidence: "high" | "medium" | "low" = "low";

  const template = await pickTemplate(rawText, userId);
  if (template) {
    const run = await extractWithTemplate(rawText, template, undefined, displayName);
    if (run.fields) {
      const f = run.fields;
      expiryDate = template.expiry_field
        ? (f[template.expiry_field] as string | null) ?? null
        : null;
      contactName = (f["contact_person"] ?? f["client_name"] ?? f["client_company"]) as string | null;
      contactEmail = f["contact_email"] as string | null;
      contactPhone = f["contact_phone"] as string | null;
      documentType = template.name;
      confidence = (f["_confidence"] as "high" | "medium" | "low") ?? "medium";
    }
  } else {
    const run = await extractDocument(rawText, undefined, displayName);
    if (run.result) {
      const r = run.result;
      expiryDate = r.expiry_date;
      contactName = r.client_company ?? r.client_name;
      contactEmail = r.client_email;
      contactPhone = r.client_phone;
      documentType = r.document_type;
      confidence = r.confidence;
    }
  }

  if (!expiryDate) return [];

  if (locale === "en" && documentType) {
    documentType = docTypeHeToEn[documentType] ?? documentType;
  }

  return buildPreviews(
    expiryDate, contactName, contactEmail, contactPhone,
    documentType, displayName, advanceDays, confidence, null, locale
  );
}

async function extractFromXlsx(
  rawText: string,
  displayName: string,
  advanceDays: number[],
  locale: "en" | "he" = "he"
): Promise<ReminderPreview[]> {
  // Ask AI to find ALL date-bearing rows in the spreadsheet at once.
  // Returns an array of objects rather than a single record.
  const { getSettings } = await import("../settings.js");
  const settings = getSettings();
  const OpenAI = (await import("openai")).default;

  const client = settings.aiBackend === "ollama"
    ? new OpenAI({ baseURL: `${settings.ollamaUrl}/v1`, apiKey: "ollama" })
    : new OpenAI({ apiKey: settings.openAiKey });

  const model = settings.aiBackend === "ollama" ? settings.ollamaModel : settings.openAiModel;

  const titleExample = locale === "en"
    ? 'a concise English description of what the reminder is for (e.g. "Insurance renewal - Company X").'
    : 'a concise Hebrew description of what the reminder is for (e.g. "חידוש ביטוח - חברת X").';

  const systemPrompt = `You are a spreadsheet data extraction assistant.
The user provides text extracted from an Excel file.
Your job is to find every row that contains a reminder-worthy date (expiry, renewal, next inspection, payment due, license expiry, etc.).
Return ONLY valid JSON: an array of objects, each with these fields:
{
  "expiry_date": "YYYY-MM-DD" | null,
  "contact_name": string | null,
  "contact_email": string | null,
  "contact_phone": string | null,
  "document_type": string | null,
  "title": string | null,
  "confidence": "high" | "medium" | "low"
}

Rules:
- Normalize ALL dates to ISO 8601 (YYYY-MM-DD). Israeli DD/MM/YYYY → YYYY-MM-DD.
- Only include rows where expiry_date is not null and is a future-oriented date.
- title: ${titleExample}
- If the spreadsheet has column headers, use them to understand what each column means.
- Skip rows where the date is clearly in the past AND no future action is needed.
- Return [] if nothing found.`;

  const text = rawText.slice(0, settings.extractionMaxChars ?? 12000);

  try {
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Spreadsheet text:\n\n${text}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    // AI may return { rows: [...] } or { items: [...] } or just [...]
    const rows: any[] = Array.isArray(parsed)
      ? parsed
      : (parsed.rows ?? parsed.items ?? parsed.reminders ?? parsed.data ?? []);

    const previews: ReminderPreview[] = [];
    for (const row of rows) {
      if (!row?.expiry_date) continue;
      const p = buildPreviews(
        row.expiry_date,
        row.contact_name ?? null,
        row.contact_email ?? null,
        row.contact_phone ?? null,
        row.document_type ?? null,
        displayName,
        advanceDays,
        row.confidence ?? "medium",
        row.title ?? null,
        locale
      );
      previews.push(...p);
    }
    return previews;
  } catch {
    return [];
  }
}

function buildPreviews(
  expiryDate: string,
  contactName: string | null,
  contactEmail: string | null,
  contactPhone: string | null,
  documentType: string | null,
  sourceFile: string,
  advanceDays: number[],
  confidence: "high" | "medium" | "low",
  customTitle?: string | null,
  locale: "en" | "he" = "he"
): ReminderPreview[] {
  const today = new Date().toISOString().slice(0, 10);
  if (expiryDate < today) return [];

  const previews: ReminderPreview[] = [];
  const baseTitle = customTitle ?? buildTitle(documentType, contactName, expiryDate, locale);

  for (const days of advanceDays) {
    const expiry = new Date(expiryDate);
    expiry.setDate(expiry.getDate() - days);
    const triggerRaw = expiry.toISOString().slice(0, 10);
    const triggerDate = triggerRaw < today ? today : triggerRaw;

    previews.push({
      title: baseTitle,
      trigger_date: triggerDate,
      expiry_date: expiryDate,
      next_check_date: expiryDate,
      advance_days: days,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      document_type: documentType,
      source_file: sourceFile,
      confidence,
    });
  }

  return previews;
}

function buildTitle(
  documentType: string | null,
  contactName: string | null,
  expiryDate: string,
  locale: "en" | "he" = "he"
): string {
  const parts: string[] = [];
  if (documentType) parts.push(documentType);
  if (contactName) parts.push(`- ${contactName}`);
  if (!parts.length) parts.push(bodyLabels[locale].fallbackTitle);
  parts.push(`| ${expiryDate}`);
  return parts.join(" ");
}
