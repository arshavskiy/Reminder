/**
 * Repair of email addresses mangled by Hebrew PDF bidi extraction.
 *
 * A PDF that lays out an RTL line renders the address in visual order, so text
 * extraction reads it back scrambled in two independent ways:
 *
 *   1. Domain-first: "shanigolan@gmail.com" is emitted as "com.gmail@shanigolan"
 *      — the dot segments and the two sides of the "@" are both flipped.
 *   2. Digit glue: a trailing digit run in the local part renders at the visual
 *      start, so "shanigolan83@" comes back as "83shanigolan@".
 *
 * Both can happen to the same address, which is how "shanigolan83@gmail.com"
 * arrived as "com.gmail@83shanigolan". This module owns the single repair used
 * by every extraction path; it previously lived in importer.ts with a partial
 * copy in ocrExtractor.ts that fixed only the first case, so the OCR path wrote
 * a half-repaired address to the document while the client record got the right
 * one from the other path.
 */

const KNOWN_TLDS = new Set(["com", "net", "org", "il", "co", "io", "me", "info", "biz", "edu", "gov"]);

/**
 * Put a reversed domain back into logical order.
 *
 * Dot segments flip ("com.gmail" -> "gmail.com"), and so do hyphen segments
 * inside a segment ("afar-d" -> "d-afar"), because bidi reverses the whole
 * visual run and a hyphen is just another separator inside it. The hyphen pass
 * runs only on a genuinely reversed domain — a correctly ordered address never
 * reaches here, so a real hyphenated domain is never scrambled.
 */
function reverseDotSegments(s: string): string {
  return s
    .split(".")
    .reverse()
    .map((segment) => (segment.includes("-") ? segment.split("-").reverse().join("-") : segment))
    .join(".");
}

function isReversedEmail(local: string, domain: string): boolean {
  // A reversed email's local part, when dot-segments are reversed, ends with a known TLD.
  // e.g. "com.gmail" reversed segments = "gmail.com" -> ends with "com" ✓
  // e.g. "li.oc" reversed segments = "co.il" -> ends with "il" ✓
  const reversedLocal = local.split(".").reverse().join(".");
  const reversedLocalTld = reversedLocal.split(".").pop()?.toLowerCase() ?? "";
  const domainLast = domain.split(".").pop()?.toLowerCase() ?? "";
  return KNOWN_TLDS.has(reversedLocalTld) && !KNOWN_TLDS.has(domainLast);
}

/**
 * Move a digit run that bidi pushed to the front of the local part back to the
 * end: "83shanigolan" -> "shanigolan83".
 *
 * Single digits count — they are the common case, and a \d{2,} guard silently
 * let them through. Applied only when what follows the digits starts with a
 * letter, so an address that legitimately begins with digits ("2024reports@")
 * is left alone unless the rest looks like a name.
 */
function unglueLeadingDigits(local: string, domain?: string): string {
  const match = local.match(/^(\d+)([a-z][a-z0-9._%+-]*)$/i);
  if (!match) return local;

  // A local part that already equals the domain's first label is the address the
  // sender actually uses, not a bidi artifact — "6cn@6cn.co" is a real mailbox,
  // and rewriting it to "cn6@" would break a working address. Checked against a
  // real false positive found while auditing production data; every other
  // digit-leading address there was a genuine artifact.
  const firstLabel = domain?.split(".")[0]?.toLowerCase();
  if (firstLabel && local.toLowerCase() === firstLabel) return local;

  return `${match[2]}${match[1]}`;
}

/**
 * Normalize one address to logical order and lower case.
 *
 * Safe to call on an already-correct address: every branch is guarded by a
 * shape test that a well-formed address fails, so this is idempotent.
 */
export function normalizeEmail(value: string): string {
  const cleaned = value.trim().replace(/[.,;:]+$/g, "").toLowerCase();
  const atIdx = cleaned.indexOf("@");
  if (atIdx === -1) return cleaned;
  const beforeAt = cleaned.slice(0, atIdx);
  const afterAt = cleaned.slice(atIdx + 1);

  // Fully reversed: "com.gmail@83shanigolan" -> local "83shanigolan", domain "gmail.com".
  // The local part still carries the digit glue, so it is ungued after the swap.
  if (isReversedEmail(beforeAt, afterAt)) {
    const domain = reverseDotSegments(beforeAt);
    return `${unglueLeadingDigits(reverseDotSegments(afterAt), domain)}@${domain}`;
  }

  // Domain in local part, no dots in domain: "com.gmail@username" -> "username@gmail.com"
  if (beforeAt.includes(".") && !afterAt.includes(".")) {
    const swappedDomain = reverseDotSegments(beforeAt);
    return `${unglueLeadingDigits(afterAt, swappedDomain)}@${swappedDomain}`;
  }

  // Sides are already correct; only the local part needs unglueing.
  return `${unglueLeadingDigits(beforeAt, afterAt)}@${afterAt}`;
}

/**
 * Find the first email address in a block of extracted text and normalize it.
 *
 * The pattern deliberately allows a domain-shaped left side and a name-shaped
 * right side, because that is exactly what a reversed address looks like before
 * repair. Returns null when the match cannot be made into a plausible address.
 */
export function extractEmailFromText(text: string): string | null {
  const match = text.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+/);
  if (!match?.[0]) return null;

  const normalized = normalizeEmail(match[0]);
  const atIdx = normalized.indexOf("@");
  if (atIdx === -1) return null;

  // A usable address needs a dotted domain. Anything still lacking one after
  // normalization was not an address to begin with (a stray "@" in a table).
  const domain = normalized.slice(atIdx + 1);
  if (!domain.includes(".")) return null;

  return normalized;
}
