import type { Database } from "bun:sqlite";
import { getSettings } from "../settings.js";
import type { User } from "../../shared/types.js";

/**
 * Create a new session for a user
 */
export function createSession(
  db: Database,
  userId: number,
  userAgent?: string,
  ip?: string
): { sessionId: string; cookies: string } {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, user_agent, ip)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, userId, expiresAt, userAgent || null, ip || null);

  const settings = getSettings();
  const secure = process.env.NODE_ENV === "production";

  // Generate signed session cookie
  const setCookieHeader = `session=${sessionId}; Path=/; HttpOnly; ${
    secure ? "Secure; " : ""
  }SameSite=Lax; Max-Age=604800`; // 7 days in seconds

  return { sessionId, cookies: setCookieHeader };
}

/**
 * Verify a session cookie and return the user
 */
export function verifySession(db: Database, sessionId: string): User | null {
  const session = db
    .prepare(
      `
    SELECT s.*, u.* FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `
    )
    .get(sessionId) as (Session & User) | undefined;

  if (!session) {
    return null;
  }

  // Session is valid
  return {
    id: session.id,
    google_sub: session.google_sub,
    email: session.email,
    name: session.name,
    picture_url: session.picture_url,
    role: session.role,
    is_active: session.is_active,
    created_at: session.created_at,
    last_login_at: session.last_login_at,
  };
}

/**
 * Revoke a session
 */
export function revokeSession(db: Database, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

/**
 * Clean up expired sessions (run periodically)
 */
export function cleanupExpiredSessions(db: Database): number {
  const result = db.run("DELETE FROM sessions WHERE expires_at < datetime('now')");
  return result.changes;
}

/**
 * Extract session ID from cookie header
 */
export function extractSessionFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "session") {
      return value;
    }
  }

  return null;
}

/**
 * Generate a secure random session ID
 */
function generateSessionId(): string {
  return crypto.getRandomValues(new Uint8Array(32)).reduce((acc, byte) => {
    return acc + byte.toString(16).padStart(2, "0");
  }, "");
}

// Helper type
interface Session {
  id: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  user_agent: string | null;
  ip: string | null;
}

interface User {
  id: number;
  google_sub: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  role: "admin" | "user";
  is_active: number;
  created_at: string;
  last_login_at: string | null;
}

