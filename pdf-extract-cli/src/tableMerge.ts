import type {PlumberTable} from "./tableExtract.js";

/**
 * Multi-page documents like a paginated bank statement produce one
 * pdfplumber table per page. Merge consecutive per-page tables into a
 * single logical table so the CSV/HTML isn't split into N disconnected
 * fragments.
 *
 * Column boundaries are already normalized across pages by
 * pdfplumber_extract.py (see COLUMN_BOUNDARY_TOLERANCE / _rebucket_table
 * there), so tables sharing the same column count can be merged directly —
 * exact header-text matching isn't reliable here: the first row of each
 * per-page table is typically page banner/metadata text that legitimately
 * varies slightly between pages (a phone number wrapping differently, for
 * instance), not the real column header. Row-level noise (page banners,
 * footnote-marker rows) is filtered separately by rowConsolidate.ts, which
 * runs before this.
 */
export function mergeTablesAcrossPages(perPageTables: PlumberTable[][]): PlumberTable[] {
  const merged: PlumberTable[] = [];

  for (const pageTables of perPageTables) {
    for (const table of pageTables) {
      const colCount = table.rows[0]?.length ?? 0;
      const prev = merged[merged.length - 1];
      const prevColCount = prev?.rows[0]?.length ?? -1;

      if (prev && colCount > 0 && colCount === prevColCount) {
        prev.rows.push(...table.rows);
        prev.cellBboxes.push(...table.cellBboxes);
      } else {
        merged.push({ rows: [...table.rows], cellBboxes: [...table.cellBboxes] });
      }
    }
  }

  return merged;
}
