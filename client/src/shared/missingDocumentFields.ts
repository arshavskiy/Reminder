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

/** Reminder date only when the template explicitly configures expiry_field. */
export function reminderDateKey(template: DocTemplate | null | undefined): string | null {
  const key = template?.expiry_field;
  return key ? String(key) : null;
}

/** Templates without expiry_field (e.g. תלוש משכורת) do not use the reminder/missing-fields flow. */
export function templateUsesReminders(template: DocTemplate | null | undefined): boolean {
  return Boolean(reminderDateKey(template));
}

export function isPayslipLikeTemplate(template: DocTemplate | null | undefined): boolean {
  if (!template) return false;
  if (/תלוש/.test(String(template.name ?? ""))) return true;
  const keys = new Set((template.fields ?? []).map((f) => f.key));
  return keys.has("payroll_month") || keys.has("net_payment") || keys.has("base_salary");
}

export function isPayslipLikeExtraction(extracted: Record<string, unknown> | null | undefined): boolean {
  if (!extracted) return false;
  return Boolean(
    extracted.payroll_month ||
    extracted.employee_name ||
    extracted.net_payment ||
    extracted.base_salary ||
    extracted.hourly_pay,
  );
}

function isMissingReminderDate(
  template: DocTemplate,
  reminderKey: string,
  extracted: Record<string, unknown>,
): boolean {
  if (reminderKey === EXPIRY_FIELD || reminderKey === "next_inspection_date") {
    return !hasExpiryDateValue(extracted, template);
  }
  return isEmpty(extracted[reminderKey]) && !hasExpiryDateValue(extracted, template);
}

/**
 * Missing fields are always derived from the doc-template schema.
 * For templates without expiry_field, returns [] (no reminder/missing prompt).
 */
export function listMissingDocumentFields(
  template: DocTemplate | null | undefined,
  extracted: Record<string, unknown>,
): MissingFieldItem[] {
  const missing: MissingFieldItem[] = [];
  const seen = new Set<string>();

  const push = (key: string, label: string, type: string, critical: boolean) => {
    if (seen.has(key)) return;
    if (key === EXPIRY_FIELD && type === "date") {
      if (hasExpiryDateValue(extracted, template)) return;
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

  // No template → keep legacy inspection defaults for older docs.
  if (!template) {
    push(EXPIRY_FIELD, "בתוקף עד", "date", true);
    push("inspection_date", "תאריך בדיקה", "date", false);
    push("client_email", "מייל", "email", false);
    return missing;
  }

  // Payslip / non-reminder templates: do not prompt missing fields for now.
  if (!templateUsesReminders(template) || isPayslipLikeTemplate(template)) {
    return missing;
  }

  const reminderKey = reminderDateKey(template);
  const reminderDef =
    (reminderKey ? template.fields?.find((field) => field.key === reminderKey) : undefined) ??
    template.fields?.find((field) => field.key === EXPIRY_FIELD);

  for (const field of template.fields ?? []) {
    if (!field.required) continue;
    if (reminderKey && (field.key === reminderKey || field.key === EXPIRY_FIELD)) continue;
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

  if (reminderKey && isMissingReminderDate(template, reminderKey, extracted)) {
    push(
      reminderKey === "next_inspection_date" ? EXPIRY_FIELD : reminderKey,
      reminderDef?.label_he ?? (reminderKey === EXPIRY_FIELD ? "בתוקף עד" : reminderKey),
      reminderDef?.type ?? "date",
      true,
    );
  }

  return missing;
}

export function missingFieldsBlockReminders(missing: MissingFieldItem[]): boolean {
  return missing.some((field) => field.critical);
}

/** Prefer the template whose field keys best match the extraction payload. */
export function pickBestTemplateForExtraction(
  templates: DocTemplate[],
  extracted: Record<string, unknown> | null | undefined,
  preferredId?: string | null,
): DocTemplate | null {
  if (!templates.length) return null;
  const keys = Object.keys(extracted ?? {}).filter((k) => {
    if (k.startsWith("_")) return false;
    const v = extracted![k];
    return v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
  });

  let best: { tpl: DocTemplate; score: number } | null = null;
  for (const tpl of templates) {
    const fieldKeys = new Set((tpl.fields ?? []).map((f) => f.key));
    let score = 0;
    for (const key of keys) {
      if (fieldKeys.has(key)) score += 3;
    }
    // Prefer exact id / payslip name lightly.
    if (preferredId && String(tpl.id) === String(preferredId)) score += 1;
    if (isPayslipLikeExtraction(extracted) && isPayslipLikeTemplate(tpl)) score += 5;
    if (!best || score > best.score) best = { tpl, score };
  }
  if (best && best.score > 0) return best.tpl;
  return templates.find((t) => preferredId && String(t.id) === String(preferredId)) ?? null;
}

/** Type label stored on documents = template.document_kind (or name if kind is unknown). */
export function documentTypeFromTemplate(template: DocTemplate | null | undefined): string {
  if (!template) return "";
  const kind = String(template.document_kind ?? "").trim();
  if (kind && kind !== "unknown") return kind;
  return String(template.name ?? "").trim();
}

export { readExpiryDateValue };
