import express from "express";
import { writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { col } from "../db/db";
import { isFeatureEnabledForUser } from "../features";
import { getSpacesSignedUrl } from "../storage/spaces";
import { discoveries, discoveryId, discoverySummary, persistDiscovery, plainEmailHtml, saveDiscoveryPdf } from "../gmail/discoveryStore";
import { HTTPException, requireAuth } from "../auth/middleware";
import { logger } from "../logger";
import { htmlToPlainText, scanInlineEmailForObligation, subjectRequestsAttachmentDate } from "../gmail/inlineObligationScan";
import { parsePdf } from "../pipeline/pdfParser";
import { releaseTempFile, tempDir } from "../storage/tempFiles";
import {
  obligationLangErrorBody,
  obligationSearchParameters,
  parseObligationSearchLangs,
} from "../gmail/obligationSearch";
import { gmailFetch, resolveGmailToken, retryWithRefresh } from "./gmail";
import {
  effectivePlanId,
  planAllowsDocumentImport,
  PLAN_GATE_MESSAGES,
} from "../plans/tierFeatures";

const SCAN_PAGE_SIZE = 500;
const MAX_SCAN_MESSAGES = 2500;
const DEFAULT_HISTORY_MONTHS = 3;
const MAX_HISTORY_MONTHS = 36;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

export function registerGmailObligationRoutes(app: express.Application) {
  app.use("/api/gmail/obligation", async (req, res, next) => {
    try {
      const ctx = await requireAuth(req.headers.cookie);
      if (!await isFeatureEnabledForUser(ctx.userId, "pages.discovery")) {
        res.status(403).json({ error: "feature_disabled" }); return;
      }
      res.locals.discoveryUserId = ctx.userId;
      next();
    } catch (err) { res.status((err as HTTPException).status ?? 401).json({ error: "unauthorized" }); }
  });
  app.get("/api/gmail/obligation/saved", async (_req, res) => {
    try {
      const rows = await discoveries().find({ user_id: res.locals.discoveryUserId }).sort({ due_date: 1 }).toArray();
      res.json({ proposals: rows.map(discoverySummary) });
    } catch { res.status(500).json({ error: "discovery_load_failed" }); }
  });
  app.get("/api/gmail/obligation/saved/:id", async (req, res) => {
    try {
      const row = await discoveries().findOne({ _id: req.params.id, user_id: res.locals.discoveryUserId });
      if (!row) { res.status(404).json({ error: "not_found" }); return; }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ...discoverySummary(row), preview_html: row.preview_html });
    } catch { res.status(500).json({ error: "discovery_load_failed" }); }
  });
  app.put("/api/gmail/obligation/saved/:id", async (req, res) => {
    if (!["new", "dismissed", "created"].includes(req.body.status)) { res.status(400).json({ error: "invalid_status" }); return; }
    try {
      const result = await discoveries().updateOne({ _id: req.params.id, user_id: res.locals.discoveryUserId }, { $set: { status: req.body.status, updated_at: new Date() } });
      if (!result.matchedCount) { res.status(404).json({ error: "not_found" }); return; }
      res.json({ ok: true });
    } catch { res.status(500).json({ error: "discovery_update_failed" }); }
  });
  app.get("/api/gmail/obligation/saved/:id/pdf/:fileId", async (req, res) => {
    try {
      const row = await discoveries().findOne({ _id: req.params.id, user_id: res.locals.discoveryUserId });
      const file = row?.pdfs.find(pdf => pdf.id === req.params.fileId);
      if (!file) { res.status(404).json({ error: "not_found" }); return; }
      res.setHeader("Cache-Control", "no-store");
      if (file.spaces_key) { res.redirect(await getSpacesSignedUrl(file.spaces_key, 300, file.filename, true)); return; }
      if (!file.local_path) { res.status(404).json({ error: "source_unavailable" }); return; }
      res.download(file.local_path, file.filename);
    } catch { if (!res.headersSent) res.status(500).json({ error: "source_unavailable" }); }
  });
  /**
   * POST /api/gmail/obligation/scan?langs=he,en&months=3
   * langs is 1–3 packs (en, he today). Omitted langs means Hebrew.
   * Reads the message body and, when the subject matches, the first attached PDF
   * together. Saves discoveries and their sources; reminders require review.
   */
  app.post("/api/gmail/obligation/scan", async (req, res) => {
    let userId: string;
    let plan: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
      plan = effectivePlanId(ctx.user);
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    if (!planAllowsDocumentImport(plan)) {
      res.status(403).json({ error: "plan_no_document_import", message: PLAN_GATE_MESSAGES.documentImport });
      return;
    }

    const langs = parseObligationSearchLangs(req.query.langs);
    if (typeof langs === "string") {
      res.status(400).json(obligationLangErrorBody(langs));
      return;
    }
    const months = historyMonths(req.query.months);
    const search = obligationSearchParameters(langs, months);

    const accessToken = await resolveGmailToken(userId);
    if (!accessToken) {
      res.status(403).json({ error: "gmail_not_connected" });
      return;
    }

    try {
      const listed = await listMessageIds(accessToken, userId, search.q);
      if (listed.error) {
        res.status(listed.error.httpStatus).json({ error: listed.error.code, detail: listed.error.message });
        return;
      }

      const accountRow = await col<{ gmail_email?: string }>("users").findOne({ _id: new ObjectId(userId) });
      const account = accountRow?.gmail_email ?? "default";
      const proposals = [];
      for (const id of listed.ids) {
        const hit = await scanMessage(listed.accessToken, id, userId, account);
        if (hit) proposals.push(hit);
      }
      proposals.sort((a, b) => a.due_date.localeCompare(b.due_date));

      logger.info("gmail_obligation_scan", {
        user_id: userId,
        langs: search.langs,
        scanned: listed.ids.length,
        found: proposals.length,
      });

      res.json({
        langs: search.langs,
        historyMonths: search.historyMonths,
        terms: search.terms,
        query: search.q,
        scanned: listed.ids.length,
        proposals,
      });
    } catch (err) {
      logger.error("gmail_obligation_scan_failed", { user_id: userId, error: String(err) });
      res.status(500).json({ error: "internal_error" });
    }
  });
}

