/**
 * Quick smoke-test for ocrExtractor.
 * Run: node test_ocr_extractor.mjs
 *
 * Prints what the regex extractor pulls from a synthetic Hebrew inspection-report snippet.
 */

// Inline the extractor logic (no TS compilation needed) so we can run it raw.
// Mirrors ocrExtractor.ts patterns exactly.

function firstMatch(text, pattern) {
  const m = text.match(pattern);
  return m?.[1]?.trim() || null;
}

function normalisePhone(raw) {
  const digits = raw.replace(/[\s\-]/g, "");
  if (digits.length === 10 && /^0/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return raw.trim();
}

const EXPIRY_PATTERNS = [
  /בתוקף\s+עד\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /(?:תאריך\s+)?בדיקה\s+הבאה\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /מועד\s+חידוש\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /תאריך\s+פקיעה\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /תוקף\s+עד\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /פג\s+תוקף\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /מועד\s+תשלום\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
];

function normalizeDate(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function extractExpiryDate(text) {
  for (const pattern of EXPIRY_PATTERNS) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const iso = normalizeDate(m[1]);
      if (iso) return iso;
    }
  }
  return null;
}

const LABEL_WORDS = /^(?:פקס|טלפון|נייד|מייל|מיקוד|ישוב|כתובת|רחוב|סוג|שם|תאריך|מספר|:)$/;
const NOISE_PATTERN = /(?:טלפון|פקס|תקופתית|סוג\s+בדיקה|מספר\s+רישוי|ת\.ד|מיקוד)/;

function isCleanName(v) {
  if (!v) return false;
  if (LABEL_WORDS.test(v.split(/\s/)[0])) return false;
  if (NOISE_PATTERN.test(v)) return false;
  if (!/[א-ת]/.test(v)) return false;
  return true;
}

function extractContactName(text) {
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

function extractPhone(text) {
  const labelled = text.match(
    /(?:נייד|טלפון|טל[.'"]?|mobile|phone)\s*:?\s*(0[0-9]{1,2}[-\s]?[0-9]{3}[-\s]?[0-9]{4})/i
  );
  if (labelled?.[1]) return normalisePhone(labelled[1]);
  const bare = text.match(/\b(0[235789][0-9][-\s]?[0-9]{3}[-\s]?[0-9]{4})\b/);
  if (bare?.[1]) return normalisePhone(bare[1]);
  return null;
}

function extractEmail(text) {
  const m = text.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+/);
  if (!m?.[0]) return null;
  const addr = m[0];
  const atIdx = addr.indexOf("@");
  const before = addr.slice(0, atIdx);
  const after  = addr.slice(atIdx + 1);
  const afterHasDot = /\./.test(after);
  const beforeHasDot = /\./.test(before);
  if (beforeHasDot && !afterHasDot && after.length >= 1) return `${after}@${before}`;
  if (afterHasDot) return addr;
  return null;
}

function extractAddress(text) {
  return (
    firstMatch(text, /(?:כתובת|רחוב|ישוב)\s*:?\s*([^\n\r\t|]{4,60})/) ??
    firstMatch(text, /(?:address)\s*:?\s*([^\n\r\t|]{4,60})/i) ??
    null
  );
}

function extractPoBox(text) {
  return (
    firstMatch(text, /ת[."]?ד[."]?\s*:?\s*(\d{3,6})/) ??
    firstMatch(text, /p\.?\s*o\.?\s*box\s*:?\s*(\d{3,6})/i) ??
    null
  );
}

function extractDocumentType(text) {
  if (/תסקיר/.test(text)) return "תסקיר בדיקה";
  if (/חוזה/.test(text))   return "חוזה";
  if (/הסכם/.test(text))   return "הסכם";
  if (/חשבונית/.test(text)) return "חשבונית";
  if (/תעודה/.test(text))  return "תעודה";
  return null;
}

function extractFromOcr(rawText) {
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

// ── Test samples ──────────────────────────────────────────────────────────────

const SAMPLES = [
  {
    label: "Inspection report (תסקיר) — typical layout",
    text: `
מספר תסקיר: 17924/484590
פרטי הלקוח / תופש
שם החברה: מילניום שירותים ולוגיסטיקה בע"מ
איש קשר: בר
נייד: 053-8801490
מייל: benitaliftingplat@gmail.com
כתובת: הקידמה 235, אשדוד
ת.ד: 679

תאריך בדיקה: 15/01/2025
בתוקף עד: 15/01/2026
    `,
  },
  {
    label: "Inspection report — 'בדיקה הבאה' label",
    text: `
תסקיר מספר 12345
שם מעביד / בעל הציוד: חברת ABC
טלפון: 0521234567
מייל: test@example.co.il
רחוב: הרצל 10, תל אביב

תאריך בדיקה הבאה: 20/06/2026
    `,
  },
  {
    label: "Contract — expiry label",
    text: `
חוזה שירות
שם הלקוח: דוד כהן
נייד: 050-7870067
מייל: david@cohen.co.il
כתובת: רוטשילד 22, תל אביב

תאריך פקיעה: 31/12/2025
    `,
  },
  {
    label: "No expiry date at all",
    text: `
מסמך כללי
איש קשר: רחל לוי
נייד: 052-9991234
    `,
  },
  {
    label: "10-digit phone without dash",
    text: `
פרטי לקוח
איש קשר: יוסי
נייד: 0537285690
בתוקף עד 01/03/2027
    `,
  },
  {
    label: "Reversed bidi email",
    text: `
מייל: il.co1945.shelev@klodin
בתוקף עד: 10/05/2026
    `,
  },
  {
    label: "Noisy contact_name — garbled bidi table header (should return null)",
    text: `
פקס: טלפוןתקופתית: סוג בדיקה679ד .ת, 235 : תופש/פרטי הלקוח
2027/07/23: בתוקף עד
    `,
  },
  {
    label: "Clean reversed bidi company name",
    text: `
מ"הובלות בע1945שלב : תופש/פרטי הלקוח1 .
2027/07/23: בתוקף עד
    `,
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────

for (const { label, text } of SAMPLES) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`📄 ${label}`);
  console.log("─".repeat(60));
  const result = extractFromOcr(text);
  for (const [k, v] of Object.entries(result)) {
    const icon = v ? "✓" : "·";
    console.log(`  ${icon} ${k.padEnd(16)} ${v ?? "(not found)"}`);
  }
}

console.log(`\n${"─".repeat(60)}`);
console.log("Done.\n");
