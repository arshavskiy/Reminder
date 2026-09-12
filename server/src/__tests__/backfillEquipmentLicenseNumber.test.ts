import {describe, expect, it} from "vitest";
import {empty, firstNonEmpty, parseFields, resolveLicenseNumber} from "../scripts/backfillEquipmentLicenseNumber";

describe("empty", () => {
  it("treats null and undefined as empty", () => {
    expect(empty(null)).toBe(true);
    expect(empty(undefined)).toBe(true);
  });

  it("treats whitespace-only strings as empty", () => {
    expect(empty("   ")).toBe(true);
    expect(empty("")).toBe(true);
  });

  it("treats a real value as non-empty", () => {
    expect(empty("80327-8")).toBe(false);
    expect(empty(0)).toBe(false);
  });
});

describe("firstNonEmpty", () => {
  it("returns the first non-empty value, trimmed", () => {
    expect(firstNonEmpty(null, "  ", "  80327-8  ", "fallback")).toBe("80327-8");
  });

  it("returns null when every value is empty", () => {
    expect(firstNonEmpty(null, undefined, "", "   ")).toBeNull();
  });

  it("coerces non-string values to strings", () => {
    expect(firstNonEmpty(null, 12345)).toBe("12345");
  });
});

describe("parseFields", () => {
  it("returns an empty object for null/undefined input", () => {
    expect(parseFields(null)).toEqual({});
    expect(parseFields(undefined)).toEqual({});
  });

  it("passes through an already-parsed object", () => {
    expect(parseFields({license_number: "123"})).toEqual({license_number: "123"});
  });

  it("parses a JSON string", () => {
    expect(parseFields('{"license_number":"80327-8"}')).toEqual({license_number: "80327-8"});
  });

  it("returns an empty object for malformed JSON", () => {
    expect(parseFields("not json")).toEqual({});
  });
});

describe("resolveLicenseNumber", () => {
  it("prefers the structured _equipment[0].license_number", () => {
    const fields = {
      _equipment: [{license_number: "80327-8"}],
      license_number: "999",
    };
    expect(resolveLicenseNumber(fields)).toBe("80327-8");
  });

  it("falls back to the flat license_number field when _equipment is missing it", () => {
    const fields = {
      _equipment: [{}],
      license_number: "483067",
    };
    expect(resolveLicenseNumber(fields)).toBe("483067");
  });

  it("falls back to the legacy misspelled lisence_number field", () => {
    const fields = {lisence_number: "20676604"};
    expect(resolveLicenseNumber(fields)).toBe("20676604");
  });

  it("returns null when no field has a usable value", () => {
    const fields = {_equipment: [{license_number: ""}], license_number: null};
    expect(resolveLicenseNumber(fields)).toBeNull();
  });

  it("returns null for a document with no equipment/license data at all", () => {
    expect(resolveLicenseNumber({})).toBeNull();
  });

  it("preserves hyphenated license number formats", () => {
    expect(resolveLicenseNumber({license_number: "80327-8"})).toBe("80327-8");
  });

  it("preserves internal (פנימי) license number formats", () => {
    expect(resolveLicenseNumber({license_number: "פנימי 108"})).toBe("פנימי 108");
  });
});
