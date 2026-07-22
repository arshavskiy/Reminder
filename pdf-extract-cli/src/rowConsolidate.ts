import type {PlumberTable} from "./tableExtract.js";

const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

const isBlankRow = (row: string[]) => row.every((c) => !c.trim());

const isNoiseRow = (row: string[]) => {
  const nonEmpty = row.map((c) => c.trim()).filter(Boolean);
  if (nonEmpty.length !== 1) return false;
  const value = nonEmpty[0];
  return value.length <= 3 && !DATE_RE.test(value);
};

/**
 * Bank-statement-style tables (confirmed against a real Bank Hapoalim PDF)
 * split each logical transaction across several raw pdfplumber rows: a data
 * row (date/amount/balance/description), a footnote-reference row (a lone
 * digit like "1" or "2" in one column, everything else blank), and
 * pure-noise rows (e.g. a lone "##" with everything else blank — an
 * artifact of pdfplumber's text-based table strategy picking up a stray
 * glyph as its own row, not real data). Left as-is, this can triple+ the
 * CSV row count and buries real data among near-empty rows.
 *
 * Runs per-page, on the full set of rows (no row is treated as a special
 * "header" here — that's handled separately by stripRepeatedBannerBlocks
 * after pages are merged, since every page's first few rows are a
 * per-page banner, not a header to preserve verbatim per page):
 *   1. Drop rows that are "noise" (see isNoiseRow).
 *   2. Split what's left into blocks separated by fully-blank rows.
 *   3. Merge each block into one row by taking, per column, the first
 *      non-empty value across the block.
 */
export function consolidateRows(table: PlumberTable): PlumberTable {
  if (table.rows.length === 0) return table;

  const colCount = table.rows[0]?.length ?? 0;
  const blocks: string[][][] = [];
  const blockBboxes: number[][][][] = [];
  let currentBlock: string[][] = [];
  let currentBboxBlock: number[][][] = [];

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    if (isNoiseRow(row)) continue;
    if (isBlankRow(row)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        blockBboxes.push(currentBboxBlock);
        currentBlock = [];
        currentBboxBlock = [];
      }
      continue;
    }
    currentBlock.push(row);
    currentBboxBlock.push(table.cellBboxes[i] ?? []);
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
    blockBboxes.push(currentBboxBlock);
  }

  const consolidatedRows: string[][] = [];
  const consolidatedBboxes: number[][][] = [];

  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    const mergedRow: string[] = [];
    const mergedBbox: number[][] = [];

    for (let c = 0; c < colCount; c++) {
      let value = "";
      let bbox: number[] = [];
      for (let r = 0; r < block.length; r++) {
        const cell = block[r][c]?.trim();
        if (cell) {
          value = cell;
          bbox = blockBboxes[b][r]?.[c] ?? [];
          break;
        }
      }
      mergedRow.push(value);
      mergedBbox.push(bbox);
    }

    consolidatedRows.push(mergedRow);
    consolidatedBboxes.push(mergedBbox);
  }

  return { rows: consolidatedRows, cellBboxes: consolidatedBboxes };
}

const CANDIDATE_HEADER_LABELS = ["תאריך", "פעולה", "חובה", "זכות", "יתרה", "date", "amount", "balance"];

function looksLikeHeaderRow(row: string[]): boolean {
  const joined = row.join(" ");
  return CANDIDATE_HEADER_LABELS.some((label) => joined.includes(label));
}

/**
 * After merging per-page tables into one, a repeated page banner (account
 * name, statement period, and — critically — the real column-header row)
 * appears once per original page. Keep only the FIRST occurrence of a
 * header-like row (so the CSV/HTML still has one header) and drop rows that
 * are neither header-like nor a real data row (heuristic: has at least 2
 * non-empty cells, or contains something date-shaped — a page-banner line
 * with just one or two short fragments doesn't qualify).
 */
export function stripRepeatedBannerBlocks(table: PlumberTable): PlumberTable {
  if (table.rows.length === 0) return table;

  let keptHeader = false;
  const rows: string[][] = [];
  const bboxes: number[][][] = [];

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];

    if (looksLikeHeaderRow(row)) {
      if (keptHeader) continue; // drop repeat headers from later pages
      keptHeader = true;
      rows.push(row);
      bboxes.push(table.cellBboxes[i] ?? []);
      continue;
    }

    // A real transaction row has the date in the LAST column (matches the
    // observed layout: ..., פעולה, תאריך) AND a non-numeric description in
    // the second-to-last column. A page banner can also contain a
    // date-shaped value in the last column (e.g. the statement period line
    // "... , 07/07/2025 -, 07/07/2026") but never real description text
    // next to it — that distinguishes real data from banner noise.
    const lastCell = row[row.length - 1]?.trim() ?? "";
    const secondToLastCell = row[row.length - 2]?.trim() ?? "";
    const hasDateInLastColumn = DATE_RE.test(lastCell);
    const hasDescription = secondToLastCell.length > 0 && !/^[\d.,\-\s]+$/.test(secondToLastCell);

    if (hasDateInLastColumn && hasDescription) {
      rows.push(row);
      bboxes.push(table.cellBboxes[i] ?? []);
    }
  }

  return { rows, cellBboxes: bboxes };
}
