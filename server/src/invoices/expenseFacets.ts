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
  return rows.filter((row) => (row.provider_category ?? null) === category);
}

export function categoryFacetValues(rows: ExpenseFacetRow[]): string[] {
  return sortUnique(rows.map((row) => row.provider_category || DEFAULT_CATEGORY));
}

export function supplierFacetValues(rows: ExpenseFacetRow[]): string[] {
  return sortUnique(rows.map((row) => row.supplier_name ?? ""));
}
