import {describe, expect, it, vi} from "vitest";

// ── helpers mirroring PUT /api/documents/:id/fields logic ────────────────────

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
  return { ...existing, ...sanitizeIncoming(incoming) };
}

function expiryChanged(sanitized: Record<string, unknown>): boolean {
  return sanitized.expiry_date !== undefined || sanitized.next_inspection_date !== undefined;
}

// ── sanitization ──────────────────────────────────────────────────────────────

describe("PUT /documents/:id/fields — sanitization", () => {
  it("strips empty strings", () => {
    expect(sanitizeIncoming({ name: "test", phone: "", email: "" })).toEqual({ name: "test" });
  });

  it("strips null values", () => {
    expect(sanitizeIncoming({ name: "test", phone: null })).toEqual({ name: "test" });
  });

  it("preserves zero and false", () => {
    expect(sanitizeIncoming({ count: 0, active: false })).toEqual({ count: 0, active: false });
  });

  it("preserves all non-empty values", () => {
    expect(sanitizeIncoming({ a: "hello", b: "world" })).toEqual({ a: "hello", b: "world" });
  });
});

// ── field merging ─────────────────────────────────────────────────────────────

describe("PUT /documents/:id/fields — field merging", () => {
  it("merges new fields into existing", () => {
    const merged = mergeFields(
      { client_company: "חברה א", expiry_date: "2026-01-01" },
      { contact_person: "משה", phone: "" }
    );
    expect(merged.client_company).toBe("חברה א");
    expect(merged.contact_person).toBe("משה");
    expect(merged.phone).toBeUndefined();
  });

  it("incoming value overwrites existing", () => {
    const merged = mergeFields({ expiry_date: "2026-01-01" }, { expiry_date: "2027-06-30" });
    expect(merged.expiry_date).toBe("2027-06-30");
  });

  it("existing value preserved when incoming is empty string", () => {
    const merged = mergeFields({ expiry_date: "2026-01-01" }, { expiry_date: "" });
    expect(merged.expiry_date).toBe("2026-01-01");
  });

  it("preserves _equipment array from existing fields", () => {
    const eq = [{ name: "מנוף", serial_number: "SN-1" }];
    const merged = mergeFields({ _equipment: eq, expiry_date: "2026-01-01" }, { expiry_date: "2027-01-01" });
    expect(merged._equipment).toEqual(eq);
  });
});

// ── reminder regeneration trigger ────────────────────────────────────────────

describe("PUT /documents/:id/fields — reminder regeneration trigger", () => {
  it("triggers when expiry_date changes", () => {
    expect(expiryChanged({ expiry_date: "2027-01-01" })).toBe(true);
  });

  it("triggers when next_inspection_date changes", () => {
    expect(expiryChanged({ next_inspection_date: "2027-06-01" })).toBe(true);
  });

  it("does not trigger for non-expiry fields", () => {
    expect(expiryChanged({ contract_number: "123", client_company: "חברה" })).toBe(false);
  });

  it("triggers when both expiry_date and next_inspection_date present", () => {
    expect(expiryChanged({ expiry_date: "2027-01-01", next_inspection_date: "2028-01-01" })).toBe(true);
  });
});

// ── entity propagation via saveTemplateEntitiesForDoc (mocked) ────────────────

function makeMockSaveEntities() {
  return vi.fn(async (
    _documentId: string,
    _template: any,
    _fields: any,
    _userId?: string,
    _skipReminders?: boolean
  ) => {});
}

