import {randomBytes} from "crypto";
import {ObjectId} from "mongodb";
import {getDb} from "../db/db";
import type {User, UserPlan} from "../../src/shared/types.js";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
// Trial accounts are often provisioned in bulk (e.g. from inspector leads) and
// clicked well after creation, so their link gets a much longer window before
// going stale unused. Still single-use — consumeMagicLinkToken deletes it on
// the first successful click regardless of how much of the window is left.
const TRIAL_MAGIC_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** TTL in minutes for the given plan's magic link — for surfacing to callers/UI. */
export function magicLinkTtlMinutes(plan?: UserPlan | string | null): number {
  return (plan === "trial" ? TRIAL_MAGIC_LINK_TTL_MS : MAGIC_LINK_TTL_MS) / 60_000;
}

export async function createMagicLinkToken(userId: string, plan?: UserPlan | string | null): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const ttl = plan === "trial" ? TRIAL_MAGIC_LINK_TTL_MS : MAGIC_LINK_TTL_MS;
  await getDb().collection("magic_link_tokens").insertOne({
    token,
    user_id: userId,
    created_at: new Date(),
    expires_at: new Date(Date.now() + ttl),
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

  const setCookieHeader = buildSessionCookie(sessionId, 604800);

  return { sessionId, cookies: setCookieHeader };
}

export function clearSessionCookie(): string {
  return buildSessionCookie("", 0);
}

function buildSessionCookie(value: string, maxAge: number): string {
  const secure = shouldUseSecureCookie();
  const sameSite = cookieSameSite(secure);
  const domain = cookieDomain();
  return [
    `session=${value}`,
    "Path=/",
    "HttpOnly",
    secure ? "Secure" : null,
    `SameSite=${sameSite}`,
    domain ? `Domain=${domain}` : null,
    `Max-Age=${maxAge}`,
  ].filter(Boolean).join("; ");
}

function shouldUseSecureCookie(): boolean {
  const configured = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  if (isLocalAppEnv()) return false;
  return process.env.NODE_ENV === "production" ||
    Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME) ||
    isHttpsUrl(process.env.SERVER_URL) ||
    isHttpsUrl(process.env.FRONTEND_URL) ||
    isHttpsUrl(process.env.DEV_FRONTEND_URL);
}

function cookieSameSite(secure: boolean): "Lax" | "None" | "Strict" {
  const configured = process.env.COOKIE_SAMESITE?.trim();
  if (configured === "Lax" || configured === "None" || configured === "Strict") return configured;
  // SameSite=None is required when the deployed client/API are cross-origin.
  // Browsers require Secure together with SameSite=None, so local HTTP stays Lax.
  return secure ? "None" : "Lax";
}

function cookieDomain(): string | null {
  const configured = process.env.COOKIE_DOMAIN?.trim();
  if (configured) return configured;
  if (process.env.COOKIE_DOMAIN_AUTO?.trim().toLowerCase() === "false") return null;
  if (isLocalAppEnv()) return null;
  const urls = [process.env.FRONTEND_URL, process.env.DEV_FRONTEND_URL, process.env.SERVER_URL];
  for (const url of urls) {
    const host = hostname(url);
    if (host === "handcoded.tech" || host?.endsWith(".handcoded.tech")) return ".handcoded.tech";
    if (host === "remindocr.com" || host?.endsWith(".remindocr.com")) return ".remindocr.com";
  }
  return null;
}

function isLocalAppEnv(): boolean {
  const appEnv = process.env.APP_ENV?.trim().toLowerCase();
  if (appEnv && appEnv !== "production") return true;
  return process.env.NODE_ENV !== "production" &&
    !process.env.RAILWAY_ENVIRONMENT &&
    !process.env.RAILWAY_ENVIRONMENT_NAME;
}

function isHttpsUrl(value: string | undefined): boolean {
  return value?.trim().toLowerCase().startsWith("https://") ?? false;
}

function hostname(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
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
    plan: normalizeUserPlan(doc.plan ?? planFromRole(doc.role)),
    trial_ends_at: doc.trial_ends_at ?? null,
    is_active: doc.is_active,
    created_at: doc.created_at?.toISOString() ?? "",
    last_login_at: doc.last_login_at?.toISOString() ?? null,
  } as any;
}

function planFromRole(role: string | null | undefined): UserPlan {
  // Fallback only, for rows predating the plan field. Roles no longer map to
  // tiers: admin administers, everyone else is a user.
  if (role === "admin") return "business";
  return "free";
}

function normalizeUserPlan(value: unknown): UserPlan {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "business") return "business";
  if (text === "basic") return "basic";
  // "trial" must survive here: the gates read plan off the session user, and
  // collapsing it to free would expire every trial the moment it is loaded.
  if (text === "trial") return "trial";
  return "free";
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
