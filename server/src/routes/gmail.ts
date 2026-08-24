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
import { tierFeatureFlags } from "../plans/tierFeatures";
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
const GMAIL_JOB_STALE_MS = 10 * 60 * 1000;
const REJECTED_INVOICE_VALIDATION_STATUSES = new Set([
  "missing_required_fields",
  "missing_invoice_number_and_amount",
]);

type GmailImportJobStatus = "queued" | "running" | "completed" | "failed";
type GmailImportJobResult = { messageId: string; filename: string; documentId?: string; error?: string };
type GmailImportJob = {
  _id: ObjectId;
  user_id: string;
  status: GmailImportJobStatus;
  q: string;
  template_id: string | null;
  max_results: number;
  total_messages: number;
  new_messages: number;
  processed_messages: number;
  imported: number;
  skipped: number;
  errors: number;
  results: GmailImportJobResult[];
  message_ids?: string[];
  cursor?: number;
  error?: string | null;
  quota?: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  started_at?: Date;
  completed_at?: Date;
};

type GmailImportHistoryRow = {
  message_id?: string;
  files?: Array<{ document_id?: unknown; error?: unknown }>;
};

let gmailImportWorkerRunning = false;

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
      const invoiceHistoryMonths = isInvoiceTemplate(template)
        ? tierFeatureFlags(ctx.user.plan ?? ctx.user.role).gmailInvoiceHistoryMonths
        : null;
      if (isInvoiceTemplate(template) && (!invoiceHistoryMonths || invoiceHistoryMonths < 1)) {
        res.status(403).json({
          error: "gmail_invoice_plan_required",
          message: "ייבוא חשבוניות מ-Gmail זמין במסלולים בסיסי ועסקי בלבד",
        });
        return;
      }
      const q = buildGmailQuery(req.query.q as string | undefined, template, ctx.user.plan ?? ctx.user.role);
      logger.info("gmail_inbox_query", {
        query: q,
        templateId: templateId ?? null,
        inspection: isInspectionTemplate(template),
        gmailInvoiceHistoryMonths: invoiceHistoryMonths,
      });
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

  // POST /api/gmail/import-all — enqueue a durable Gmail bulk import job.
  app.post("/api/gmail/import-all", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }
    if (!hasFullGmailAccess(ctx.user.role)) { res.status(403).json({ error: "forbidden" }); return; }

    const accessToken = await resolveGmailToken(ctx.userId);
    if (!accessToken) { res.status(403).json({ error: "gmail_not_connected" }); return; }

    const templateId = req.body.templateId as string | undefined;
    const template = templateId ? await loadTemplate(templateId).catch(() => null) : null;
    const invoiceHistoryMonths = isInvoiceTemplate(template)
      ? tierFeatureFlags(ctx.user.plan ?? ctx.user.role).gmailInvoiceHistoryMonths
      : null;
    if (isInvoiceTemplate(template) && (!invoiceHistoryMonths || invoiceHistoryMonths < 1)) {
      res.status(403).json({
        error: "gmail_invoice_plan_required",
        message: "ייבוא חשבוניות מ-Gmail זמין במסלולים בסיסי ועסקי בלבד",
      });
      return;
    }
    const q = buildGmailQuery(req.body.q as string | undefined, template, ctx.user.plan ?? ctx.user.role);
    logger.info("gmail_import_all_query", {
      query: q,
      templateId: templateId ?? null,
      inspection: isInspectionTemplate(template),
      gmailInvoiceHistoryMonths: invoiceHistoryMonths,
    });
    const maxResults = gmailPageSize(req.body.limit);

    try {
      const now = new Date();
      const insert = await col<GmailImportJob>("gmail_import_jobs").insertOne({
        user_id: ctx.userId,
        status: "queued",
        q,
        template_id: templateId ?? null,
        max_results: maxResults,
        total_messages: 0,
        new_messages: 0,
        processed_messages: 0,
        imported: 0,
        skipped: 0,
        errors: 0,
        results: [],
        cursor: 0,
        error: null,
        quota: null,
        created_at: now,
        updated_at: now,
      } as any);
      startGmailImportJobWorker();
      res.status(202).json({
        jobId: insert.insertedId.toString(),
        status: "queued",
        imported: 0,
        skipped: 0,
        results: [],
      });
    } catch (err: any) {
      logger.error("gmail_import_all_failed", { user_id: ctx.userId, error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/gmail/import-jobs/:jobId", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }
    if (!hasFullGmailAccess(ctx.user.role)) { res.status(403).json({ error: "forbidden" }); return; }

    const jobId = String(req.params.jobId ?? "");
    if (!ObjectId.isValid(jobId)) { res.status(400).json({ error: "invalid_job_id" }); return; }
    startGmailImportJobWorker();

    const job = await col<GmailImportJob>("gmail_import_jobs").findOne(
      { _id: new ObjectId(jobId), user_id: ctx.userId } as any,
      { projection: { message_ids: 0 } } as any
    );
    if (!job) { res.status(404).json({ error: "job_not_found" }); return; }
    res.json(presentGmailImportJob(job));
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

  app.delete("/api/gmail/import-history/:messageId", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }
    if (!hasFullGmailAccess(ctx.user.role)) { res.status(403).json({ error: "forbidden" }); return; }

    const messageId = String(req.params.messageId ?? "").trim();
    if (!messageId) {
      res.status(400).json({ error: "messageId required" });
      return;
    }

    const result = await col("gmail_imports").deleteOne({ user_id: ctx.userId, message_id: messageId });
    res.json({ ok: true, deleted: result.deletedCount });
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

export function startGmailImportJobWorker() {
  if (gmailImportWorkerRunning) return;
  gmailImportWorkerRunning = true;
  void processGmailImportJobs().finally(() => {
    gmailImportWorkerRunning = false;
  });
}

async function processGmailImportJobs() {
  await recoverStaleGmailImportJobs();
  while (true) {
    const job = await claimNextGmailImportJob();
    if (!job) return;
    try {
      await runGmailImportJob(job);
    } catch (err: any) {
      logger.error("gmail_import_job_failed", { job_id: job._id.toString(), user_id: job.user_id, error: err.message });
      await col<GmailImportJob>("gmail_import_jobs").updateOne(
        { _id: job._id } as any,
        { $set: { status: "failed", error: err.message, updated_at: new Date(), completed_at: new Date() } } as any
      );
    }
  }
}

async function recoverStaleGmailImportJobs() {
  const staleBefore = new Date(Date.now() - GMAIL_JOB_STALE_MS);
  const result = await col<GmailImportJob>("gmail_import_jobs").updateMany(
    { status: "running", updated_at: { $lt: staleBefore } } as any,
    { $set: { status: "queued", updated_at: new Date() } } as any
  );
  if (result.modifiedCount) {
    logger.warn("gmail_import_jobs_requeued_stale", { count: result.modifiedCount });
  }
}

async function claimNextGmailImportJob(): Promise<GmailImportJob | null> {
  const now = new Date();
  return await col<GmailImportJob>("gmail_import_jobs").findOneAndUpdate(
    { status: "queued" } as any,
    { $set: { status: "running", started_at: now, updated_at: now } } as any,
    { sort: { created_at: 1 }, returnDocument: "after" }
  ) as GmailImportJob | null;
}

async function runGmailImportJob(job: GmailImportJob) {
  logger.info("gmail_import_job_started", { job_id: job._id.toString(), user_id: job.user_id, query: job.q, template_id: job.template_id });

  const template = job.template_id ? await loadTemplate(job.template_id).catch(() => null) : null;
  const skipMonthlyReports = isInspectionTemplate(template);
  const quotaCategory = quotaCategoryFromTemplate(template);
  const accessToken = await resolveGmailToken(job.user_id);
  if (!accessToken) throw new Error("gmail_not_connected");

  let messageIds = job.message_ids ?? [];
  let importedSet = new Set<string>();
  let importedSetLoaded = false;
  let diagnostics = createGmailDiagnostics(job.q, requestedExtensionsFromQuery(job.q), job.total_messages);

  if (!messageIds.length) {
    const initialized = await initializeGmailImportJob(job, accessToken);
    messageIds = initialized.messageIds;
    importedSet = initialized.importedSet;
    importedSetLoaded = true;
    diagnostics = initialized.diagnostics;
    job = initialized.job;
  }

  if (!messageIds.length) {
    await completeGmailImportJob(job, diagnostics);
    return;
  }

  let quotaLimitReached: DocumentImportQuotaError | null = null;
  for (let index = job.cursor ?? 0; index < messageIds.length; index += 1) {
    const id = messageIds[index];
    const freshToken = await resolveGmailToken(job.user_id);
    if (!freshToken) throw new Error("gmail_not_connected");

    if (!importedSetLoaded) {
      importedSet = await findSuccessfullyImportedMessageIds(job.user_id, messageIds);
      importedSetLoaded = true;
    }
    if (importedSet.has(id)) {
      await updateGmailImportJobProgress(job._id, { cursor: index + 1, processedDelta: 1 });
      continue;
    }

    const meta = await fetchEmailMeta(freshToken, id, diagnostics.allowedExtensions, diagnostics);
    if (!meta) {
      await updateGmailImportJobProgress(job._id, { cursor: index + 1, processedDelta: 1, skippedDelta: 1 });
      continue;
    }
    if (skipMonthlyReports && isMonthlyReportGmailItem(meta)) {
      logger.info("gmail_import_monthly_report_skipped", {
        user_id: job.user_id,
        message_id: id,
        template_id: job.template_id,
        subject: meta.subject,
      });
      await updateGmailImportJobProgress(job._id, { cursor: index + 1, processedDelta: 1, skippedDelta: 1 });
      continue;
    }

    const fileResults: GmailImportJobResult[] = [];
    for (const att of meta.attachments) {
      if (skipMonthlyReports && isMonthlyReportGmailItem(meta, att.filename)) {
        logger.info("gmail_import_monthly_report_attachment_skipped", {
          user_id: job.user_id,
          message_id: id,
          filename: att.filename,
        });
        fileResults.push({ messageId: id, filename: att.filename, error: "monthly_report_not_imported" });
        continue;
      }
      try {
        const user = await col<any>("users").findOne({ _id: new ObjectId(job.user_id) } as any, { projection: { role: 1, plan: 1 } } as any);
        await assertDocumentImportQuota(job.user_id, user?.plan ?? user?.role, 1, quotaCategory);
        const pipeline = await gmailImportPipelineOptions(job.template_id ?? undefined, meta, att.filename);
        const result = await downloadAndImportAttachment(freshToken, id, att.attachmentId, att.filename, job.user_id, pipeline);
        fileResults.push({ messageId: id, filename: att.filename, documentId: result.documentId });
      } catch (err: any) {
        if (err instanceof DocumentImportQuotaError) {
          quotaLimitReached = err;
          fileResults.push({ messageId: id, filename: att.filename, error: DOCUMENT_MONTHLY_QUOTA_ERROR });
          break;
        }
        fileResults.push({ messageId: id, filename: att.filename, error: err.message });
      }
    }

    await col("gmail_imports").updateOne(
      { user_id: job.user_id, message_id: id },
      {
        $setOnInsert: { user_id: job.user_id, message_id: id, imported_at: new Date(), subject: meta.subject },
        $set: { files: fileResults.map(r => ({ filename: r.filename, document_id: r.documentId ?? null, error: r.error ?? null })) },
      },
      { upsert: true }
    );
    await updateGmailImportJobProgress(job._id, {
      cursor: index + 1,
      processedDelta: 1,
      importedDelta: fileResults.filter(r => r.documentId).length,
      skippedDelta: fileResults.length ? 0 : 1,
      errorDelta: fileResults.filter(r => r.error).length,
      results: fileResults,
      quota: quotaLimitReached ? documentImportQuotaErrorPayload(quotaLimitReached) : null,
    });
    if (quotaLimitReached) break;
  }

  await completeGmailImportJob(job, diagnostics, quotaLimitReached);
}

async function initializeGmailImportJob(job: GmailImportJob, accessToken: string) {
  let listRes = await gmailFetch(accessToken, `messages?q=${encodeURIComponent(job.q)}&maxResults=${job.max_results}`);
  if (listRes.status === 401) {
    const refreshed = await retryWithRefresh(job.user_id);
    if (refreshed) listRes = await gmailFetch(refreshed, `messages?q=${encodeURIComponent(job.q)}&maxResults=${job.max_results}`);
  }
  const listError = await parseGmailError(listRes);
  if (listError) {
    logger.error("gmail_import_all_api_error", { status: listRes.status, code: listError.code, message: listError.message, body: listError.body.slice(0, 500) });
    throw new Error(listError.code);
  }
  const listData = await listRes.json() as { messages?: { id: string }[] };
  const allMessageIds = (listData.messages ?? []).map((message) => message.id);
  const diagnostics = createGmailDiagnostics(job.q, requestedExtensionsFromQuery(job.q), allMessageIds.length);
  const importedSet = await findSuccessfullyImportedMessageIds(job.user_id, allMessageIds);
  const messageIds = allMessageIds.filter((id) => !importedSet.has(id));

  const updated = await col<GmailImportJob>("gmail_import_jobs").findOneAndUpdate(
    { _id: job._id } as any,
    {
      $set: {
        total_messages: allMessageIds.length,
        new_messages: messageIds.length,
        skipped: importedSet.size,
        message_ids: messageIds,
        cursor: 0,
        updated_at: new Date(),
      },
    } as any,
    { returnDocument: "after" }
  ) as GmailImportJob | null;
  return { job: updated ?? job, messageIds, importedSet, diagnostics };
}

async function findSuccessfullyImportedMessageIds(userId: string, messageIds: string[]): Promise<Set<string>> {
  if (!messageIds.length) return new Set();
  const imports = await col("gmail_imports").find(
    { user_id: userId, message_id: { $in: messageIds } },
    { projection: { message_id: 1, files: 1 } }
  ).toArray() as GmailImportHistoryRow[];
  const documentIds = [...new Set(
    imports.flatMap((item) => (item.files ?? [])
      .map((file) => String(file.document_id ?? "").trim())
      .filter((id) => ObjectId.isValid(id)))
  )];
  const documents = documentIds.length
    ? await col("documents").find(
      { user_id: userId, _id: { $in: documentIds.map((id) => new ObjectId(id)) } } as any,
      { projection: { _id: 1, processing_status: 1, invoice_rejected: 1 } } as any
    ).toArray()
    : [];
  const invoices = documentIds.length
    ? await col("invoices").find(
      { user_id: userId, document_id: { $in: [...documentIds, ...documentIds.map((id) => new ObjectId(id))] } } as any,
      { projection: { document_id: 1, possible_not_invoice: 1, invoice_validation_status: 1, missing_required_fields: 1 } } as any
    ).toArray()
    : [];
  const documentMap = new Map(documents.map((doc: any) => [doc._id.toString(), doc]));
  const rejectedInvoiceDocumentIds = new Set(invoices
    .filter((invoice: any) => invoiceIsRejectedForGmailRetry(invoice))
    .map((invoice: any) => String(invoice.document_id ?? "").trim())
    .filter((id: string) => ObjectId.isValid(id)));

  return new Set(imports
    .filter((item) => gmailImportHasSuccessfulDocument(item, documentMap, rejectedInvoiceDocumentIds))
    .map((item) => String(item.message_id ?? ""))
    .filter(Boolean));
}

function gmailImportHasSuccessfulDocument(
  row: GmailImportHistoryRow,
  documentMap: Map<string, any>,
  rejectedInvoiceDocumentIds: Set<string>,
): boolean {
  return (row.files ?? []).some((file) => {
    if (file.error) return false;
    const documentId = String(file.document_id ?? "").trim();
    if (!ObjectId.isValid(documentId)) return false;
    if (rejectedInvoiceDocumentIds.has(documentId)) return false;
    const doc = documentMap.get(documentId);
    if (!doc) return false;
    if (doc.processing_status === "error") return false;
    if (doc.invoice_rejected === true) return false;
    return true;
  });
}

function invoiceIsRejectedForGmailRetry(invoice: any): boolean {
  if (invoice?.possible_not_invoice === true) return true;
  const status = String(invoice?.invoice_validation_status ?? "").trim();
  if (REJECTED_INVOICE_VALIDATION_STATUSES.has(status)) return true;
  return Array.isArray(invoice?.missing_required_fields) && invoice.missing_required_fields.length > 0;
}

async function updateGmailImportJobProgress(
  jobId: ObjectId,
  patch: {
    cursor: number;
    processedDelta?: number;
    importedDelta?: number;
    skippedDelta?: number;
    errorDelta?: number;
    results?: GmailImportJobResult[];
    quota?: Record<string, unknown> | null;
  }
) {
  const inc: Record<string, number> = {};
  if (patch.processedDelta) inc.processed_messages = patch.processedDelta;
  if (patch.importedDelta) inc.imported = patch.importedDelta;
  if (patch.skippedDelta) inc.skipped = patch.skippedDelta;
  if (patch.errorDelta) inc.errors = patch.errorDelta;

  await col<GmailImportJob>("gmail_import_jobs").updateOne(
    { _id: jobId } as any,
    {
      $set: {
        cursor: patch.cursor,
        updated_at: new Date(),
        ...(patch.quota ? { quota: patch.quota } : {}),
      },
      ...(Object.keys(inc).length ? { $inc: inc } : {}),
      ...(patch.results?.length ? { $push: { results: { $each: patch.results } } } : {}),
    } as any
  );
}

async function completeGmailImportJob(
  job: GmailImportJob,
  diagnostics: GmailDiagnostics,
  quotaLimitReached: DocumentImportQuotaError | null = null
) {
  const current = await col<GmailImportJob>("gmail_import_jobs").findOne({ _id: job._id } as any);
  if (!current) return;
  logGmailDiagnostics("gmail_import_all_parse", diagnostics, current.results.length ? new Set(current.results.map(r => r.messageId)).size : 0);
  logger.info("gmail_bulk_import", {
    job_id: job._id.toString(),
    user_id: job.user_id,
    total: current.total_messages,
    new: current.new_messages,
    imported: current.imported,
    quota_limit_reached: Boolean(quotaLimitReached ?? current.quota),
  });
  await col<GmailImportJob>("gmail_import_jobs").updateOne(
    { _id: job._id } as any,
    {
      $set: {
        status: "completed",
        updated_at: new Date(),
        completed_at: new Date(),
        quota: quotaLimitReached ? documentImportQuotaErrorPayload(quotaLimitReached) : current.quota ?? null,
      },
    } as any
  );
}

function presentGmailImportJob(job: GmailImportJob) {
  return {
    jobId: job._id.toString(),
    status: job.status,
    q: job.q,
    templateId: job.template_id,
    total: job.total_messages,
    totalMessages: job.total_messages,
    newMessages: job.new_messages,
    processedMessages: job.processed_messages,
    imported: job.imported,
    skipped: job.skipped,
    errors: job.errors,
    results: job.results ?? [],
    quota: job.quota ?? null,
    error: job.error ?? null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    completedAt: job.completed_at ?? null,
  };
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
    invoice_rejection_label: invoice?.invoice_rejection_label ?? doc.invoice_rejection_label ?? null,
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
  const pipeline: PipelineOptions = {
    gmailImport: true,
    usageKind: "gmail_document",
    ...(templateId ? { templateId } : {}),
  };
  if (!templateId) return pipeline;

  const template = await loadTemplate(templateId).catch(() => null);
  if (!isInvoiceTemplate(template)) return pipeline;

  const provider = await matchGmailSearchProvider(`${meta?.from ?? ""} ${meta?.subject ?? ""} ${filename ?? ""}`);
  const invoiceFolder = provider
    ? `gmail/invoices/${provider.category}/${provider.id}`
    : "gmail/invoices/other";
  return { ...pipeline, usageKind: "gmail_invoice", storageKeyPrefix: invoiceFolder };
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
const INVOICE_ATTACHMENT_QUERY = "{filename:pdf filename:doc filename:docx filename:xls filename:xlsx}";

export function buildGmailQuery(
  userQuery: string | undefined,
  template: Awaited<ReturnType<typeof loadTemplate>>,
  planOrRole?: string | null,
): string {
  const defaultQuery = "has:attachment filename:pdf";
  const q = userQuery || defaultQuery;
  if (isInspectionTemplate(template) && q === defaultQuery) {
    return INSPECTION_GMAIL_QUERY;
  }
  if (isInvoiceTemplate(template)) {
    return applyInvoiceHistoryWindow(forceInvoiceAttachmentTypes(q), planOrRole);
  }
  return q;
}

function applyInvoiceHistoryWindow(query: string, planOrRole: string | null | undefined): string {
  const months = tierFeatureFlags(planOrRole).gmailInvoiceHistoryMonths;
  if (!months || months < 1) return query;
  const withoutExistingHistory = query
    .replace(/\bnewer_than:\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${withoutExistingHistory} newer_than:${months}m`;
}

function forceInvoiceAttachmentTypes(query: string): string {
  const withoutAttachmentTypes = query
    .replace(/\{(?:\s*filename:(?:pdf|doc|docx|xls|xlsx|jpg|jpeg|png)\s*)+\}/gi, " ")
    .replace(/\bfilename:(?:pdf|doc|docx|xls|xlsx|jpg|jpeg|png)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!withoutAttachmentTypes) return `has:attachment ${INVOICE_ATTACHMENT_QUERY}`;
  if (/\bhas:attachment\b/i.test(withoutAttachmentTypes)) {
    return withoutAttachmentTypes.replace(/\bhas:attachment\b/i, `has:attachment ${INVOICE_ATTACHMENT_QUERY}`);
  }
  return `has:attachment ${INVOICE_ATTACHMENT_QUERY} ${withoutAttachmentTypes}`;
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
    const matchesType = matchesRequestedAttachment(filename, mimeType, allowedExtensions);
    const junk = isJunkAttachment(filename, size);
    if (matchesType && !junk) {
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
          reason: !filename
            ? "no_filename"
            : junk
              ? `junk_attachment:${ext || "none"}`
              : `extension_not_selected:${ext || "none"}`,
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
