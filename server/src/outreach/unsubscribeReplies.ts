import type {Collection} from "mongodb";

// Replies to outreach campaigns land in the contact@remindocr.com Gmail. The
// campaign footer asks recipients to answer "הסר", and the footer link /
// List-Unsubscribe header prefill the subject with "הסר" or "unsubscribe".
export const UNSUBSCRIBE_GMAIL_QUERY = 'to:contact@remindocr.com (הסר OR הסירו OR להסיר OR unsubscribe OR "remove me") newer_than:365d';

const OWN_DOMAIN = "remindocr.com";
// Hebrew has no \b word boundary in JS regexes, so the Hebrew words are matched
// between non-Hebrew-letter characters instead.
const HEBREW_REQUEST = /(^|[^א-ת])(הסר|הסירו|להסיר|תסירו)(?=$|[^א-ת])/;
const ENGLISH_REQUEST = /\b(unsubscribe|remove me)\b/i;

export interface UnsubscribeReply {
  email: string;
  messageId: string;
  requestedAt: Date;
  subject: string;
  snippet: string;
}

/** Pulls the bare address out of a From header such as `"Name" <a@b.co.il>`. */
export function extractSenderEmail(from: string): string | null {
  const bracketed = from.match(/<([^<>\s@]+@[^<>\s@]+)>/);
  const bare = bracketed?.[1] ?? from.match(/[^\s<>"',;]+@[^\s<>"',;]+/)?.[0];
  return bare ? bare.trim().toLowerCase() : null;
}

/**
 * True when the reply itself asks to be removed. Only the subject and Gmail's
 * snippet (the start of the reply) are checked, so the quoted campaign footer
 * further down — which also contains "הסר" — does not count.
 */
export function isUnsubscribeRequest(subject: string, snippet: string): boolean {
  const text = `${subject}\n${snippet}`;
  return HEBREW_REQUEST.test(text) || ENGLISH_REQUEST.test(text);
}

export function parseUnsubscribeReply(message: {
  id: string;
  snippet?: string;
  internalDate?: string;
  headers: {name: string; value: string}[];
}): UnsubscribeReply | null {
  const header = (name: string) => message.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const email = extractSenderEmail(header("From"));
  if (!email || email.endsWith(`@${OWN_DOMAIN}`)) return null;
  const subject = header("Subject");
  const snippet = decodeSnippet(message.snippet ?? "");
  if (!isUnsubscribeRequest(subject, snippet)) return null;
  const internal = Number(message.internalDate);
  return {
    email,
    messageId: message.id,
    requestedAt: Number.isFinite(internal) && internal > 0 ? new Date(internal) : new Date(),
    subject,
    snippet,
  };
}

/** Gmail snippets arrive HTML-escaped (&quot; &#39; ...). */
function decodeSnippet(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Keeps the earliest request per sender. */
export function dedupeUnsubscribeReplies(replies: UnsubscribeReply[]): UnsubscribeReply[] {
  const bySender = new Map<string, UnsubscribeReply>();
  for (const reply of replies) {
    const current = bySender.get(reply.email);
    if (!current || reply.requestedAt < current.requestedAt) bySender.set(reply.email, reply);
  }
  return [...bySender.values()];
}

function exactEmailFilter(email: string) {
  return {email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")};
}

/**
 * Flags each sender as unsubscribed in inspector_leads. A sender that is not a
 * lead yet is inserted as a suppression-only lead so future campaigns skip it.
 */
export async function recordUnsubscribes(leads: Collection, replies: UnsubscribeReply[]) {
  let newlyUnsubscribed = 0;
  let alreadyUnsubscribed = 0;
  let insertedLeads = 0;
  for (const reply of replies) {
    const lead = await leads.findOne(exactEmailFilter(reply.email));
    const unsubscribe = {
      unsubscribed: true,
      unsubscribedAt: reply.requestedAt,
      unsubscribeSource: "gmail-reply",
      unsubscribeMessageId: reply.messageId,
      unsubscribeSubject: reply.subject,
      unsubscribeSnippet: reply.snippet.slice(0, 300),
      updated_at: new Date(),
    };
    if (!lead) {
      await leads.insertOne({
        name: null,
        email: reply.email,
        source: "unsubscribe-reply",
        contactStatus: "NOT_RELEVANT",
        leadScore: 0,
        created_at: new Date(),
        ...unsubscribe,
      });
      insertedLeads += 1;
      continue;
    }
    if (lead.unsubscribed) {
      alreadyUnsubscribed += 1;
      continue;
    }
    const status = String(lead.contactStatus ?? "NEW").toUpperCase();
    await leads.updateOne({_id: lead._id}, {$set: {
      ...unsubscribe,
      ...(status === "NEW" || status === "CONTACTED" ? {contactStatus: "NOT_RELEVANT"} : {}),
    }});
    newlyUnsubscribed += 1;
  }
  return {newlyUnsubscribed, alreadyUnsubscribed, insertedLeads};
}
