import {describe, expect, it} from "vitest";

// ── days_until calculation (mirrors history route logic) ──────────────────────

function daysUntil(expiryIso: string, todayIso: string): number {
  return Math.ceil(
    (new Date(expiryIso).getTime() - new Date(todayIso).getTime()) / 86400000
  );
}

// ── history event shaping ─────────────────────────────────────────────────────

function shapeEvent(contract: any, extracted: Record<string, any>, todayIso: string) {
  const expiry = contract.expiry_date ?? null;
  const days = expiry ? daysUntil(expiry, todayIso) : null;
  return {
    id: contract._id?.toString(),
    contract_type: contract.contract_type ?? null,
    contract_number: contract.contract_number ?? null,
    start_date: contract.start_date ?? null,
    expiry_date: expiry,
    status: contract.status ?? null,
    inspector: extracted.inspector ?? extracted.contact_person ?? null,
    load_capacity_test: extracted.load_capacity_test ?? null,
    pass_fail: extracted.pass_fail ?? extracted.result ?? null,
    days_until: days,
  };
}

describe("Equipment Service History — days_until", () => {
  const TODAY = "2026-06-01";

  it("returns negative value for expired certificate", () => {
    expect(daysUntil("2026-05-01", TODAY)).toBeLessThan(0);
  });

  it("returns 0 for expiry today", () => {
    expect(daysUntil("2026-06-01", TODAY)).toBe(0);
  });

  it("returns positive value for future expiry", () => {
    expect(daysUntil("2026-12-01", TODAY)).toBeGreaterThan(0);
  });
});

describe("Equipment Service History — event shaping", () => {
  const TODAY = "2026-06-01";

  it("maps inspector from extracted contact_person when inspector missing", () => {
    const contract = { _id: { toString: () => "c1" }, contract_type: "תסקיר", expiry_date: "2027-01-01", status: "active" };
    const extracted = { contact_person: "משה" };
    const ev = shapeEvent(contract, extracted, TODAY);
    expect(ev.inspector).toBe("משה");
  });

  it("prefers inspector over contact_person", () => {
    const contract = { _id: { toString: () => "c1" }, expiry_date: "2027-01-01", status: "active" };
    const extracted = { inspector: "דני", contact_person: "משה" };
    const ev = shapeEvent(contract, extracted, TODAY);
    expect(ev.inspector).toBe("דני");
  });

  it("maps pass_fail from result when pass_fail missing", () => {
    const contract = { _id: { toString: () => "c1" }, expiry_date: "2027-01-01", status: "active" };
    const extracted = { result: "עבר" };
    const ev = shapeEvent(contract, extracted, TODAY);
    expect(ev.pass_fail).toBe("עבר");
  });

  it("sets days_until to null when expiry_date is null", () => {
    const contract = { _id: { toString: () => "c1" }, expiry_date: null, status: "active" };
    const ev = shapeEvent(contract, {}, TODAY);
    expect(ev.days_until).toBeNull();
  });

  it("sets days_until correctly for future expiry", () => {
    const contract = { _id: { toString: () => "c1" }, expiry_date: "2026-07-01", status: "active" };
    const ev = shapeEvent(contract, {}, TODAY);
    expect(ev.days_until).toBe(30);
  });
});

describe("Equipment Service History — document_id collection", () => {
  it("collects direct document_id from equipment", () => {
    const eq = { document_id: "doc1", serial_number: null };
    const docIdSet = new Set<string>();
    if (eq.document_id) docIdSet.add(eq.document_id);
    expect(docIdSet.has("doc1")).toBe(true);
  });

  it("collects sibling document_ids by serial_number", () => {
    const siblings = [
      { document_id: "doc2" },
      { document_id: "doc3" },
      { document_id: null },
    ];
    const docIdSet = new Set<string>();
    for (const s of siblings) {
      if (s.document_id) docIdSet.add(s.document_id);
    }
    expect([...docIdSet]).toEqual(["doc2", "doc3"]);
  });

  it("deduplicates when sibling has same document_id as equipment", () => {
    const docIdSet = new Set<string>(["doc1"]);
    const siblings = [{ document_id: "doc1" }, { document_id: "doc2" }];
    for (const s of siblings) {
      if (s.document_id) docIdSet.add(s.document_id);
    }
    expect([...docIdSet]).toEqual(["doc1", "doc2"]);
  });
});
