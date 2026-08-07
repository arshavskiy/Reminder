import {randomBytes} from "crypto";
import {ObjectId} from "mongodb";
import {getDb} from "../db/db";
import type {User} from "../../src/shared/types.js";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export async function createMagicLinkToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await getDb().collection("magic_link_tokens").insertOne({
    token,
    user_id: userId,
    created_at: new Date(),
    expires_at: new Date(Date.now() + MAGIC_LINK_TTL_MS),
  } as any);
  return token;
}

/** Verifies and consumes a magic-link token, returning the associated user id. Single-use. */
export async function consumeMagicLinkToken(token: string): Promise<string | null> {
  const record = await getDb().collection("magic_link_tokens").findOneAndDelete({
    token,
    expires_at: { $gt: new Date() },
  } as any);
  return record?.user_id ?? null;
}

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

function toUser(doc: any): User {
  return {
    id: doc._id.toString(),
    google_sub: doc.google_sub,
    email: doc.email,
    name: doc.name,
    phone: doc.phone ?? null,
    company_name: doc.company_name ?? null,
    picture_url: doc.picture_url,
    role: doc.role,
    is_active: doc.is_active,
    created_at: doc.created_at?.toISOString() ?? "",
    last_login_at: doc.last_login_at?.toISOString() ?? null,
  } as any;
}

export interface SessionIdentity {
  /** The user the session actually belongs to. Role checks must use this. */
  user: User;
  /** Admin-selected user whose data is being viewed, when impersonating. */
  actingAs: User | null;
}

/**
 * Resolves a session to its real user plus any admin "view as" target.
 * The override is honoured only when the session's OWN user is an admin.
 */
export async function verifySessionIdentity(sessionId: string): Promise<SessionIdentity | null> {
  const db = getDb();
  const session = await db.collection("sessions").findOne({
    _id: sessionId as any,
    expires_at: { $gt: new Date() },
  });

  if (!session) return null;

  const userDoc = await db.collection("users").findOne({ _id: new ObjectId(session.user_id as string) }) as any;
  if (!userDoc) return null;
  const user = toUser(userDoc);

  let actingAs: User | null = null;
  const targetId = (session as any).acting_as_user_id as string | undefined;
  if (targetId && user.role === "admin" && targetId !== String(user.id)) {
    try {
      const targetDoc = await db.collection("users").findOne({ _id: new ObjectId(targetId) }) as any;
      if (targetDoc) actingAs = toUser(targetDoc);
    } catch {
      // Malformed id stored on the session — ignore and act as self.
    }
  }

  return { user, actingAs };
}

export async function verifySession(sessionId: string): Promise<User | null> {
  const identity = await verifySessionIdentity(sessionId);
  return identity?.user ?? null;
}

/** Sets (or clears, with null) the admin's "view as" target for this session. */
export async function setActingAsUser(sessionId: string, targetUserId: string | null): Promise<void> {
  await getDb().collection("sessions").updateOne(
    { _id: sessionId as any },
    targetUserId
      ? { $set: { acting_as_user_id: targetUserId } }
      : { $unset: { acting_as_user_id: "" } },
  );
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
