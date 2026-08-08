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

interface SeedRow {
  name: string;
  description: string;
  document_kind: DocumentKind;
  match_keywords: string[];
  fields: TemplateField[];
  expiry_field: string | null;
  is_default: number;
}

const SEEDS: SeedRow[] = [
  {
    name: "תסקיר בדיקה",
    description: "תסקיר בדיקה תקופתית של ציוד הרמה, מעליות, מערכות בטיחות וכד׳",
    document_kind: "inspection_report",
    match_keywords: ["תסקיר", "בדיקה תקופתית", "פקודת הבטיחות"],
    expiry_field: "next_inspection_date",
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
      { key: "next_inspection_date", label_he: "בתוקף עד",            type: "date",  required: true,
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
    description: "חשבונית מס / קבלה / דרישת תשלום",
    document_kind: "invoice",
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
 * Pick the best matching template for a given raw document text.
 * If a clientId is supplied and that client has a preferred_template_id, that
 * template is returned directly (skipping keyword auto-detect). Otherwise falls
 * back to the one whose match_keywords have the most hits, then is_default,
 * then the first row, then null.
 */
export async function pickTemplate(
  rawText: string,
  userId?: string,
  clientId?: string
): Promise<DocTemplate | null> {
  // Client-forced template — highest priority, skips keyword scan.
  if (clientId) {
    const preferred = await loadClientPreferredTemplate(clientId);
    if (preferred) return preferred;
  }

  const all = await loadAllTemplates(userId);
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

  return all.find((t) => userId && t.user_id === userId && t.is_default) ??
    all.find((t) => t.is_default) ??
    all[0];
}

async function loadClientPreferredTemplate(clientId: string): Promise<DocTemplate | null> {
  try {
    const cf = (() => { try { return { _id: new ObjectId(clientId) }; } catch { return { _id: clientId }; } })();
    const client = await col<any>("clients").findOne(cf as any);
    const templateId = client?.preferred_template_id;
    if (!templateId) return null;
    return await loadTemplate(String(templateId));
  } catch {
    return null;
  }
}

// ── Keyword tables for document-kind classification ─────────────────────────

const KIND_KEYWORDS: Record<DocumentKind, string[]> = {
  inspection_report: [
    "תסקיר", "בדיקה תקופתית", "פקודת הבטיחות", "מספר תסקיר",
    "ציוד הרמה", "בודק מוסמך", "בתוקף עד", "בדיקה הבאה",
  ],
  contract: [
    "חוזה", "הסכם", "הסכם שירות", "הסכם שכירות", "הסכם ביטוח",
    "הצדדים מסכימים", "תנאי ההסכם",
  ],
  invoice: [
    "חשבונית", "חשבונית מס", "מספר חשבונית", "סכום לתשלום",
    "מע\"מ", "קבלה", "דרישת תשלום",
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