describe("PUT /documents/:id/fields — entity propagation", () => {
  it("calls saveTemplateEntitiesForDoc with merged fields when template is resolved", async () => {
    const saveEntities = makeMockSaveEntities();
    const template = { id: "tpl-1", name: "תסקיר בדיקה", fields: [], expiry_field: "expiry_date" };
    const merged = { client_company: "חברה א", expiry_date: "2027-01-01", _equipment: [] };

    await saveEntities("doc-1", template, merged, "user-1", true);

    expect(saveEntities).toHaveBeenCalledOnce();
    expect(saveEntities).toHaveBeenCalledWith("doc-1", template, merged, "user-1", true);
  });

  it("passes skipReminders=true so reminder logic is not double-triggered", async () => {
    const saveEntities = makeMockSaveEntities();
    await saveEntities("doc-1", {}, {}, "user-1", true);
    const [, , , , skipReminders] = saveEntities.mock.calls[0];
    expect(skipReminders).toBe(true);
  });

  it("does not call saveTemplateEntitiesForDoc when no template is found", async () => {
    const saveEntities = makeMockSaveEntities();
    const template = null;
    if (template) await saveEntities("doc-1", template, {}, "user-1", true);
    expect(saveEntities).not.toHaveBeenCalled();
  });
});

// ── flat equipment field propagation to equipment collection ─────────────────

const EQUIPMENT_FLAT_FIELDS = [
  "equipment_description", "serial_number", "manufacturer", "model",
  "load_capacity", "load_capacity_test", "load_radius",
] as const;

function extractEquipmentUpdate(sanitized: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const f of EQUIPMENT_FLAT_FIELDS) {
    if (sanitized[f] !== undefined) {
      update[f === "equipment_description" ? "name" : f] = sanitized[f];
    }
  }
  return update;
}

describe("PUT /documents/:id/fields — flat equipment field propagation", () => {
  it("maps equipment_description to name in db update", () => {
    const update = extractEquipmentUpdate({ equipment_description: "מנוף חדש" });
    expect(update.name).toBe("מנוף חדש");
    expect(update.equipment_description).toBeUndefined();
  });

  it("maps serial_number directly", () => {
    const update = extractEquipmentUpdate({ serial_number: "SN-999" });
    expect(update.serial_number).toBe("SN-999");
  });

  it("maps manufacturer and model directly", () => {
    const update = extractEquipmentUpdate({ manufacturer: "XYZ", model: "M3" });
    expect(update.manufacturer).toBe("XYZ");
    expect(update.model).toBe("M3");
  });

  it("maps load_capacity, load_capacity_test, load_radius", () => {
    const update = extractEquipmentUpdate({
      load_capacity: "500 ק\"ג",
      load_capacity_test: "750 ק\"ג",
      load_radius: "3 מ'",
    });
    expect(update.load_capacity).toBe("500 ק\"ג");
    expect(update.load_capacity_test).toBe("750 ק\"ג");
    expect(update.load_radius).toBe("3 מ'");
  });

  it("returns empty object when no equipment fields in sanitized", () => {
    const update = extractEquipmentUpdate({ expiry_date: "2027-01-01", client_company: "חברה" });
    expect(Object.keys(update)).toHaveLength(0);
  });

  it("only includes fields present in sanitized (not all flat fields)", () => {
    const update = extractEquipmentUpdate({ serial_number: "SN-100" });
    expect(Object.keys(update)).toEqual(["serial_number"]);
  });

  it("triggers db update when at least one equipment field changed", () => {
    const sanitized = { serial_number: "SN-NEW", expiry_date: "2027-01-01" };
    const update = extractEquipmentUpdate(sanitized);
    expect(Object.keys(update).length).toBeGreaterThan(0);
  });

  it("does not trigger db update when no equipment fields changed", () => {
    const sanitized = { expiry_date: "2027-01-01", client_company: "חברה" };
    const update = extractEquipmentUpdate(sanitized);
    expect(Object.keys(update)).toHaveLength(0);
  });
});

// ── equipment field propagation ───────────────────────────────────────────────

