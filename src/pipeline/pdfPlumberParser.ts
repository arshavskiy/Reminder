import {spawnSync} from "child_process";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

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

export function parsePdfWithPlumber(filePath: string): PlumberResult | null {
  const result = spawnSync("python", [SCRIPT, filePath], {
    timeout: TIMEOUT_MS,
    maxBuffer: 20 * 1024 * 1024,
    encoding: "utf-8",
  });

  if (result.error || result.status !== 0) {
    const msg = result.error?.message ?? result.stderr ?? "unknown error";
    console.warn(`[pdfplumber] Failed for ${filePath}: ${msg}`);
    return null;
  }

  try {
    return JSON.parse(result.stdout) as PlumberResult;
  } catch {
    console.warn(`[pdfplumber] JSON parse failed for ${filePath}`);
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
      const rows = table
        .map((row) => row.map((c) => c.trim()).filter(Boolean).join("\t"))
        .filter(Boolean);
      if (rows.length > 0) parts.push(rows.join("\n"));
    }
  }
  return parts.join("\n\n");
}
