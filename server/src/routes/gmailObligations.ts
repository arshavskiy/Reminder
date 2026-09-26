import express from "express";
import { writeFileSync } from "fs";
import { join } from "path";
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

const SCAN_PAGE_SIZE = 25;
const DEFAULT_HISTORY_MONTHS = 3;
const MAX_HISTORY_MONTHS = 36;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

export function registerGmailObligationRoutes(app: express.Application) {
  /**
   * GET /api/gmail/obligation/scan?langs=he,en&months=3
   * langs is 1–3 packs (en, he today). Omitted langs means Hebrew.
   * Reads the message body and, when the subject matches, the first attached PDF
   * together. Does not save a document or a reminder.
   */
  app.get("/api/gmail/obligation/scan", async (req, res) => {
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
      const listed = await listMessageIds(accessToken, userId, search.q, SCAN_PAGE_SIZE);
      if (listed.error) {
        res.status(listed.error.httpStatus).json({ error: listed.error.code, detail: listed.error.message });
        return;
      }

      const proposals = [];
      for (const id of listed.ids) {
        const hit = await scanMessage(listed.accessToken, id);
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

async function listMessageIds(
  accessToken: string,
  userId: string,
  query: string,
  pageSize: number,
): Promise<{
  accessToken: string;
  ids: string[];
  error: { code: string; message: string; httpStatus: number } | null;
}> {
  const url = `messages?q=${encodeURIComponent(query)}&maxResults=${pageSize}`;
  let token = accessToken;
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
  const data = await listRes.json() as { messages?: { id: string }[] };
  return {
    accessToken: token,
    ids: (data.messages ?? []).map((message) => message.id),
    error: null,
  };
}

async function scanMessage(accessToken: string, id: string) {
  const response = await gmailFetch(accessToken, `messages/${id}?format=full`);
  if (!response.ok) return null;
  const message = await response.json() as { payload?: MimePart; internalDate?: string };
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
  const dateSource = emailText && pdfText ? "email_and_pdf" : pdfText ? "pdf" : "body";
  return packed(id, subject, from, header("Date"), message.internalDate, body.hasAttachment || Boolean(pdfText), proposal, dateSource, attachmentName);
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

function packed(
  messageId: string,
  subject: string,
  from: string,
  date: string,
  internalDate: string | undefined,
  hasAttachment: boolean,
  proposal: NonNullable<ReturnType<typeof scanInlineEmailForObligation>>,
  dateSource: "body" | "pdf" | "email_and_pdf",
  attachmentName: string | null,
) {
  return {
    messageId,
    subject,
    from,
    date,
    internalDate: internalDate ?? "",
    hasAttachment,
    date_source: dateSource,
    attachment_name: attachmentName,
    ...proposal,
  };
}

interface MimePart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: MimePart[];
}

interface PdfAttachment {
  attachmentId: string;
  filename: string;
  size: number;
}

function listPdfAttachments(part: MimePart | undefined): PdfAttachment[] {
  const found: PdfAttachment[] = [];
  function walk(node: MimePart | undefined) {
    if (!node) return;
    const name = node.filename ?? "";
    const mime = (node.mimeType ?? "").toLowerCase();
    const attachmentId = node.body?.attachmentId;
    const isPdf = mime === "application/pdf" || name.toLowerCase().endsWith(".pdf");
    if (attachmentId && isPdf) {
      found.push({ attachmentId, filename: name || "attachment.pdf", size: node.body?.size ?? 0 });
    }
    for (const child of node.parts ?? []) walk(child);
  }
  walk(part);
  return found;
}

async function pdfAttachmentText(accessToken: string, messageId: string, pdf: PdfAttachment): Promise<string | null> {
  const response = await gmailFetch(accessToken, `messages/${messageId}/attachments/${pdf.attachmentId}`);
  if (!response.ok) return null;
  const data = await response.json() as { data?: string };
  if (!data.data) return null;
  const bytes = Buffer.from(data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (bytes.length > MAX_PDF_BYTES) return null;
  const safeName = pdf.filename.replace(/[^a-zA-Z0-9._֐-׿ -]/g, "_").slice(0, 80) || "attachment.pdf";
  const tmpPath = join(tempDir("gmail-tmp"), `obligation-${Date.now()}-${safeName}`);
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
