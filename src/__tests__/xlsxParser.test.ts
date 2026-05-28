import {mkdtempSync, rmSync} from "fs";
import {join} from "path";
import {tmpdir} from "os";
import {describe, expect, it} from "vitest";
import * as XLSX from "xlsx";
import {parseXlsx} from "../pipeline/xlsxParser";

describe("parseXlsx", () => {
  it("reads workbook tables into tab-separated text", () => {
    const dir = mkdtempSync(join(tmpdir(), "reminder-xlsx-"));
    const filePath = join(dir, "sample.xlsx");

    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ["איש קשר", "נייד", "עומס עבודה בטוח (קג)"],
        ["בר", "053-8801490", "230 קג - עד 2 אנשים"],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, "תסקיר");
      XLSX.writeFile(wb, filePath);

      const text = parseXlsx(filePath);

      expect(text).toContain("=== תסקיר ===");
      expect(text).toContain("איש קשר\tנייד\tעומס עבודה בטוח (קג)");
      expect(text).toContain("בר\t053-8801490\t230 קג - עד 2 אנשים");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
