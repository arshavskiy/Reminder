import {col} from "./db/db";

export type FeatureScope = "pages" | "dashboard";

export interface FeatureDefinition {
  key: string;
  scope: FeatureScope;
  label_he: string;
  label_en: string;
  description_he: string;
  default_enabled: boolean;
  sort_order: number;
}

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    key: "pages.dashboard",
    scope: "pages",
    label_he: "ראשי",
    label_en: "Dashboard",
    description_he: "גישה לעמוד הראשי של המערכת.",
    default_enabled: true,
    sort_order: 10
  },
  {key: "pages.documents", scope: "pages", label_he: "מסמכים", label_en: "Documents", description_he: "העלאה, צפייה וניהול מסמכים.", default_enabled: true, sort_order: 20},
  {key: "pages.invoices", scope: "pages", label_he: "חשבוניות", label_en: "Invoices", description_he: "ניהול חשבוניות וקבלות שיובאו מ-Gmail וממסמכים. זמין למנהלים בלבד.", default_enabled: false, sort_order: 25},
  {key: "pages.contracts", scope: "pages", label_he: "תסקירים", label_en: "Inspections", description_he: "ניהול תסקירים, חוזים ותוקפים.", default_enabled: true, sort_order: 30},
  {key: "pages.reminders", scope: "pages", label_he: "תזכורות", label_en: "Reminders", description_he: "ניהול ושליחת תזכורות.", default_enabled: true, sort_order: 40},
  {key: "pages.reports", scope: "pages", label_he: "דוחות", label_en: "Reports", description_he: "הפקה ושליחה של דוחות חודשיים.", default_enabled: true, sort_order: 50},
  {key: "pages.clients", scope: "pages", label_he: "לקוחות", label_en: "Clients", description_he: "ניהול לקוחות ואנשי קשר.", default_enabled: true, sort_order: 60},
  {key: "pages.equipment", scope: "pages", label_he: "ציוד", label_en: "Equipment", description_he: "ניהול ציוד, יצרנים ותאריכי בדיקה.", default_enabled: true, sort_order: 70},
  {key: "pages.field", scope: "pages", label_he: "שטח", label_en: "Field", description_he: "עמוד עבודה מהירה בשטח.", default_enabled: true, sort_order: 80},
  {key: "pages.profile", scope: "pages", label_he: "פרופיל", label_en: "Profile", description_he: "פרטי משתמש, חברה ותעודות.", default_enabled: true, sort_order: 90},
  {key: "pages.doc_templates", scope: "pages", label_he: "תבניות מסמכים", label_en: "Document templates", description_he: "הגדרת תבניות חילוץ למסמכים.", default_enabled: true, sort_order: 100},
  {key: "pages.email_templates", scope: "pages", label_he: "תבניות אימייל", label_en: "Email templates", description_he: "עריכת תבניות אימייל לתזכורות.", default_enabled: true, sort_order: 110},
  {key: "pages.settings", scope: "pages", label_he: "הגדרות", label_en: "Settings", description_he: "הגדרות מערכת, SMTP ו-AI.", default_enabled: true, sort_order: 120},
  {key: "pages.search", scope: "pages", label_he: "חיפוש", label_en: "Search", description_he: "חיפוש גלובלי במסמכים, לקוחות ותסקירים.", default_enabled: true, sort_order: 130},
  {key: "pages.gmail", scope: "pages", label_he: "Gmail", label_en: "Gmail Inbox", description_he: "תיבת דואר Gmail לייבוא מסמכים.", default_enabled: true, sort_order: 140},
  {key: "dashboard.stat_documents", scope: "dashboard", label_he: "סטטיסטיקת מסמכים", label_en: "Documents stat", description_he: "הצגת מספר המסמכים בלוח הבקרה.", default_enabled: true, sort_order: 210},
  {key: "dashboard.stat_clients", scope: "dashboard", label_he: "סטטיסטיקת לקוחות", label_en: "Clients stat", description_he: "הצגת מספר הלקוחות בלוח הבקרה.", default_enabled: true, sort_order: 220},
  {key: "dashboard.stat_inspections", scope: "dashboard", label_he: "סטטיסטיקת תסקירים", label_en: "Inspections stat", description_he: "הצגת מספר התסקירים בלוח הבקרה.", default_enabled: true, sort_order: 230},
  {key: "dashboard.stat_pending_reminders", scope: "dashboard", label_he: "תזכורות ממתינות", label_en: "Pending reminders stat", description_he: "הצגת כמות התזכורות הממתינות.", default_enabled: true, sort_order: 240},
  {key: "dashboard.stat_expiring_soon", scope: "dashboard", label_he: "פגי תוקף בקרוב", label_en: "Expiring soon stat", description_he: "הצגת תוקפים שמסתיימים ב-30 יום.", default_enabled: true, sort_order: 250},
  {key: "dashboard.drop_strip", scope: "dashboard", label_he: "רצועת העלאה", label_en: "Upload drop strip", description_he: "הצגת אזור גרירה/לחיצה להעלאת מסמכים בראש לוח הבקרה.", default_enabled: true, sort_order: 260},
  {key: "dashboard.calendar", scope: "dashboard", label_he: "לוח תזכורות", label_en: "Reminder calendar", description_he: "הצגת לוח התזכורות והתוקפים.", default_enabled: true, sort_order: 270},
  {key: "dashboard.modules", scope: "dashboard", label_he: "כרטיסי מודולים", label_en: "Module cards", description_he: "הצגת כרטיסי סביבת העבודה.", default_enabled: true, sort_order: 280},
  {key: "dashboard.recent_documents", scope: "dashboard", label_he: "מסמכים אחרונים", label_en: "Recent documents", description_he: "הצגת רשימת מסמכים אחרונים.", default_enabled: true, sort_order: 290},
  {key: "dashboard.upcoming_reminders", scope: "dashboard", label_he: "תזכורות קרובות", label_en: "Upcoming reminders", description_he: "הצגת רשימת תזכורות קרובות.", default_enabled: true, sort_order: 300},
  {key: "dashboard.calendar_filters", scope: "dashboard", label_he: "פילטרי לוח שנה", label_en: "Calendar filters", description_he: "הצגת כפתורי סינון בלוח התזכורות.", default_enabled: true, sort_order: 310},
];

