import {INSPECTION_PRINT_TEMPLATE_PRESETS, INSPECTION_PRINT_TEMPLATE_PRESETS_EN} from "../shared/printTemplateLayout.js";

const presets = [...INSPECTION_PRINT_TEMPLATE_PRESETS, ...INSPECTION_PRINT_TEMPLATE_PRESETS_EN];
const MATCH_PHRASES: Record<string, string[]> = {
    underground_parking_lift: ["קרקעי תת חניה", "קרקעי תת-חניה", "תת חניה מתקן", "מתקן תת חניה", "מתקן תת-חניה"],
  air_receiver: ["קולט אוויר", "קולט אויר", "קולטי אוויר", "קולטי אויר"],
  steam_receiver: ["קולט קיטור", "קולטי קיטור"],
  steam_boiler: ["דוד קיטור", "דודי קיטור"],
  pressure_vessel: ["כלי לחץ", "מיתקן לחץ", "מתקן לחץ"],
  tower_crane: ["עגורן צריח"],
  work_platform: ["במת הרמה"],
  powered_scaffold: ["פיגום ממוכן"],
  escalator: ["דרגנוע"],
  elevator: ["מעלית", "מעליות"],
  lifting_accessory: ["אביזרי הרמה", "אביזר הרמה"],
  lifting_machine: ["מכונת הרמה", "מכונות הרמה", "ציוד הרמה"],
};


function normalize(value: string): string {
  return value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function classify(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = normalize(value);
  const exact = presets.find(p => [p.key, p.name, p.reportTypeLabel, p.contractType, p.title].some(v => normalize(v) === text));
  if (exact) return exact.key;
  for (const [key, phrases] of Object.entries(MATCH_PHRASES)) {
    if (phrases.some(phrase => text.includes(normalize(phrase)))) return key;
  }
  return null;
}

/** Resolve the equipment category from report metadata, never from incidental body mentions. */
export function resolveInspectionType(doc: {document_kind?: unknown; file_name?: unknown; raw_text?: unknown; extracted_fields?: unknown}, reportTypeKey?: unknown): string | null {
  if (doc.document_kind !== "inspection_report" && doc.document_kind !== "generated_print_template_pdf") return null;
  if (typeof reportTypeKey === "string" && presets.some(p => p.key === reportTypeKey)) return reportTypeKey;
  let fields: any = doc.extracted_fields;
  if (typeof fields === "string") { try { fields = JSON.parse(fields); } catch { fields = {}; } }
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) fields = {};
  for (const key of ["report_type", "contract_type"]) {
    const type = classify(fields[key]);
    if (type) return type;
  }
  // Prefer explicit report headings; the rest of a report can mention unrelated machinery.
  const lines = typeof doc.raw_text === "string" ? doc.raw_text.split(/\r?\n/).slice(0, 40) : [];
  for (const line of lines) {
    if (!/תסקיר\s+(?:ניסוי|בדיק|על\s|מכונ|אביזר|קולט|דוד|כלי|מעל|דרג|עגור|במת|פיגום)|inspection report/i.test(line)) continue;
    const type = classify(line);
    if (type) return type;
  }
  const fromFile = classify(doc.file_name);
  if (fromFile) return fromFile;
  for (const key of ["equipment_description", "equipment_type"]) {
    const type = classify(fields[key]);
    if (type) return type;
  }
  return null;
}
