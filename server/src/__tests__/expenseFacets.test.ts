import {describe, expect, it} from "vitest";
import {
  categoryFacetRows,
  categoryFacetValues,
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
