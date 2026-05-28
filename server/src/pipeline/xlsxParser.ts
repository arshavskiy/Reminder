import * as XLSX from "xlsx";
import * as CFB from "cfb";
import {readFileSync} from "fs";

export function parseXlsx(filePath: string): string {
  const file = readFileSync(filePath);
  const wb = XLSX.read(file, { type: "buffer" });
  const zip = CFB.parse(file, { type: "buffer" });
  const lines: string[] = [];

  wb.SheetNames.forEach((sheetName, index) => {
    const sheet = wb.Sheets[sheetName];
    const headerFooterLines = extractWorksheetHeaderFooter(zip, index + 1);
    const keyValueLines = extractKeyValueLines(sheet);
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t" });
    lines.push(`=== ${sheetName} ===`);
    if (headerFooterLines.length) {
      lines.push("--- worksheet header/footer ---");
      lines.push(...headerFooterLines);
    }
    if (keyValueLines.length) {
      lines.push("--- detected key/value cells ---");
      lines.push(...keyValueLines);
      lines.push("--- table text ---");
    }
    lines.push(csv);
  });

  return lines.join("\n");
}

function extractWorksheetHeaderFooter(zip: CFB.CFB$Container, sheetIndex: number): string[] {
  const path = `xl/worksheets/sheet${sheetIndex}.xml`;
  const entry = CFB.find(zip, path) ?? CFB.find(zip, `/${path}`);
  if (!entry) return [];

  const xml = Buffer.from(entry.content as Uint8Array).toString("utf8");
  const lines: string[] = [];
  const blocks = [
    ["firstHeader", "header:first"],
    ["oddHeader", "header:odd"],
    ["evenHeader", "header:even"],
    ["firstFooter", "footer:first"],
    ["oddFooter", "footer:odd"],
    ["evenFooter", "footer:even"],
  ] as const;

  for (const [tag, label] of blocks) {
    const raw = extractXmlTag(xml, tag);
    if (!raw) continue;
    const cleaned = cleanHeaderFooterText(raw);
    if (!cleaned) continue;
    lines.push(`${label}: ${cleaned}`);
  }

  return lines;
}

function extractXmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  return match?.[1] ?? null;
}

function cleanHeaderFooterText(raw: string): string {
  return decodeXmlEntities(raw)
    .replace(/&"[^"]*"/g, " ")
    .replace(/&[LCRPNTZFAGSU]/g, " ")
    .replace(/&K[0-9A-Fa-f]{6}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function extractKeyValueLines(sheet: XLSX.WorkSheet): string[] {
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const label = cleanCell(row[i]);
      if (!looksLikeLabel(label)) continue;

      const value = firstValueToRight(row, i + 1);
      if (!value) continue;

      const line = `${label}: ${value}`;
      if (!seen.has(line)) {
        seen.add(line);
        lines.push(line);
      }
    }
  }

  return lines;
}

function firstValueToRight(row: string[], startIndex: number): string | null {
  for (let i = startIndex; i < row.length; i++) {
    const value = cleanCell(row[i]);
    if (value) return value;
  }
  return null;
}

function cleanCell(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function looksLikeLabel(value: string): boolean {
  if (!value || value.length > 80) return false;
  return /[:：]$/.test(value) ||
    /(מספר תסקיר|תסקיר קודם|איש קשר|נייד|טלפון|מייל|פרטי הלקוח|תופש|תאריך בדיקה|בתוקף עד|עומס עבודה בטוח)/.test(value);
}
