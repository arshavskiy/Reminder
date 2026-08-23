import express from "express";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { ObjectId } from "mongodb";
import { col } from "../db/db";
import { getSettings, getDataDir } from "../settings";
import { requireAuth } from "../auth/middleware";
import { generateState, generateCodeVerifier, generateCodeChallenge } from "../auth/google";
import { importFile, type PipelineOptions } from "../pipeline/importer";
import { logger } from "../logger";
import { loadGmailSearchProviders, type GmailSearchProvider } from "../gmail/searchProviders";
import { loadTemplate } from "../templates/seedTemplates";
import {
  assertDocumentImportQuota,
  DOCUMENT_MONTHLY_QUOTA_ERROR,
  DocumentImportQuotaError,
  type DocumentImportQuotaCategory,
  documentImportQuotaErrorPayload,
} from "../quotas/documentImportQuota";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.file";
const GMAIL_FULL_ACCESS_ROLES = new Set(["user", "pro", "admin"]);
const GMAIL_DEFAULT_PAGE_SIZE = 500;
const GMAIL_MAX_PAGE_SIZE = 500;

export function registerGmailRoutes(app: express.Application) {
  app.get("/api/gmail/search-providers", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }
    if (!hasFullGmailAccess(ctx.user.role)) { res.status(403).json({ error: "forbidden" }); return; }

    const providers = await loadGmailSearchProviders();
    res.json({ providers });
  });

  // GET /api/gmail/auth-url — start Gmail OAuth
  app.get("/api/gmail/auth-url", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }
    if (!hasFullGmailAccess(ctx.user.role)) { res.status(403).json({ error: "forbidden" }); return; }

    const settings = getSettings();
    const googleClientId = settings.googleClientId;
    if (!googleClientId) { res.status(500).json({ error: "google_client_not_configured" }); return; }
    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    await col("oauth_states").insertOne({
      state,
      code_verifier: codeVerifier,
      user_id: ctx.userId,
      type: "gmail",
      return_to: safeFrontendReturnPath(req.query.returnTo),
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    } as any);
    await col("oauth_states").deleteMany({ expires_at: { $lt: new Date() } });

    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: gmailRedirectUri(req),
      response_type: "code",
      scope: GMAIL_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: await generateCodeChallenge(codeVerifier),
      code_challenge_method: "S256",
    });

    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });

  // GET /auth/gmail/callback
  app.get("/auth/gmail/callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;
    const defaultReturnPath = "/gmail-inbox";

    if (error) { res.redirect(frontendUrl(`${defaultReturnPath}?error=${encodeURIComponent(error)}`)); return; }
    if (!code || !state) { res.redirect(frontendUrl(`${defaultReturnPath}?error=missing_params`)); return; }

    const pkce = await col<any>("oauth_states").findOne({ state, type: "gmail", expires_at: { $gt: new Date() } });
    if (!pkce) { res.redirect(frontendUrl(`${defaultReturnPath}?error=invalid_state`)); return; }
    await col("oauth_states").deleteOne({ state });
    const returnPath = safeFrontendReturnPath(pkce.return_to) ?? defaultReturnPath;

    const settings = getSettings();
    const googleClientId = settings.googleClientId;
    const googleClientSecret = settings.googleClientSecret;
    if (!googleClientId || !googleClientSecret) {
      res.redirect(frontendUrl(`${returnPath}?error=google_client_not_configured`));
      return;
    }
    const redirectUri = gmailRedirectUri(req);
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: String(pkce.code_verifier),
      }),
    });

    if (!tokenRes.ok) { res.redirect(frontendUrl(`${returnPath}?error=token_exchange_failed`)); return; }
    const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in: number };

      let gmailEmail: string | null = null;
      try {
          const profileRes = await gmailFetch(tokens.access_token, "profile");
          if (profileRes.ok) {
              const profile = await profileRes.json() as { emailAddress?: string };
              gmailEmail = profile.emailAddress ?? null;
          }
      } catch {
      }

      if (gmailEmail) {
          const existing = await col("users").findOne({
              gmail_email: gmailEmail,
              _id: {$ne: pkce.user_id},
          } as any);
          if (existing) {
              logger.warn("gmail_connect_duplicate_blocked", {
                  user_id: pkce.user_id.toString(),
                  gmail_email: gmailEmail,
                  existing_user_id: existing._id!.toString(),
              });
              res.redirect(frontendUrl(`${returnPath}?error=gmail_already_connected`));
              return;
          }
      }

    await col("users").updateOne(
      { _id: pkce.user_id } as any,
      { $set: {
          gmail_access_token: tokens.access_token,
          gmail_refresh_token: tokens.refresh_token ?? null,
          gmail_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
              gmail_email: gmailEmail,
        }
      }
    );

    res.redirect(frontendUrl(returnPath));
  });

  // GET /api/gmail/status — check if Gmail connected
  app.get("/api/gmail/status", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }
    if (!hasFullGmailAccess(ctx.user.role)) { res.status(403).json({ error: "forbidden" }); return; }

    const user = await col<any>("users").findOne({ _id: new ObjectId(ctx.userId) } as any);
    const userConnected = Boolean(user?.gmail_access_token);
    const envConnected = Boolean(process.env.GMAIL_ACCESS_TOKEN || process.env.GMAIL_REFRESH_TOKEN);
    const connected = userConnected || envConnected;
    const source = userConnected ? "oauth" : envConnected ? "env" : null;

    let email: string | null = null;
    if (connected) {
      const accessToken = await resolveGmailToken(ctx.userId);
      if (accessToken) {
        try {
          const profileRes = await gmailFetch(accessToken, "profile");
          if (profileRes.ok) {
            const profile = await profileRes.json() as { emailAddress?: string };
            email = profile.emailAddress ?? null;
          }
        } catch {}
      }
    }

    res.json({ connected, source, email });
  });

  // GET /api/gmail/inbox — list emails with PDF attachments
  app.get("/api/gmail/inbox", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }
    if (!hasFullGmailAccess(ctx.user.role)) { res.status(403).json({ error: "forbidden" }); return; }

    const accessToken = await resolveGmailToken(ctx.userId);
    if (!accessToken) { res.status(403).json({ error: "gmail_not_connected" }); return; }

    try {
      const templateId = req.query.templateId as string | undefined;
      const template = templateId ? await loadTemplate(templateId).catch(() => null) : null;
      const q = buildGmailQuery(req.query.q as string | undefined, template);
      logger.info("gmail_inbox_query", { query: q, templateId: templateId ?? null, inspection: isInspectionTemplate(template) });
      const maxResults = gmailPageSize(req.query.limit);
      const pageToken = (req.query.pageToken as string) || undefined;

      let url = `messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

      let listRes = await gmailFetch(accessToken, url);
      if (listRes.status === 401) {
        const refreshed = await retryWithRefresh(ctx.userId);
        if (refreshed) listRes = await gmailFetch(refreshed, url);
      }
      const listError = await parseGmailError(listRes);
      if (listError) {
        logger.error("gmail_inbox_api_error", { status: listRes.status, code: listError.code, message: listError.message, body: listError.body.slice(0, 500) });
        res.status(listError.httpStatus).json({ error: listError.code, detail: listError.message });
        return;
      }
      const listData = await listRes.json() as { messages?: { id: string }[]; nextPageToken?: string; resultSizeEstimate?: number };
      const messageIds = listData.messages ?? [];
      logger.info("gmail_inbox_list", { query: q, resultCount: messageIds.length, resultSizeEstimate: listData.resultSizeEstimate });

      const diagnostics = createGmailDiagnostics(q, requestedExtensionsFromQuery(q), messageIds.length);
      const emails = await Promise.all(
        messageIds.map(({ id }) => fetchEmailMeta(accessToken, id, diagnostics.allowedExtensions, diagnostics))
      );
      const visibleEmails = emails.filter(Boolean);
      logGmailDiagnostics("gmail_inbox_parse", diagnostics, visibleEmails.length);

      res.json({ emails: visibleEmails, nextPageToken: listData.nextPageToken ?? null, resultSizeEstimate: listData.resultSizeEstimate ?? null });
    } catch (err) {
      res.status(500).json({ error: "internal_error" });
    }
  });

  // GET /api/gmail/attachment/:messageId/:attachmentId — download a specific attachment
  app.get("/api/gmail/attachment/:messageId/:attachmentId", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }
    if (!hasFullGmailAccess(ctx.user.role)) { res.status(403).json({ error: "forbidden" }); return; }

    const accessToken = await resolveGmailToken(ctx.userId);
    if (!accessToken) { res.status(403).json({ error: "gmail_not_connected" }); return; }

    const { messageId, attachmentId } = req.params;
    let attRes = await gmailFetch(accessToken, `messages/${messageId}/attachments/${attachmentId}`);
    if (attRes.status === 401) {
      const refreshed = await retryWithRefresh(ctx.userId);
      if (refreshed) attRes = await gmailFetch(refreshed, `messages/${messageId}/attachments/${attachmentId}`);
    }
    const attError = await parseGmailError(attRes);
    if (attError) {
      logger.error("gmail_attachment_api_error", { status: attRes.status, code: attError.code, message: attError.message, body: attError.body.slice(0, 500) });
      res.status(attError.httpStatus).json({ error: attError.code, detail: attError.message });
      return;
    }

    const attData = await attRes.json() as { data: string };
    const buf = Buffer.from(attData.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const filename = (req.query.filename as string) || "attachment.pdf";

    res.setHeader("Content-Type", "application/pdf");
    const disposition = req.query.preview === "1" ? "inline" : "attachment";
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
    res.send(buf);
  });

  // POST /api/gmail/import-attachment — server-side download + pipeline import
  app.post("/api/gmail/import-attachment", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }
    if (!hasFullGmailAccess(ctx.user.role)) { res.status(403).json({ error: "forbidden" }); return; }

    const { messageId, attachmentId, filename, templateId } = req.body;
    if (!messageId || !attachmentId) { res.status(400).json({ error: "messageId and attachmentId required" }); return; }

    const accessToken = await resolveGmailToken(ctx.userId);
    if (!accessToken) { res.status(403).json({ error: "gmail_not_connected" }); return; }

    try {
      const meta = await fetchGmailMessageHeaders(accessToken, messageId);
      const template = templateId ? await loadTemplate(templateId).catch(() => null) : null;
      if (isInspectionTemplate(template) && isMonthlyReportGmailItem(meta, filename)) {
        res.status(422).json({ error: "monthly_report_not_imported" });
        return;
      }
      await assertDocumentImportQuota(ctx.userId, ctx.user.plan ?? ctx.user.role, 1, quotaCategoryFromTemplate(template));
      const pipeline = await gmailImportPipelineOptions(templateId, meta, filename);
      const result = await downloadAndImportAttachment(accessToken, messageId, attachmentId, filename ?? "attachment.pdf", ctx.userId, pipeline);
      await col("gmail_imports").updateOne(
        { user_id: ctx.userId, message_id: messageId },
        {
          $setOnInsert: { user_id: ctx.userId, message_id: messageId, imported_at: new Date() },
          $push: { files: { filename: result.filename, document_id: result.documentId, error: null } } as any,
        },
        { upsert: true }
      );
      res.json(result);
    } catch (err: any) {
      if (err instanceof DocumentImportQuotaError) {
        res.status(403).json(documentImportQuotaErrorPayload(err));
        return;
      }
      logger.error("gmail_import_attachment_failed", { user_id: ctx.userId, messageId, error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/gmail/import-all — scan inbox, import all new PDF attachments
  app.post("/api/gmail/import-all", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }
    if (!hasFullGmailAccess(ctx.user.role)) { res.status(403).json({ error: "forbidden" }); return; }

    const accessToken = await resolveGmailToken(ctx.userId);
    if (!accessToken) { res.status(403).json({ error: "gmail_not_connected" }); return; }

    const templateId = req.body.templateId as string | undefined;
    const template = templateId ? await loadTemplate(templateId).catch(() => null) : null;
    const q = buildGmailQuery(req.body.q as string | undefined, template);
    logger.info("gmail_import_all_query", { query: q, templateId: templateId ?? null, inspection: isInspectionTemplate(template) });
    const maxResults = gmailPageSize(req.body.limit);
    const skipMonthlyReports = isInspectionTemplate(template);
    const quotaCategory = quotaCategoryFromTemplate(template);

    try {
      let listRes = await gmailFetch(accessToken, `messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`);
      if (listRes.status === 401) {
        const refreshed = await retryWithRefresh(ctx.userId);
        if (refreshed) listRes = await gmailFetch(refreshed, `messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`);
      }
      const listError = await parseGmailError(listRes);
      if (listError) {
        logger.error("gmail_import_all_api_error", { status: listRes.status, code: listError.code, message: listError.message, body: listError.body.slice(0, 500) });
        res.status(listError.httpStatus).json({ error: listError.code, detail: listError.message });
        return;
      }
      const listData = await listRes.json() as { messages?: { id: string }[] };
      const messageIds = listData.messages ?? [];
      const diagnostics = createGmailDiagnostics(q, requestedExtensionsFromQuery(q), messageIds.length);

      const alreadyImported = await col("gmail_imports").find(
        { user_id: ctx.userId, message_id: { $in: messageIds.map(m => m.id) } },
        { projection: { message_id: 1 } }
      ).toArray();
      const importedSet = new Set(alreadyImported.map((r: any) => r.message_id));

      const newMessages = messageIds.filter(m => !importedSet.has(m.id));
      if (!newMessages.length) { res.json({ imported: 0, skipped: messageIds.length, results: [] }); return; }

      const results: Array<{ messageId: string; filename: string; documentId?: string; error?: string }> = [];
      let quotaLimitReached: DocumentImportQuotaError | null = null;

      for (const { id } of newMessages) {
        const meta = await fetchEmailMeta(accessToken, id, diagnostics.allowedExtensions, diagnostics);
        if (!meta) continue;
        if (skipMonthlyReports && isMonthlyReportGmailItem(meta)) {
          logger.info("gmail_import_monthly_report_skipped", {
            user_id: ctx.userId,
            message_id: id,
            template_id: templateId ?? null,
            subject: meta.subject,
          });
          continue;
        }

        for (const att of meta.attachments) {
          if (skipMonthlyReports && isMonthlyReportGmailItem(meta, att.filename)) {
            logger.info("gmail_import_monthly_report_attachment_skipped", {
              user_id: ctx.userId,
              message_id: id,
              filename: att.filename,
            });
            continue;
          }
          try {
            await assertDocumentImportQuota(ctx.userId, ctx.user.plan ?? ctx.user.role, 1, quotaCategory);
            const pipeline = await gmailImportPipelineOptions(templateId, meta, att.filename);
            const result = await downloadAndImportAttachment(accessToken, id, att.attachmentId, att.filename, ctx.userId, pipeline);
            results.push({ messageId: id, filename: att.filename, documentId: result.documentId });
          } catch (err: any) {
            if (err instanceof DocumentImportQuotaError) {
              quotaLimitReached = err;
              results.push({ messageId: id, filename: att.filename, error: DOCUMENT_MONTHLY_QUOTA_ERROR });
              break;
            }
            results.push({ messageId: id, filename: att.filename, error: err.message });
          }
        }

        const fileResults = results.filter(r => r.messageId === id);
        await col("gmail_imports").updateOne(
          { user_id: ctx.userId, message_id: id },
          {
            $setOnInsert: { user_id: ctx.userId, message_id: id, imported_at: new Date(), subject: meta.subject },
            $set: { files: fileResults.map(r => ({ filename: r.filename, document_id: r.documentId ?? null, error: r.error ?? null })) },
          },
          { upsert: true }
        );
        if (quotaLimitReached) break;
      }

      logGmailDiagnostics("gmail_import_all_parse", diagnostics, results.length ? new Set(results.map(r => r.messageId)).size : 0);
      logger.info("gmail_bulk_import", { user_id: ctx.userId, total: messageIds.length, new: newMessages.length, imported: results.filter(r => r.documentId).length, quota_limit_reached: Boolean(quotaLimitReached) });
      res.json({
        imported: results.filter(r => r.documentId).length,
        skipped: importedSet.size,
        results,
        quota: quotaLimitReached ? documentImportQuotaErrorPayload(quotaLimitReached) : null,
      });
    } catch (err: any) {
      logger.error("gmail_import_all_failed", { user_id: ctx.userId, error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/gmail/import-history — list previously imported messages
  app.get("/api/gmail/import-history", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }
    if (!hasFullGmailAccess(ctx.user.role)) { res.status(403).json({ error: "forbidden" }); return; }

    const history = await col("gmail_imports").find(
      { user_id: ctx.userId },
      { projection: { _id: 0, message_id: 1, subject: 1, imported_at: 1, files: 1 } }
    ).sort({ imported_at: -1 }).limit(200).toArray();

    const documentIds = [...new Set(
      history.flatMap((item: any) => (item.files ?? [])
        .map((file: any) => String(file.document_id ?? ""))
        .filter((id: string) => ObjectId.isValid(id))
      )
    )];
    const documents = documentIds.length
      ? await col("documents")
        .find({ _id: { $in: documentIds.map((id) => new ObjectId(id)) }, user_id: ctx.userId } as any, { projection: { raw_text: 0 } } as any)
        .toArray()
      : [];
    const invoices = documentIds.length
      ? await col("invoices")
        .find({ document_id: { $in: documentIds }, user_id: ctx.userId } as any)
        .toArray()
      : [];
    const invoiceMap = new Map(invoices.map((invoice: any) => [String(invoice.document_id), invoice]));
    const docMap = new Map(documents.map((doc: any) => [doc._id.toString(), flatGmailImportedDocument(doc, invoiceMap.get(doc._id.toString()))]));

    res.json({
      history: history.map((item: any) => ({
        ...item,
        files: (item.files ?? []).map((file: any) => ({
          ...file,
          document: file.document_id ? docMap.get(String(file.document_id)) ?? null : null,
        })),
      })),
    });
  });

  // DELETE /api/gmail/disconnect
  app.delete("/api/gmail/disconnect", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }
    if (!hasFullGmailAccess(ctx.user.role)) { res.status(403).json({ error: "forbidden" }); return; }

    await col("users").updateOne(
      { _id: new ObjectId(ctx.userId) } as any,
        {$unset: {gmail_access_token: "", gmail_refresh_token: "", gmail_token_expires_at: "", gmail_email: ""}}
    );
    res.json({ ok: true });
  });
}

function hasFullGmailAccess(role: string | null | undefined): boolean {
  return GMAIL_FULL_ACCESS_ROLES.has(role ?? "");
}

function gmailPageSize(value: unknown): number {
  const parsed = parseInt(String(value ?? GMAIL_DEFAULT_PAGE_SIZE), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return GMAIL_DEFAULT_PAGE_SIZE;
  return Math.min(parsed, GMAIL_MAX_PAGE_SIZE);
}

function flatGmailImportedDocument(doc: any, invoice?: any) {
  const id = doc._id?.toString?.() ?? String(doc._id);
  return {
    id,
    file_name: doc.file_name ?? "",
    mime_type: doc.mime_type ?? null,
    processing_status: doc.processing_status ?? "queued",
    invoice_id: invoice?._id?.toString?.() ?? null,
    invoice_status: invoice?.status ?? null,
    possible_not_invoice: Boolean(invoice?.possible_not_invoice),
    invoice_validation_status: invoice?.invoice_validation_status ?? null,
    missing_required_fields: Array.isArray(invoice?.missing_required_fields) ? invoice.missing_required_fields : [],
    business: invoice?.business ?? invoice?.fields?.business ?? invoice?.fields?.business_name ?? null,
    expense_category: invoice?.expense_category ?? invoice?.fields?.expense_category ?? null,
    document_kind: doc.document_kind ?? null,
    document_type: doc.document_type ?? null,
    extracted_fields: parseJsonObject(doc.extracted_fields),
    import_date: doc.import_date ?? doc.created_at ?? null,
    created_at: doc.created_at ?? null,
    preview_url: `/api/documents/${id}/download`,
    thumbnail_url: doc.thumbnail_key || doc.thumbnail_path ? `/api/documents/${id}/thumbnail` : null,
    download_url: `/api/documents/${id}/download?dl=1`,
  };
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function parseGmailError(res: Response): Promise<null | {
  code: string;
  message: string;
  httpStatus: number;
  body: string;
}> {
  if (res.ok) return null;
  const body = await res.text().catch(() => "");
  let googleCode = "";
  let googleMessage = "";
  let googleStatus = "";
  let googleReason = "";
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        status?: string;
        errors?: Array<{ reason?: string; message?: string }>;
      };
    };
    googleMessage = parsed.error?.message ?? "";
    googleStatus = parsed.error?.status ?? "";
    googleReason = parsed.error?.errors?.[0]?.reason ?? "";
  } catch {
    googleMessage = body.trim();
  }

  if (res.status === 401 || googleStatus === "UNAUTHENTICATED" || googleReason === "authError") {
    googleCode = "gmail_auth_invalid";
    googleMessage = googleMessage || "Gmail authorization is invalid or expired. Reconnect Gmail.";
    return { code: googleCode, message: googleMessage, httpStatus: 401, body };
  }

  if (res.status === 403) {
    googleCode = googleReason === "insufficientPermissions" ? "gmail_scope_missing" : "gmail_permission_denied";
    googleMessage = googleMessage || "Gmail permission denied.";
    return { code: googleCode, message: googleMessage, httpStatus: 403, body };
  }

  if (res.status === 429) {
    googleMessage = googleMessage || "Gmail rate limit exceeded.";
    return { code: "gmail_rate_limited", message: googleMessage, httpStatus: 429, body };
  }

  googleMessage = googleMessage || `Gmail API returned ${res.status}`;
  return { code: "gmail_api_error", message: googleMessage, httpStatus: 502, body };
}

type GmailAttachmentMeta = { attachmentId: string; filename: string; size: number; mimeType: string };
type GmailSkippedAttachment = { filename: string; mimeType: string; size: number; reason: string };
type GmailMessageHeaders = { subject: string; from: string; date: string };
type GmailDiagnostics = {
  query: string;
  allowedExtensions: Set<string>;
  messageCount: number;
  attachmentCount: number;
  skippedAttachmentCount: number;
  skippedSamples: GmailSkippedAttachment[];
};

async function fetchGmailMessageHeaders(accessToken: string, id: string): Promise<GmailMessageHeaders | null> {
  const r = await gmailFetch(accessToken, `messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
  if (!r.ok) return null;
  const msg = await r.json() as any;
  const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
  const get = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  return { subject: get("Subject"), from: get("From"), date: get("Date") };
}

