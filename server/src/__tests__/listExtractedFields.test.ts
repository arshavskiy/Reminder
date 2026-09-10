import {describe, expect, it} from "vitest";
import {LIST_EXTRACTED_FIELD_KEYS, slimExtractedFieldsForList} from "../documents/listExtractedFields";

describe("slimExtractedFieldsForList", () => {
  it("keeps the keys the documents table renders", () => {
    const input = JSON.stringify({
      report_number: "48192/3001",
      client_company: 'מרדכי זבאי בע"מ',
      expiry_date: "2027-03-09",
      contact_email: "office@example.com",
    });
    expect(JSON.parse(slimExtractedFieldsForList(input) as string)).toEqual({
      report_number: "48192/3001",
      client_company: 'מרדכי זבאי בע"מ',
      expiry_date: "2027-03-09",
      contact_email: "office@example.com",
    });
  });

  it("drops the detail-only keys that made the list response large", () => {
    const input = JSON.stringify({
      report_number: "1",
      checked_equipment: "…a long block…",
      equipment_description: "…another…",
      _confidence: {report_number: 0.9},
      findings: ["a", "b"],
    });
    const out = JSON.parse(slimExtractedFieldsForList(input) as string);
    expect(out).toEqual({report_number: "1"});
    for (const key of ["checked_equipment", "equipment_description", "_confidence", "findings"]) {
      expect(key in out).toBe(false);
    }
  });

  it("preserves the stored shape: a string stays a string, an object stays an object", () => {
    // Rows hold this as a JSON string, but one production row is a plain object
    // and the client parses either — so the shape has to survive untouched.
    expect(typeof slimExtractedFieldsForList(JSON.stringify({report_number: "1"}))).toBe("string");
    const asObject = slimExtractedFieldsForList({report_number: "1", findings: []});
    expect(typeof asObject).toBe("object");
    expect(asObject).toEqual({report_number: "1"});
  });

  it("passes through values it cannot parse rather than dropping data", () => {
    expect(slimExtractedFieldsForList(null)).toBe(null);
    expect(slimExtractedFieldsForList(undefined)).toBe(undefined);
    expect(slimExtractedFieldsForList("not json")).toBe("not json");
    expect(slimExtractedFieldsForList("[1,2]")).toBe("[1,2]");
  });

  it("covers every key the report-number column falls back through", () => {
    // documentReportNumberLabel reads these three in order; losing any one
    // would blank the מספר column for a slice of rows.
    for (const key of ["report_number", "document_number", "contract_number"]) {
      expect(LIST_EXTRACTED_FIELD_KEYS).toContain(key);
    }
  });

  it("covers every key the client-name fallback reads", () => {
    for (const key of ["client_company", "client_name", "company", "counterparty", "contact_person"]) {
      expect(LIST_EXTRACTED_FIELD_KEYS).toContain(key);
    }
  });
});
