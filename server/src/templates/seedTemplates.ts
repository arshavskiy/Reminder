// Seed a few built-in document templates on first boot so a brand-new install
// already extracts something useful. Users can edit them or add their own.
//
// Built-in templates are marked is_builtin=1 so the UI can show a small badge,
// but they're otherwise fully editable.

import {col} from "../db/db";
import {ObjectId} from "mongodb";
import type {DocTemplate, DocumentKind, TemplateField} from "../../src/shared/types.js";
import {buildPromptForTemplate, type InspectorProfile} from "./buildPrompt";
import {logger} from "../logger";
import {DEFAULT_GMAIL_SEARCH_PROVIDERS} from "../gmail/searchProviders";

interface SeedRow {
  name: string;
  description: string;
  document_kind: DocumentKind;
  match_keywords: string[];
  fields: TemplateField[];
  expiry_field: string | null;
  is_default: number;
}

const INVOICE_BASE_MATCH_KEYWORDS = [
  "חשבונית",
  "invoice",
  "receipt",
  "bill",
  "חשבונית מס",
  "קבלה",
  "דרישת תשלום",
  "חשבון תקופתי",
  // Russian receipts and invoices
  "кассовый чек",
  "счет-фактура",
  "счёт на оплату",
  "квитанция",
  "итого",
  "к оплате",
  "маршрутная квитанция",
  "электронный билет",
  "פירוט חשבון",
  "פירוט חודשי",
  "לתשלום",
  "סכום לתשלום",
  "סכום כולל מע\"מ",
  "תקופת חשבון",
  "תקופת חיוב",
  "תקופת השימושים",
  "מספר לקוח",
  "מספר מנוי",
  "מספר חשבון חוזה",
  "מספר מונה",
  "קריאת מונה",
];

const INVOICE_PROVIDER_MATCH_KEYWORDS = DEFAULT_GMAIL_SEARCH_PROVIDERS.flatMap((provider) => [
  provider.label,
  ...provider.terms,
]);

const INVOICE_MATCH_KEYWORDS = uniqueKeywords([
  ...INVOICE_BASE_MATCH_KEYWORDS,
  ...INVOICE_PROVIDER_MATCH_KEYWORDS,
]);

