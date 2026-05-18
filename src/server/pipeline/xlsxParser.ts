import * as XLSX from "xlsx";

export function parseXlsx(filePath: string): string {
  const wb = XLSX.readFile(filePath);
  const lines: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t" });
    lines.push(`=== ${sheetName} ===`);
    lines.push(csv);
  }

  return lines.join("\n");
}