// Flat dotted-key map — used internally for lookups.
export const DEFAULT_FEATURES = Object.fromEntries(
  FEATURE_DEFINITIONS.map((feature) => [feature.key, feature.default_enabled])
) as Record<string, boolean>;

// Nested object — used for DB storage and API responses.
export const DEFAULT_FEATURES_NESTED: Record<string, Record<string, boolean>> = (() => {
  const nested: Record<string, Record<string, boolean>> = {};
  for (const def of FEATURE_DEFINITIONS) {
    const dot = def.key.indexOf(".");
    if (dot === -1) continue;
    const scope = def.key.slice(0, dot);
    const name = def.key.slice(dot + 1);
    if (!nested[scope]) nested[scope] = {};
    nested[scope][name] = def.default_enabled;
  }
  return nested;
})();

export async function seedFeatureDefinitions(): Promise<void> {
  for (const feature of FEATURE_DEFINITIONS) {
    await col("features").updateOne(
      {key: feature.key},
      {
        $set: {
          scope: feature.scope,
          label_he: feature.label_he,
          label_en: feature.label_en,
          description_he: feature.description_he,
          default_enabled: feature.default_enabled,
          sort_order: feature.sort_order,
          updated_at: new Date(),
        },
        $setOnInsert: {
          key: feature.key,
          created_at: new Date(),
        },
      },
      {upsert: true},
    );
  }
}

export async function isFeatureEnabledForUser(userId: string, featureKey: string): Promise<boolean> {
  const row = await col("user_settings").findOne({user_id: userId}) as any;
  const features = normalizeFeatures(row?.features) ?? normalizeFeatures(row?.features_json) ?? DEFAULT_FEATURES;
  return features[featureKey] ?? DEFAULT_FEATURES[featureKey] ?? true;
}

export async function isAnyFeatureEnabledForUser(userId: string, featureKeys: string[]): Promise<boolean> {
  for (const key of featureKeys) {
    if (await isFeatureEnabledForUser(userId, key)) return true;
  }
  return false;
}

// Accepts flat {"pages.dashboard": true} or nested {pages: {dashboard: true}}.
// Returns flat dotted-key map for internal use.
export function normalizeFeatures(value: unknown): Record<string, boolean> | null {
  if (value == null || value === "") return null;
  let parsed = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("features must be a valid JSON object");
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("features must be an object");
  }

  const normalized: Record<string, boolean> = {};
  function walk(obj: Record<string, unknown>, prefix: string) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "boolean") {
        normalized[key] = v;
      } else if (typeof v === "string") {
        if (v === "true") normalized[key] = true;
        else if (v === "false") normalized[key] = false;
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, key);
      }
    }
  }
  walk(parsed as Record<string, unknown>, "");

  return normalized;
}

// Convert flat dotted-key map to nested object for DB storage and API responses.
export function featuresToNested(flat: Record<string, boolean>): Record<string, Record<string, boolean>> {
  const nested: Record<string, Record<string, boolean>> = {};
  for (const [dotKey, val] of Object.entries(flat)) {
    const dot = dotKey.indexOf(".");
    if (dot === -1) continue;
    const scope = dotKey.slice(0, dot);
    const name = dotKey.slice(dot + 1);
    if (!nested[scope]) nested[scope] = {};
    nested[scope][name] = val;
  }
  return nested;
}
