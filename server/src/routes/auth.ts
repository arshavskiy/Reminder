import express from "express";
import { col } from "../db/db";
import { getSettings } from "../settings";
import {
  getGoogleAuthUrl,
  exchangeCodeForIdToken,
  verifyIdToken,
  generateState,
  generateCodeVerifier,
} from "../auth/google";
import {
  createSession,
  revokeSession,
  extractSessionFromCookie,
  verifySession,
} from "../auth/session";

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

    const url = await getGoogleAuthUrl(state, codeVerifier);
    res.redirect(url);
  });

  // GET /auth/google/callback — handle redirect from Google
  app.get("/auth/google/callback", async (req, res) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const error = req.query.error as string | undefined;

    if (error) {
      res.redirect(frontendUrl(`/#/login?error=${encodeURIComponent(error)}`));
      return;
    }

    if (!code || !state) {
      res.redirect(frontendUrl("/#/login?error=missing_params"));
      return;
    }

    const pkce = await col<{ state: string; code_verifier: string; expires_at: Date }>(
      "oauth_states"
    ).findOne({ state, expires_at: { $gt: new Date() } });

    if (!pkce) {
      res.redirect(frontendUrl("/#/login?error=invalid_state"));
      return;
    }
    await col("oauth_states").deleteOne({ state });

    try {
      const tokens = await exchangeCodeForIdToken(code, pkce.code_verifier);
      const profile = await verifyIdToken(tokens.id_token);
      const settings = getSettings();

      // Email whitelist check
      if (settings.allowedEmails && settings.allowedEmails.length > 0) {
        if (!settings.allowedEmails.includes(profile.email)) {
          res.redirect(frontendUrl("/#/login?error=not_allowed"));
          return;
        }
      }

      // Upsert user
      await col("users").updateOne(
        { google_sub: profile.sub },
        {
          $set: {
            email: profile.email,
            name: profile.name ?? null,
            picture_url: profile.picture ?? null,
            last_login_at: new Date(),
          },
          $setOnInsert: {
            google_sub: profile.sub,
            role: "user",
            is_active: 1,
            created_at: new Date(),
          },
        },
        { upsert: true }
      );

      const user = await col("users").findOne({ google_sub: profile.sub }) as any;
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
          },
        },
        { upsert: true }
      );

      const ua = req.headers["user-agent"] ?? undefined;
      const ip = (req.headers["x-forwarded-for"] as string) ?? req.socket.remoteAddress ?? undefined;
      const { cookies } = await createSession(user._id.toString(), ua, ip);

      res.setHeader("Set-Cookie", cookies);
      res.redirect(frontendUrl("/"));
    } catch (err) {
      console.error("[auth] OAuth callback error:", err);
      res.redirect(frontendUrl("/#/login?error=auth_failed"));
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
          res.status(403).json({ error: "not_allowed" });
          return;
        }
      }

      // Upsert user
      await col("users").updateOne(
        { google_sub: profile.sub },
        {
          $set: {
            email: profile.email,
            name: profile.name ?? null,
            picture_url: profile.picture ?? null,
            last_login_at: new Date(),
          },
          $setOnInsert: {
            google_sub: profile.sub,
            role: "user",
            is_active: 1,
            created_at: new Date(),
          },
        },
        { upsert: true }
      );

      const user = await col("users").findOne({ google_sub: profile.sub }) as any;
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
          },
        },
        { upsert: true }
      );

      const ua = req.headers["user-agent"] ?? undefined;
      const ip = (req.headers["x-forwarded-for"] as string) ?? req.socket.remoteAddress ?? undefined;
      const { cookies } = await createSession(user._id.toString(), ua, ip);

      res.setHeader("Set-Cookie", cookies);
      res.status(200).json({
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          picture_url: user.picture_url,
          role: user.role,
        },
      });
    } catch (err) {
      console.error("[auth] GIS sign-in error:", err);
      res.status(500).json({ error: "auth_failed" });
    }
  });

  // POST /auth/logout
  app.post("/auth/logout", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    const sessionId = extractSessionFromCookie(cookieHeader);
    if (sessionId) {
      await revokeSession(sessionId);
    }
    res.setHeader("Set-Cookie", "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    res.json({ ok: true });
  });

  // GET /auth/me — return current user info
  app.get("/auth/me", async (req, res) => {
    const cookieHeader = req.headers.cookie ?? undefined;
    const sessionId = extractSessionFromCookie(cookieHeader);
    if (!sessionId) {
      res.json({ user: null });
      return;
    }

    const user = await verifySession(sessionId);
    if (!user) {
      res.json({ user: null });
      return;
    }

    res.json({
      user: {
        id: (user as any).id,
        email: user.email,
        name: user.name,
        picture_url: user.picture_url,
        role: user.role,
      },
    });
  });
}

const DEV_FRONTEND =
  process.env.VITE_DEV_URL ??
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173");

function frontendUrl(path: string): string {
  return `${DEV_FRONTEND}${path}`;
}
