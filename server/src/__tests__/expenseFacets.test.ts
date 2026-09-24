import {describe, expect, it} from "vitest";
import {
  categoryFacetRows,
  categoryFacetValues,
  HOUSEHOLD_CATEGORY,
  matchesCategoryFilter,
  normalizeProviderCategory,
  supplierFacetRows,
  supplierFacetValues,
} from "../invoices/expenseFacets";

// Mirrors the real data that exposed the bug: GitHub receipts resolve to the
// "development" category via the provider table, alongside other suppliers.
const rows = [
  { supplier_name: "GitHub, Inc.", provider_category: "development" },
  { supplier_name: "GitHub, Inc.", provider_category: "development" },
  { supplier_name: "Anthropic, PBC", provider_category: "development" },
  { supplier_name: "Railway Corporation", provider_category: "digital" },
  { supplier_name: "Vercel Inc.", provider_category: null },
];

describe("categoryFacetRows", () => {
  it("keeps every category when a category is selected", () => {
    // The category filter must not feed the category options.
    const options = categoryFacetValues(categoryFacetRows(rows, []));

    expect(options).toContain("development");
    expect(options).toContain("digital");
  });

  it("still narrows by the supplier filter", () => {
    const options = categoryFacetValues(categoryFacetRows(rows, ["Railway Corporation"]));

    expect(options).toEqual(["digital"]);
  });

  it("buckets an unset category as general rather than dropping the row", () => {
    const options = categoryFacetValues(categoryFacetRows(rows, ["Vercel Inc."]));

    expect(options).toEqual(["general"]);
  });
});

describe("supplierFacetRows", () => {
  it("keeps every supplier when suppliers are selected", () => {
    const options = supplierFacetValues(supplierFacetRows(rows, ""));

    expect(options).toContain("GitHub, Inc.");
    expect(options).toContain("Vercel Inc.");
  });

  it("still narrows by the category filter", () => {
    const options = supplierFacetValues(supplierFacetRows(rows, "development"));

    expect(options).toEqual(["Anthropic, PBC", "GitHub, Inc."]);
  });

  it("deduplicates repeated suppliers", () => {
    const options = supplierFacetValues(supplierFacetRows(rows, "development"));

    expect(options.filter((name) => name === "GitHub, Inc.")).toHaveLength(1);
  });
});

describe("household bills category", () => {
  // Saved before the merge: old values must read as household until backfilled.
  const bills = [
    { supplier_name: "IEC", provider_category: "electricity" },
    { supplier_name: "Mei Avivim", provider_category: "water" },
    { supplier_name: "Bezeq", provider_category: "household" },
    { supplier_name: "Pharmacy", provider_category: "healthcare" },
  ];

  it("reads the old electricity/water/gas/telecom/municipality values as household", () => {
    expect(normalizeProviderCategory("electricity")).toBe(HOUSEHOLD_CATEGORY);
    expect(normalizeProviderCategory("municipality")).toBe(HOUSEHOLD_CATEGORY);
    expect(normalizeProviderCategory("healthcare")).toBe("healthcare");
    expect(normalizeProviderCategory(null)).toBe(null);
  });

  it("offers one household option instead of the old categories", () => {
    expect(categoryFacetValues(bills)).toEqual(["healthcare", "household"]);
  });

  it("filters old and new household rows together", () => {
    expect(matchesCategoryFilter("electricity", HOUSEHOLD_CATEGORY)).toBe(true);
    expect(matchesCategoryFilter("household", HOUSEHOLD_CATEGORY)).toBe(true);
    expect(matchesCategoryFilter("healthcare", HOUSEHOLD_CATEGORY)).toBe(false);
    expect(matchesCategoryFilter("water", "")).toBe(true);
    expect(supplierFacetValues(supplierFacetRows(bills, HOUSEHOLD_CATEGORY))).toEqual(["Bezeq", "IEC", "Mei Avivim"]);
  });
});
