import type { DocTemplate } from "./types.js";

export const EXPIRY_FIELD = "expiry_date";

export function normalizeDateForContract(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const isoPrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefix) {
    const year = Number(isoPrefix[1]);
    const month = Number(isoPrefix[2]);
    const day = Number(isoPrefix[3]);
    return isValidDateParts(year, month, day)
      ? `${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`
      : null;
  }

  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (dmy) {
    const dayNumber = Number(dmy[1]);
    const monthNumber = Number(dmy[2]);
    const day = String(dayNumber).padStart(2, "0");
    const month = String(monthNumber).padStart(2, "0");
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    if (!isValidDateParts(Number(year), monthNumber, dayNumber)) return null;
    return `${year}-${month}-${day}`;
  }

  const my = raw.match(/^(\d{1,2})[./-](\d{4})$/);
  if (my) {
    const monthNumber = Number(my[1]);
    const year = Number(my[2]);
    if (monthNumber < 1 || monthNumber > 12) return null;
    const lastDay = new Date(year, monthNumber, 0).getDate();
    return `${year}-${String(monthNumber).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  return null;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

export function isValidReminderDate(value: unknown): boolean {
  if (value == null) return false;
  const text = String(value).trim();
  if (!text) return false;
  return normalizeDateForContract(text) != null;
}

export function readExpiryDateValue(fields: Record<string, unknown> | null | undefined): string {
  if (!fields) return "";
  for (const key of [EXPIRY_FIELD, "next_inspection_date"] as const) {
    const value = fields[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function hasExpiryDateValue(extracted: Record<string, unknown>): boolean {
  return Boolean(readExpiryDateValue(extracted));
}

export function canonicalExpiryFieldKey(_template: DocTemplate | null | undefined): string {
  return EXPIRY_FIELD;
}

export function resolveMissingFieldInitialValue(
  fieldKey: string,
  extracted: Record<string, unknown>,
  _template: DocTemplate | null | undefined,
): string {
  if (fieldKey === EXPIRY_FIELD || fieldKey === "next_inspection_date") return readExpiryDateValue(extracted);
  if (fieldKey === "client_email" || fieldKey === "contact_email" || fieldKey === "email") {
    for (const key of ["client_email", "contact_email", "email"] as const) {
      const value = extracted[key];
      if (value == null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return "";
  }
  const value = extracted[fieldKey];
  return value == null ? "" : String(value);
}

export function buildMissingFieldsPatch(
  missing: Array<{ key: string; type: string }>,
  values: Record<string, string>,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const field of missing) {
    const raw = values[field.key]?.trim();
    if (!raw) continue;
    if (field.type === "date") {
      const normalized = normalizeDateForContract(raw);
      patch[field.key] = normalized ?? raw;
      continue;
    }
    patch[field.key] = raw;
    if (field.key === "client_email") {
      patch.contact_email = raw;
    } else if (field.key === "contact_email") {
      patch.client_email = raw;
    }
  }
  return patch;
}
