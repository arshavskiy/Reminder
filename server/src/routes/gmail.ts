import express from "express";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { col } from "../db/db";
import { getSettings, getDataDir } from "../settings";
import { requireAuth } from "../auth/middleware";
import { generateState, generateCodeVerifier, generateCodeChallenge } from "../auth/google";
import { importFile } from "../pipeline/importer";
import { logger } from "../logger";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function registerGmailRoutes(app: express.Application) {
  // GET /api/gmail/auth-url — start Gmail OAuth
  app.get("/api/gmail/auth-url", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }

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
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    } as any);
    await col("oauth_states").deleteMany({ expires_at: { $lt: new Date() } });

    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: gmailRedirectUri(settings),
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
    const frontend = frontendUrl("/");

    if (error) { res.redirect(frontendUrl(`/gmail-inbox?error=${encodeURIComponent(error)}`)); return; }
    if (!code || !state) { res.redirect(frontendUrl("/gmail-inbox?error=missing_params")); return; }

    const pkce = await col<any>("oauth_states").findOne({ state, type: "gmail", expires_at: { $gt: new Date() } });
    if (!pkce) { res.redirect(frontendUrl("/gmail-inbox?error=invalid_state")); return; }
    await col("oauth_states").deleteOne({ state });

    const settings = getSettings();
    const googleClientId = settings.googleClientId;
    const googleClientSecret = settings.googleClientSecret;
    if (!googleClientId || !googleClientSecret) {
      res.redirect(frontendUrl("/gmail-inbox?error=google_client_not_configured"));
      return;
    }
    const redirectUri = gmailRedirectUri(settings);
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

    if (!tokenRes.ok) { res.redirect(frontendUrl("/gmail-inbox?error=token_exchange_failed")); return; }
    const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in: number };

    await col("users").updateOne(
      { _id: pkce.user_id } as any,
      { $set: {
          gmail_access_token: tokens.access_token,
          gmail_refresh_token: tokens.refresh_token ?? null,
          gmail_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
        }
      }
    );

    res.redirect(frontendUrl("/gmail-inbox"));
  });

  // GET /api/gmail/status — check if Gmail connected
  app.get("/api/gmail/status", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }

    const user = await col<any>("users").findOne({ _id: ctx.userId } as any);
    const userConnected = Boolean(user?.gmail_access_token);
    const envConnected = Boolean(process.env.GMAIL_ACCESS_TOKEN);
    res.json({ connected: userConnected || envConnected, source: userConnected ? "oauth" : envConnected ? "env" : null });
  });

  // GET /api/gmail/inbox — list emails with PDF attachments
  app.get("/api/gmail/inbox", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }

    const accessToken = await resolveGmailToken(ctx.userId);
    if (!accessToken) { res.status(403).json({ error: "gmail_not_connected" }); return; }

    try {
      const q = (req.query.q as string) || "has:attachment filename:pdf";
      const maxResults = Math.min(parseInt((req.query.limit as string) || "50", 10), 100);

      const listRes = await gmailFetch(accessToken, `messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`);
      if (!listRes.ok) { res.status(502).json({ error: "gmail_api_error" }); return; }
      const listData = await listRes.json() as { messages?: { id: string }[] };
      const messageIds = listData.messages ?? [];

      const emails = await Promise.all(
        messageIds.map(({ id }) => fetchEmailMeta(accessToken, id))
      );

      res.json({ emails: emails.filter(Boolean) });
    } catch (err) {
      res.status(500).json({ error: "internal_error" });
    }
  });

  // GET /api/gmail/attachment/:messageId/:attachmentId — download a specific attachment
  app.get("/api/gmail/attachment/:messageId/:attachmentId", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }

    const accessToken = await resolveGmailToken(ctx.userId);
    if (!accessToken) { res.status(403).json({ error: "gmail_not_connected" }); return; }

    const { messageId, attachmentId } = req.params;
    const attRes = await gmailFetch(accessToken, `messages/${messageId}/attachments/${attachmentId}`);
    if (!attRes.ok) { res.status(502).json({ error: "gmail_api_error" }); return; }

    const attData = await attRes.json() as { data: string };
    const buf = Buffer.from(attData.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const filename = (req.query.filename as string) || "attachment.pdf";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  });

  // POST /api/gmail/import-attachment — server-side download + pipeline import
  app.post("/api/gmail/import-attachment", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }

    const { messageId, attachmentId, filename } = req.body;
    if (!messageId || !attachmentId) { res.status(400).json({ error: "messageId and attachmentId required" }); return; }

    const accessToken = await resolveGmailToken(ctx.userId);
    if (!accessToken) { res.status(403).json({ error: "gmail_not_connected" }); return; }

    try {
      const result = await downloadAndImportAttachment(accessToken, messageId, attachmentId, filename ?? "attachment.pdf", ctx.userId);
      res.json(result);
    } catch (err: any) {
      logger.error("gmail_import_attachment_failed", { user_id: ctx.userId, messageId, error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/gmail/import-all — scan inbox, import all new PDF attachments
  app.post("/api/gmail/import-all", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }

    const accessToken = await resolveGmailToken(ctx.userId);
    if (!accessToken) { res.status(403).json({ error: "gmail_not_connected" }); return; }

    const q = (req.body.q as string) || "has:attachment filename:pdf";
    const maxResults = Math.min(parseInt(req.body.limit ?? "50", 10), 100);

    try {
      const listRes = await gmailFetch(accessToken, `messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`);
      if (!listRes.ok) { res.status(502).json({ error: "gmail_api_error" }); return; }
      const listData = await listRes.json() as { messages?: { id: string }[] };
      const messageIds = listData.messages ?? [];

      const alreadyImported = await col("gmail_imports").find(
        { user_id: ctx.userId, message_id: { $in: messageIds.map(m => m.id) } },
        { projection: { message_id: 1 } }
      ).toArray();
      const importedSet = new Set(alreadyImported.map((r: any) => r.message_id));

      const newMessages = messageIds.filter(m => !importedSet.has(m.id));
      if (!newMessages.length) { res.json({ imported: 0, skipped: messageIds.length, results: [] }); return; }

      const results: Array<{ messageId: string; filename: string; documentId?: string; error?: string }> = [];

      for (const { id } of newMessages) {
        const meta = await fetchEmailMeta(accessToken, id);
        if (!meta) continue;

        for (const att of meta.attachments) {
          try {
            const result = await downloadAndImportAttachment(accessToken, id, att.attachmentId, att.filename, ctx.userId);
            results.push({ messageId: id, filename: att.filename, documentId: result.documentId });
          } catch (err: any) {
            results.push({ messageId: id, filename: att.filename, error: err.message });
          }
        }

        await col("gmail_imports").updateOne(
          { user_id: ctx.userId, message_id: id },
          { $setOnInsert: { user_id: ctx.userId, message_id: id, imported_at: new Date(), subject: meta.subject } },
          { upsert: true }
        );
      }

      logger.info("gmail_bulk_import", { user_id: ctx.userId, total: messageIds.length, new: newMessages.length, imported: results.filter(r => r.documentId).length });
      res.json({ imported: results.filter(r => r.documentId).length, skipped: importedSet.size, results });
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

    const history = await col("gmail_imports").find(
      { user_id: ctx.userId },
      { projection: { _id: 0, message_id: 1, subject: 1, imported_at: 1 } }
    ).sort({ imported_at: -1 }).limit(200).toArray();

    res.json({ history });
  });

  // DELETE /api/gmail/disconnect
  app.delete("/api/gmail/disconnect", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    let ctx: Awaited<ReturnType<typeof requireAuth>>;
    try { ctx = await requireAuth(cookieHeader); } catch { res.status(401).json({ error: "unauthorized" }); return; }

    await col("users").updateOne(
      { _id: ctx.userId } as any,
      { $unset: { gmail_access_token: "", gmail_refresh_token: "", gmail_token_expires_at: "" } }
    );
    res.json({ ok: true });
  });
}

