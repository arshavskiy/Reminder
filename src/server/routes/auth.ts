import { getDb } from "../db/db.js";
import { getSettings } from "../settings.js";
import {
  getGoogleAuthUrl,
  exchangeCodeForIdToken,
  verifyIdToken,
  generateState,
  generateCodeVerifier,
} from "../auth/google.js";
import { createSession, revokeSession, extractSessionFromCookie, verifySession } from "../auth/session.js";

type Handler = (req: Request) => Promise<Response>;

// In-memory PKCE store: state → { codeVerifier, expiresAt }
const pkceStore = new Map<string, { codeVerifier: string; expiresAt: number }>();

// Prune stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pkceStore) {
    if (v.expiresAt < now) pkceStore.delete(k);
  }
}, 10 * 60 * 1000);

export function registerAuthRoutes(router: Map<string, Handler>) {
  // GET /auth/google — kick off OAuth flow
  router.set("GET /auth/google", async (req) => {
    const settings = getSettings();
    if (!settings.googleClientId || !settings.googleClientSecret) {
      return new Response("Google OAuth not configured", { status: 503 });
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    pkceStore.set(state, { codeVerifier, expiresAt: Date.now() + 10 * 60 * 1000 });

    const url = getGoogleAuthUrl(state, codeVerifier);
    return new Response(null, {
      status: 302,
      headers: { Location: url },
    });
  });

  // GET /auth/google/callback — handle redirect from Google
  router.set("GET /auth/google/callback", async (req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return redirectToLogin(`error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return redirectToLogin("error=missing_params");
    }

    const pkce = pkceStore.get(state);
    if (!pkce) {
      return redirectToLogin("error=invalid_state");
    }
    pkceStore.delete(state);

    try {
      const tokens = await exchangeCodeForIdToken(code, pkce.codeVerifier);
      const profile = await verifyIdToken(tokens.id_token);

      const settings = getSettings();

      // Email whitelist check
      if (settings.allowedEmails && settings.allowedEmails.length > 0) {
        if (!settings.allowedEmails.includes(profile.email)) {
          return redirectToLogin("error=not_allowed");
        }
      }

      const db = getDb();

      // Upsert user
      db.prepare(`
        INSERT INTO users (google_sub, email, name, picture_url)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(google_sub) DO UPDATE SET
          email        = excluded.email,
          name         = excluded.name,
          picture_url  = excluded.picture_url,
          last_login_at = datetime('now')
      `).run(profile.sub, profile.email, profile.name ?? null, profile.picture ?? null);

      const user = db.prepare("SELECT * FROM users WHERE google_sub = ?").get(profile.sub) as { id: number };

      // Update last_login_at
      db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);

      // Ensure user_settings row exists
      db.prepare(`
        INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)
      `).run(user.id);

      const ua = req.headers.get("user-agent") ?? undefined;
      const ip = req.headers.get("x-forwarded-for") ?? undefined;
      const { cookies } = createSession(db, user.id, ua, ip);

      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": cookies,
        },
      });
    } catch (err) {
      console.error("[auth] OAuth callback error:", err);
      return redirectToLogin("error=auth_failed");
    }
  });

  // POST /auth/logout
  router.set("POST /auth/logout", async (req) => {
    const cookieHeader = req.headers.get("cookie") ?? undefined;
    const sessionId = extractSessionFromCookie(cookieHeader);
    if (sessionId) {
      const db = getDb();
      revokeSession(db, sessionId);
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      },
    });
  });

  // GET /auth/me — return current user info
  router.set("GET /auth/me", async (req) => {
    const cookieHeader = req.headers.get("cookie") ?? undefined;
    const sessionId = extractSessionFromCookie(cookieHeader);
    if (!sessionId) {
      return new Response(JSON.stringify({ user: null }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();
    const user = verifySession(db, sessionId);
    if (!user) {
      return new Response(JSON.stringify({ user: null }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture_url: user.picture_url,
          role: user.role,
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  });
}

function redirectToLogin(query: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `/#/login?${query}` },
  });
}
