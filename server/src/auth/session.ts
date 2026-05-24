import {randomBytes} from "crypto";
import {ObjectId} from "mongodb";
import {getDb} from "../db/db";
import type {User} from "../../src/shared/types.js";

export async function createSession(
  userId: string,
  userAgent?: string,
  ip?: string
): Promise<{ sessionId: string; cookies: string }> {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await getDb().collection("sessions").insertOne({
    _id: sessionId as any,
    user_id: userId,
    created_at: new Date(),
    expires_at: expiresAt,
    user_agent: userAgent ?? null,
    ip: ip ?? null,
  });

  const secure = process.env.NODE_ENV === "production";
  // SameSite=None required for cross-origin (Vercel client → Railway server)
  const sameSite = secure ? "None" : "Lax";
  const setCookieHeader = `session=${sessionId}; Path=/; HttpOnly; ${
    secure ? "Secure; " : ""
  }SameSite=${sameSite}; Max-Age=604800`;

  return { sessionId, cookies: setCookieHeader };
}

export async function verifySession(sessionId: string): Promise<User | null> {
  const db = getDb();
  const session = await db.collection("sessions").findOne({
    _id: sessionId as any,
    expires_at: { $gt: new Date() },
  });

  if (!session) return null;

  const user = await db.collection("users").findOne({ _id: new ObjectId(session.user_id as string) }) as any;
  if (!user) return null;

  return {
    id: user._id.toString(),
    google_sub: user.google_sub,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    picture_url: user.picture_url,
    role: user.role,
    is_active: user.is_active,
    created_at: user.created_at?.toISOString() ?? "",
    last_login_at: user.last_login_at?.toISOString() ?? null,
  } as any;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await getDb().collection("sessions").deleteOne({ _id: sessionId as any });
}

export function extractSessionFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(";")) {
    const [name, value] = cookie.trim().split("=");
    if (name === "session") return value;
  }
  return null;
}

function generateSessionId(): string {
  return randomBytes(32).toString("hex");
}
