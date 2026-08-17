export const EXPIRY_FIELD = "expiry_date";
export const LEGACY_EXPIRY_FIELD = "next_inspection_date";

export function readExpiryDateValue(fields: Record<string, unknown> | null | undefined): string | null {
  if (!fields) return null;
  for (const key of [EXPIRY_FIELD, LEGACY_EXPIRY_FIELD]) {
    const value = fields[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

export function mergeLegacyExpiryFields(fields: Record<string, unknown>): {
  changed: boolean;
  fields: Record<string, unknown>;
} {
  const next = { ...fields };
  let changed = false;
  const legacy = next[LEGACY_EXPIRY_FIELD];
  const current = next[EXPIRY_FIELD];
  if (legacy != null && String(legacy).trim()) {
    if (current == null || !String(current).trim()) {
      next[EXPIRY_FIELD] = legacy;
      changed = true;
    }
  }
  if (LEGACY_EXPIRY_FIELD in next) {
    delete next[LEGACY_EXPIRY_FIELD];
    changed = true;
  }
  return { changed, fields: next };
}

export function renameLegacyExpiryKey(key: string): string {
  return key === LEGACY_EXPIRY_FIELD ? EXPIRY_FIELD : key;
}

export function migrateFlatFieldKeys(data: Record<string, unknown>): {
  changed: boolean;
  data: Record<string, unknown>;
} {
  const { changed, fields } = mergeLegacyExpiryFields(data);
  return { changed, data: fields };
}

export function migrateDocTemplateRecord(template: Record<string, unknown>): {
  changed: boolean;
  template: Record<string, unknown>;
} {
  let changed = false;
  const next: Record<string, unknown> = { ...template };

  if (next.expiry_field === LEGACY_EXPIRY_FIELD) {
    next.expiry_field = EXPIRY_FIELD;
    changed = true;
  }

  if (Array.isArray(next.fields)) {
    const fields = next.fields.map((field) => {
      if (!field || typeof field !== "object") return field;
      const row = { ...(field as Record<string, unknown>) };
      if (row.key === LEGACY_EXPIRY_FIELD) {
        row.key = EXPIRY_FIELD;
        changed = true;
      }
      return row;
    });
    next.fields = fields;
  }

  return { changed, template: next };
}
