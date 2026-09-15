// Display-only English -> Hebrew labels for reminder categories from imported
// files. The stored reminder_category / contract_type value is never changed;
// this only affects what the UI shows (sidebar, table, template picker).
const CATEGORY_LABELS_HE: Record<string, string> = {
  Software: "תוכנה",
  Insurance: "ביטוח",
  Certificate: "תעודה",
  Vehicle: "רכב",
  Domain: "דומיין",
  Certification: "הסמכה",
  Safety: "בטיחות",
  Contract: "חוזה",
  Compliance: "רגולציה",
  Equipment: "ציוד",
};

export function categoryLabel(name: string | null | undefined): string {
  if (!name) return "";
  return CATEGORY_LABELS_HE[name] ?? name;
}
