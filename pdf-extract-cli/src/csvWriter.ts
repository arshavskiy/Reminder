/** RFC 4180 field escaping: quote if it contains a comma, quote, or newline. */
function escapeCsvField(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function tableToCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n") + "\r\n";
}

// Excel's CSV importer ignores the file's actual encoding and guesses based
// on the system codepage unless the file starts with a UTF-8 byte-order
// mark — without it, Hebrew (and any non-ASCII) text renders as mojibake
// even though the file itself is valid UTF-8. Must be the very first bytes
// of the file, so this is applied once at the top level, not per-table.
const UTF8_BOM = "﻿";

export function joinCsvTables(tables: string[][][]): string {
  return UTF8_BOM + tables.map(tableToCsv).join("\r\n");
}