async function fetchEmailMeta(
  accessToken: string,
  id: string,
  allowedExtensions = new Set(["pdf"]),
  diagnostics?: GmailDiagnostics,
) {
  const r = await gmailFetch(accessToken, `messages/${id}?format=full`);
  if (!r.ok) return null;
  const msg = await r.json() as any;

  const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
  const get = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  const attachments: GmailAttachmentMeta[] = [];
  collectMatchingAttachments(msg.payload, allowedExtensions, attachments, diagnostics);

  if (!attachments.length) return null;

  return {
    id,
    subject: get("Subject"),
    from: get("From"),
    date: get("Date"),
    internalDate: msg.internalDate as string,
    attachments,
  };
}

async function gmailImportPipelineOptions(
  templateId: string | undefined,
  meta: GmailMessageHeaders | null,
  filename: string | undefined,
): Promise<PipelineOptions | undefined> {
  const pipeline: PipelineOptions = { gmailImport: true, ...(templateId ? { templateId } : {}) };
  if (!templateId) return pipeline;

  const template = await loadTemplate(templateId).catch(() => null);
  if (!isInvoiceTemplate(template)) return pipeline;

  const provider = await matchGmailSearchProvider(`${meta?.from ?? ""} ${meta?.subject ?? ""} ${filename ?? ""}`);
  const invoiceFolder = provider
    ? `gmail/invoices/${provider.category}/${provider.id}`
    : "gmail/invoices/other";
  return { ...pipeline, storageKeyPrefix: invoiceFolder };
}