const SEEDS: SeedRow[] = [
  {
    name: "תסקיר בדיקה",
    description: "תסקיר בדיקה תקופתית של ציוד הרמה, מעליות, מערכות בטיחות וכד׳",
    document_kind: "inspection_report",
    match_keywords: ["תסקיר", "בדיקה תקופתית", "פקודת הבטיחות"],
    expiry_field: "expiry_date",
    is_default: 1,
    fields: [
      { key: "report_number",        label_he: "מספר תסקיר",          type: "text",  required: true,
        hint_he: "מספר התסקיר הנוכחי בלבד. אם מופיע גם 'מספר תסקיר קודם', אל תשתמש בו כ-report_number. למשל: 'מספר תסקיר: 17924/484590' ו-'מספר תסקיר קודם: 161748/340' => report_number='17924/484590'" },
      { key: "client_company",       label_he: "שם החברה / תופש",     type: "text",  required: true,
        hint_he: "החברה שעבורה בוצעה הבדיקה — שדה 'פרטי הלקוח/תופש'. מספרים יכולים להיות חלק משם החברה, למשל 'מולטיפק פלסטיק 1990' — לא להסיר אותם" },
      { key: "contact_person",       label_he: "איש קשר",             type: "text",  required: true,
        hint_he: "איש הקשר של הלקוח/תופש מתוך בלוק פרטי הלקוח העליון, למשל 'איש קשר: בר'. לא לקחת מחתימת הבודק, פוטר או הוראות סוף המסמך" },
      { key: "contact_phone",        label_he: "נייד",                type: "phone", required: true,
        hint_he: "טלפון/נייד של איש הקשר מתוך בלוק פרטי הלקוח העליון, למשל 'נייד: 053-8801490'. לא לקחת טלפון של הבודק או החברה הבודקת" },
      { key: "contact_email",        label_he: "מייל",                type: "email", required: true,
        hint_he: "מייל של איש הקשר מתוך בלוק פרטי הלקוח העליון, למשל 'מייל: benitaliftingplat@gmail.com'. לא לקחת מייל מפוטר/חתימת הבודק" },
      { key: "inspection_date",      label_he: "תאריך בדיקה",         type: "date",  required: true },
      { key: "expiry_date",       label_he: "בתוקף עד",            type: "date",  required: true,
        hint_he: "שדה 'בתוקף עד' — זה מה שיפעיל את התזכורת" },
      { key: "equipment_description",label_he: "תיאור",               type: "text",  required: true,
        hint_he: "ערך שדה התיאור הכללי. אם מופיע בטקסט 'תיאור מכונת הרמה', הערך הוא 'מכונת הרמה' ולא תיאור הפריט שנבדק" },
      { key: "checked_equipment",    label_he: "ציוד שנבדק",          type: "text",
        hint_he: 'הפריט הספציפי שנבדק, למשל "מלגזה חשמלית", "רצועות הרמה", "שאקל אומגה", "עגורן"' },
      { key: "license_number",       label_he: "מספר רישוי",          type: "text",
        hint_he: "מספר רישוי / מספר כרטיס הבדיקה של הציוד. אם הציוד הוא אביזרי הרמה (כמו רצועות, שרשרות, קלעים), שדה זה לעתים קרובות לא קיים — השאר null" },
      { key: "manufacturer",         label_he: "יצרן",                type: "text" },
      { key: "model",                label_he: "דגם",                 type: "text" },
      { key: "serial_number",        label_he: "מספר סידורי",         type: "text" },
      { key: "load_capacity",        label_he: "כושר עמיסה",          type: "text",
        hint_he: "אם יש כמה ערכי עומס עבודה בטוח בטבלת הציוד, שמור את כולם לפי סדר הופעתם. אל תיקח ערכים מהוראות/פוטר סוף המסמך" },
      { key: "findings",             label_he: "ממצאים / הערות",      type: "text" },
    ],
  },
  {
    name: "US Inspection Report",
    description: "US/English periodic equipment inspection report — cranes, elevators, boilers, pressure vessels, lifts, etc. (OSHA/ASME/ANSI)",
    document_kind: "inspection_report",
    match_keywords: [
      "OSHA", "ANSI", "ASME", "29 CFR", "1926.1412", "1910.180", "1910.179",
      "B30.5", "B30.10", "BPVC", "API 510", "A17.1",
      "annual inspection", "periodic inspection", "annual certificate",
      "certificate of operation", "certified inspector", "qualified person",
      "inspection report", "inspection checklist", "inspection worksheet",
      "crane", "boom truck", "elevator", "escalator", "pressure vessel",
      "air receiver", "steam boiler", "aerial lift", "scissor lift",
      "rigging", "wire rope", "load test", "safety hazard",
    ],
    expiry_field: "expiry_date",
    is_default: 0,
    fields: [
      { key: "report_number",        label_he: "מספר תסקיר",          type: "text",  required: true,
        hint_he: "The document's own report/certificate/equip number, e.g. 'Crane Sticker Number', 'Equip Number', 'R.O. Number'. Not the previous report's number if both appear." },
      { key: "client_company",       label_he: "שם החברה / תופש",     type: "text",  required: true,
        hint_he: "The owner/company the inspection was performed for — 'Owner Name', 'Company / Owner'." },
      { key: "contact_person",       label_he: "איש קשר",             type: "text",
        hint_he: "Contact person if named separately from the owner/company, e.g. a certifier or technician name — 'Certifier Name', 'Name of Technician'. Leave null if only the company appears." },
      { key: "contact_phone",        label_he: "נייד",                type: "phone",
        hint_he: "Contact phone number if present." },
      { key: "contact_email",        label_he: "מייל",                type: "email",
        hint_he: "Owner or contact email, e.g. 'Owner Email Address'." },
      { key: "inspection_date",      label_he: "תאריך בדיקה",         type: "date",  required: true,
        hint_he: "The inspection/certification date, e.g. 'Date of Inspection', 'Date'." },
      { key: "expiry_date",       label_he: "בתוקף עד",            type: "date",  required: true,
        hint_he: "The next inspection due date — e.g. 'Inspection Due Date', 'Next Inspection Due', 'Valid Until'. This is what triggers the reminder." },
      { key: "equipment_description",label_he: "תיאור",               type: "text",  required: true,
        hint_he: "General equipment category, e.g. 'Boom Truck Crane', 'Elevator', 'Air Receiver', 'Aerial Work Platform'." },
      { key: "checked_equipment",    label_he: "ציוד שנבדק",          type: "text",
        hint_he: "The specific unit inspected, e.g. 'Mobile Crane', 'Hydraulic Elevator', 'Scissor Lift'." },
      { key: "license_number",       label_he: "מספר רישוי",          type: "text",
        hint_he: "License, sticker, or certifier number if present — e.g. 'Crane Sticker Number', 'Certifier Number'." },
      { key: "manufacturer",         label_he: "יצרן",                type: "text",
        hint_he: "e.g. 'Crane Manufacturer', 'Unit Make'." },
      { key: "model",                label_he: "דגם",                 type: "text",
        hint_he: "e.g. 'Crane Model Number', 'Unit Model'." },
      { key: "serial_number",        label_he: "מספר סידורי",         type: "text",
        hint_he: "e.g. 'Crane Serial Number', 'Serial Number', 'VIN'." },
      { key: "load_capacity",        label_he: "כושר עמיסה",          type: "text",
        hint_he: "Rated/maximum capacity if present, e.g. 'Maximum Rated Capacity (lbs)'." },
      { key: "findings",             label_he: "ממצאים / הערות",      type: "text",
        hint_he: "Any noted defects, safety hazards, or follow-up items — e.g. rows marked 'X= Safety Hazard' or 'Follow Up/ Deficiency Details'." },
    ],
  },
  {
    name: "חוזה שירות",
    description: "חוזה / הסכם שירות, ביטוח, שכירות וכד׳",
    document_kind: "contract",
    match_keywords: ["חוזה", "הסכם", "הסכם שירות"],
    expiry_field: "expiry_date",
    is_default: 0,
    fields: [
      { key: "contract_number",   label_he: "מספר חוזה",        type: "text", required: true },
      { key: "client_company",    label_he: "שם הלקוח / חברה",  type: "text", required: true },
      { key: "contact_person",    label_he: "איש קשר",          type: "text" },
      { key: "contact_phone",     label_he: "טלפון",            type: "phone" },
      { key: "contact_email",     label_he: "אימייל",           type: "email" },
      { key: "contract_type",     label_he: "סוג החוזה",        type: "text" },
      { key: "start_date",        label_he: "תאריך תחילה",      type: "date", required: true },
      { key: "expiry_date",       label_he: "תאריך פקיעה",      type: "date", required: true,
        hint_he: "התאריך שבו החוזה פג — זה מה שיפעיל את התזכורת" },
      { key: "amount",            label_he: "סכום",             type: "currency" },
      { key: "currency",          label_he: "מטבע",             type: "text",  example_he: "ILS" },
      { key: "auto_renewal",      label_he: "חידוש אוטומטי?",   type: "text",  example_he: "כן / לא" },
      { key: "notes",             label_he: "הערות",            type: "text" },
    ],
  },
  {
    name: "חשבונית",
    description: "חשבונית מס / קבלה / דרישת תשלום, כולל חשבונות חשמל, מים, תקשורת וספקי שירות ישראליים",
    document_kind: "invoice",
    match_keywords: INVOICE_MATCH_KEYWORDS,
    expiry_field: "payment_due_date",
    is_default: 0,
    fields: [
      { key: "supplier_name",     label_he: "שם הספק",          type: "text", required: true,
        hint_he: "החברה שהנפיקה את החשבונית או דרישת התשלום, למשל חברת חשמל לישראל, בזק, סלקום, פרטנר, הגיחון או מי אביבים. אל תחליף בשם הלקוח." },
      { key: "supplier_id",       label_he: "ח.פ / מזהה ספק",    type: "text",
        hint_he: "מספר ח.פ או מזהה רשמי של הספק אם מופיע במסמך." },
      { key: "invoice_number",    label_he: "מספר חשבונית",      type: "text", required: true,
        hint_he: "מספר החשבונית, הקבלה או דרישת התשלום. באנגלית: Invoice number או Receipt number. אם אין מספר חשבונית מפורש, השתמש במספר הודעה/אסמכתא/מסמך המרכזי." },
      { key: "document_subtype",  label_he: "סוג מסמך",          type: "text", example_he: "חשבונית מס / קבלה / דרישת תשלום / חשבון תקופתי" },
      { key: "client_company",    label_he: "שם הלקוח",          type: "text", required: true,
        hint_he: "שם הלקוח/מנוי/צרכן שעל שמו החשבון. אל תשתמש בשם הספק." },
      { key: "client_id",         label_he: "ח.פ / ת.ז לקוח",     type: "text" },
      { key: "customer_number",   label_he: "מספר לקוח / מנוי",   type: "text",
        hint_he: "מספר לקוח, מספר מנוי, מספר צרכן או מספר משלם." },
      { key: "account_number",    label_he: "מספר חשבון / חוזה",  type: "text",
        hint_he: "מספר חשבון חוזה, מספר חשבון, מספר חוזה או מספר נכס שירות." },
      { key: "service_address",   label_he: "כתובת שירות",       type: "text",
        hint_he: "כתובת הנכס/נקודת השירות שאליה מתייחס החשבון, אם שונה מכתובת למשלוח דואר." },
      { key: "issue_date",        label_he: "תאריך הוצאה",        type: "date", required: true },
      { key: "billing_period",    label_he: "תקופת חיוב",         type: "text",
        hint_he: "טווח התקופה של החשבון כמו 01/07/2026 - 31/07/2026. אם יש תאריך התחלה וסיום, שמור את שניהם באותו ערך." },
      { key: "billing_period_start", label_he: "תחילת תקופת חיוב", type: "date" },
      { key: "billing_period_end",   label_he: "סוף תקופת חיוב",   type: "date" },
      { key: "payment_due_date",  label_he: "תאריך לתשלום",       type: "date", required: true,
        hint_he: "המועד האחרון לתשלום או תאריך חיוב בפועל. באנגלית: Date due. בקבלה באנגלית Date paid יכול לשמש גם כתאריך ההוצאה וגם כתאריך התשלום. זה השדה שמפעיל תזכורת." },
      { key: "amount",            label_he: "סכום לתשלום",        type: "currency", required: true,
        hint_he: "הסכום הסופי לתשלום כולל מע\"מ, לאחר זיכויים/יתרות קודמות אם מופיעים. באנגלית העדף Amount paid, Amount due, Total לפי הסדר. אל תיקח Tax/VAT כסכום לתשלום." },
      { key: "amount_before_vat", label_he: "סכום לפני מע\"מ",     type: "currency" },
      { key: "vat_amount",        label_he: "סכום מע\"מ",          type: "currency" },
      { key: "currency",          label_he: "מטבע",               type: "text", example_he: "ILS",
        hint_he: "החזר קוד ISO בן 3 אותיות בלבד: ILS, USD, EUR, GBP. אם מופיע $, USD או שורה כמו 11.25 USD, החזר USD ולא ש\"ח." },
      { key: "payment_status",    label_he: "סטטוס תשלום",        type: "text", example_he: "לתשלום / שולם / הוראת קבע / חיוב אשראי",
        hint_he: "אם מופיע Receipt, paid, Amount paid או Date paid, החזר paid/שולם." },
      { key: "payment_method",    label_he: "אמצעי תשלום",        type: "text", example_he: "כרטיס אשראי / הוראת קבע / העברה בנקאית",
        hint_he: "באנגלית: Payment method או Charged to, למשל Mastercard - 8021." },
      { key: "meter_number",      label_he: "מספר מונה",          type: "text",
        hint_he: "לחשבונות חשמל/מים/גז בלבד. אם יש כמה מונים, שמור את כולם." },
      { key: "previous_reading",  label_he: "קריאה קודמת",        type: "text" },
      { key: "current_reading",   label_he: "קריאה נוכחית",       type: "text" },
      { key: "usage_quantity",    label_he: "צריכה",              type: "text",
        hint_he: "כמות הצריכה ויחידה, למשל קוט\"ש, מ\"ק, דקות, GB או יחידות שירות." },
      { key: "tariff_plan",       label_he: "מסלול / תעריף",      type: "text",
        hint_he: "שם מסלול, תעריף, חבילה, תוכנית סלולר/אינטרנט או סוג צריכה אם מופיע." },
      { key: "items",             label_he: "פירוט חיובים",       type: "list",
        hint_he: "רשימת שורות חיוב מרכזיות: שירות, תקופה, כמות, סכום. שמור רק פריטים משמעותיים ולא טקסט משפטי ארוך." },
      { key: "notes",             label_he: "הערות",              type: "text",
        hint_he: "הערות חשובות כמו יתרת חוב, זיכוי, התראה לפני ניתוק, חיוב חריג או שינוי תעריף." },
    ],
  },
];

function uniqueKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const keyword = String(value ?? "").trim();
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
  }
  return out;
}

export async function seedBuiltinTemplates(): Promise<void> {
  const collection = col<any>("doc_templates");
  const now = new Date();
  for (const s of SEEDS) {
    // Build and cache the system prompt at seed time so it's ready immediately.
    const tplShell = { fields: s.fields, name: s.name, expiry_field: s.expiry_field, match_keywords: s.match_keywords } as DocTemplate;
    const cached_system_prompt = buildPromptForTemplate(tplShell);
    await collection.updateOne(
      { name: s.name, user_id: null },
      {
        $set: {
          description: s.description,
          document_kind: s.document_kind,
          match_keywords: s.match_keywords,
          fields: s.fields,
          expiry_field: s.expiry_field,
          cached_system_prompt,
          is_default: s.is_default,
          is_builtin: 1,
          user_id: null,
          extract_equipment: true,
          updated_at: now,
        },
        $setOnInsert: {
          name: s.name,
          created_at: now,
        },
      },
      { upsert: true }
    );
  }
}

export async function loadTemplate(id: string): Promise<DocTemplate | null> {
  let filter: Record<string, any>;
  try {
    filter = { _id: new ObjectId(id) };
  } catch {
    filter = { _id: id };
  }
  const row = await col<any>("doc_templates").findOne(filter);
  if (!row) return null;
  return flatRow(row);
}

