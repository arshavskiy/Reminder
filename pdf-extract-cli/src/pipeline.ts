import {basename, extname} from "path";
import {parsePdf} from "./pdfParser.js";
import {ocrFile} from "./ocrParser.js";
import {askAboutDocument} from "./ask.js";
import {cleanupTempDir, extractTables, makeTempRasterDir, type PlumberPage, type PlumberTable} from "./tableExtract.js";
import {createCellOcrWorker, repairGarbledCells} from "./cellRepair.js";
import {consolidateRows, stripRepeatedBannerBlocks} from "./rowConsolidate.js";
import {mergeTablesAcrossPages} from "./tableMerge.js";
import {joinCsvTables} from "./csvWriter.js";
import {toHtml} from "./htmlWriter.js";
import {dedupTextAgainstTables} from "./dedupText.js";
import type {AskRun} from "./types.js";
import type {Config} from "./config.js";

/**
 * Repairs garbled cells across every page's table(s) using a single
 * Tesseract worker created once and reused for the whole document —
 * spawning a fresh worker per cell reloads the OCR engine + language data
 * from scratch each time, which dominated runtime on documents with many
 * garbled cells (e.g. ~27 cells on a real bank statement took minutes).
 * Only created at all if the document actually has a table to repair.
 */
async function repairAllPages(pages: PlumberPage[], config: Config): Promise<PlumberTable[][]> {
  const hasAnyTable = pages.some((p) => p.tables.length > 0);
  if (!hasAnyTable) return pages.map((p) => p.tables);

  const ocrWorker = await createCellOcrWorker(config);
  try {
    const repairedPerPage: PlumberTable[][] = [];
    for (const page of pages) {
      const repairedTables: PlumberTable[] = [];
      for (const table of page.tables) {
        const repaired = await repairGarbledCells(table, page.rasterPath, page.rasterScale, ocrWorker);
        repairedTables.push(consolidateRows(repaired));
      }
      repairedPerPage.push(repairedTables);
    }
    return repairedPerPage;
  } finally {
    await ocrWorker.terminate().catch(() => {});
  }
}

export interface PipelineResult {
  file: string;
  rawTextChars: number;
  usedOcr: boolean;
  ocrReason?: string;
  text: string;
  answer: AskRun | null; // null unless a question was asked
  csv: string | null; // merged table as CSV, null if no table detected
  csvRowCount: number; // 0 if no table
  html: string;
}

export interface PipelineOptions {
  question?: string;
  model?: string;
  verbose?: boolean;
  skipTables?: boolean; // skip pdfplumber/table detection (e.g. Python unavailable)
}

export async function runPipeline(
  filePath: string,
  config: Config,
  opts: PipelineOptions = {}
): Promise<PipelineResult> {
  const ext = extname(filePath).toLowerCase();
  if (ext !== ".pdf") {
    throw new Error(`Unsupported file type "${ext}" — this CLI only handles .pdf files`);
  }

  let text: string;
  let usedOcr = false;
  let ocrReason: string | undefined;

  const parsed = await parsePdf(filePath);
  if (parsed.needsOcr) {
    if (opts.verbose) {
      console.log(`[pipeline] ${filePath}: falling back to OCR (${parsed.reason})`);
    }
    usedOcr = true;
    ocrReason = parsed.reason;
    text = await ocrFile(filePath, config);
  } else {
    text = parsed.text;
  }

  // Table detection is independent of the text/OCR path above — it runs
  // its own extraction via pdfplumber rather than reusing `text`, since
  // pdfplumber's layout-aware table detection needs the PDF file directly.
  let csv: string | null = null;
  let csvRowCount = 0;
  let tablesForHtml: string[][][] = [];

  if (!opts.skipTables) {
    let rasterDir: string | null = null;
    try {
      rasterDir = makeTempRasterDir();
      const plumberResult = extractTables(filePath, config, rasterDir);

      if (plumberResult) {
        const repairedPerPage = await repairAllPages(plumberResult.pages, config);
        const merged = mergeTablesAcrossPages(repairedPerPage).map(stripRepeatedBannerBlocks);
        tablesForHtml = merged.map((t) => t.rows);
        if (merged.length > 0) {
          csv = joinCsvTables(merged.map((t) => t.rows));
          csvRowCount = merged.reduce((sum, t) => sum + Math.max(0, t.rows.length - 1), 0);
        }
      }
    } catch (err) {
      console.warn(`[pipeline] Table extraction failed for ${filePath}: ${err}`);
    } finally {
      if (rasterDir) cleanupTempDir(rasterDir);
    }
  }

  if (tablesForHtml.length > 0) {
    text = dedupTextAgainstTables(text, tablesForHtml);
  }

  const html = toHtml({ fileName: basename(filePath), text, tables: tablesForHtml });

  let answer: AskRun | null = null;
  if (opts.question) {
    answer = await askAboutDocument(text, opts.question, config, opts.model);
  }

  return {
    file: filePath,
    rawTextChars: text.length,
    usedOcr,
    ocrReason,
    text,
    answer,
    csv,
    csvRowCount,
    html,
  };
}