function isInvoiceTemplate(template: Awaited<ReturnType<typeof loadTemplate>>): boolean {
  if (!template) return false;
  return template.document_kind === "invoice" || template.name.includes("חשבונית");
}

function isInspectionTemplate(template: Awaited<ReturnType<typeof loadTemplate>>): boolean {
  if (!template) return false;
  return template.document_kind === "inspection_report" || /תסקיר|בדיקה/.test(template.name);
}

const INSPECTION_GMAIL_QUERY = "has:attachment filename:pdf תסקיר";

function buildGmailQuery(userQuery: string | undefined, template: Awaited<ReturnType<typeof loadTemplate>>): string {
  const defaultQuery = "has:attachment filename:pdf";
  const q = userQuery || defaultQuery;
  if (isInspectionTemplate(template) && q === defaultQuery) {
    return INSPECTION_GMAIL_QUERY;
  }
  return q;
}

function quotaCategoryFromTemplate(template: Awaited<ReturnType<typeof loadTemplate>>): DocumentImportQuotaCategory {
  if (isInspectionTemplate(template) || template?.document_kind === "contract") return "contracts";
  if (isInvoiceTemplate(template)) return "invoices";
  return "documents";
}

function isMonthlyReportGmailItem(meta: GmailMessageHeaders | null, filename = ""): boolean {
  const text = normalizeSearchText(`${meta?.subject ?? ""} ${meta?.from ?? ""} ${filename}`);
  return text.includes("דוח חודשי") || text.includes("דו ח חודשי") || text.includes("monthly report");
}

