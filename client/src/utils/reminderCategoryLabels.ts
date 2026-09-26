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
  Personal: "אישי",
};

const CATEGORY_LABELS_EN: Record<string, string> = {
  "תסקיר בדיקה": "Inspection Report",
  "תסקיר": "Inspection Report",
  "חוזה": "Contract",
  "חוזה שכירות": "Lease Agreement",
  "חוזה שכירות רכב": "Vehicle Lease",
  "חשבונית": "Invoice",
  "אישור": "Certificate",
  "תעודה": "Certificate",
  "תעודת אחריות": "Warranty",
  "תעודת אחריות מוגבלת": "Limited Warranty",
  "פוליסת ביטוח": "Insurance Policy",
  "פוליסת ביטוח רכב פרטי": "Vehicle Insurance",
  "ביטוח": "Insurance",
  "רישיון": "License",
  "היתר": "Permit",
  "הסכם": "Agreement",
  "הצעת מחיר": "Quote",
  "קבלה": "Receipt",
  "תוכנה": "Software",
  "רכב": "Vehicle",
  "דומיין": "Domain",
  "הסמכה": "Certification",
  "בטיחות": "Safety",
  "רגולציה": "Compliance",
  "ציוד": "Equipment",
  "אישי": "Personal",
};

export function categoryLabel(name: string | null | undefined, locale: "he" | "en" = "he"): string {
  if (!name) return "";
  if (locale === "en") return CATEGORY_LABELS_EN[name] ?? name;
  return CATEGORY_LABELS_HE[name] ?? name;
}