export async function loadAllTemplates(userId?: string): Promise<DocTemplate[]> {
  const filter = userId
    ? { $or: [{ user_id: userId }, { user_id: null }, { user_id: { $exists: false } }] }
    : {};
  const rows = await col<any>("doc_templates")
    .find(filter)
    .sort({ user_id: -1, name: 1 })
    .toArray();
  return rows.map(flatRow);
}

function flatRow(row: any): DocTemplate {
  const { _id, ...rest } = row;
  return {
    id: _id?.toString(),
    ...rest,
    document_kind: (rest.document_kind as DocumentKind) ?? "unknown",
    cached_system_prompt: rest.cached_system_prompt ?? null,
    match_keywords: Array.isArray(rest.match_keywords)
      ? rest.match_keywords
      : safeJson(rest.match_keywords, []),
    fields: Array.isArray(rest.fields)
      ? rest.fields
      : safeJson(rest.fields, []),
  } as DocTemplate;
}

function safeJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Display / storage type for a document extracted with this template.
 * Prefer document_kind when set (including custom Hebrew kinds like "תלוש משכורת"),
 * otherwise fall back to the template name.
 */
export function documentTypeFromTemplate(template: DocTemplate): string {
  const kind = String(template.document_kind ?? "").trim();
  if (kind && kind !== "unknown") return kind;
  return String(template.name ?? "").trim() || "unknown";
}
export async function pickTemplate(rawText: string, userId?: string): Promise<DocTemplate | null> {
  const all = await loadAllTemplates(userId);
  if (!all.length) return null;

  let best: { tpl: DocTemplate; score: number } | null = null;
  for (const tpl of all) {
    const score = scoreTemplateMatch(rawText, tpl);
    if (!best || score > best.score || (score === best.score && preferTemplate(tpl, best.tpl, userId))) {
      best = { tpl, score };
    }
  }
  if (best && best.score > 0) return best.tpl;

  return null;
}