async function matchGmailSearchProvider(text: string): Promise<GmailSearchProvider | null> {
  const haystack = normalizeSearchText(text);
  if (!haystack) return null;
  const providers = await loadGmailSearchProviders();
  for (const provider of providers) {
    for (const term of provider.terms) {
      const needle = normalizeSearchText(term);
      if (needle && haystack.includes(needle)) return provider;
    }
  }
  return null;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function collectMatchingAttachments(
  part: any,
  allowedExtensions: Set<string>,
  out: GmailAttachmentMeta[],
  diagnostics?: GmailDiagnostics,
) {
  if (!part) return;
  if (part.body?.attachmentId) {
    const filename = String(part.filename || "").trim();
    const mimeType = String(part.mimeType || "").trim();
    const size = Number(part.body.size || 0);
    const ext = extensionFromFilename(filename);
    if (matchesRequestedAttachment(filename, mimeType, allowedExtensions) && !isJunkAttachment(filename, size)) {
      out.push({
        attachmentId: part.body.attachmentId,
        filename: filename || `attachment.${[...allowedExtensions][0] ?? "bin"}`,
        size,
        mimeType,
      });
      if (diagnostics) diagnostics.attachmentCount += 1;
    } else if (diagnostics) {
      diagnostics.skippedAttachmentCount += 1;
      if (diagnostics.skippedSamples.length < 12) {
        diagnostics.skippedSamples.push({
          filename: filename || "(no filename)",
          mimeType: mimeType || "(no mime)",
          size,
          reason: filename ? `extension_not_selected:${ext || "none"}` : "no_filename",
        });
      }
    }
  }
  if (part.parts) {
    for (const child of part.parts) {
      collectMatchingAttachments(child, allowedExtensions, out, diagnostics);
    }
  }
}

function extensionFromFilename(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function matchesRequestedAttachment(filename: string, mimeType: string, allowedExtensions: Set<string>): boolean {
  const ext = extensionFromFilename(filename);
  if (ext && allowedExtensions.has(ext)) return true;
  const mime = mimeType.toLowerCase();
  if (allowedExtensions.has("pdf") && mime === "application/pdf") return true;
  if ((allowedExtensions.has("doc") || allowedExtensions.has("docx")) && mime.includes("wordprocessingml")) return true;
  if ((allowedExtensions.has("xls") || allowedExtensions.has("xlsx")) && mime.includes("spreadsheetml")) return true;
  if ((allowedExtensions.has("jpg") || allowedExtensions.has("jpeg") || allowedExtensions.has("png")) && mime.startsWith("image/")) return true;
  return false;
}

const JUNK_FILENAME_PATTERNS = /^(logo|signature|banner|header|footer|image\d*|icon|stamp|seal|badge)\./i;
const MIN_DOCUMENT_SIZE = 5_000; // 5KB — skip tiny attachments (logos, signatures, inline images)

function isJunkAttachment(filename: string, size: number): boolean {
  if (size > 0 && size < MIN_DOCUMENT_SIZE) return true;
  if (JUNK_FILENAME_PATTERNS.test(filename)) return true;
  return false;
}

function requestedExtensionsFromQuery(query: string): Set<string> {
  const matches = [...query.matchAll(/filename:([a-z0-9]+)/gi)].map((m) => m[1].toLowerCase());
  const supported = new Set(["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png"]);
  const selected = matches.filter((ext) => supported.has(ext));
  return new Set(selected.length ? selected : ["pdf"]);
}

function createGmailDiagnostics(query: string, allowedExtensions: Set<string>, messageCount: number): GmailDiagnostics {
  return {
    query,
    allowedExtensions,
    messageCount,
    attachmentCount: 0,
    skippedAttachmentCount: 0,
    skippedSamples: [],
  };
}

function logGmailDiagnostics(event: string, diagnostics: GmailDiagnostics, visibleEmailCount: number) {
  logger.info(event, {
    query: diagnostics.query,
    requested_extensions: [...diagnostics.allowedExtensions],
    gmail_messages: diagnostics.messageCount,
    visible_emails: visibleEmailCount,
    matched_attachments: diagnostics.attachmentCount,
    skipped_attachments: diagnostics.skippedAttachmentCount,
    skipped_samples: diagnostics.skippedSamples,
  });
}

async function refreshGmailToken(user: any, userId: string): Promise<string | null> {
  if (!user.gmail_refresh_token) return null;
  const settings = getSettings();
  const googleClientId = settings.googleClientId;
  const googleClientSecret = settings.googleClientSecret;
  if (!googleClientId || !googleClientSecret) return null;
  const refreshToken = String(user.gmail_refresh_token);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) return null;
  const data = await r.json() as { access_token: string; expires_in: number };
  await col("users").updateOne(
    { _id: new ObjectId(userId) } as any,
    { $set: {
        gmail_access_token: data.access_token,
        gmail_token_expires_at: new Date(Date.now() + data.expires_in * 1000),
      }
    }
  );
  return data.access_token;
}

function gmailFetch(accessToken: string, path: string) {
  return fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function resolveGmailToken(userId: string): Promise<string | null> {
  // 1. Check user's OAuth token
  const user = await col<any>("users").findOne({ _id: new ObjectId(userId) } as any);
  if (user?.gmail_access_token) {
    if (user.gmail_token_expires_at && new Date(user.gmail_token_expires_at) <= new Date()) {
      logger.info("gmail_token_resolve", { source: "user_oauth", action: "refreshing_expired" });
      const refreshed = await refreshGmailToken(user, userId);
      if (refreshed) return refreshed;
      logger.warn("gmail_token_resolve", { source: "user_oauth", action: "refresh_failed_falling_to_env" });
    } else {
      logger.info("gmail_token_resolve", { source: "user_oauth", action: "using_valid_token" });
      return user.gmail_access_token;
    }
  }

  // 2. Fall back to env tokens
  const envToken = process.env.GMAIL_ACCESS_TOKEN;
  const envRefresh = process.env.GMAIL_REFRESH_TOKEN;
  logger.info("gmail_token_resolve", { source: "env", hasToken: !!envToken, hasRefresh: !!envRefresh, hasCached: !!cachedEnvToken, cacheExpiry: envTokenExpiry?.toISOString() ?? null });
  if (!envToken && !envRefresh) return null;

  if (cachedEnvToken && envTokenExpiry && envTokenExpiry > new Date()) return cachedEnvToken;

  if (envRefresh) {
    const refreshed = await refreshEnvGmailToken();
    if (refreshed) { logger.info("gmail_token_resolve", { source: "env", action: "refreshed_ok" }); return refreshed; }
    logger.warn("gmail_token_resolve", { source: "env", action: "refresh_failed" });
  }

  return cachedEnvToken ?? envToken ?? null;
}

let cachedEnvToken: string | null = null;
let envTokenExpiry: Date | null = null;

async function refreshEnvGmailToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? getSettings().googleClientId;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? getSettings().googleClientSecret;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    logger.error("gmail_env_token_refresh_failed", { status: r.status, body: body.slice(0, 500), clientId: clientId?.slice(0, 20), hasSecret: !!clientSecret, refreshLen: refreshToken?.length });
    return null;
  }
  const data = await r.json() as { access_token: string; expires_in: number };
  cachedEnvToken = data.access_token;
  envTokenExpiry = new Date(Date.now() + data.expires_in * 1000);
  return cachedEnvToken;
}

