// Email-in: every user gets a private address (in+<token>@<INBOUND_EMAIL_DOMAIN>).
// Mail forwarded there is imported like an upload: allowed attachments go
// through importFile, and the body is scanned for a deadline.
//
// The handler takes its collaborators as arguments so the rules (token lookup,
// idempotency, auto-reply skip, limits, quota) are unit tested without Resend,
// Mongo or the document pipeline. `createInboundDeps` wires the real ones.

export const INBOUND_MAX_ATTACHMENTS = 10;
export const INBOUND_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const INBOUND_MAX_EMAILS_PER_DAY = 50;

const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "png", "jpg", "jpeg", "tif", "tiff"]);
const TOKEN_RE = /^in\+([a-z0-9]{16,64})@(.+)$/i;

export interface InboundAttachment {
  id: string;
  filename: string | null;
  size: number;
  content_type: string;
  content_disposition?: string | null;
  content_id?: string | null;
}

export interface InboundEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  headers: Record<string, string> | null;
  attachments: InboundAttachment[];
}

export interface InboundEvent {
  type: string;
  data?: { email_id?: string; to?: string[]; received_for?: string[] };
}

export interface InboundUser {
  userId: string;
  plan: string;
  /** Whether the plan includes document import; the same gate the upload route applies. */
  importAllowed: boolean;
}

export type InboundOutcome =
  | { status: "ignored"; reason: "not_received_event" | "no_domain" | "no_token" | "unknown_token" | "auto_reply" }
  | { status: "duplicate" }
  | { status: "refused"; reason: "plan" | "daily_limit" }
  | { status: "done"; imported: number; duplicates: number; skipped: number; quotaReached: boolean; discovery: boolean };

export interface InboundDeps {
  domain: string | null;
  findUserByToken(token: string): Promise<InboundUser | null>;
  /** Records the email id; false when it was already recorded (a webhook retry). */
  claimEmail(emailId: string, userId: string): Promise<boolean>;
  countToday(userId: string): Promise<number>;
  fetchEmail(emailId: string): Promise<InboundEmail>;
  downloadAttachment(emailId: string, attachmentId: string): Promise<Buffer>;
  /** Throws when the plan's document quota is used up. */
  assertQuota(user: InboundUser): Promise<void>;
  isQuotaError(error: unknown): boolean;
  /** Returns the document id and whether the file was already stored. */
  importDocument(user: InboundUser, filename: string, bytes: Buffer): Promise<{ id: string; duplicate: boolean }>;
  /** Saves a deadline found in the mail body to the discovery list; false when none. */
  saveDiscovery(user: InboundUser, email: InboundEmail): Promise<boolean>;
  finish(emailId: string, user: InboundUser, summary: Record<string, unknown>): Promise<void>;
}

export function inboundAddress(token: string, domain: string): string {
  return `in+${token}@${domain}`;
}

/** The token from the first recipient that matches our domain, else null. */
export function tokenFromRecipients(recipients: string[], domain: string): string | null {
  for (const raw of recipients) {
    const address = (/<([^>]+)>/.exec(raw)?.[1] ?? raw).trim();
    const match = TOKEN_RE.exec(address);
    if (match && match[2].toLowerCase() === domain.toLowerCase()) return match[1].toLowerCase();
  }
  return null;
}

/** Out-of-office replies and bulk mail must not create documents or loops. */
export function isAutoReply(headers: Record<string, string> | null | undefined): boolean {
  if (!headers) return false;
  const lower: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = String(value).toLowerCase();
  const autoSubmitted = lower["auto-submitted"];
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (/bulk|junk|auto_reply/.test(lower["precedence"] ?? "")) return true;
  return "x-autoreply" in lower || "x-autorespond" in lower;
}

export function isImportableAttachment(attachment: InboundAttachment): boolean {
  // Signature logos and tracking pixels arrive as inline images with a content id.
  if (attachment.content_disposition === "inline" && attachment.content_id) return false;
  const extension = (attachment.filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) return false;
  return attachment.size <= INBOUND_MAX_ATTACHMENT_BYTES;
}

export async function handleInboundEmailEvent(event: InboundEvent, deps: InboundDeps): Promise<InboundOutcome> {
  if (event.type !== "email.received") return { status: "ignored", reason: "not_received_event" };
  if (!deps.domain) return { status: "ignored", reason: "no_domain" };
  const emailId = event.data?.email_id?.trim();
  const recipients = [...(event.data?.to ?? []), ...(event.data?.received_for ?? [])];
  const token = tokenFromRecipients(recipients, deps.domain);
  if (!emailId || !token) return { status: "ignored", reason: "no_token" };

  const user = await deps.findUserByToken(token);
  if (!user) return { status: "ignored", reason: "unknown_token" };

  // Claimed before any work so a Resend retry cannot import the same mail twice.
  if (!await deps.claimEmail(emailId, user.userId)) return { status: "duplicate" };

  if (!user.importAllowed) {
    await deps.finish(emailId, user, { status: "refused", reason: "plan" });
    return { status: "refused", reason: "plan" };
  }

  if (await deps.countToday(user.userId) > INBOUND_MAX_EMAILS_PER_DAY) {
    await deps.finish(emailId, user, { status: "refused", reason: "daily_limit" });
    return { status: "refused", reason: "daily_limit" };
  }

  const email = await deps.fetchEmail(emailId);
  if (isAutoReply(email.headers)) {
    await deps.finish(emailId, user, { status: "ignored", reason: "auto_reply" });
    return { status: "ignored", reason: "auto_reply" };
  }

  let imported = 0;
  let duplicates = 0;
  let skipped = 0;
  let quotaReached = false;
  const candidates = email.attachments.slice(0, INBOUND_MAX_ATTACHMENTS);
  skipped += email.attachments.length - candidates.length;
  for (const attachment of candidates) {
    if (!isImportableAttachment(attachment)) { skipped += 1; continue; }
    try {
      await deps.assertQuota(user);
    } catch (error) {
      if (deps.isQuotaError(error)) { quotaReached = true; break; }
      throw error;
    }
    const bytes = await deps.downloadAttachment(emailId, attachment.id);
    const result = await deps.importDocument(user, attachment.filename ?? "attachment", bytes);
    if (result.duplicate) duplicates += 1; else imported += 1;
  }

  const discovery = await deps.saveDiscovery(user, email);
  await deps.finish(emailId, user, { status: "done", imported, duplicates, skipped, quotaReached, discovery, from: email.from, subject: email.subject });
  return { status: "done", imported, duplicates, skipped, quotaReached, discovery };
}
