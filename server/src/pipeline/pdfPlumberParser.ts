import {spawnSync} from "child_process";
import {dirname, join} from "path";
import {fileURLToPath} from "url";
import {fixHebrewBidiTable} from "./hebrewBidi";
import {logger} from "../logger";
import {pythonCommand} from "./systemDeps";

export interface PlumberResult {
  text: string;
  pageCount: number;
  tables: string[][][][];  // [page][table][row][cell]
  needsOcr: boolean;
  method: "pdfplumber";
  error?: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "pdfplumber_extract.py");
const TIMEOUT_MS = 30_000;

type RawPlumberResult = {
  text?: string;
  tables?: string[][][][];
  error?: string;
  needs_ocr?: boolean;
  needsOcr?: boolean;
  page_count?: number;
  pageCount?: number;
  method?: string;
};

export function parsePdfWithPlumber(filePath: string): PlumberResult | null {
  const result = spawnSync(pythonCommand(), [SCRIPT, filePath], {
    timeout: TIMEOUT_MS,
    maxBuffer: 20 * 1024 * 1024,
    encoding: "utf-8",
    env: {...process.env, PYTHONIOENCODING: "utf-8"},
  });

  if (result.error || result.status !== 0) {
    const msg = result.error?.message ?? result.stderr ?? "unknown error";
    logger.warn("pdfplumber_failed", {file_path: filePath, error: msg});
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout) as RawPlumberResult;
    if (parsed.error) {
      logger.warn("pdfplumber_failed", {file_path: filePath, error: parsed.error});
      return null;
    }
    return {
      text: parsed.text ?? "",
      pageCount: parsed.page_count ?? parsed.pageCount ?? 0,
      tables: parsed.tables ?? [],
      needsOcr: parsed.needs_ocr ?? parsed.needsOcr ?? false,
      method: "pdfplumber",
    };
  } catch {
    logger.warn("pdfplumber_json_failed", {file_path: filePath});
    return null;
  }
}

/**
 * Flatten extracted tables into a text block appended after the main text.
 * Each table row becomes a tab-separated line, tables separated by blank lines.
 * This lets the AI extractor see structured rows even from CID-encoded PDFs.
 */
export function tablesToText(tables: string[][][][]): string {
  const parts: string[] = [];
  for (const pageTables of tables) {
    for (const table of pageTables) {
      const fixed = fixHebrewBidiTable(table);
      const rows = fixed
        .map((row) => row.map((c) => c.trim()).filter(Boolean).join("\t"))
        .filter(Boolean);
      if (rows.length > 0) parts.push(rows.join("\n"));
    }
  }
  return parts.join("\n\n");
}

/** Append column-aligned plumber tables so equipment rows survive pdf-parse fusion. */
export function enrichTextWithPlumberTables(filePath: string, text: string): string {
  const parsed = parsePdfWithPlumber(filePath);
  if (!parsed) return text;
  const tableText = tablesToText(parsed.tables);
  if (!tableText) return text;
  if (!text.trim()) return tableText;
  if (text.includes(tableText)) return text;
  return `${text.trim()}\n\n${tableText}`;
}
