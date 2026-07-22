/**
 * Table extraction (pdfplumber) and raw text extraction (pdf-parse/OCR) run
 * independently over the same PDF, so a transaction that appears as a
 * structured table row also shows up verbatim as a line in the raw text —
 * duplicating every table row in the "Extracted text" section. This strips
 * text lines that are already represented by a table row.
 */

function normalize(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/[.,:;!?()[\]{}<>\/\\"'`~+\-=*_]/g, "")
    .toLowerCase();
}

export function dedupTextAgainstTables(text: string, tables: string[][][]): string {
  const cellSet = new Set<string>();
  const rowSet = new Set<string>();

  for (const table of tables) {
    for (const row of table) {
      const cells = row.map((c) => normalize(c)).filter((c) => c.length >= 3);
      for (const c of cells) cellSet.add(c);
      if (cells.length > 0) rowSet.add(cells.join(""));
    }
  }

  if (rowSet.size === 0 && cellSet.size === 0) return text;

  const lines = text.split(/\r?\n/);
  const kept = lines.filter((line) => {
    const norm = normalize(line);
    if (!norm) return true; // keep blank lines as-is (collapsed later if needed)
    if (rowSet.has(norm)) return false;
    // A line that's just one table cell's content (e.g. a lone amount or
    // date pulled out on its own raw-text line) is also redundant.
    if (cellSet.has(norm) && norm.length >= 4) return false;
    return true;
  });

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
