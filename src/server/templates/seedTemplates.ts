// Seed a few built-in document templates on first boot so a brand-new install
// already extracts something useful. Users can edit them or add their own.
//
// Built-in templates are marked is_builtin=1 so the UI can show a small badge,
// but they're otherwise fully editable.

import type { Database } from "bun:sqlite";
import type { DocTemplate, TemplateField } from "../../shared/types.js";

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
      { key: "report_number",        label_he: "מספר תסקיר",        type: "text",     required: true },
      { key: "client_company",       label_he: "שם החברה / תופש",   type: "text",     required: true,
        hint_he: "החברה שעבורה בוצעה הבדיקה (תופש)" },
      { key: "contact_person",       label_he: "איש קשר",            type: "text" },
      { key: "contact_phone",        label_he: "טלפון",              type: "phone" },
      { key: "contact_email",        label_he: "אימייל",             type: "email" },
      { key: "client_address",       label_he: "כתובת / יישוב",      type: "text" },
      { key: "inspection_date",      label_he: "תאריך הבדיקה",       type: "date",     required: true },
      { key: "next_inspection_date", label_he: "תאריך בדיקה הבא",    type: "date",     required: true,
        hint_he: "התאריך הבא לבדיקה — זה מה שיפעיל את התזכורת" },
      { key: "equipment_type",       label_he: "סוג הציוד",          type: "text",
        hint_he: 'למשל "מגבה רכב במבנה מספריים", "מעלית", "עגורן"' },
      { key: "manufacturer",         label_he: "יצרן",               type: "text" },
      { key: "model",                label_he: "דגם",                type: "text" },
      { key: "serial_number",        label_he: "מספר סידורי",        type: "text" },
      { key: "load_capacity",        label_he: "כושר עמיסה",         type: "text" },
      { key: "findings",             label_he: "ממצאים / הערות",     type: "text" },
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

export function seedBuiltinTemplates(db: Database) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO doc_templates
       (name, description, match_keywords, fields, expiry_field, is_default, is_builtin)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  );
  for (const s of SEEDS) {
    insert.run(
      s.name,
      s.description,
      JSON.stringify(s.match_keywords),
      JSON.stringify(s.fields),
      s.expiry_field,
      s.is_default
    );
  }
}

export function loadTemplate(db: Database, id: number): DocTemplate | null {
  const row = db.prepare("SELECT * FROM doc_templates WHERE id = ?").get(id) as
    | (Omit<DocTemplate, "match_keywords" | "fields"> & { match_keywords: string; fields: string })
    | null;
  if (!row) return null;
  return parseRow(row);
}

export function loadAllTemplates(db: Database): DocTemplate[] {
  const rows = db.prepare("SELECT * FROM doc_templates ORDER BY name ASC").all() as Array<
    Omit<DocTemplate, "match_keywords" | "fields"> & { match_keywords: string; fields: string }
  >;
  return rows.map(parseRow);
}

function parseRow(row: Omit<DocTemplate, "match_keywords" | "fields"> & {
  match_keywords: string;
  fields: string;
}): DocTemplate {
  return {
    ...row,
    match_keywords: safeJson(row.match_keywords, []),
    fields: safeJson(row.fields, []),
  };
}

function safeJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/**
 * Pick the best matching template for a given raw document text.
 * Returns the one whose match_keywords have the most hits, falling back to is_default,
 * then to the first row, then null.
 */
export function pickTemplate(db: Database, rawText: string): DocTemplate | null {
  const all = loadAllTemplates(db);
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