function historyMonths(value: unknown): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_HISTORY_MONTHS;
  return Math.min(Math.floor(parsed), MAX_HISTORY_MONTHS);
}

export async function listMessageIds(
  accessToken: string,
  userId: string,
  query: string,
): Promise<{
  accessToken: string;
  ids: string[];
  error: { code: string; message: string; httpStatus: number } | null;
}> {
  let token = accessToken;
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const pageSize = Math.min(SCAN_PAGE_SIZE, MAX_SCAN_MESSAGES - ids.length);
    const url = `messages?q=${encodeURIComponent(query)}&maxResults=${pageSize}`
      + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    let listRes = await gmailFetch(token, url);
    if (listRes.status === 401) {
      const refreshed = await retryWithRefresh(userId);
      if (refreshed) {
        token = refreshed;
        listRes = await gmailFetch(token, url);
      }
    }
    if (!listRes.ok) {
      const error = await gmailError(listRes);
      return { accessToken: token, ids: [], error };
    }
    const data = await listRes.json() as { messages?: { id: string }[]; nextPageToken?: string };
    ids.push(...(data.messages ?? []).slice(0, pageSize).map((message) => message.id));
    pageToken = data.nextPageToken;
  } while (pageToken && ids.length < MAX_SCAN_MESSAGES);
  return {
    accessToken: token,
    ids,
    error: null,
  };
}

async function scanMessage(accessToken: string, id: string, userId: string, account: string) {
  const response = await gmailFetch(accessToken, `messages/${id}?format=full`);
  if (!response.ok) return null;
  const message = await response.json() as { payload?: MimePart; internalDate?: string };
  await loadExternalBodies(accessToken, id, message.payload);
  const headers = message.payload?.headers ?? [];
  const header = (name: string) => headers.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const subject = header("Subject");
  const from = header("From");
  const body = readBodies(message.payload);
  const emailText = messagePlain(body.plain, body.html);
  let pdfText: string | null = null;
  let attachmentName: string | null = null;
  const pdf = listPdfAttachments(message.payload).find((item) => item.size === 0 || item.size <= MAX_PDF_BYTES);
  if (pdf && subjectRequestsAttachmentDate(subject)) {
    pdfText = await pdfAttachmentText(accessToken, id, pdf);
    if (pdfText) attachmentName = pdf.filename;
  }
  const proposal = scanInlineEmailForObligation({
    from,
    subject,
    plain: [emailText, pdfText].filter(Boolean).join("\n"),
    html: null,
    sentOn: sentOnFromInternal(message.internalDate),
  });
  if (!proposal) return null;
  const recordId = discoveryId(userId, account, id);
  const existing = await discoveries().findOne({ _id: recordId, user_id: userId });
  const pdfs = [];
  for (const attachment of listPdfAttachments(message.payload)) {
    const bytes = await pdfAttachmentBytes(accessToken, id, attachment);
    if (!bytes) throw new Error("discovery_pdf_download_failed");
    pdfs.push(await saveDiscoveryPdf(recordId, attachment.attachmentId, attachment.filename, bytes));
  }
  const previewHtml = body.html ?? plainEmailHtml(body.plain ?? "");
  if (Buffer.byteLength(previewHtml) + Buffer.byteLength(body.plain ?? "") > 12 * 1024 * 1024) throw new Error("discovery_email_too_large");
  return persistDiscovery({
    _id: recordId, user_id: userId, account, messageId: id, subject, from, date: header("Date"),
    ...proposal, attachment_name: attachmentName, preview_html: previewHtml, plain_text: body.plain,
    pdfs: pdfs.length ? pdfs : existing?.pdfs ?? [],
  });
}

