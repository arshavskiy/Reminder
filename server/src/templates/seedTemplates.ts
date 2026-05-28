// Seed a few built-in document templates on first boot so a brand-new install
// already extracts something useful. Users can edit them or add their own.
//
// Built-in templates are marked is_builtin=1 so the UI can show a small badge,
// but they're otherwise fully editable.

import {col} from "../db/db";
import {ObjectId} from "mongodb";
import type {DocTemplate, TemplateField} from "../../src/shared/types.js";

interface SeedRow {
  name: string;
  description: string;
  match_keywords: string[];
  fields: TemplateField[];
  expiry_field: string | null;
  is_default: number;
}

const SEEDS: SeedRow[] = [
  {
    name: "תסקיר בדיקה",
    description: "תסקיר בדיקה תקופתית של ציוד הרמה, מעליות, מערכות בטיחות וכד׳",
    match_keywords: ["תסקיר", "בדיקה תקופתית", "פקודת הבטיחות"],
    expiry_field: "next_inspection_date",
    is_default: 1,
    fields: [
      { key: "report_number",        label_he: "מספר תסקיר",          type: "text",  required: true,
        hint_he: "מספר התסקיר הנוכחי בלבד. אם מופיע גם 'מספר תסקיר קודם', אל תשתמש בו כ-report_number. למשל: 'מספר תסקיר: 17924/484590' ו-'מספר תסקיר קודם: 161748/340' => report_number='17924/484590'" },
      { key: "client_company",       label_he: "שם החברה / תופש",     type: "text",  required: true,
        hint_he: "החברה שעבורה בוצעה הבדיקה — שדה 'פרטי הלקוח/תופש'" },
      { key: "contact_person",       label_he: "איש קשר",             type: "text",  required: true,
        hint_he: "איש הקשר של הלקוח/תופש מתוך בלוק פרטי הלקוח העליון, למשל 'איש קשר: בר'. לא לקחת מחתימת הבודק, פוטר או הוראות סוף המסמך" },
      { key: "contact_phone",        label_he: "נייד",                type: "phone", required: true,
        hint_he: "טלפון/נייד של איש הקשר מתוך בלוק פרטי הלקוח העליון, למשל 'נייד: 053-8801490'. לא לקחת טלפון של הבודק או החברה הבודקת" },
      { key: "contact_email",        label_he: "מייל",                type: "email", required: true,
        hint_he: "מייל של איש הקשר מתוך בלוק פרטי הלקוח העליון, למשל 'מייל: benitaliftingplat@gmail.com'. לא לקחת מייל מפוטר/חתימת הבודק" },
      { key: "client_address",       label_he: "ישוב / רחוב",         type: "text",  required: true,
        hint_he: "רחוב + מספר + ישוב בלבד — ללא ת.ד, למשל: 'הקידמה 235, אשדוד'" },
      { key: "po_box",               label_he: "ת.ד",                 type: "text",
        hint_he: "מספר תיבת דואר בלבד (P.O. Box), למשל: '679'. אם אין ת.ד, השאר null" },
      { key: "client_zipcode",       label_he: "מיקוד",               type: "text",
        hint_he: "מיקוד בלבד (5–7 ספרות) — לא ת.ד. אם אין מיקוד מפורש בטקסט, השאר null" },
      { key: "inspection_date",      label_he: "תאריך בדיקה",         type: "date",  required: true },
      { key: "next_inspection_date", label_he: "בתוקף עד",            type: "date",  required: true,
        hint_he: "שדה 'בתוקף עד' — זה מה שיפעיל את התזכורת" },
      { key: "equipment_description",label_he: "תיאור מכונת הרמה",    type: "text",  required: true,
        hint_he: 'תיאור מלא של הציוד למשל "רצועות הרמה", "שאקל אומגה", "עגורן"' },
      { key: "license_number",       label_he: "מספר רישוי",          type: "text",  required: true,
        hint_he: "מספר רישוי / מספר כרטיס הבדיקה של הציוד" },
      { key: "manufacturer",         label_he: "יצרן",                type: "text" },
      { key: "model",                label_he: "דגם",                 type: "text" },
      { key: "serial_number",        label_he: "מספר סידורי",         type: "text" },
      { key: "load_capacity",        label_he: "כושר עמיסה",          type: "text",
        hint_he: "אם יש כמה ערכי עומס עבודה בטוח בטבלת הציוד, שמור את כולם לפי סדר הופעתם. אל תיקח ערכים מהוראות/פוטר סוף המסמך" },
      { key: "findings",             label_he: "ממצאים / הערות",      type: "text" },
    ],
  },
  {
    name: "חוזה שירות",
    description: "חוזה / הסכם שירות, ביטוח, שכירות וכד׳",
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
    description: "חשבונית מס / קבלה / דרישת תשלום",
    match_keywords: ["חשבונית", "מספר חשבונית", "תשלום"],
    expiry_field: "payment_due_date",
    is_default: 0,
    fields: [
      { key: "invoice_number",   label_he: "מספר חשבונית",  type: "text", required: true },
      { key: "client_company",   label_he: "שם הלקוח",      type: "text", required: true },
      { key: "client_id",        label_he: "ח.פ / ת.ז",      type: "text" },
      { key: "issue_date",       label_he: "תאריך הוצאה",    type: "date", required: true },
      { key: "payment_due_date", label_he: "תאריך לתשלום",   type: "date", required: true,
        hint_he: "מתי צריך לשלם — מפעיל תזכורת" },
      { key: "amount",           label_he: "סכום לתשלום",   type: "currency", required: true },
      { key: "currency",         label_he: "מטבע",          type: "text",     example_he: "ILS" },
      { key: "vat_amount",       label_he: "סכום מע\"מ",    type: "currency" },
      { key: "items",            label_he: "פירוט פריטים",  type: "list" },
    ],
  },
];

export async function seedBuiltinTemplates(): Promise<void> {
  const collection = col<any>("doc_templates");
  const now = new Date();
  for (const s of SEEDS) {
    await collection.updateOne(
      { name: s.name },
      {
        $set: {
          description: s.description,
          match_keywords: s.match_keywords,
          fields: s.fields,
          expiry_field: s.expiry_field,
          is_default: s.is_default,
          is_builtin: 1,
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

export async function loadAllTemplates(): Promise<DocTemplate[]> {
  const rows = await col<any>("doc_templates")
    .find({})
    .sort({ name: 1 })
    .toArray();
  return rows.map(flatRow);
}

function flatRow(row: any): DocTemplate {
  const { _id, ...rest } = row;
  return {
    id: _id?.toString(),
    ...rest,
    // In MongoDB we store arrays natively; no JSON.parse needed.
    // Guard against legacy string values just in case.
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
 * Pick the best matching template for a given raw document text.
 * Returns the one whose match_keywords have the most hits, falling back to
 * is_default, then to the first row, then null.
 */
export async function pickTemplate(rawText: string): Promise<DocTemplate | null> {
  const all = await loadAllTemplates();
  if (!all.length) return null;

  let best: { tpl: DocTemplate; score: number } | null = null;
  for (const tpl of all) {
    let score = 0;
    for (const kw of tpl.match_keywords) {
      if (kw && rawText.includes(kw)) score++;
    }
    if (!best || score > best.score) best = { tpl, score };
  }
  if (best && best.score > 0) return best.tpl;

  return all.find((t) => t.is_default) ?? all[0];
}
