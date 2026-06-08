import {readFileSync} from "fs";

const dump = JSON.parse(
  readFileSync(
    "data/extractions/2026-05-31T20-51-24-129Z_doc6a1c9f0108974aa8d63166ba_במת_הרמה__בניטה_פנימי_108_תסקיר_17907.484590.pdf__tpl.json",
    "utf-8"
  )
);
const rawText = dump.input_text;

// ── mirror ocrExtractor.ts exactly ──────────────────────────────────────���───

function firstMatch(text, ...patterns) {
  for (const p of patterns) {
    const m = text.match(p);
    const v = m?.[1]?.trim();
    if (v) return v;
  }
  return null;
}

function normalisePhone(raw) {
  const digits = raw.replace(/[\s\-]/g, "");
  if (digits.length === 10 && /^0/.test(digits)) return `${digits.slice(0,3)}-${digits.slice(3)}`;
  return raw.trim();
}

function normalizeDate(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  const ymd = raw.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2,"0")}-${ymd[3].padStart(2,"0")}`;
  return null;
}

const EXPIRY_PATTERNS = [
  /בתוקף\s+עד\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /(?:תאריך\s+)?בדיקה\s+הבאה\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /מועד\s+חידוש\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /תאריך\s+פקיעה\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /תוקף\s+עד\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /פג\s+תוקף\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /מועד\s+תשלום\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /בתוקף\s+עד\s*:?\s*(\d{4}-\d{2}-\d{2})/,
  /(?:תאריך\s+)?בדיקה\s+הבאה\s*:?\s*(\d{4}-\d{2}-\d{2})/,
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*בתוקף\s+עד/,
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*(?:תאריך\s+)?בדיקה\s+הבאה/,
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*מועד\s+חידוש/,
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*תאריך\s+פקיעה/,
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*תוקף\s+עד/,
  /(\d{4}-\d{2}-\d{2})\s*:\s*בתוקף\s+עד/,
];

function extractExpiryDate(text) {
  for (const p of EXPIRY_PATTERNS) {
    const m = text.match(p);
    if (m?.[1]) { const iso = normalizeDate(m[1]); if (iso) return iso; }
  }
  return null;
}

function extractPhone(text) {
  const fwd = text.match(/(?:נייד|טלפון|טל[.'"]?|mobile|phone)\s*:?\s*(0[0-9]{1,2}[-\s]?[0-9]{3}[-\s]?[0-9]{4})/i);
  if (fwd?.[1]) return normalisePhone(fwd[1]);
  const rev = text.match(/(0[0-9]{8,9})\s*:\s*(?:נייד|ניידבר|טלפון)/);
  if (rev?.[1]) return normalisePhone(rev[1]);
  const revDash = text.match(/([0-9]{3}-[0-9]{7})\s*:\s*(?:נייד|ניידבר|טלפון)/);
  if (revDash?.[1]) return normalisePhone(revDash[1]);
  const bare = text.match(/\b(0[235789][0-9][-\s]?[0-9]{3}[-\s]?[0-9]{4})\b/);
  if (bare?.[1]) return normalisePhone(bare[1]);
  return null;
}

const LABEL_WORDS = /^(?:פקס|טלפון|נייד|מייל|מיקוד|ישוב|כתובת|רחוב|סוג|שם|תאריך|מספר|:)$/;
function extractContactName(text) {
  for (const p of [
    /איש\s+קשר\s*:\s*([^\n\r\t|:]{2,40})/,
    /שם\s+איש\s+קשר\s*:?\s*([^\n\r\t|:]{2,40})/,
    /שם\s+מלא\s*:?\s*([^\n\r\t|:]{2,40})/,
    /שם\s+הלקוח\s*:?\s*([^\n\r\t|:]{2,40})/,
    /שם\s+מעביד\s*[/]?\s*בעל\s+הציוד\s*:?\s*([^\n\r\t|:]{2,40})/,
    /שם\s+החברה\s*:?\s*([^\n\r\t|:]{2,40})/,
  ]) {
    const m = text.match(p);
    const v = m?.[1]?.trim();
    if (v && !LABEL_WORDS.test(v.split(/\s/)[0])) return v;
  }
  return firstMatch(text,
    /([^\n:]{2,50})\s*:\s*תופש\/פרטי\s+הלקוח/,
    /([^\n:]{2,50})\s*:\s*(?:תופש|פרטי\s+הלקוח)/,
    /([^\n:]{2,50})\s*:\s*שם\s+הלקוח/,
    /([^\n:]{2,50})\s*:\s*שם\s+החברה/,
  );
}

function extractEmail(text) {
  const m = text.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+/);
  if (!m?.[0]) return null;
  const addr = m[0];
  const atIdx = addr.indexOf("@");
  const before = addr.slice(0, atIdx);
  const after  = addr.slice(atIdx + 1);
  if (/\.[a-z]{2,}(\.[a-z]{2})?$/i.test(before) && !/\./.test(after)) return `${after}@${before}`;
  if (/\./.test(after)) return addr;
  return null;
}

function extractAddress(text) {
  const fwd = firstMatch(text,
    /(?:כתובת|רחוב)\s*:?\s*([^\n\r\t|:]{4,60})/,
    /address\s*:?\s*([^\n\r\t|:]{4,60})/i,
  );
  if (fwd) return fwd;

  const detailsLine = text.match(/([^\n:]{4,80})\s*:\s*פרטים\s+מלאים/);
  if (detailsLine?.[1]) {
    const addr = detailsLine[1].trim()
      .replace(/[0-9]{3}-[0-9]{7,8}/g, "")
      .replace(/טלפון\s*\d*/g, "")
      .replace(/\s{2,}/g, " ").trim();
    if (addr.length >= 4) return addr;
  }

  const yishuv = text.match(/([^\n:]{2,30})\s*:\s*ישוב/);
  if (yishuv?.[1]) {
    const val = yishuv[1].trim();
    if (!/מיקוד/.test(val)) return val;
  }
  return null;
}

function extractPoBox(text) {
  return firstMatch(text,
    /ת[."]?ד[."]?\s*:?\s*(\d{3,6})/,
    /p\.?\s*o\.?\s*box\s*:?\s*(\d{3,6})/i,
    /(\d{3,6})\s*:\s*ת[."]?ד/,
  );
}

function extractDocumentType(text) {
  if (/תסקיר/.test(text)) return "תסקיר בדיקה";
  if (/חוזה/.test(text))  return "חוזה";
  if (/הסכם/.test(text))  return "הסכם";
  if (/חשבונית/.test(text)) return "חשבונית";
  if (/תעודה/.test(text)) return "תעודה";
  return null;
}

function extractFromOcr(rawText) {
  const text = rawText.replace(/\r\n/g,"\n").replace(/[ \t]{2,}/g," ");
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

// ─�� run + compare ────────────────────────────────────────────────────────────

const ocr = extractFromOcr(rawText);
const ai  = dump.fields ?? {};

const rows = [
  ["expiry_date",    ocr.expiry_date,    ai.next_inspection_date],
  ["contact_phone",  ocr.contact_phone,  ai.contact_phone],
  ["contact_name",   ocr.contact_name,   ai.contact_person ?? ai.client_company],
  ["contact_email",  ocr.contact_email,  ai.contact_email],
  ["client_address", ocr.client_address, ai.client_address],
  ["po_box",         ocr.po_box,         ai.po_box],
  ["document_type",  ocr.document_type,  null],
];

console.log("\n" + "─".repeat(72));
console.log("  Field            OCR result                AI result");
console.log("─".repeat(72));
for (const [field, ocrVal, aiVal] of rows) {
  const match = ocrVal && aiVal ? (ocrVal === aiVal ? "✓" : "~") : (ocrVal ? "·" : "✗");
  console.log(
    `  ${match} ${field.padEnd(16)} ${String(ocrVal ?? "(not found)").padEnd(26)} ${aiVal ?? ""}`
  );
}
console.log("─".repeat(72));
console.log("  ✓ match  ~ close  · ocr only  ✗ not found\n");