function messagePlain(plain: string | null, html: string | null): string {
  const plainText = String(plain ?? "").trim();
  const htmlText = html ? htmlToPlainText(html) : "";
  return htmlText.length > plainText.length ? htmlText : plainText;
}

function sentOnFromInternal(internalDate: string | undefined): string | undefined {
  const ms = Number(internalDate);
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  return new Date(ms).toISOString().slice(0, 10);
}

interface MimePart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: MimePart[];
}

async function loadExternalBodies(accessToken: string, messageId: string, part: MimePart | undefined): Promise<void> {
  if (!part) return;
  if (!part.filename && (part.mimeType === "text/html" || part.mimeType === "text/plain") && !part.body?.data && part.body?.attachmentId) {
    const response = await gmailFetch(accessToken, `messages/${messageId}/attachments/${part.body.attachmentId}`);
    if (!response.ok) throw new Error("discovery_email_download_failed");
    const body = await response.json() as { data?: string };
    if (!body.data) throw new Error("discovery_email_download_failed");
    part.body.data = body.data;
  }
  for (const child of part.parts ?? []) await loadExternalBodies(accessToken, messageId, child);
}

interface PdfAttachment {
  attachmentId: string;
  filename: string;
  size: number;
  data?: string;
}

function listPdfAttachments(part: MimePart | undefined): PdfAttachment[] {
  const found: PdfAttachment[] = [];
  function walk(node: MimePart | undefined) {
    if (!node) return;
    const name = node.filename ?? "";
    const mime = (node.mimeType ?? "").toLowerCase();
    const attachmentId = node.body?.attachmentId;
    const isPdf = mime === "application/pdf" || name.toLowerCase().endsWith(".pdf");
    if (isPdf && (attachmentId || node.body?.data)) {
      found.push({ attachmentId: attachmentId ?? `inline-${found.length}`, filename: name || "attachment.pdf", size: node.body?.size ?? 0, data: node.body?.data });
    }
    for (const child of node.parts ?? []) walk(child);
  }
  walk(part);
  return found;
}

async function pdfAttachmentBytes(accessToken: string, messageId: string, pdf: PdfAttachment): Promise<Buffer | null> {
  if (pdf.data) return Buffer.from(pdf.data, "base64url");
  const response = await gmailFetch(accessToken, `messages/${messageId}/attachments/${pdf.attachmentId}`);
  if (!response.ok) return null;
  const data = await response.json() as { data?: string };
  if (!data.data) return null;
  return Buffer.from(data.data, "base64url");
}

async function pdfAttachmentText(accessToken: string, messageId: string, pdf: PdfAttachment): Promise<string | null> {
  const bytes = await pdfAttachmentBytes(accessToken, messageId, pdf);
  if (!bytes) return null;
  if (bytes.length > MAX_PDF_BYTES) return null;
  const safeName = pdf.filename.replace(/[^a-zA-Z0-9._֐-׿ -]/g, "_").slice(0, 80) || "attachment.pdf";
  const tmpPath = join(tempDir("gmail-tmp"), `obligation-${randomUUID()}-${safeName}`);
  writeFileSync(tmpPath, bytes);
  try {
    const parsed = await parsePdf(tmpPath);
    const text = parsed.text.trim();
    return text.length ? text.slice(0, 20000) : null;
  } catch (err) {
    logger.warn("gmail_obligation_pdf_failed", { message_id: messageId, filename: pdf.filename, error: String(err) });
    return null;
  } finally {
    releaseTempFile(tmpPath);
  }
}

function readBodies(part: MimePart | undefined): { plain: string | null; html: string | null; hasAttachment: boolean } {
  const found = { plain: null as string | null, html: null as string | null, hasAttachment: false };
  function walk(node: MimePart | undefined) {
    if (!node) return;
    if (node.filename && node.body?.attachmentId) found.hasAttachment = true;
    if (node.body?.data && node.mimeType === "text/plain" && !found.plain) found.plain = decodeBody(node.body.data);
    if (node.body?.data && node.mimeType === "text/html" && !found.html) found.html = decodeBody(node.body.data);
    for (const child of node.parts ?? []) walk(child);
  }
  walk(part);
  return found;
}

function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

async function gmailError(response: Response): Promise<{ code: string; message: string; httpStatus: number }> {
  const body = await response.text().catch(() => "");
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) message = parsed.error.message;
  } catch { /* keep the raw slice */ }
  if (response.status === 401) {
    return { code: "gmail_auth_invalid", message: message || "Gmail authorization is invalid or expired.", httpStatus: 401 };
  }
  return { code: "gmail_api_error", message, httpStatus: response.status || 502 };
}
