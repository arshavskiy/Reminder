import { getDb } from "../db/db";
import { getSettings } from "../settings";
import {
  getGoogleAuthUrl,
  exchangeCodeForIdToken,
  verifyIdToken,
  generateState,
  generateCodeVerifier,
} from "../auth/google";
import { createSession, revokeSession, extractSessionFromCookie, verifySession } from "../auth/session";

type Handler = (req: Request) => Promise<Response>;

export function registerAuthRoutes(router: Map<string, Handler>) {
  // GET /auth/google — kick off OAuth flow
  router.set("GET /auth/google", async (req) => {
    const settings = getSettings();
    if (!settings.googleClientId || !settings.googleClientSecret) {
      return new Response("Google OAuth not configured", { status: 503 });
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    // Persist PKCE state to DB so a server restart between redirect and callback
    // doesn't lose it (in-memory Map is wiped on restart)
    const db = getDb();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO oauth_states (state, code_verifier, expires_at)
      VALUES (?, ?, ?)
    `).run(state, codeVerifier, expiresAt);

    // Prune expired states while we're here
    db.prepare(`DELETE FROM oauth_states WHERE expires_at < datetime('now')`).run();

    const url = await getGoogleAuthUrl(state, codeVerifier);
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

    const db = getDb();
    const pkce = db.prepare(`
      SELECT code_verifier FROM oauth_states
      WHERE state = ? AND expires_at > datetime('now')
    `).get(state) as { code_verifier: string } | null;

    if (!pkce) {
      return redirectToLogin("error=invalid_state");
    }
    db.prepare(`DELETE FROM oauth_states WHERE state = ?`).run(state);

    try {
      const tokens = await exchangeCodeForIdToken(code, pkce.code_verifier);
      const profile = await verifyIdToken(tokens.id_token);

      const settings = getSettings();

      // Email whitelist check
      if (settings.allowedEmails && settings.allowedEmails.length > 0) {
        if (!settings.allowedEmails.includes(profile.email)) {
          return redirectToLogin("error=not_allowed");
        }
      }

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
          Location: frontendUrl("/"),
          "Set-Cookie": cookies,
        },
      });
    } catch (err) {
      console.error("[auth] OAuth callback error:", err);
      return redirectToLogin("error=auth_failed");
    }
  });

  // POST /api/auth/google — GIS credential (ID token) sign-in
  router.set("POST /api/auth/google", async (req) => {
    const body = await req.json() as { credential?: string };
    if (!body.credential) {
      return new Response(JSON.stringify({ error: "missing_credential" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    try {
      const profile = await verifyIdToken(body.credential);
      const settings = getSettings();

      if (settings.allowedEmails && settings.allowedEmails.length > 0) {
        if (!settings.allowedEmails.includes(profile.email)) {
          return new Response(JSON.stringify({ error: "not_allowed" }), { status: 403, headers: { "Content-Type": "application/json" } });
        }
      }

      const db = getDb();

      db.prepare(`
        INSERT INTO users (google_sub, email, name, picture_url)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(google_sub) DO UPDATE SET
          email         = excluded.email,
          name          = excluded.name,
          picture_url   = excluded.picture_url,
          last_login_at = datetime('now')
      `).run(profile.sub, profile.email, profile.name ?? null, profile.picture ?? null);

      const user = db.prepare("SELECT * FROM users WHERE google_sub = ?").get(profile.sub) as { id: number; email: string; name: string | null; picture_url: string | null; role: string };
      db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
      db.prepare("INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)").run(user.id);

      const ua = req.headers.get("user-agent") ?? undefined;
      const ip = req.headers.get("x-forwarded-for") ?? undefined;
      const { cookies } = createSession(db, user.id, ua, ip);

      return new Response(
        JSON.stringify({ user: { id: user.id, email: user.email, name: user.name, picture_url: user.picture_url, role: user.role } }),
        { status: 200, headers: { "Content-Type": "application/json", "Set-Cookie": cookies } }
      );
    } catch (err) {
      console.error("[auth] GIS sign-in error:", err);
      return new Response(JSON.stringify({ error: "auth_failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
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

const DEV_FRONTEND = process.env.VITE_DEV_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173");

function frontendUrl(path: string): string {
  return `${DEV_FRONTEND}${path}`;
}

function redirectToLogin(query: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: frontendUrl(`/#/login?${query}`) },
  });
}