/** Exported for tests — higher = stronger match. */
export function scoreTemplateMatch(rawText: string, tpl: DocTemplate): number {
  if (!rawText) return 0;
  let score = 0;
  let hits = 0;
  for (const kw of tpl.match_keywords ?? []) {
    const needle = String(kw ?? "").trim();
    if (!needle) continue;
    if (needle.length < 4) continue;
    if (rawText.includes(needle)) {
      score += Math.max(2, Math.min(needle.length, 28));
      hits++;
    }
  }
  const name = String(tpl.name ?? "").trim();
  if (name.length >= 4 && rawText.includes(name)) {
    score += Math.max(10, Math.min(name.length, 28));
    hits++;
  }
  if (hits < 2) return 0;
  return score;
}

function preferTemplate(candidate: DocTemplate, current: DocTemplate, userId?: string): boolean {
  const candBuiltin = Number(candidate.is_builtin) === 1;
  const curBuiltin = Number(current.is_builtin) === 1;
  if (candBuiltin !== curBuiltin) return !candBuiltin;
  if (userId) {
    const candUser = candidate.user_id === userId;
    const curUser = current.user_id === userId;
    if (candUser !== curUser) return candUser;
  }
  const candDefault = Boolean(candidate.is_default);
  const curDefault = Boolean(current.is_default);
  if (candDefault !== curDefault) return candDefault;
  return false;
}

