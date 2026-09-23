// Extracts structured amount/date/vendor/transaction data from inline
// payment-receipt emails (no PDF, no document link — the data is plain HTML
// text in the email body). Scoped to a small whitelist of senders whose
// layout has been verified against real samples; anything else returns null
// rather than guessing at an unfamiliar format.

export interface ParsedInlineReceipt {
  vendor: string; // display name, e.g. "PayPal", "Hyp / iPos", "Meta Ads"
  transactionId: string;
  amount: number;
  currency: string; // ISO 4217 where knowable, else the raw symbol/code
  merchant: string | null; // who was paid, if distinct from the sending vendor
  date: string | null; // ISO yyyy-mm-dd when parseable
}

function decodeHtmlEntity(codePoint: number): string {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return "";
  try { return String.fromCodePoint(codePoint); } catch { return ""; }
}

function stripTags(html: string): string {
  return html
    .replace(/&#(\d+);/g, (_, digits) => decodeHtmlEntity(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => decodeHtmlEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/<[^>]+>/g, " ")
    // Gmail wraps amounts in bidi marks (U+200F before ₪, U+202A around $14.50).
    // Those are not whitespace, so "Total: ‏12.00" never matched the amount.
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  const match = cleaned.match(/([\d.]+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function normalizeCurrencyToken(token: string | undefined): string | null {
  if (!token) return null;
  if (/^[A-Za-z]{3}$/.test(token)) return token.toUpperCase();
  return detectCurrency(token);
}

function detectCurrency(raw: string): string {
  if (/₪|ILS/i.test(raw)) return "ILS";
  if (/\$|USD/i.test(raw)) return "USD";
  if (/€|EUR/i.test(raw)) return "EUR";
  if (/£|GBP/i.test(raw)) return "GBP";
  return "ILS";
}

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Parses "30 May 2024" / "Aug 15, 2025" style dates by hand, using UTC parts
// directly, so a server running west of UTC doesn't roll the date back a day
// the way Date.parse + toISOString() does for a bare UTC-midnight timestamp.
function parseHumanDate(raw: string): string | null {
  const match = raw.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/) ?? raw.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!match) return null;
  const [day, monthName, year] = match.length === 4 && /^\d+$/.test(match[1])
    ? [match[1], match[2], match[3]]
    : [match[2], match[1], match[3]];
  const monthIndex = MONTH_NAMES.indexOf(monthName.slice(0, 3).toLowerCase());
  if (monthIndex === -1) return null;
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(Number(day)).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function parsePayPal(html: string, subject: string): ParsedInlineReceipt | null {
  const text = stripTags(html);
  const txnMatch = text.match(/Transaction ID\s*([A-Z0-9]{10,})/i);
  const totalMatch = text.match(/(?<!Sub)\bTotal\s*[|:]?\s*[₪$€£]?\s*([\d,]+\.?\d*)\s*(ILS|USD|EUR|GBP)?/i);
  // Some PayPal mails have no Total row. The amount is the heading:
  // "You paid $14.50 USD to Patreon" or "You authorized a payment of ₪107.72 ILS to EBAY...".
  const headingMatch = text.match(/You (?:paid|authorized a payment of)\s*[₪$€£]?\s*([\d,]+\.?\d*)\s*(ILS|USD|EUR|GBP)?\s*to\s+(.+?)(?:\s+View|\s+This purchase|$)/i);
  const amountMatch = totalMatch ?? headingMatch;
  const dateMatch = text.match(/Transaction date\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i);
  const merchantMatch = text.match(/Merchant\s+(.+?)\s+Instructions to merchant/i)
    ?? text.match(/Merchant\s+([^\n]+?)\s+(?:no-reply|[a-z0-9.+_-]+@)/i)
    ?? (headingMatch ? [headingMatch[0], headingMatch[3]] as RegExpMatchArray : null)
    ?? subject.match(/Payment to\s+(.+)$/i);
  if (!txnMatch || !amountMatch) return null;
  const amount = parseAmount(amountMatch[1]);
  if (amount === null) return null;
  return {
    vendor: "PayPal",
    transactionId: txnMatch[1],
    amount,
    currency: amountMatch[2] ? amountMatch[2].toUpperCase() : detectCurrency(amountMatch[0]),
    merchant: merchantMatch?.[1]?.trim() || null,
    date: dateMatch ? parseHumanDate(dateMatch[1]) : null,
  };
}

function parseHyp(html: string): ParsedInlineReceipt | null {
  const text = stripTags(html);
  // Real Hyp/iPos emails render as a pipe-delimited two-language table —
  // "| מספר עסקה: | 436087431 | Transaction Number |" — so the label and
  // value sit on opposite sides of a "|", not directly adjacent.
  const txnMatch = text.match(/(?:מספר עסקה|Transaction Number)\s*:?\s*\|?\s*(\d{5,})/i);
  const amountMatch = text.match(/(?:סכום|Amount)\s*:?\s*\|?\s*([₪$€]?\s*[\d,]+\.?\d*)\s*(?:ש["'׳]?ח)?/i);
  const businessMatch = text.match(/(?:פרטי בית העסק|Business information)\s*:?\s*\|?\s*([^|]+?)\s*\|/i);
  const dateMatch = text.match(/(?:תאריך|Date)\s*:?\s*\|?\s*(\d{4}-\d{2}-\d{2})/);
  if (!txnMatch || !amountMatch) return null;
  const amount = parseAmount(amountMatch[1]);
  if (amount === null) return null;
  return {
    vendor: "Hyp / iPos",
    transactionId: txnMatch[1],
    amount,
    currency: detectCurrency(amountMatch[1]),
    merchant: businessMatch ? businessMatch[1].trim() : null,
    date: dateMatch ? dateMatch[1] : null,
  };
}

function parseMeta(html: string): ParsedInlineReceipt | null {
  const text = stripTags(html);
  const txnMatch = text.match(/Transaction ID\s*:?\s*([\d-]{10,})/i);
  const amountMatch = text.match(/Amount billed\s*:?\s*([₪$€]?\s*[\d,]+\.?\d*)\s*(ILS|USD|EUR|GBP)?/i);
  const dateMatch = text.match(/Date range\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i);
  if (!txnMatch || !amountMatch) return null;
  const amount = parseAmount(amountMatch[1]);
  if (amount === null) return null;
  return {
    vendor: "Meta Ads",
    transactionId: txnMatch[1],
    amount,
    currency: amountMatch[2] ? amountMatch[2].toUpperCase() : detectCurrency(amountMatch[1]),
    merchant: "Meta Platforms",
    date: dateMatch ? parseHumanDate(dateMatch[1]) : null,
  };
}

function parseGooglePlay(html: string): ParsedInlineReceipt | null {
  const text = stripTags(html);
  const txnMatch = text.match(/Order number\s*:?\s*([A-Z0-9.\-]{10,})/i);
  const totalMatch = text.match(/(?<!Sub)\bTotal\s*:?\s*([₪$€£]?\s*[\d,]+\.?\d*)(?:\s*([₪$€£]|ILS|USD|EUR|GBP))?/i);
  const dateMatch = text.match(/Order date\s*:?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i);
  const itemMatch = text.match(/Item\s+Price\s+(.+?)\s+\(by\s/i) ?? text.match(/\n\n([^\n]+?)\s+\(by\s/i);
  if (!txnMatch || !totalMatch) return null;
  const amount = parseAmount(totalMatch[1]);
  if (amount === null) return null;
  return {
    vendor: "Google Play",
    transactionId: txnMatch[1],
    amount,
    currency: normalizeCurrencyToken(totalMatch[2]) ?? detectCurrency(totalMatch[1]),
    merchant: itemMatch ? itemMatch[1].trim() : "Google Play",
    date: dateMatch ? parseHumanDate(dateMatch[1]) : null,
  };
}

// Whitelist gate: only these sender patterns are eligible to be parsed into
// an invoice record at all. Detection (the link-only/inline banner) stays
// broader than this on purpose — this list is strictly the "safe to create a
// financial record from" boundary, verified against real samples.
const INLINE_RECEIPT_PARSERS: Array<{
  senderPattern: RegExp;
  parse: (html: string, subject: string) => ParsedInlineReceipt | null;
}> = [
  { senderPattern: /@paypal\.(com|co\.il)$/i, parse: parsePayPal },
  { senderPattern: /@hyp\.co\.il$/i, parse: parseHyp },
  { senderPattern: /@(support\.facebook\.com|business-updates\.facebook\.com)$/i, parse: parseMeta },
  { senderPattern: /@google\.com$/i, parse: parseGooglePlay },
];

export function parseInlineReceipt(from: string, html: string, subject: string): ParsedInlineReceipt | null {
  const emailMatch = from.match(/<([^>]+)>/) ?? from.match(/([^\s<]+@[^\s>]+)/);
  const email = (emailMatch ? emailMatch[1] : from).trim();
  for (const { senderPattern, parse } of INLINE_RECEIPT_PARSERS) {
    if (senderPattern.test(email)) return parse(html, subject);
  }
  return null;
}
