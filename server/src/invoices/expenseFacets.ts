/**
 * Facet options for the expense analytics page.
 *
 * A facet must never be narrowed by the filter it populates. If the category
 * options are built from rows that were already filtered by category, then
 * picking a category leaves it as the only selectable option and the user
 * cannot switch or clear it from the dropdown.
 */

export type ExpenseFacetRow = {
  supplier_name?: string | null;
  provider_category?: string | null;
};

const DEFAULT_CATEGORY = "general";

/**
 * "חשבונות הבית" replaced the separate electricity, water, gas, telecom and
 * municipality categories. Rows saved before the merge still carry the old
 * value until backfillHouseholdCategory runs, so they are read as household.
 */
export const HOUSEHOLD_CATEGORY = "household";
export const LEGACY_HOUSEHOLD_CATEGORIES = ["electricity", "water", "gas", "telecom", "municipality"];

export function normalizeProviderCategory<T extends string | null | undefined>(category: T): T | typeof HOUSEHOLD_CATEGORY {
  return LEGACY_HOUSEHOLD_CATEGORIES.includes(String(category ?? "")) ? HOUSEHOLD_CATEGORY : category;
}

/** Whether a row's category passes a category filter (old household values count as household). */
export function matchesCategoryFilter(category: string | null | undefined, filter: string): boolean {
  if (!filter) return true;
  return (normalizeProviderCategory(category) ?? null) === filter;
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((a, b) =>
    a.localeCompare(b, "he", { sensitivity: "base" }),
  );
}

/** Rows to build category options from: every filter applied except category. */
export function categoryFacetRows<T extends ExpenseFacetRow>(rows: T[], suppliers: string[]): T[] {
  if (!suppliers.length) return rows;
  return rows.filter((row) => suppliers.includes(row.supplier_name ?? ""));
}

/** Rows to build supplier options from: every filter applied except supplier. */
export function supplierFacetRows<T extends ExpenseFacetRow>(rows: T[], category: string): T[] {
  if (!category) return rows;
  return rows.filter((row) => matchesCategoryFilter(row.provider_category, category));
}

export function categoryFacetValues(rows: ExpenseFacetRow[]): string[] {
  return sortUnique(rows.map((row) => normalizeProviderCategory(row.provider_category) || DEFAULT_CATEGORY));
}

export function supplierFacetValues(rows: ExpenseFacetRow[]): string[] {
  return sortUnique(rows.map((row) => row.supplier_name ?? ""));
}
