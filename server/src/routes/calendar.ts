import express from "express";
import { ObjectId } from "mongodb";
import { col } from "../db/db";
import { getSettings } from "../settings";
import { requireAuth } from "../auth/middleware";
import { generateState, generateCodeVerifier, generateCodeChallenge, verifyIdToken } from "../auth/google";
import { logger } from "../logger";
import {
  CALENDAR_SCOPE,
  calendarNameForUser,
  normalizeCalendarName,
  renameCalendar,
  resolveCalendarToken,
} from "../calendar/googleCalendar";
import { TASKS_SCOPE } from "../calendar/googleTasks";
import { pullCalendarChanges, pushAllReminders } from "../calendar/sync";
import { featureFlagsForUser, PLAN_GATE_MESSAGES } from "../plans/tierFeatures";

const GOOGLE_IDENTITY_SCOPE = "openid profile email";
const CALENDAR_CONNECT_SCOPE = `${GOOGLE_IDENTITY_SCOPE} ${CALENDAR_SCOPE} ${TASKS_SCOPE}`;
const DEFAULT_RETURN_PATH = "/settings";

type HTTPException = { status?: number; message: string };

export function registerCalendarRoutes(app: express.Express) {
  // GET /api/calendar/auth-url — start the OAuth consent flow.
  app.get("/api/calendar/auth-url", async (req, res) => {
    let userId: string;
    let expectedEmail: string | null = null;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
      expectedEmail = String((ctx.actingAs ?? ctx.user)?.email ?? "").trim() || null;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const user = await col<any>("users").findOne({ _id: new ObjectId(userId) } as any);
    if (!featureFlagsForUser(user).googleCalendarSync) {
      res.status(403).json({ error: "calendar_plan_required", message: PLAN_GATE_MESSAGES.calendar });
      return;
    }

    const settings = getSettings();
    const googleClientId = settings.googleClientId;
    if (!googleClientId) {
      res.status(500).json({ error: "google_client_not_configured" });
      return;
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    await col("oauth_states").insertOne({
      state,
      code_verifier: codeVerifier,
      user_id: userId,
      type: "calendar",
      expected_email: expectedEmail,
      return_to: safeFrontendReturnPath(req.query.returnTo),
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    } as any);
    await col("oauth_states").deleteMany({ expires_at: { $lt: new Date() } });

    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: calendarRedirectUri(req),
      response_type: "code",
      scope: CALENDAR_CONNECT_SCOPE,
      access_type: "offline",
      prompt: "consent select_account",
      state,
      code_challenge: await generateCodeChallenge(codeVerifier),
      code_challenge_method: "S256",
      include_granted_scopes: "true",
    });
    if (expectedEmail) params.set("login_hint", expectedEmail);

    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });

  // GET /auth/calendar/callback
  app.get("/auth/calendar/callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) { res.redirect(frontendUrl(`${DEFAULT_RETURN_PATH}?error=${encodeURIComponent(error)}`)); return; }
    if (!code || !state) { res.redirect(frontendUrl(`${DEFAULT_RETURN_PATH}?error=missing_params`)); return; }

    const pkce = await col<any>("oauth_states").findOne({
      state,
      type: "calendar",
      expires_at: { $gt: new Date() },
    });
    if (!pkce) { res.redirect(frontendUrl(`${DEFAULT_RETURN_PATH}?error=invalid_state`)); return; }
    await col("oauth_states").deleteOne({ state });

    const returnPath = safeFrontendReturnPath(pkce.return_to) ?? DEFAULT_RETURN_PATH;
    const userObjectId = new ObjectId(String(pkce.user_id));
    const connectingUser = await col<any>("users").findOne({ _id: userObjectId } as any);
    if (!featureFlagsForUser(connectingUser).googleCalendarSync) {
      res.redirect(frontendUrl(`${returnPath}?error=calendar_plan_required`));
      return;
    }

    const settings = getSettings();
    const googleClientId = settings.googleClientId;
    const googleClientSecret = settings.googleClientSecret;
    if (!googleClientId || !googleClientSecret) {
      res.redirect(frontendUrl(`${returnPath}?error=google_client_not_configured`));
      return;
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: calendarRedirectUri(req),
        grant_type: "authorization_code",
        code_verifier: String(pkce.code_verifier),
      }),
    });
    if (!tokenRes.ok) {
      res.redirect(frontendUrl(`${returnPath}?error=token_exchange_failed`));
      return;
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
      id_token?: string;
    };
    let connectedEmail = String(pkce.expected_email ?? "").trim() || null;
    if (tokens.id_token && pkce.expected_email) {
      try {
        const profile = await verifyIdToken(tokens.id_token);
        const tokenEmail = String(profile.email ?? "").trim().toLowerCase();
        const expectedEmail = String(pkce.expected_email ?? "").trim().toLowerCase();
        if (tokenEmail) connectedEmail = String(profile.email ?? "").trim();
        if (tokenEmail && expectedEmail && tokenEmail !== expectedEmail) {
          logger.warn("calendar_account_mismatch", {
            user_id: String(pkce.user_id),
            expected_email: expectedEmail,
            token_email: tokenEmail,
          });
          res.redirect(frontendUrl(`${returnPath}?error=calendar_account_mismatch`));
          return;
        }
      } catch (e) {
        logger.warn("calendar_identity_check_failed", { user_id: String(pkce.user_id), error: String(e) });
        res.redirect(frontendUrl(`${returnPath}?error=calendar_identity_check_failed`));
        return;
      }
    }
    const grantedScopes = String(tokens.scope ?? "").split(/\s+/).filter(Boolean);
    const hasCalendarScope = grantedScopes.includes(CALENDAR_SCOPE);
    const hasTasksScope = grantedScopes.includes(TASKS_SCOPE);

    const setFields: Record<string, any> = {
      calendar_access_token: tokens.access_token,
      calendar_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
      calendar_scope_granted: hasCalendarScope,
      calendar_tasks_scope_granted: hasTasksScope,
      calendar_email: connectedEmail,
      updated_at: new Date(),
    };
    if (tokens.refresh_token) setFields.calendar_refresh_token = tokens.refresh_token;
    // Clear the revoked marker, or a successful reconnect would still report
    // needs_reconnect and keep telling the user to do what they just did.
    await col("users").updateOne(
      { _id: userObjectId } as any,
      { $set: setFields, $unset: { calendar_token_revoked_at: "" } },
    );

    logger.info("calendar_connected", {
      user_id: String(pkce.user_id),
      scope_granted: hasCalendarScope,
    });

    // Seed the calendar with the reminders that already exist. Backgrounded so
    // the user is not left waiting on the redirect.
    if (hasCalendarScope) {
      pushAllReminders(String(pkce.user_id)).catch((e) => {
        logger.warn("calendar_initial_push_failed", { user_id: String(pkce.user_id), error: String(e) });
      });
    }

    res.redirect(frontendUrl(returnPath));
  });

  // GET /api/calendar/status
  app.get("/api/calendar/status", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const user = await col<any>("users").findOne({ _id: new ObjectId(userId) } as any);
    const connected = Boolean(user?.calendar_access_token) && user?.calendar_scope_granted !== false;
    const allowed = featureFlagsForUser(user).googleCalendarSync;
    const syncedCount = connected
      ? await col("calendar_links").countDocuments({
        user_id: userId,
        $or: [
          { gcal_event_id: { $exists: true, $nin: [null, ""] } },
          { gtask_id: { $exists: true, $nin: [null, ""] } },
        ],
      })
      : 0;
    const calendarId = user?.calendar_id ? String(user.calendar_id) : null;

    res.json({
      allowed,
      connected,
      // True when a connection existed and Google later rejected the refresh —
      // the user has to reconnect, and without this the UI can only say
      // "not connected", which reads as if they never connected at all.
      needs_reconnect: Boolean(user?.calendar_token_revoked_at) && !connected,
      calendar_id: calendarId,
      calendar_url: calendarId ? googleCalendarUrl(calendarId) : null,
      calendar_name: calendarNameForUser(user),
      email: user?.calendar_email ?? user?.email ?? null,
      synced_count: syncedCount,
      last_synced_at: user?.calendar_last_synced_at ?? null,
    });
  });

  // POST /api/calendar/sync — push pending reminders, then pull remote edits.
  app.post("/api/calendar/sync", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const user = await col<any>("users").findOne({ _id: new ObjectId(userId) } as any);
    if (!featureFlagsForUser(user).googleCalendarSync) {
      res.status(403).json({ error: "calendar_plan_required", message: PLAN_GATE_MESSAGES.calendar });
      return;
    }

    const accessToken = await resolveCalendarToken(userId);
    if (!accessToken) {
      res.status(400).json({ error: "calendar_not_connected" });
      return;
    }

    try {
      const pushed = await pushAllReminders(userId);
      const pulled = await pullCalendarChanges(userId);
      await col("users").updateOne(
        { _id: new ObjectId(userId) } as any,
        { $set: { calendar_last_synced_at: new Date() } },
      );
      res.json({ pushed, ...pulled });
    } catch (e) {
      logger.error("calendar_manual_sync_failed", { user_id: userId, error: String(e) });
      res.status(500).json({ error: "sync_failed" });
    }
  });

  // POST /api/calendar/disconnect — drop tokens and forget the event links.
  // The events themselves stay in the user's Google Calendar; deleting data
  // out of their account on disconnect would be a surprise.
  app.post("/api/calendar/disconnect", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    await col("users").updateOne(
      { _id: new ObjectId(userId) } as any,
      {
        $set: {
          calendar_access_token: "",
          calendar_refresh_token: "",
          calendar_scope_granted: false,
          calendar_sync_token: null,
          updated_at: new Date(),
        },
      },
    );
    const removed = await col("calendar_links").deleteMany({ user_id: userId });
    logger.info("calendar_disconnected", { user_id: userId, links_removed: removed.deletedCount });
    res.json({ ok: true });
  });

  // POST /api/calendar/name — rename the app's calendar. The stored name is the
  // source of truth; pushing to Google is best-effort, since ensureAppCalendar
  // reconciles any drift on the next sync.
  app.post("/api/calendar/name", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const user = await col<any>("users").findOne({ _id: new ObjectId(userId) } as any);
    if (!featureFlagsForUser(user).googleCalendarSync) {
      res.status(403).json({
        error: "calendar_plan_required",
        message: PLAN_GATE_MESSAGES.calendar,
      });
      return;
    }

    const name = normalizeCalendarName(req.body?.name);
    if (!name) {
      res.status(400).json({ error: "missing_name" });
      return;
    }

    await col("users").updateOne(
      { _id: new ObjectId(userId) } as any,
      { $set: { calendar_name: name, updated_at: new Date() } },
    );

    // Push immediately so the change shows in Google without waiting for the
    // hourly sync. A failure here is not fatal — the name is already persisted.
    let synced = false;
    const calendarId = user?.calendar_id ? String(user.calendar_id) : null;
    if (calendarId) {
      const accessToken = await resolveCalendarToken(userId);
      if (accessToken) {
        synced = await renameCalendar(accessToken, calendarId, name);
      }
    }

    logger.info("calendar_renamed", { user_id: userId, synced });
    res.json({ ok: true, name, synced });
  });
}

function calendarRedirectUri(req: express.Request): string {
  if (process.env.CALENDAR_REDIRECT_URI) return process.env.CALENDAR_REDIRECT_URI;
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const frontendBase = oauthCallbackBaseUrl();
  if (frontendBase) return `${frontendBase}/auth/google/callback`;
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}/auth/google/callback`;
}

function googleCalendarUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(calendarId)}`;
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
