import type { DocTemplate } from "./types.js";
import { EXPIRY_FIELD, hasExpiryDateValue, readExpiryDateValue } from "./documentDates.js";

export type MissingFieldItem = {
  key: string;
  label: string;
  type: string;
  critical: boolean;
};

function isEmpty(val: unknown): boolean {
  if (val == null) return true;
  if (typeof val === "string") return !val.trim();
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

function isMissingEmailField(extracted: Record<string, unknown>): boolean {
  for (const key of ["client_email", "contact_email", "email"] as const) {
    const value = extracted[key];
    if (value != null && String(value).trim()) return false;
  }
  return true;
}

export function listMissingDocumentFields(
  template: DocTemplate | null | undefined,
  extracted: Record<string, unknown>,
): MissingFieldItem[] {
  const missing: MissingFieldItem[] = [];
  const seen = new Set<string>();

  const push = (key: string, label: string, type: string, critical: boolean) => {
    if (seen.has(key)) return;
    if (key === EXPIRY_FIELD && type === "date") {
      if (hasExpiryDateValue(extracted)) return;
    } else if ((key === "client_email" || key === "contact_email" || key === "email") && type === "email") {
      if (!isMissingEmailField(extracted)) return;
      if (seen.has("client_email")) return;
      key = "client_email";
    } else if (!isEmpty(extracted[key])) {
      return;
    }
    seen.add(key);
    missing.push({ key, label, type, critical });
  };

  if (!template) {
    push(EXPIRY_FIELD, "בתוקף עד", "date", true);
    push("inspection_date", "תאריך בדיקה", "date", false);
    push("client_email", "מייל", "email", false);
    return missing;
  }

  const expiryField = template.fields?.find((field) => field.key === EXPIRY_FIELD)
    ?? template.fields?.find((field) => field.key === template.expiry_field);

  for (const field of template.fields ?? []) {
    if (!field.required) continue;
    if (field.key === EXPIRY_FIELD || field.key === template.expiry_field) continue;
    if ((field.key === "client_email" || field.key === "contact_email" || field.key === "email") && field.type === "email") {
      if (seen.has("client_email")) continue;
      push("client_email", field.label_he || "מייל", "email", false);
      continue;
    }
    push(
      field.key,
      field.label_he || field.key,
      field.type,
      field.key === template.expiry_field,
    );
  }

  push(
    EXPIRY_FIELD,
    expiryField?.label_he ?? "בתוקף עד",
    expiryField?.type ?? "date",
    true,
  );

  return missing;
}

export function missingFieldsBlockReminders(missing: MissingFieldItem[]): boolean {
  return missing.some((field) => field.critical);
}

export { readExpiryDateValue };
