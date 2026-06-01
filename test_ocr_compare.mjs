/**
 * Compare OCR extractor v1 (forward-label only) vs v2 (bidi-aware)
 * across ALL real extraction dumps in data/extractions/.
 *
 * Run: node test_ocr_compare.mjs
 */

import {readdirSync, readFileSync} from "fs";
import {join} from "path";

// ─── v1: original extractor (forward-label patterns only) ────────────────────

function v1_firstMatch(text, pattern) {
  const m = text.match(pattern);
  return m?.[1]?.trim() || null;
}
function v1_normalisePhone(raw) {
  const digits = raw.replace(/[\s\-]/g, "");
  if (digits.length === 10 && /^0/.test(digits)) return `${digits.slice(0,3)}-${digits.slice(3)}`;
  return raw.trim();
}
function v1_normalizeDate(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  return null;
}
const V1_EXPIRY = [
  /בתוקף\s+עד\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /(?:תאריך\s+)?בדיקה\s+הבאה\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /מועד\s+חידוש\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /תאריך\s+פקיעה\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /תוקף\s+עד\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /פג\s+תוקף\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /מועד\s+תשלום\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  /בתוקף\s+עד\s*:?\s*(\d{4}-\d{2}-\d{2})/,
  /(?:תאריך\s+)?בדיקה\s+הבאה\s*:?\s*(\d{4}-\d{2}-\d{2})/,
];
function v1_extractExpiry(text) {
  for (const p of V1_EXPIRY) {
    const m = text.match(p);
    if (m?.[1]) { const iso = v1_normalizeDate(m[1]); if (iso) return iso; }
  }
  return null;
}
function v1_extractPhone(text) {
  const lab = text.match(/(?:נייד|טלפון|טל[.'"]?|mobile|phone)\s*:?\s*(0[0-9]{1,2}[-\s]?[0-9]{3}[-\s]?[0-9]{4})/i);
  if (lab?.[1]) return v1_normalisePhone(lab[1]);
  const bare = text.match(/\b(0[235789][0-9][-\s]?[0-9]{3}[-\s]?[0-9]{4})\b/);
  if (bare?.[1]) return v1_normalisePhone(bare[1]);
  return null;
}
function v1_extractName(text) {
  return (
    v1_firstMatch(text, /איש\s+קשר\s*:?\s*([^\n\r\t|]{2,40})/) ??
    v1_firstMatch(text, /שם\s+איש\s+קשר\s*:?\s*([^\n\r\t|]{2,40})/) ??
    v1_firstMatch(text, /שם\s+מלא\s*:?\s*([^\n\r\t|]{2,40})/) ??
    v1_firstMatch(text, /שם\s+הלקוח\s*:?\s*([^\n\r\t|]{2,40})/) ??
    v1_firstMatch(text, /שם\s+מעביד\s*[/]?\s*בעל\s+הציוד\s*:?\s*([^\n\r\t|]{2,40})/) ??
    v1_firstMatch(text, /שם\s+החברה\s*:?\s*([^\n\r\t|]{2,40})/) ??
    v1_firstMatch(text, /(?:תופש|בעל\s+הנכס)\s*:?\s*([^\n\r\t|]{2,40})/) ??
    null
  );
}
function v1_extractEmail(text) {
  const raw = text.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+/);
  if (!raw?.[0]) return null;
  const addr = raw[0];
  const atIdx = addr.indexOf("@"); const before = addr.slice(0, atIdx); const after = addr.slice(atIdx+1);
  if (/\.[a-z]{2,}(\.[a-z]{2})?$/i.test(before) && !/\./.test(after)) return `${after}@${before}`;
  if (/\./.test(after)) return addr;
  return null;
}
function v1_extractAddress(text) {
  return (
    v1_firstMatch(text, /(?:כתובת|רחוב|ישוב)\s*:?\s*([^\n\r\t|]{4,60})/) ??
    v1_firstMatch(text, /(?:address)\s*:?\s*([^\n\r\t|]{4,60})/i) ??
    null
  );
}
function v1_extractPoBox(text) {
  return (
    v1_firstMatch(text, /ת[."]?ד[."]?\s*:?\s*(\d{3,6})/) ??
    v1_firstMatch(text, /p\.?\s*o\.?\s*box\s*:?\s*(\d{3,6})/i) ??
    null
  );
}
function v1_extractDocType(text) {
  if (/תסקיר/.test(text)) return "תסקיר בדיקה";
  if (/חוזה/.test(text))  return "חוזה";
  if (/הסכם/.test(text))  return "הסכם";
  if (/חשבונית/.test(text)) return "חשבונית";
  if (/תעודה/.test(text)) return "תעודה";
  return null;
}
function v1_extract(rawText) {
  const text = rawText.replace(/\r\n/g,"\n").replace(/[ \t]{2,}/g," ");
  return {
    expiry_date:    v1_extractExpiry(text),
    contact_name:   v1_extractName(text),
    contact_phone:  v1_extractPhone(text),
    contact_email:  v1_extractEmail(text),
    client_address: v1_extractAddress(text),
    po_box:         v1_extractPoBox(text),
    document_type:  v1_extractDocType(text),
  };
}

// ─── v2: current extractor (bidi-aware) ──────────────────────────────────────

function v2_firstMatch(text, ...patterns) {
  for (const p of patterns) { const m = text.match(p); const v = m?.[1]?.trim(); if (v) return v; }
  return null;
}
function v2_normalisePhone(raw) {
  const digits = raw.replace(/[\s\-]/g, "");
  if (digits.length === 10 && /^0/.test(digits)) return `${digits.slice(0,3)}-${digits.slice(3)}`;
  return raw.trim();
}
function v2_normalizeDate(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  const ymd = raw.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2,"0")}-${ymd[3].padStart(2,"0")}`;
  return null;
}
const V2_EXPIRY = [
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
function v2_extractExpiry(text) {
  for (const p of V2_EXPIRY) {
    const m = text.match(p);
    if (m?.[1]) { const iso = v2_normalizeDate(m[1]); if (iso) return iso; }
  }
  return null;
}
function v2_extractPhone(text) {
  const fwd = text.match(/(?:נייד|טלפון|טל[.'"]?|mobile|phone)\s*:?\s*(0[0-9]{1,2}[-\s]?[0-9]{3}[-\s]?[0-9]{4})/i);
  if (fwd?.[1]) return v2_normalisePhone(fwd[1]);
  const rev = text.match(/(0[0-9]{8,9})\s*:\s*(?:נייד|ניידבר|טלפון)/);
  if (rev?.[1]) return v2_normalisePhone(rev[1]);
  const revDash = text.match(/([0-9]{3}-[0-9]{7})\s*:\s*(?:נייד|ניידבר|טלפון)/);
  if (revDash?.[1]) return v2_normalisePhone(revDash[1]);
  const bare = text.match(/\b(0[235789][0-9][-\s]?[0-9]{3}[-\s]?[0-9]{4})\b/);
  if (bare?.[1]) return v2_normalisePhone(bare[1]);
  return null;
}
const LABEL_WORDS = /^(?:פקס|טלפון|נייד|מייל|מיקוד|ישוב|כתובת|רחוב|סוג|שם|תאריך|מספר|:)$/;
function v2_extractName(text) {
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
  return v2_firstMatch(text,
    /([^\n:]{2,50})\s*:\s*תופש\/פרטי\s+הלקוח/,
    /([^\n:]{2,50})\s*:\s*(?:תופש|פרטי\s+הלקוח)/,
    /([^\n:]{2,50})\s*:\s*שם\s+הלקוח/,
    /([^\n:]{2,50})\s*:\s*שם\s+החברה/,
  );
}
function v2_extractEmail(text) {
  const m = text.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+/);
  if (!m?.[0]) return null;
  const addr = m[0]; const atIdx = addr.indexOf("@");
  const before = addr.slice(0, atIdx); const after = addr.slice(atIdx+1);
  if (/\.[a-z]{2,}(\.[a-z]{2})?$/i.test(before) && !/\./.test(after)) return `${after}@${before}`;
  if (/\./.test(after)) return addr;
  return null;
}
function v2_extractAddress(text) {
  const fwd = v2_firstMatch(text,
    /(?:כתובת|רחוב)\s*:?\s*([^\n\r\t|:]{4,60})/,
    /address\s*:?\s*([^\n\r\t|:]{4,60})/i,
  );
  if (fwd) return fwd;
  const detailsLine = text.match(/([^\n:]{4,80})\s*:\s*פרטים\s+מלאים/);
  if (detailsLine?.[1]) {
    const addr = detailsLine[1].trim()
      .replace(/[0-9]{3}-[0-9]{7,8}/g,"")
      .replace(/טלפון\s*\d*/g,"")
      .replace(/\s{2,}/g," ").trim();
    if (addr.length >= 4) return addr;
  }
  const yishuv = text.match(/([^\n:]{2,30})\s*:\s*ישוב/);
  if (yishuv?.[1]) {
    const val = yishuv[1].trim();
    if (!/מיקוד/.test(val)) return val;
  }
  return null;
}
function v2_extractPoBox(text) {
  return v2_firstMatch(text,
    /ת[."]?ד[."]?\s*:?\s*(\d{3,6})/,
    /p\.?\s*o\.?\s*box\s*:?\s*(\d{3,6})/i,
    /(\d{3,6})\s*:\s*ת[."]?ד/,
  );
}
function v2_extractDocType(text) {
  if (/תסקיר/.test(text)) return "תסקיר בדיקה";
  if (/חוזה/.test(text))  return "חוזה";
  if (/הסכם/.test(text))  return "הסכם";
  if (/חשבונית/.test(text)) return "חשבונית";
  if (/תעודה/.test(text)) return "תעודה";
  return null;
}
function v2_extract(rawText) {
  const text = rawText.replace(/\r\n/g,"\n").replace(/[ \t]{2,}/g," ");
  return {
    expiry_date:    v2_extractExpiry(text),
    contact_name:   v2_extractName(text),
    contact_phone:  v2_extractPhone(text),
    contact_email:  v2_extractEmail(text),
    client_address: v2_extractAddress(text),
    po_box:         v2_extractPoBox(text),
    document_type:  v2_extractDocType(text),
  };
}

// ─── score ────────────────────────────────────────────────────────────────────

const FIELDS = ["expiry_date","contact_name","contact_phone","contact_email","client_address","po_box","document_type"];

function score(result) {
  return FIELDS.filter(f => result[f] != null).length;
}

// ─── run across all dumps ─────────────────────────────────────────────────────

const dir = "data/extractions";
const files = readdirSync(dir)
  .filter(f => f.endsWith(".json"))
  .sort();

let v1Total = 0, v2Total = 0, possible = 0;
let v1Wins = 0, v2Wins = 0, ties = 0;
const perField = { v1: {}, v2: {} };
FIELDS.forEach(f => { perField.v1[f] = 0; perField.v2[f] = 0; });

const details = [];

for (const file of files) {
  let dump;
  try { dump = JSON.parse(readFileSync(join(dir, file), "utf-8")); } catch { continue; }
  const text = dump.input_text || dump.raw_text;
  if (!text || text.trim().length < 50) continue;

  const r1 = v1_extract(text);
  const r2 = v2_extract(text);
  const s1 = score(r1);
  const s2 = score(r2);

  v1Total += s1; v2Total += s2; possible += FIELDS.length;
  if (s2 > s1) v2Wins++; else if (s1 > s2) v1Wins++; else ties++;
  FIELDS.forEach(f => {
    if (r1[f]) perField.v1[f]++;
    if (r2[f]) perField.v2[f]++;
  });

  if (s1 !== s2) {
    details.push({ file: file.slice(0,60), s1, s2, r1, r2 });
  }
}

const n = files.length;
console.log(`\n${"═".repeat(72)}`);
console.log(` OCR extractor comparison — ${n} dump files`);
console.log(`${"═".repeat(72)}`);
console.log(`\n  Version   Fields extracted   Fill rate   Wins`);
console.log(`  ───────   ────────────────   ─────────   ────`);
console.log(`  v1 (old)  ${String(v1Total).padEnd(16)} ${(v1Total/possible*100).toFixed(1)}%       ${v1Wins}`);
console.log(`  v2 (new)  ${String(v2Total).padEnd(16)} ${(v2Total/possible*100).toFixed(1)}%       ${v2Wins}`);
console.log(`  ties: ${ties}   total docs scored: ${n}`);

console.log(`\n${"─".repeat(72)}`);
console.log(` Per-field extraction rate`);
console.log(`${"─".repeat(72)}`);
console.log(`  Field            v1        v2        Δ`);
FIELDS.forEach(f => {
  const d = perField.v2[f] - perField.v1[f];
  const sign = d > 0 ? `+${d}` : d < 0 ? `${d}` : "=";
  console.log(`  ${f.padEnd(16)} ${String(perField.v1[f]).padEnd(9)} ${String(perField.v2[f]).padEnd(9)} ${sign}`);
});

if (details.length > 0) {
  console.log(`\n${"─".repeat(72)}`);
  console.log(` Documents where scores differ (showing up to 20)`);
  console.log(`${"─".repeat(72)}`);
  for (const d of details.slice(0, 20)) {
    console.log(`\n  ${d.file}`);
    console.log(`  v1=${d.s1}/7  v2=${d.s2}/7`);
    FIELDS.forEach(f => {
      const v1v = d.r1[f]; const v2v = d.r2[f];
      if (v1v !== v2v) {
        console.log(`    ${f.padEnd(16)} v1="${v1v ?? "—"}"  v2="${v2v ?? "—"}"`);
      }
    });
  }
}
console.log(`\n${"═".repeat(72)}\n`);