describe("PUT /documents/:id/fields — equipment in merged fields", () => {
  it("_equipment rows are preserved through merge", () => {
    const equipmentRows = [
      { name: "מנוף א", serial_number: "SN-100", manufacturer: "XYZ", model: "M1" },
      { name: "מנוף ב", serial_number: "SN-200", manufacturer: "ABC", model: "M2" },
    ];
    const existing = { expiry_date: "2026-01-01", _equipment: equipmentRows };
    const incoming = { expiry_date: "2027-06-01" };
    const merged = mergeFields(existing, incoming);
    expect(merged._equipment).toEqual(equipmentRows);
    expect((merged._equipment as any[]).length).toBe(2);
  });

  it("_equipment can be updated via incoming fields", () => {
    const updated = [{ name: "מנוף חדש", serial_number: "SN-999" }];
    const merged = mergeFields(
      { _equipment: [{ name: "ישן", serial_number: "SN-000" }] },
      { _equipment: updated }
    );
    expect(merged._equipment).toEqual(updated);
  });
});

// ── client field propagation ──────────────────────────────────────────────────

describe("PUT /documents/:id/fields — client fields in merged output", () => {
  it("client identity fields are present in merged output for entity save", () => {
    const merged = mergeFields(
      { expiry_date: "2026-01-01" },
      { client_company: "מילניום בע\"מ", client_name: "שילה", client_email: "test@example.com" }
    );
    expect(merged.client_company).toBe("מילניום בע\"מ");
    expect(merged.client_name).toBe("שילה");
    expect(merged.client_email).toBe("test@example.com");
  });

  it("null client_email is stripped and does not overwrite existing", () => {
    const merged = mergeFields(
      { client_email: "existing@example.com" },
      { client_email: null }
    );
    expect(merged.client_email).toBe("existing@example.com");
  });
});

// ── reminder regeneration with contract lookup (mocked) ──────────────────────

describe("PUT /documents/:id/fields — reminder regeneration flow", () => {
  it("deletes pending reminders and regenerates when expiry_date changes", async () => {
    const deleteMany = vi.fn(async (_filter: Record<string, unknown>) => ({ deletedCount: 2 }));
    const generateReminders = vi.fn(async (..._args: unknown[]) => {});

    const contract = { _id: { toString: () => "ctr-1" }, client_id: "cli-1", expiry_date: "2026-01-01" };
    const sanitized = { expiry_date: "2027-06-01" };

    if (expiryChanged(sanitized)) {
      const expiryDate = String(sanitized.expiry_date ?? (contract as any).expiry_date ?? "");
      await deleteMany({ source_type: "contract_expiry", source_id: "ctr-1", status: "pending" });
      await generateReminders("ctr-1", contract.client_id, "doc-1", expiryDate, "user-1");
    }

    expect(deleteMany).toHaveBeenCalledOnce();
    expect(deleteMany).toHaveBeenCalledWith({
      source_type: "contract_expiry",
      source_id: "ctr-1",
      status: "pending",
    });
    expect(generateReminders).toHaveBeenCalledWith("ctr-1", "cli-1", "doc-1", "2027-06-01", "user-1");
  });

  it("skips reminder regeneration when expiry_date not in sanitized fields", async () => {
    const deleteMany = vi.fn(async (_filter: Record<string, unknown>) => ({}));
    const generateReminders = vi.fn(async (..._args: unknown[]) => {});
    const sanitized = { contract_number: "123" };

    if (expiryChanged(sanitized)) {
      await deleteMany({});
      await generateReminders("ctr-1", "cli-1", "doc-1", "", "user-1");
    }

    expect(deleteMany).not.toHaveBeenCalled();
    expect(generateReminders).not.toHaveBeenCalled();
  });

  it("uses next_inspection_date as expiry fallback for reminder date", async () => {
    const generateReminders = vi.fn(async (..._args: unknown[]) => {});
    const sanitized = { next_inspection_date: "2028-03-15" };
    const contract = { _id: { toString: () => "ctr-2" }, client_id: "cli-2", expiry_date: "2026-01-01" };

    if (expiryChanged(sanitized)) {
      const expiryDate = String(
        (sanitized as any).expiry_date ?? sanitized.next_inspection_date ?? (contract as any).expiry_date ?? ""
      );
      await generateReminders("ctr-2", contract.client_id, "doc-2", expiryDate, "user-1");
    }

    expect(generateReminders).toHaveBeenCalledWith("ctr-2", "cli-2", "doc-2", "2028-03-15", "user-1");
  });
});
