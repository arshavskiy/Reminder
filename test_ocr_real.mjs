import {readFileSync} from "fs";

// Load the real extraction dump
const dump = JSON.parse(
  readFileSync(
    "data/extractions/2026-05-31T20-51-24-129Z_doc6a1c9f0108974aa8d63166ba_במת_הרמה__בניטה_פנימי_108_תסקיר_17907.484590.pdf__tpl.json",
    "utf-8"
  )
);

const text = dump.input_text;
console.log("=== RAW TEXT ===");
console.log(text);
console.log("\n=== PATTERN TESTS ===\n");

// ── helpers ──────────────────────────────────────────────────────────────────
function firstMatch(text, pattern) {
  const m = text.match(pattern);
  return m?.[1]?.trim() || null;
}

// ── date ─────────────────────────────────────────────────────────────────────
function normalizeDate(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // DD/MM/YYYY or DD.MM.YYYY
  const dmy = raw.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  // YYYY/MM/DD (reversed bidi)
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
  // reversed bidi
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*בתוקף\s+עד/,
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*(?:תאריך\s+)?בדיקה\s+הבאה/,
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*מועד\s+חידוש/,
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*תאריך\s+פקיעה/,
  /(\d{4}[./]\d{1,2}[./]\d{1,2})\s*:\s*תוקף\s+עד/,
  /(\d{4}-\d{2}-\d{2})\s*:\s*בתוקף\s+עד/,
];

let expiry = null;
for (const p of EXPIRY_PATTERNS) {
  const m = text.match(p);
  if (m?.[1]) {
    const iso = normalizeDate(m[1]);
    console.log(`  expiry pattern ${p.source.slice(0,50).padEnd(52)} → raw="${m[1]}" iso="${iso}"`);
    if (iso && !expiry) expiry = iso;
  } else {
    console.log(`  expiry pattern ${p.source.slice(0,50).padEnd(52)} → NO MATCH`);
  }
}
console.log(`\n  ✓ expiry_date = ${expiry ?? "(not found)"}\n`);

// ── phone ─────────────────────────────────────────────────────────────────────
function normalisePhone(raw) {
  const digits = raw.replace(/[\s\-]/g, "");
  if (digits.length === 10 && /^0/.test(digits)) return `${digits.slice(0,3)}-${digits.slice(3)}`;
  return raw.trim();
}

const PHONE_PATTERNS = [
  // forward
  /(?:נייד|טלפון|טל)\s*:?\s*(0[0-9]{1,2}[-\s]?[0-9]{3}[-\s]?[0-9]{4})/i,
  // reversed  digits: label
  /(0[0-9]{8,9})\s*:\s*(?:נייד|ניידבר|טלפון)/,
  /([0-9]{3}-[0-9]{7})\s*:\s*(?:נייד|ניידבר|טלפון)/,
];

let phone = null;
for (const p of PHONE_PATTERNS) {
  const m = text.match(p);
  if (m?.[1]) {
    const norm = normalisePhone(m[1]);
    console.log(`  phone pattern  ${p.source.slice(0,50).padEnd(52)} → raw="${m[1]}" norm="${norm}"`);
    if (!phone) phone = norm;
  } else {
    console.log(`  phone pattern  ${p.source.slice(0,50).padEnd(52)} → NO MATCH`);
  }
}
console.log(`\n  ✓ contact_phone = ${phone ?? "(not found)"}\n`);

// ── contact name ─────────────────────────────────────────────────────────────
const NAME_PATTERNS = [
  /איש\s+קשר\s*:?\s*([^\n\r\t|:]{2,40})/,
  /שם\s+איש\s+קשר\s*:?\s*([^\n\r\t|:]{2,40})/,
  /שם\s+הלקוח\s*:?\s*([^\n\r\t|:]{2,40})/,
  /שם\s+החברה\s*:?\s*([^\n\r\t|:]{2,40})/,
  // reversed  value: תופש/פרטי הלקוח
  /([^\n:]{2,50})\s*:\s*(?:תופש|פרטי\s+הלקוח)/,
  /([^\n:]{2,50})\s*:\s*שם\s+הלקוח/,
];

let contactName = null;
for (const p of NAME_PATTERNS) {
  const m = text.match(p);
  if (m?.[1]) {
    const val = m[1].trim();
    console.log(`  name pattern   ${p.source.slice(0,50).padEnd(52)} → "${val}"`);
    if (!contactName) contactName = val;
  } else {
    console.log(`  name pattern   ${p.source.slice(0,50).padEnd(52)} → NO MATCH`);
  }
}
console.log(`\n  ✓ contact_name = ${contactName ?? "(not found)"}\n`);

// ── email ─────────────────────────────────────────────────────────────────────
const emailMatch = text.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+/);
let email = null;
if (emailMatch?.[0]) {
  const addr = emailMatch[0];
  const atIdx = addr.indexOf("@");
  const before = addr.slice(0, atIdx);
  const after  = addr.slice(atIdx + 1);
  if (/\.[a-z]{2,}(\.[a-z]{2})?$/i.test(before) && !/\./.test(after)) {
    email = `${after}@${before}`;
    console.log(`  email: reversed bidi → "${email}"`);
  } else if (/\./.test(after)) {
    email = addr;
    console.log(`  email: normal → "${email}"`);
  } else {
    console.log(`  email: captured "${addr}" but invalid`);
  }
} else {
  console.log(`  email: NO MATCH`);
}
console.log(`\n  ✓ contact_email = ${email ?? "(not found)"}\n`);

// ── address ───────────────────────────────────────────────────────────────────
const ADDRESS_PATTERNS = [
  /(?:כתובת|רחוב)\s*:?\s*([^\n\r\t|:]{4,60})/,
  // reversed  value: ישוב
  /([^\n:]{2,40})\s*:\s*ישוב/,
  // reversed  address: פרטים מלאים
  /([^\n:]{4,60})\s*:\s*פרטים\s+מלאים/,
];

let address = null;
for (const p of ADDRESS_PATTERNS) {
  const m = text.match(p);
  if (m?.[1]) {
    const val = m[1].trim();
    console.log(`  address pattern ${p.source.slice(0,50).padEnd(52)} → "${val}"`);
    if (!address) address = val;
  } else {
    console.log(`  address pattern ${p.source.slice(0,50).padEnd(52)} → NO MATCH`);
  }
}
console.log(`\n  ✓ client_address = ${address ?? "(not found)"}\n`);
