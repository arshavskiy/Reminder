import {describe, expect, it} from "vitest";
import * as XLSX from "xlsx";

// ── XLSX parsing helpers (mirrors import-xlsx/preview route logic) ─────────────

function parseXlsxBuffer(buffer: Buffer): { headers: string[]; dataRows: string[][] } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  const headers: string[] = (rawRows[0] ?? []).map((h: any) => String(h ?? "").trim());
  const dataRows = (rawRows.slice(1) as string[][]).filter((r) => r.some((c: any) => String(c ?? "").trim()));
  return { headers, dataRows };
}

function applyMapping(row: string[], headers: string[], mapping: Record<string, string>): Record<string, string> {
  const get = (field: string): string => {
    const col = mapping[field];
    if (!col) return "";
    const idx = headers.indexOf(col);
    return idx >= 0 ? String(row[idx] ?? "").trim() : "";
  };
  const result: Record<string, string> = {};
  for (const key of Object.keys(mapping)) {
    const val = get(key);
    if (val) result[key] = val;
  }
  return result;
}

function makeXlsxBuffer(rows: string[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "ציוד");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── dedup logic ────────────────────────────────────────────────────────────────

function dedup(rows: Array<{ serial_number: string; name: string }>, existing: string[]): { created: typeof rows; skipped: number } {
  const existingSet = new Set(existing);
  const created: typeof rows = [];
  let skipped = 0;
  for (const row of rows) {
    if (!row.name) { skipped++; continue; }
    if (row.serial_number && existingSet.has(row.serial_number)) { skipped++; continue; }
    created.push(row);
  }
  return { created, skipped };
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("XLSX Import — preview parsing", () => {
  it("extracts headers from first row", () => {
    const buf = makeXlsxBuffer([
      ["שם הציוד", "מספר סידורי", "יצרן"],
      ["עגורן", "CR-001", "MANITOU"],
    ]);
    const { headers } = parseXlsxBuffer(buf);
    expect(headers).toEqual(["שם הציוד", "מספר סידורי", "יצרן"]);
  });

  it("counts data rows (excludes header)", () => {
    const buf = makeXlsxBuffer([
      ["שם הציוד", "יצרן"],
      ["עגורן", "MANITOU"],
      ["מנוף", "LIEBHERR"],
    ]);
    const { dataRows } = parseXlsxBuffer(buf);
    expect(dataRows).toHaveLength(2);
  });

  it("filters out completely empty rows", () => {
    const buf = makeXlsxBuffer([
      ["שם הציוד", "יצרן"],
      ["עגורן", "MANITOU"],
      ["", ""],
      ["מנוף", ""],
    ]);
    const { dataRows } = parseXlsxBuffer(buf);
    expect(dataRows).toHaveLength(2);
  });

  it("returns first 5 rows as preview", () => {
    const rows: string[][] = [["שם הציוד"]];
    for (let i = 1; i <= 8; i++) rows.push([`ציוד ${i}`]);
    const buf = makeXlsxBuffer(rows);
    const { dataRows } = parseXlsxBuffer(buf);
    const preview = dataRows.slice(0, 5);
    expect(preview).toHaveLength(5);
  });
});

describe("XLSX Import — column mapping", () => {
  it("maps columns by header name", () => {
    const headers = ["שם הציוד", "מספר סידורי", "יצרן"];
    const row = ["עגורן", "CR-001", "MANITOU"];
    const mapping = { name: "שם הציוד", serial_number: "מספר סידורי", manufacturer: "יצרן" };
    const result = applyMapping(row, headers, mapping);
    expect(result.name).toBe("עגורן");
    expect(result.serial_number).toBe("CR-001");
    expect(result.manufacturer).toBe("MANITOU");
  });

  it("returns empty string for unmapped fields", () => {
    const headers = ["שם הציוד"];
    const row = ["עגורן"];
    const mapping = { name: "שם הציוד", model: "" }; // model not mapped
    const result = applyMapping(row, headers, mapping);
    expect(result.model).toBeUndefined(); // empty string filtered out
  });

  it("handles missing column gracefully", () => {
    const headers = ["שם הציוד"];
    const row = ["עגורן"];
    const mapping = { name: "עמודה לא קיימת" };
    const result = applyMapping(row, headers, mapping);
    expect(result.name).toBeUndefined();
  });
});

describe("XLSX Import — deduplication", () => {
  it("skips rows with duplicate serial_number", () => {
    const { created, skipped } = dedup(
      [
        { serial_number: "SN-001", name: "עגורן" },
        { serial_number: "SN-002", name: "מנוף" },
      ],
      ["SN-001"]
    );
    expect(created).toHaveLength(1);
    expect(created[0].serial_number).toBe("SN-002");
    expect(skipped).toBe(1);
  });

  it("skips rows with empty name", () => {
    const { created, skipped } = dedup(
      [{ serial_number: "SN-X", name: "" }],
      []
    );
    expect(created).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("allows rows without serial_number even if others have duplicates", () => {
    const { created } = dedup(
      [
        { serial_number: "", name: "ציוד ללא מ״ס" },
        { serial_number: "SN-001", name: "כפול" },
      ],
      ["SN-001"]
    );
    expect(created).toHaveLength(1);
    expect(created[0].name).toBe("ציוד ללא מ״ס");
  });
});