// ── Keyword tables for document-kind classification ─────────────────────────

const KIND_KEYWORDS: Record<DocumentKind, string[]> = {
  inspection_report: [
    "תסקיר", "בדיקה תקופתית", "פקודת הבטיחות", "מספר תסקיר",
    "ציוד הרמה", "בודק מוסמך", "בתוקף עד", "בדיקה הבאה",
    "OSHA", "ANSI", "ASME", "annual inspection", "periodic inspection",
    "certificate of operation", "certified inspector", "qualified person",
    "inspection report", "inspection checklist", "inspection worksheet",
  ],
  contract: [
    "חוזה", "הסכם", "הסכם שירות", "הסכם שכירות", "הסכם ביטוח",
    "הצדדים מסכימים", "תנאי ההסכם",
  ],
  invoice: [
    "חשבונית", "חשבונית מס", "מספר חשבונית", "סכום לתשלום",
    "מע\"מ", "קבלה", "דרישת תשלום",
    "кассовый чек", "счет-фактура", "счёт на оплату", "квитанция",
    "итого", "к оплате", "НДС", "маршрутная квитанция", "электронный билет",
  ],
  certificate: [
    "תעודה", "הסמכה", "רישיון", "מוסמך", "תעודת הסמכה",
    "תעודת מהנדס", "inspector", "license", "certification",
    "מ.ר.", "מ.ג.", "תוקף עד",
  ],
  unknown: [],
};

/**
 * Classify raw document text into a DocumentKind using keyword scoring.
 * Returns the kind with the highest hit count; falls back to "unknown".
 */
export function classifyDocumentKind(rawText: string): DocumentKind {
  let best: { kind: DocumentKind; score: number } = { kind: "unknown", score: 0 };

  for (const [kind, keywords] of Object.entries(KIND_KEYWORDS) as [DocumentKind, string[]][]) {
    if (kind === "unknown") continue;
    let score = 0;
    for (const kw of keywords) {
      if (rawText.includes(kw)) score++;
    }
    if (score > best.score) best = { kind, score };
  }

  return best.score > 0 ? best.kind : "unknown";
}

/**
 * Return the cached system prompt for a template, building and persisting it if absent.
 * Pass `inspector` only if you need a user-specific exclusion note baked in;
 * inspector-aware prompts are NOT cached (returned ephemerally).
 */
export async function getOrBuildSystemPrompt(
  template: DocTemplate,
  inspector?: InspectorProfile
): Promise<string> {
  // Inspector-specific prompts cannot be shared across users — build ephemerally.
  if (inspector) {
    return buildPromptForTemplate(template, inspector);
  }

  if (template.cached_system_prompt) {
    return template.cached_system_prompt;
  }

  // Cache miss — build, persist, and return.
  const prompt = buildPromptForTemplate(template);
  await col("doc_templates").updateOne(
    { _id: tryObjectId(String(template.id)) },
    { $set: { cached_system_prompt: prompt, updated_at: new Date() } }
  );
  logger.debug("template_prompt_cached", { template_id: template.id, template_name: template.name });
  return prompt;
}

/**
 * Clear the cached system prompt so it is rebuilt on the next extraction.
 * Call this whenever a template's fields, name, or expiry_field change.
 */
export async function invalidatePromptCache(templateId: string): Promise<void> {
  await col("doc_templates").updateOne(
    { _id: tryObjectId(templateId) },
    { $set: { cached_system_prompt: null, updated_at: new Date() } }
  );
  logger.info("template_prompt_cache_invalidated", { template_id: templateId });
}

function tryObjectId(id: string): any {
  try { return new ObjectId(id); } catch { return id; }
}
