import express from "express";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {getSettings} from "../settings";
import {
    exchangeCodeForIdToken,
    generateCodeVerifier,
    generateState,
    getGoogleAuthUrl,
    verifyIdToken,
} from "../auth/google";
import {
    consumeMagicLinkToken,
    createSession,
    clearSessionCookie,
    extractSessionFromCookie,
    revokeSession,
    setActingAsUser,
    verifySession,
    verifySessionIdentity,
} from "../auth/session";
import {HTTPException, requireAuth, requireRole} from "../auth/middleware";
import {
    generateToken,
    hashPassword,
    sendPasswordResetEmail,
    sendVerificationEmail,
    verifyPassword,
} from "../auth/emailAuth";
import {clientIp, logger} from "../logger";
import {DEFAULT_FEATURES_NESTED} from "../features";
import {notifyPasswordResetRequested} from "../push/adminNotify";

export function registerAuthRoutes(app: express.Application) {
  // GET /auth/google — kick off OAuth flow
  app.get("/auth/google", async (req, res) => {
    const settings = getSettings();
    if (!settings.googleClientId || !settings.googleClientSecret) {
      res.status(503).send("Google OAuth not configured");
      return;
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    // Persist PKCE state to DB so a server restart between redirect and callback
    // doesn't lose it
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await col("oauth_states").insertOne({
      state,
      code_verifier: codeVerifier,
      expires_at: expiresAt,
    } as any);

    // Prune expired states
    await col("oauth_states").deleteMany({ expires_at: { $lt: new Date() } });

    const redirectUri = googleCallbackUri(req);
    const url = await getGoogleAuthUrl(state, codeVerifier, redirectUri);
    res.redirect(url);
  });

  // GET /auth/google/callback — handle redirect from Google
  app.get("/auth/google/callback", async (req, res) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const error = req.query.error as string | undefined;

    if (error) {
      res.redirect(frontendUrl(`/login?error=${encodeURIComponent(error)}`));
      return;
    }

    if (!code || !state) {
      res.redirect(frontendUrl("/login?error=missing_params"));
      return;
    }

    const pkce = await col<{ state: string; code_verifier: string; expires_at: Date }>(
      "oauth_states"
    ).findOne({ state, expires_at: { $gt: new Date() } });

    if (!pkce) {
      res.redirect(frontendUrl("/login?error=invalid_state"));
      return;
    }

    if ((pkce as any).type === "calendar") {
      res.redirect(`/auth/calendar/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
      return;
    }
    if ((pkce as any).type === "gmail") {
      res.redirect(`/auth/gmail/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
      return;
    }
    await col("oauth_states").deleteOne({ state });

    try {
      const tokens = await exchangeCodeForIdToken(code, pkce.code_verifier, googleCallbackUri(req));
      const profile = await verifyIdToken(tokens.id_token);
      const settings = getSettings();

      // Email whitelist check
      if (settings.allowedEmails && settings.allowedEmails.length > 0) {
        if (!settings.allowedEmails.includes(profile.email)) {
          res.redirect(frontendUrl("/login?error=not_allowed"));
          return;
        }
      }

      // Upsert user — match by google_sub OR email (handles existing email/password accounts)
      logger.info("google_oauth_tokens", { hasAccessToken: !!tokens.access_token, hasRefreshToken: !!tokens.refresh_token, expiresIn: tokens.expires_in, email: profile.email });

      const upsert = await col("users").updateOne(
        { $or: [{ google_sub: profile.sub }, { email: profile.email }] },
        {
          $set: {
            google_sub: profile.sub,
            email: profile.email,
            name: profile.name ?? null,
            picture_url: profile.picture ?? null,
            last_login_at: new Date(),
          },
          $setOnInsert: {
            role: "user",
            plan: "free",
            is_active: 1,
            created_at: new Date(),
          },
        },
        { upsert: true }
      );

      const user = await col("users").findOne({ $or: [{ google_sub: profile.sub }, { email: profile.email }] }) as any;
      if (!user) throw new Error("User not found after upsert");

      // Ensure user_settings row exists
      await col("user_settings").updateOne(
        { user_id: user._id.toString() },
        {
          $setOnInsert: {
            user_id: user._id.toString(),
            theme: "light",
            email_from_name: null,
            reminder_advance_days: "[90,60,30]",
            ocr_language: "heb+eng",
            features: DEFAULT_FEATURES_NESTED,
          },
        },
        { upsert: true }
      );

      const ua = req.headers["user-agent"] ?? undefined;
      const ip = clientIp(req);
      const { cookies } = await createSession(user._id.toString(), ua, ip);
      logAuth("login_success", req, {
        user,
        method: "google_oauth",
        is_new_user: upsert.upsertedCount > 0,
      });

      res.setHeader("Set-Cookie", cookies);
      res.redirect(frontendUrl(POST_LOGIN_PATH));
    } catch (err) {
      logger.error("login_failed", { method: "google_oauth", reason: "callback_error", error: err, ip: clientIp(req) ?? null });
      res.redirect(frontendUrl("/login?error=auth_failed"));
    }
  });

  // POST /api/auth/google — GIS credential (ID token) sign-in
  app.post("/api/auth/google", async (req, res) => {
    const body = req.body as { credential?: string };
    if (!body.credential) {
      res.status(400).json({ error: "missing_credential" });
      return;
    }

    try {
      const profile = await verifyIdToken(body.credential);
      const settings = getSettings();

      if (settings.allowedEmails && settings.allowedEmails.length > 0) {
        if (!settings.allowedEmails.includes(profile.email)) {
          logger.warn("login_failed", { method: "google_gis", reason: "not_allowed", email: profile.email, ip: clientIp(req) ?? null });
          res.status(403).json({ error: "not_allowed" });
          return;
        }
      }

      // Upsert user — match by google_sub OR email (handles existing email/password accounts)
      const upsert = await col("users").updateOne(
        { $or: [{ google_sub: profile.sub }, { email: profile.email }] },
        {
          $set: {
            google_sub: profile.sub,
            email: profile.email,
            name: profile.name ?? null,
            picture_url: profile.picture ?? null,
            last_login_at: new Date(),
          },
          $setOnInsert: {
            role: "user",
            plan: "free",
            is_active: 1,
            created_at: new Date(),
          },
        },
        { upsert: true }
      );

      const user = await col("users").findOne({ $or: [{ google_sub: profile.sub }, { email: profile.email }] }) as any;
      if (!user) throw new Error("User not found after upsert");

      // Ensure user_settings row exists
      await col("user_settings").updateOne(
        { user_id: user._id.toString() },
        {
          $setOnInsert: {
            user_id: user._id.toString(),
            theme: "light",
            email_from_name: null,
            reminder_advance_days: "[90,60,30]",
            ocr_language: "heb+eng",
            features: DEFAULT_FEATURES_NESTED,
          },
        },
        { upsert: true }
      );

      const ua = req.headers["user-agent"] ?? undefined;
      const ip = clientIp(req);
      const { cookies } = await createSession(user._id.toString(), ua, ip);
      logAuth("login_success", req, {
        user,
        method: "google_gis",
        is_new_user: upsert.upsertedCount > 0,
      });

      res.setHeader("Set-Cookie", cookies);
      res.status(200).json({
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          picture_url: user.picture_url,
          role: user.role,
          plan: user.plan ?? planFromRole(user.role),
        },
      });
    } catch (err) {
      logger.error("login_failed", { method: "google_gis", reason: "auth_error", error: err, ip: clientIp(req) ?? null });
      res.status(500).json({ error: "auth_failed" });
    }
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    const sessionId = extractSessionFromCookie(cookieHeader);
    if (sessionId) {
      const user = await verifySession(sessionId);
      await revokeSession(sessionId);
      if (user) {
        logger.info("logout", {
          user_id: (user as any).id,
          email: user.email,
          role: user.role,
          ip: clientIp(req) ?? null,
        });
      }
    }
    res.setHeader("Set-Cookie", clearSessionCookie());
    res.json({ ok: true });
  });

  // GET /api/auth/me — return current user info
  app.get("/api/auth/me", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    const sessionId = extractSessionFromCookie(cookieHeader);
    if (!sessionId) {
      res.json({ user: null });
      return;
    }

    const identity = await verifySessionIdentity(sessionId);
    if (!identity) {
      res.json({ user: null });
      return;
    }
    const { user, actingAs } = identity;

    const userDoc = await col("users").findOne({ _id: new ObjectId((user as any).id) }) as any;
    res.json({
      user: {
        id: (user as any).id,
        email: user.email,
        name: user.name,
        phone: (user as any).phone ?? null,
        company_name: (user as any).company_name ?? null,
        picture_url: user.picture_url,
        role: user.role,
        plan: user.plan ?? planFromRole(user.role),
        onboarding_completed: userDoc?.onboarding_completed ?? false,
      },
      actingAs: actingAs
        ? {
            id: (actingAs as any).id,
            email: actingAs.email,
            name: actingAs.name,
            picture_url: actingAs.picture_url,
            role: actingAs.role,
            plan: (actingAs as any).plan ?? planFromRole(actingAs.role),
          }
        : null,
    });
  });

  // POST /api/auth/act-as — admin selects which user's data the app shows.
  // Stored on the session, so every route's `{ user_id: ctx.userId }` filter
  // follows the selection. Pass userId: null to go back to viewing own data.
  app.post("/api/auth/act-as", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    const sessionId = extractSessionFromCookie(cookieHeader);
    if (!sessionId) {
      res.status(401).json({ error: "No session cookie" });
      return;
    }

    let ctx;
    try {
      ctx = await requireAuth(cookieHeader);
      // Role gating deliberately uses ctx.user (the real session owner), never
      // the impersonated user — otherwise an admin viewing as a regular user
      // could not switch back.
      requireRole(ctx, "admin");
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 403).json({ error: err.message });
      return;
    }

    const { userId } = req.body as { userId?: string | null };

    if (!userId) {
      await setActingAsUser(sessionId, null);
      logger.info("admin_act_as_cleared", { admin_user_id: ctx.realUserId });
      res.json({ ok: true, actingAs: null });
      return;
    }

    let target: any = null;
    try {
      target = await col("users").findOne({ _id: new ObjectId(userId) } as any);
    } catch {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await setActingAsUser(sessionId, userId);
    logger.info("admin_act_as", {
      admin_user_id: ctx.realUserId,
      target_user_id: userId,
      target_email: target.email,
    });

    res.json({
      ok: true,
      actingAs: {
        id: target._id.toString(),
        email: target.email,
        name: target.name,
        role: target.role,
        plan: target.plan ?? planFromRole(target.role),
      },
    });
  });

  // POST /api/auth/register — email/password registration
  app.post("/api/auth/register", async (req, res) => {
    const { email, password, name } = req.body as { email?: string; password?: string; name?: string };

    if (!email || !password) {
      res.status(400).json({ error: "email_and_password_required" });
      return;
    }

    const emailLower = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      res.status(400).json({ error: "invalid_email" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "password_too_short" });
      return;
    }

    const settings = getSettings();
    if (settings.allowedEmails && settings.allowedEmails.length > 0) {
      if (!settings.allowedEmails.includes(emailLower)) {
        logger.warn("registration_failed", { reason: "not_allowed", email: emailLower, ip: clientIp(req) ?? null });
        res.status(403).json({ error: "not_allowed" });
        return;
      }
    }

    const existing = await col("users").findOne({ email: emailLower });
    if (existing) {
      logger.warn("registration_failed", { reason: "email_taken", email: emailLower, ip: clientIp(req) ?? null });
      res.status(409).json({ error: "email_taken" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const verificationToken = generateToken();
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const insert = await col("users").insertOne({
      email: emailLower,
      name: name?.trim() ?? null,
      picture_url: null,
      google_sub: null,
      password_hash: passwordHash,
      email_verified: 0,
      verification_token: verificationToken,
      verification_token_expires: tokenExpiry,
      role: "user",
      plan: "free",
      is_active: 1,
      created_at: new Date(),
      last_login_at: null,
    } as any);
    logger.info("user_registered", {
      user_id: insert.insertedId.toString(),
      email: emailLower,
      method: "email_password",
      ip: clientIp(req) ?? null,
    });

    const base = serverBaseUrl(req);
    try {
      await sendVerificationEmail(emailLower, verificationToken, base);
    } catch (err) {
      logger.error("verification_email_failed", { email: emailLower, error: err, ip: clientIp(req) ?? null });
    }

    res.status(201).json({ ok: true, emailSent: true });
  });

  // POST /api/auth/login — email/password sign-in
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ error: "email_and_password_required" });
      return;
    }

    const emailLower = email.trim().toLowerCase();
    const user = await col("users").findOne({ email: emailLower }) as any;

    if (!user || !user.password_hash) {
      logger.warn("login_failed", { method: "email_password", reason: "invalid_credentials", email: emailLower, ip: clientIp(req) ?? null });
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      logger.warn("login_failed", { method: "email_password", reason: "invalid_credentials", email: emailLower, user_id: user._id.toString(), ip: clientIp(req) ?? null });
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    if (!user.email_verified) {
      logger.warn("login_failed", { method: "email_password", reason: "email_not_verified", email: emailLower, user_id: user._id.toString(), ip: clientIp(req) ?? null });
      res.status(403).json({ error: "email_not_verified" });
      return;
    }

    if (!user.is_active) {
      logger.warn("login_failed", { method: "email_password", reason: "account_disabled", email: emailLower, user_id: user._id.toString(), ip: clientIp(req) ?? null });
      res.status(403).json({ error: "account_disabled" });
      return;
    }

    await col("users").updateOne({ _id: user._id }, { $set: { last_login_at: new Date() } });

    const ua = req.headers["user-agent"] ?? undefined;
    const ip = clientIp(req);
    const { cookies } = await createSession(user._id.toString(), ua, ip);
    logAuth("login_success", req, { user, method: "email_password", is_new_user: false });

    res.setHeader("Set-Cookie", cookies);
    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        picture_url: user.picture_url,
        role: user.role,
        plan: user.plan ?? planFromRole(user.role),
        onboarding_completed: user.onboarding_completed ?? false,
      },
    });
  });

  // GET /auth/magic?token=... — one-click magic-link sign-in
  app.get("/auth/magic", async (req, res) => {
    const token = req.query.token as string | undefined;
    if (!token) {
      res.redirect(frontendUrl("/login?error=invalid_token"));
      return;
    }

    const userId = await consumeMagicLinkToken(token);
    if (!userId) {
      logger.warn("login_failed", { method: "magic_link", reason: "token_expired", ip: clientIp(req) ?? null });
      res.redirect(frontendUrl("/login?error=token_expired"));
      return;
    }

    const user = await col("users").findOne({ _id: new ObjectId(userId) }) as any;
    if (!user || !user.is_active) {
      logger.warn("login_failed", { method: "magic_link", reason: "account_disabled", user_id: userId, ip: clientIp(req) ?? null });
      res.redirect(frontendUrl("/login?error=account_disabled"));
      return;
    }

    await col("users").updateOne({ _id: user._id }, { $set: { last_login_at: new Date() } });

    const ua = req.headers["user-agent"] ?? undefined;
    const ip = clientIp(req);
    const { cookies } = await createSession(user._id.toString(), ua, ip);
    logAuth("login_success", req, { user, method: "magic_link", is_new_user: false });

    res.setHeader("Set-Cookie", cookies);
    res.redirect(frontendUrl(POST_LOGIN_PATH));
  });

  // GET /auth/verify-email?token=...
  app.get("/auth/verify-email", async (req, res) => {
    const token = req.query.token as string | undefined;
    if (!token) {
      res.redirect(frontendUrl("/login?error=invalid_token"));
      return;
    }

    const user = await col("users").findOne({
      verification_token: token,
      verification_token_expires: { $gt: new Date() },
    }) as any;

    if (!user) {
      res.redirect(frontendUrl("/login?error=token_expired"));
      return;
    }

    await col("users").updateOne(
      { _id: user._id },
      {
        $set: { email_verified: 1, updated_at: new Date() },
        $unset: { verification_token: "", verification_token_expires: "" },
      }
    );
    logger.info("email_verified", {
      user_id: user._id.toString(),
      email: user.email,
      ip: clientIp(req) ?? null,
    });

    // Auto sign-in after verification
    const ua = req.headers["user-agent"] ?? undefined;
    const ip = clientIp(req);
    const { cookies } = await createSession(user._id.toString(), ua, ip);
    logAuth("login_success", req, { user, method: "email_verification", is_new_user: false });
    res.setHeader("Set-Cookie", cookies);
    res.redirect(frontendUrl(`${POST_LOGIN_PATH}?verified=1`));
  });

  // POST /api/auth/forgot-password
  app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body as { email?: string };
    if (!email) {
      res.status(400).json({ error: "email_required" });
      return;
    }

    const emailLower = email.trim().toLowerCase();
    const user = await col("users").findOne({ email: emailLower }) as any;

    // Always return ok to avoid user enumeration
    if (!user || !user.password_hash) {
      logger.info("password_reset_requested", { email: emailLower, user_found: false, ip: clientIp(req) ?? null });
      res.json({ ok: true });
      return;
    }

    const resetToken = generateToken();
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await col("users").updateOne(
      { _id: user._id },
      { $set: { reset_token: resetToken, reset_token_expires: resetExpiry } }
    );

    // Frontend origin: the emailed link opens /reset-password, a client-side
    // route, so it must not be built from the API host.
    const base = frontendBaseUrl(req);
    try {
      await sendPasswordResetEmail(emailLower, resetToken, base);
      notifyPasswordResetRequested({email: emailLower});
      logger.info("password_reset_requested", { user_id: user._id.toString(), email: emailLower, user_found: true, ip: clientIp(req) ?? null });
    } catch (err) {
      logger.error("password_reset_email_failed", { user_id: user._id.toString(), email: emailLower, error: err, ip: clientIp(req) ?? null });
    }

    res.json({ ok: true });
  });

  // POST /api/auth/reset-password
  app.post("/api/auth/reset-password", async (req, res) => {
    const { token, password } = req.body as { token?: string; password?: string };

    if (!token || !password) {
      res.status(400).json({ error: "token_and_password_required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "password_too_short" });
      return;
    }

    const user = await col("users").findOne({
      reset_token: token,
      reset_token_expires: { $gt: new Date() },
    }) as any;

    if (!user) {
      res.status(400).json({ error: "invalid_or_expired_token" });
      return;
    }

    const passwordHash = await hashPassword(password);
    await col("users").updateOne(
      { _id: user._id },
      {
        $set: { password_hash: passwordHash, email_verified: 1, updated_at: new Date() },
        $unset: { reset_token: "", reset_token_expires: "" },
      }
    );
    logger.info("password_reset_completed", {
      user_id: user._id.toString(),
      email: user.email,
      ip: clientIp(req) ?? null,
    });

    res.json({ ok: true });
  });
}

const isProd = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
const DEV_FRONTEND = !isProd
  ? (process.env.DEV_FRONTEND_URL ?? "http://localhost:4173")
  : (process.env.FRONTEND_URL ?? "");

/**
 * Where a completed sign-in lands. Sending users to "/" relied on that route
 * rendering the app and bouncing them onward, which flashed the login page and
 * breaks entirely once the root domain serves the marketing site instead.
 */
const POST_LOGIN_PATH = "/dashboard";

function frontendUrl(path: string): string {
  return `${DEV_FRONTEND}${path}`;
}

function googleCallbackUri(req: express.Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  return `${authCallbackBaseUrl(req)}/auth/google/callback`;
}

function authCallbackBaseUrl(req: express.Request): string {
  if (isProd && process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  return serverBaseUrl(req);
}

function serverBaseUrl(req: express.Request): string {
  if (process.env.SERVER_URL) return process.env.SERVER_URL;
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}`;
}

/**
 * Base URL for links the user opens in the app rather than on the API.
 *
 * Distinct from serverBaseUrl: a link to a client-side route such as
 * /reset-password has no server handler, so building it from the API origin
 * produces a 404. That only worked while SERVER_URL and the frontend shared a
 * host, which stops being true once the app moves to its own subdomain.
 */
function frontendBaseUrl(req: express.Request): string {
  if (isProd && process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  if (DEV_FRONTEND) return DEV_FRONTEND;
  return serverBaseUrl(req);
}

function planFromRole(role: string | null | undefined): "free" | "basic" | "business" {
  if (role === "admin") return "business";
  if (role === "pro") return "basic";
  return "free";
}

function logAuth(
  event: "login_success",
  req: express.Request,
  details: { user: any; method: string; is_new_user: boolean }
) {
  logger.info(event, {
    user_id: details.user._id?.toString(),
    email: details.user.email,
    role: details.user.role,
    method: details.method,
    is_new_user: details.is_new_user,
    ip: clientIp(req) ?? null,
    user_agent: req.headers["user-agent"] ?? null,
  });
}