async function fetchEmailMeta(accessToken: string, id: string) {
  const r = await gmailFetch(accessToken, `messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
  if (!r.ok) return null;
  const msg = await r.json() as any;

  const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
  const get = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  const parts: any[] = msg.payload?.parts ?? [];
  const attachments = parts
    .filter((p) => p.mimeType === "application/pdf" && p.body?.attachmentId)
    .map((p) => ({
      attachmentId: p.body.attachmentId as string,
      filename: p.filename as string,
      size: p.body.size as number,
    }));

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
    { _id: userId } as any,
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
  const user = await col<any>("users").findOne({ _id: userId } as any);
  if (user?.gmail_access_token) {
    if (user.gmail_token_expires_at && new Date(user.gmail_token_expires_at) <= new Date()) {
      const refreshed = await refreshGmailToken(user, userId);
      if (refreshed) return refreshed;
    } else {
      return user.gmail_access_token;
    }
  }

  // 2. Fall back to env tokens
  const envToken = process.env.GMAIL_ACCESS_TOKEN;
  const envRefresh = process.env.GMAIL_REFRESH_TOKEN;
  if (!envToken) return null;

  // Check if env token expired (stored in memory)
  if (envTokenExpiry && envTokenExpiry <= new Date() && envRefresh) {
    const refreshed = await refreshEnvGmailToken();
    if (refreshed) return refreshed;
  }

  return cachedEnvToken ?? envToken;
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
    logger.error("gmail_env_token_refresh_failed", { status: r.status });
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
  userId: string
): Promise<{ documentId: string; filename: string }> {
  const attRes = await gmailFetch(accessToken, `messages/${messageId}/attachments/${attachmentId}`);
  if (!attRes.ok) throw new Error(`Gmail API error: ${attRes.status}`);

  const attData = await attRes.json() as { data: string };
  const buf = Buffer.from(attData.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");

  const tmpDir = join(getDataDir(), "gmail-tmp");
  mkdirSync(tmpDir, { recursive: true });
  const safeName = filename.replace(/[^a-zA-Z0-9._֐-׿ -]/g, "_");
  const tmpPath = join(tmpDir, `${Date.now()}-${safeName}`);
  writeFileSync(tmpPath, buf);

  const documentId = await importFile(tmpPath, undefined, userId, filename);
  logger.info("gmail_attachment_imported", { user_id: userId, messageId, filename, documentId });
  return { documentId, filename };
}

function gmailRedirectUri(settings: ReturnType<typeof getSettings>): string {
  const googleRedirectUri = settings.googleRedirectUri ?? "http://localhost:3737/auth/google/callback";
  return process.env.GMAIL_REDIRECT_URI ?? googleRedirectUri.replace("/auth/google/callback", "/auth/gmail/callback");
}

function frontendUrl(path: string) {
  const base =
    process.env.NODE_ENV !== "production"
      ? (process.env.DEV_FRONTEND_URL ?? "http://localhost:4173")
      : (process.env.FRONTEND_URL ?? "http://localhost:4173");
  return `${base}${path}`;
}
