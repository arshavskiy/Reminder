/**
 * Lightweight regex-based extractor over raw OCR text.
 * Handles both forward (label: value) and reversed bidi (value: label)
 * layouts — the latter is common in Hebrew PDFs extracted with pdfjs/pdfminer.
 */

import {normalizeDate} from "./dateNormalizer";

export interface OcrExtraction {
  expiry_date:    string | null;  // ISO YYYY-MM-DD
  contact_name:   string | null;
  contact_phone:  string | null;
  contact_email:  string | null;
  client_address: string | null;
  po_box:         string | null;
  document_type:  string | null;
}

// ─── helpers ───────────────────────���─────────────────────────────────────────

function firstMatch(text: string, ...patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    const v = m?.[1]?.trim();
    if (v) return v;
  }
  return null;
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/[\s\-]/g, "");
  if (digits.length === 10 && /^0/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return raw.trim();
}

// Also handle YYYY/MM/DD (reversed bidi date format)
function normalizeDateExtended(raw: string): string | null {
  if (!raw) return null;
  const ymd = raw.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  return normalizeDate(raw);
}

// ─── expiry date ─────────────────────────────────────────────────���────────────

const EXPIRY_PATTERNS: RegExp[] = [
  // Forward: label before value
  /בתוקף\s+עד\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /(?:תאריך\s+)?בדיקה\s+הבאה\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /מועד\s+חידוש\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /תאריך\s+פקיעה\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /תוקף\s+עד\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /פג\s+תוקף\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /מועד\s+תשלום\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /בתוקף\s+עד\s*:?\s*(\d{4}-\d{2}-\d{2})/,
  /(?:תאריך\s+)?בדיקה\s+הבאה\s*:?\s*(\d{4}-\d{2}-\d{2})/,
  // Reversed: value before label  (bidi PDF artifact — e.g. "2027/07/23: בתוקף עד")
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*בתוקף\s+עד/,
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*(?:תאריך\s+)?בדיקה\s+הבאה/,
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*מועד\s+חידוש/,
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*תאריך\s+פקיעה/,
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*תוקף\s+עד/,
  /(\d{4}-\d{2}-\d{2})\s*:\s*בתוקף\s+עד/,
];

function extractExpiryDate(text: string): string | null {
  for (const p of EXPIRY_PATTERNS) {
    const m = text.match(p);
    if (m?.[1]) {
      const iso = normalizeDateExtended(m[1]);
      if (iso) return iso;
    }
  }
  return null;
}

// ─── phone ──────────────────────────────���───────────────────────���─────────────