async function downloadAndImportAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
  filename: string,
  userId: string,
  pipeline?: PipelineOptions
): Promise<{ documentId: string; filename: string }> {
  const attRes = await gmailFetch(accessToken, `messages/${messageId}/attachments/${attachmentId}`);
  const attError = await parseGmailError(attRes);
  if (attError) throw new Error(attError.code);

  const attData = await attRes.json() as { data: string };
  const buf = Buffer.from(attData.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");

  const tmpDir = join(getDataDir(), "gmail-tmp");
  mkdirSync(tmpDir, { recursive: true });
  const safeName = filename.replace(/[^a-zA-Z0-9._֐-׿ -]/g, "_");
  const tmpPath = join(tmpDir, `${Date.now()}-${safeName}`);
  writeFileSync(tmpPath, buf);

  const documentId = await importFile(tmpPath, undefined, userId, filename, pipeline);
  logger.info("gmail_attachment_imported", { user_id: userId, messageId, filename, documentId });
  return { documentId, filename };
}

async function retryWithRefresh(userId: string): Promise<string | null> {
  const user = await col<any>("users").findOne({ _id: new ObjectId(userId) } as any);
  if (user?.gmail_refresh_token) {
    return refreshGmailToken(user, userId);
  }
  if (process.env.GMAIL_REFRESH_TOKEN) {
    return refreshEnvGmailToken();
  }
  return null;
}

function gmailRedirectUri(req: express.Request): string {
  if (process.env.GMAIL_REDIRECT_URI) return process.env.GMAIL_REDIRECT_URI;
  const frontendBase = oauthCallbackBaseUrl();
  if (frontendBase) return `${frontendBase}/auth/gmail/callback`;
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}/auth/gmail/callback`;
}

function oauthCallbackBaseUrl(): string | null {
  const isProd = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
  if (isProd && process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  return null;
}

function frontendUrl(path: string) {
  const isProd = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
  const base = !isProd
    ? (process.env.DEV_FRONTEND_URL ?? "http://localhost:4173")
    : (process.env.FRONTEND_URL ?? "");
  return `${base}${path}`;
}

function safeFrontendReturnPath(value: unknown): string | null {
  const text = String(Array.isArray(value) ? value[0] : value ?? "").trim();
  if (!text || !text.startsWith("/") || text.startsWith("//")) return null;
  if (/[\r\n]/.test(text)) return null;
  return text;
}
