import {spawnSync} from "child_process";
import {mkdtempSync, rmSync} from "fs";
import {tmpdir} from "os";
import {dirname, join} from "path";
import {fileURLToPath} from "url";
import type {Config} from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "pdfplumber_extract.py");
const TIMEOUT_MS = 60_000;

export interface PlumberTable {
  rows: string[][];
  cellBboxes: number[][][]; // [row][col] -> [x0, top, x1, bottom] in PDF points
}

export interface PlumberPage {
  width: number;
  height: number;
  rasterPath: string | null;
  rasterScale: number | null;
  text: string;
  tables: PlumberTable[];
}

export interface PlumberResult {
  text: string;
  pageCount: number;
  pages: PlumberPage[];
  needsOcr: boolean;
}

interface RawPage {
  width: number;
  height: number;
  raster_path: string | null;
  raster_scale: number | null;
  text: string;
  tables: Array<{ rows: string[][]; cell_bboxes: number[][][] }>;
}

interface RawResult {
  text: string;
  page_count: number;
  pages: RawPage[];
  needs_ocr: boolean;
  error?: string;
}

/**
 * Run pdfplumber against a PDF, optionally rasterizing each page to a PNG
 * (in a temp dir the caller must clean up) so callers can crop+OCR
 * individual table cells whose text couldn't be decoded — common with PDFs
 * using a custom subset font with a broken Hebrew ToUnicode CMap, where the
 * text layer is unrecoverable no matter how the bytes are reinterpreted.
 *
 * Returns null on failure (missing Python/pdfplumber, non-PDF input, etc.)
 * — callers should fall back to the existing pdf-parse/OCR text path.
 */
export function extractTables(
  filePath: string,
  config: Config,
  rasterizeDir?: string
): PlumberResult | null {
  const args = [SCRIPT, filePath];
  if (rasterizeDir) args.push("--rasterize", rasterizeDir);

  const result = spawnSync(config.pythonPath, args, {
    timeout: TIMEOUT_MS,
    maxBuffer: 50 * 1024 * 1024,
    encoding: "utf-8",
  });

  if (result.error || result.status !== 0) {
    const msg = result.error?.message ?? result.stderr ?? "unknown error";
    console.warn(`[tableExtract] pdfplumber failed for ${filePath}: ${msg}`);
    return null;
  }

  let parsed: RawResult;
  try {
    parsed = JSON.parse(result.stdout) as RawResult;
  } catch {
    console.warn(`[tableExtract] Failed to parse pdfplumber JSON output for ${filePath}`);
    return null;
  }

  if (parsed.error) {
    console.warn(`[tableExtract] pdfplumber error for ${filePath}: ${parsed.error}`);
    return null;
  }

  return {
    text: parsed.text,
    pageCount: parsed.page_count,
    needsOcr: parsed.needs_ocr,
    pages: parsed.pages.map((p) => ({
      width: p.width,
      height: p.height,
      rasterPath: p.raster_path,
      rasterScale: p.raster_scale,
      text: p.text,
      tables: p.tables.map((t) => ({ rows: t.rows, cellBboxes: t.cell_bboxes })),
    })),
  };
}

/** Creates a temp directory for page rasterization; caller must call cleanupTempDir(). */
export function makeTempRasterDir(): string {
  return mkdtempSync(join(tmpdir(), "pdf-extract-raster-"));
}

export function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
