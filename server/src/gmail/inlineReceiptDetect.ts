import { parseInlineReceipt } from "./inlineReceiptParser";

// Document files are excluded so the scan's page budget is spent on receipts
// that have no PDF. The old query matched the newest invoice mail, which is
// mostly real PDF attachments, and those were then thrown away — Google Play
// and PayPal receipts never reached the body check.
export const DOCUMENT_FILENAME_EXCLUSION = "-filename:pdf -filename:doc -filename:docx -filename:xls -filename:xlsx";

export interface InlineReceiptQueryPlan {
  query: string;
  pages: number;
  pageSize: number;
  budget: number;
}

const INLINE_AMOUNT_LABEL_PATTERN = /(סכום\s*(העסק[הא])?|amount|total|payment|סה["'׳]?כ)\s*:?\s*<\/(td|th|strong|b|span)>\s*<(td|th|strong|b|span)[^>]*>\s*[₪$€]?\s*[\d,]+(\.\d+)?/i;
const INLINE_TXN_LABEL_PATTERN = /(מספר\s*עסק[הא]|מספר\s*אישור|transaction\s*(number|id)|approval\s*number)/i;
const MARKETPLACE_ORDER_SENDER_PATTERN = /@(notice\.)?aliexpress\.com|@orders\.temu\.com|@temu\.com/i;
const MARKETPLACE_ORDER_TOTAL_PATTERN = /order\s*total\s*<\/[^>]+>\s*<[^>]+>\s*[₪$€]?\s*[\d,]+(\.\d+)?/i;
const ORDER_NUMBER_IN_SUBJECT_PATTERN = /order\s*#?\s*\d{8,}|#[a-z0-9-]*\d{8,}/i;
const ALIEXPRESS_SENDER_PATTERN = /@(notice\.)?aliexpress\.com/i;

export interface ClassifiedReceiptEmail {
  kind: "link" | "inline";
  documentLinkUrl: string | null;
  importable: boolean;
}

function senderAddress(from: string): string {
  const emailMatch = from.match(/<([^>]+)>/) ?? from.match(/([^\s<]+@[^\s>]+)/);
  return (emailMatch ? emailMatch[1] : from).trim();
}

function withHistory(query: string, historyMonths: number): string {
  const body = `${query} ${DOCUMENT_FILENAME_EXCLUSION}`.replace(/\s+/g, " ").trim();
  if (!historyMonths || historyMonths < 1) return body;
  return `${body} newer_than:${historyMonths}m`;
}

// Gmail returns newest mail first and caps a page at 500. These known senders
// keep paging until newer_than runs out, so one scan covers the history window
// instead of only the first 250–500 messages.
const KNOWN_SENDER_WINDOW = { pages: 8, pageSize: 500, budget: 2000 };

export function buildInlineReceiptQueries(keywordQuery: string, historyMonths: number): InlineReceiptQueryPlan[] {
  const keywords = keywordQuery.replace(/\bhas:attachment\b/gi, " ").replace(/\s+/g, " ").trim();
  return [
    { query: withHistory("from:googleplay-noreply@google.com (receipt OR \"order receipt\")", historyMonths), ...KNOWN_SENDER_WINDOW },
    { query: withHistory("from:paypal.com (receipt OR \"receipt for your payment\")", historyMonths), ...KNOWN_SENDER_WINDOW },
    { query: withHistory("from:paypal.co.il (receipt OR \"receipt for your payment\")", historyMonths), ...KNOWN_SENDER_WINDOW },
    { query: withHistory("from:hyp.co.il", historyMonths), ...KNOWN_SENDER_WINDOW },
    { query: withHistory("from:(business-updates.facebook.com OR support.facebook.com) receipt", historyMonths), ...KNOWN_SENDER_WINDOW },
    { query: withHistory("from:aliexpress.com subject:(\"order confirmed\" OR \"orders confirmed\")", historyMonths), ...KNOWN_SENDER_WINDOW },
    // Broad catch-all stays short. It matches ordinary mail, not a receipt sender.
    { query: withHistory(keywords, historyMonths), pages: 1, pageSize: 500, budget: 500 },
  ];
}

function looksLikeKnownInlineReceipt(from: string, subject: string): boolean {
  const email = senderAddress(from);
  if (/googleplay-noreply@google\.com$/i.test(email) && /order receipt/i.test(subject)) return true;
  if (/@paypal\.(com|co\.il)$/i.test(email) && /receipt/i.test(subject)) return true;
  if (/@hyp\.co\.il$/i.test(email) && /אישור תשלום|payment/i.test(subject)) return true;
  if (/@(support\.facebook\.com|business-updates\.facebook\.com)$/i.test(email) && /receipt/i.test(subject)) return true;
  return false;
}

export function classifyNoAttachmentEmail(input: {
  from: string;
  subject: string;
  html: string | null;
  plain: string | null;
  documentLinkUrl: string | null;
}): ClassifiedReceiptEmail | null {
  const html = input.html ?? "";
  const plain = input.plain ?? "";
  const parsed = (html ? parseInlineReceipt(input.from, html, input.subject) : null)
    ?? (plain ? parseInlineReceipt(input.from, plain, input.subject) : null);
  const importable = parsed !== null;
  // AliExpress repeats the order total in every status mail (shipped, awaiting
  // confirmation, review request). Only the payment confirmation is a receipt.
  if (!importable && ALIEXPRESS_SENDER_PATTERN.test(input.from)) return null;
  const tableInline = Boolean(html && INLINE_AMOUNT_LABEL_PATTERN.test(html) && INLINE_TXN_LABEL_PATTERN.test(html));
  const marketplace = Boolean(
    html
    && MARKETPLACE_ORDER_SENDER_PATTERN.test(input.from)
    && MARKETPLACE_ORDER_TOTAL_PATTERN.test(html)
    && ORDER_NUMBER_IN_SUBJECT_PATTERN.test(input.subject),
  );
  if (importable || tableInline || marketplace || looksLikeKnownInlineReceipt(input.from, input.subject)) {
    return { kind: "inline", documentLinkUrl: null, importable };
  }
  if (input.documentLinkUrl) {
    return { kind: "link", documentLinkUrl: input.documentLinkUrl, importable: false };
  }
  return null;
}