function extractPhone(text: string): string | null {
  // Forward: label then value
  const fwd = text.match(
    /(?:נייד|טלפון|טל[.'"]?|mobile|phone)\s*:?\s*(0[0-9]{1,2}[-\s]?[0-9]{3}[-\s]?[0-9]{4})/i
  );
  if (fwd?.[1]) return normalisePhone(fwd[1]);

  // Reversed: value then label  (e.g. "0522226569: ניידבר: איש קשר")
  const rev = text.match(/(0[0-9]{8,9})\s*:\s*(?:נייד|ניידבר|טלפון)/);
  if (rev?.[1]) return normalisePhone(rev[1]);

  const revDash = text.match(/([0-9]{3}-[0-9]{7})\s*:\s*(?:נייד|ניידבר|טלפון)/);
  if (revDash?.[1]) return normalisePhone(revDash[1]);

  // Bare Israeli mobile (last resort — avoid matching inspector's phone)
  const bare = text.match(/\b(0[235789][0-9][-\s]?[0-9]{3}[-\s]?[0-9]{4})\b/);
  if (bare?.[1]) return normalisePhone(bare[1]);

  return null;
}

// ─── contact name ────────────────────────��────────────────────────────────────

// Labels that should NOT be treated as a contact name value
const LABEL_WORDS = /^(?:פקס|טלפון|נייד|מייל|מיקוד|ישוב|כתובת|רחוב|סוג|שם|תאריך|מספר|:)$/;

// Reject values that contain garbled bidi table headers (label fragments)
const NOISE_PATTERN = /(?:טלפון|פקס|תקופתית|סוג\s+בדיקה|מספר\s+רישוי|ת\.ד|מיקוד)/;

function isCleanName(v: string): boolean {
  if (!v) return false;
  if (LABEL_WORDS.test(v.split(/\s/)[0])) return false;
  if (NOISE_PATTERN.test(v)) return false;
  // Reject if it's pure digits/punctuation with no Hebrew letters
  if (!/[א-ת]/.test(v)) return false;
  return true;
}

function extractContactName(text: string): string | null {
  // Forward labels — reject captured value if it looks like another label or noise
  for (const p of [
    /איש\s+קשר\s*:\s*([^\n\r\t|:]{2,40})/,
    /שם\s+איש\s+קשר\s*:?\s*([^\n\r\t|:]{2,40})/,
    /שם\s+מלא\s*:?\s*([^\n\r\t|:]{2,40})/,
    /שם\s+הלקוח\s*:?\s*([^\n\r\t|:]{2,40})/,
    /שם\s+מעביד\s*[/]?\s*בעל\s+הציוד\s*:?\s*([^\n\r\t|:]{2,40})/,
    /שם\s+החברה\s*:?\s*([^\n\r\t|:]{2,40})/,
    /(?:^|\n)תופש\s*:?\s*([^\n\r\t|:]{2,40})/m,
  ]) {
    const m = text.match(p);
    const v = m?.[1]?.trim();
    if (v && isCleanName(v)) return v;
  }

  // Reversed: value then label  (e.g. "מ\"בניטה במות הרמה בע: תופש/פרטי הלקוח")
  for (const p of [
    /([^\n:]{2,50})\s*:\s*תופש\/פרטי\s+הלקוח/,
    /([^\n:]{2,50})\s*:\s*(?:תופש|פרטי\s+הלקוח)/,
    /([^\n:]{2,50})\s*:\s*שם\s+הלקוח/,
    /([^\n:]{2,50})\s*:\s*שם\s+החברה/,
  ]) {
    const m = text.match(p);
    const v = m?.[1]?.trim();
    if (v && isCleanName(v)) return v;
  }
  return null;
}

// ─── email ──────────────��────────────────────────────────────────��────────────

function extractEmail(text: string): string | null {
  // Match both normal and reversed bidi emails
  const m = text.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+/);
  if (!m?.[0]) return null;
  const addr = m[0];
  const atIdx = addr.indexOf("@");
  const before = addr.slice(0, atIdx);
  const after  = addr.slice(atIdx + 1);
  const afterHasDot = /\./.test(after);
  const beforeHasDot = /\./.test(before);
  // Reversed bidi: domain-like part is before @, user part after
  // Detect: before has dots (looks like domain) AND after has no dots (looks like user)
  if (beforeHasDot && !afterHasDot && after.length >= 1) {
    return `${after}@${before}`;
  }
  // Normal: must have a dot after @
  if (afterHasDot) return addr;
  return null;
}

// ─── address ──────────────────────────────────────────────────────���───────────

function extractAddress(text: string): string | null {
  // Forward labels
  const fwd = firstMatch(
    text,
    /(?:כתובת|רחוב)\s*:?\s*([^\n\r\t|:]{4,60})/,
    /address\s*:?\s*([^\n\r\t|:]{4,60})/i,
  );
  if (fwd) return fwd;

  // Reversed "פרטים מלאים" line contains address — strip the suffix after last colon
  // e.g. "ב אשדוד טלפון36העצמאות ' רח: פרטים מלאים"
  const detailsLine = text.match(/([^\n:]{4,80})\s*:\s*פרטים\s+מלאים/);
  if (detailsLine?.[1]) {
    const addr = detailsLine[1].trim()
      .replace(/[0-9]{3}-[0-9]{7,8}/g, "")      // strip phone with dash
      .replace(/טלפון\s*\d*/g, "")               // strip "טלפון" + any digits
      .replace(/\s{2,}/g, " ")
      .trim();
    if (addr.length >= 4) return addr;
  }

  // Reversed "ישוב" — but skip if it contains zipcode (מיקוד concatenated)
  const yishuv = text.match(/([^\n:]{2,30})\s*:\s*ישוב/);
  if (yishuv?.[1]) {
    const val = yishuv[1].trim();
    // Skip if looks like a zipcode was concatenated (e.g. "מיקודאשדוד")
    if (!/מיקוד/.test(val)) return val;
  }

  return null;
}

// ─── PO box ─────────────────────────────────────────��─────────────────────────

function extractPoBox(text: string): string | null {
  return (
    firstMatch(text, /ת[."]?ד[."]?\s*:?\s*(\d{3,6})/) ??
    firstMatch(text, /p\.?\s*o\.?\s*box\s*:?\s*(\d{3,6})/i) ??
    // Reversed: number: ת.ד
    firstMatch(text, /(\d{3,6})\s*:\s*ת[."]?ד/) ??
    null
  );
}

// ─── document type ────────────────────────────────────────────────────────────

function extractDocumentType(text: string): string | null {
  if (/תסקיר/.test(text))   return "תסקיר בדיקה";
  if (/חוזה/.test(text))    return "חוזה";
  if (/הסכם/.test(text))    return "הסכם";
  if (/חשבונית/.test(text)) return "חשבונית";
  if (/תעודה/.test(text))   return "תעודה";
  return null;
}

// ─── public API ─────────────────────────────────────────────────────���─────────

export function extractFromOcr(rawText: string): OcrExtraction {
  const text = rawText.replace(/\r\n/g, "\n").replace(/[ \t]{2,}/g, " ");
  return {
    expiry_date:    extractExpiryDate(text),
    contact_name:   extractContactName(text),
    contact_phone:  extractPhone(text),
    contact_email:  extractEmail(text),
    client_address: extractAddress(text),
    po_box:         extractPoBox(text),
    document_type:  extractDocumentType(text),
  };
}
