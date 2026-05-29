import {describe, expect, it} from "vitest";

// ── field sanitization (mirrors PUT /api/documents/:id/fields logic) ──────────

function sanitizeIncoming(incoming: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== "" && v !== null) out[k] = v;
  }
  return out;
}

function mergeFields(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const sanitized = sanitizeIncoming(incoming);
  return { ...existing, ...sanitized };
}

// ── contract field propagation mapping ───────────────────────────────────────

const CONTRACT_FIELDS = ["expiry_date", "start_date", "contract_number", "contract_type", "counterparty"];

function extractContractUpdate(sanitized: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const f of CONTRACT_FIELDS) {
    if (sanitized[f] !== undefined) update[f] = sanitized[f];
  }
  // report_number → contract_number alias
  if (sanitized.report_number !== undefined && update.contract_number === undefined) {
    update.contract_number = sanitized.report_number;
  }
  // next_inspection_date → expiry_date alias
  if (sanitized.next_inspection_date !== undefined && update.expiry_date === undefined) {
    update.expiry_date = sanitized.next_inspection_date;
  }
  return update;
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("PUT /documents/:id/fields — sanitization", () => {
  it("strips empty strings", () => {
    const result = sanitizeIncoming({ name: "test", phone: "", email: "" });
    expect(result).toEqual({ name: "test" });
  });

  it("strips null values", () => {
    const result = sanitizeIncoming({ name: "test", phone: null });
    expect(result).toEqual({ name: "test" });
  });

  it("preserves zero and false", () => {
    const result = sanitizeIncoming({ count: 0, active: false });
    expect(result).toEqual({ count: 0, active: false });
  });

  it("preserves all non-empty values", () => {
    const result = sanitizeIncoming({ a: "hello", b: "world" });
    expect(result).toEqual({ a: "hello", b: "world" });
  });
});

describe("PUT /documents/:id/fields — field merging", () => {
  it("merges new fields into existing", () => {
    const existing = { client_company: "חברה א", expiry_date: "2026-01-01" };
    const incoming = { contact_person: "משה", phone: "" };
    const merged = mergeFields(existing, incoming);
    expect(merged.client_company).toBe("חברה א");
    expect(merged.contact_person).toBe("משה");
    expect(merged.phone).toBeUndefined(); // empty string stripped
  });

  it("incoming value overwrites existing", () => {
    const existing = { expiry_date: "2026-01-01" };
    const incoming = { expiry_date: "2027-06-30" };
    const merged = mergeFields(existing, incoming);
    expect(merged.expiry_date).toBe("2027-06-30");
  });

  it("existing value preserved when incoming is empty string", () => {
    const existing = { expiry_date: "2026-01-01" };
    const incoming = { expiry_date: "" }; // user cleared the field
    const merged = mergeFields(existing, incoming);
    expect(merged.expiry_date).toBe("2026-01-01"); // not overwritten
  });
});

describe("PUT /documents/:id/fields — contract field propagation", () => {
  it("maps expiry_date to contract update", () => {
    const update = extractContractUpdate({ expiry_date: "2027-01-01" });
    expect(update.expiry_date).toBe("2027-01-01");
  });

  it("maps report_number → contract_number", () => {
    const update = extractContractUpdate({ report_number: "17924/484590" });
    expect(update.contract_number).toBe("17924/484590");
  });

  it("maps next_inspection_date → expiry_date", () => {
    const update = extractContractUpdate({ next_inspection_date: "2027-06-01" });
    expect(update.expiry_date).toBe("2027-06-01");
  });

  it("explicit expiry_date takes precedence over next_inspection_date alias", () => {
    const update = extractContractUpdate({ expiry_date: "2027-01-01", next_inspection_date: "2028-01-01" });
    expect(update.expiry_date).toBe("2027-01-01"); // explicit wins
  });

  it("explicit contract_number takes precedence over report_number alias", () => {
    const update = extractContractUpdate({ contract_number: "ABC-123", report_number: "XYZ-999" });
    expect(update.contract_number).toBe("ABC-123");
  });

  it("does not add contract fields when none present in incoming", () => {
    const update = extractContractUpdate({ contact_person: "משה", phone: "050-0000000" });
    expect(Object.keys(update)).toHaveLength(0);
  });

  it("propagates contract_type", () => {
    const update = extractContractUpdate({ contract_type: "תסקיר בדיקה" });
    expect(update.contract_type).toBe("תסקיר בדיקה");
  });
});

describe("PUT /documents/:id/fields — reminder regeneration trigger", () => {
  it("triggers regeneration when expiry_date changes", () => {
    const update = extractContractUpdate({ expiry_date: "2027-01-01" });
    const shouldRegenerate = !!(update.expiry_date || update.contract_type);
    expect(shouldRegenerate).toBe(true);
  });

  it("triggers regeneration when contract_type changes", () => {
    const update = extractContractUpdate({ contract_type: "תסקיר בדיקה" });
    const shouldRegenerate = !!(update.expiry_date || update.contract_type);
    expect(shouldRegenerate).toBe(true);
  });

  it("does not trigger regeneration for non-date fields", () => {
    const update = extractContractUpdate({ contract_number: "123" });
    const shouldRegenerate = !!(update.expiry_date || update.contract_type);
    expect(shouldRegenerate).toBe(false);
  });
});
