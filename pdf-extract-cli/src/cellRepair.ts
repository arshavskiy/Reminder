import {createWorker, type Worker} from "tesseract.js";
import sharp from "sharp";
import type {Config} from "./config.js";
import type {PlumberTable} from "./tableExtract.js";

// PDF fonts with a broken/missing ToUnicode CMap decode to the Unicode
// replacement character — not garbled ORDER (which hebrewBidi.ts already
// fixes) but wrong character IDENTITY, unrecoverable from the text layer.
const REPLACEMENT_CHAR_RATIO_THRESHOLD = 0.3;

function isGarbledCell(text: string): boolean {
  if (!text.trim()) return false;
  const replacementCount = (text.match(/�/g) ?? []).length;
  return replacementCount / text.length >= REPLACEMENT_CHAR_RATIO_THRESHOLD;
}

/**
 * Creates one Tesseract worker for reuse across every cell in a document.
 * Spawning a fresh worker per cell (the original implementation) is very
 * expensive — each spawn loads the OCR engine + language data from scratch,
 * which dominated runtime on documents with many garbled cells (e.g. ~27
 * cells on a real bank statement took minutes). Caller must call
 * `worker.terminate()` when done with the whole document.
 */
export async function createCellOcrWorker(config: Config): Promise<Worker> {
  const worker = await createWorker(config.ocrLanguage);
  await worker.setParameters({
    tessedit_pageseg_mode: "7" as any, // single text line — cells are short
  });
  return worker;
}

/**
 * Crop a cell's bounding box out of a rasterized page image and OCR just
 * that crop using the given (already-initialized, reused) worker. Keeps
 * OCR cost proportional to how much of the table is actually broken
 * instead of OCR'ing every page in full.
 */
async function ocrCell(
  worker: Worker,
  rasterPath: string,
  bboxPx: number[] // [x0, top, x1, bottom] already scaled to raster pixels
): Promise<string | null> {
  const pad = 4; // px margin around the crop so glyphs aren't clipped
  const [x0, top, x1, bottom] = bboxPx;
  const left = Math.max(0, Math.round(x0) - pad);
  const cropTop = Math.max(0, Math.round(top) - pad);
  const width = Math.round(x1 - x0) + pad * 2;
  const height = Math.round(bottom - top) + pad * 2;

  if (width <= 0 || height <= 0) return null;

  const cropBuffer = await sharp(rasterPath)
    .extract({ left, top: cropTop, width, height })
    .png()
    .toBuffer();

  const result = await worker.recognize(cropBuffer);
  const text = (result.data.text ?? "").trim();
  return text || null;
}

/**
 * Return a copy of the table with garbled cells replaced by OCR'd text
 * where a rasterized page image is available. Cells that aren't garbled,
 * or that fail OCR, are left as pdfplumber extracted them. `worker` is
 * created once per document (see createCellOcrWorker) and reused across
 * every table/page/cell to avoid the cost of spawning a new OCR engine
 * instance per cell.
 */
export async function repairGarbledCells(
  table: PlumberTable,
  rasterPath: string | null,
  rasterScale: number | null,
  worker: Worker
): Promise<PlumberTable> {
  if (!rasterPath || !rasterScale) return table;

  const rows = table.rows.map((row) => [...row]);
  let repairedCount = 0;

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const cell = rows[r][c];
      if (!isGarbledCell(cell)) continue;
      const bbox = table.cellBboxes[r]?.[c];
      if (!bbox) continue;

      const scaledBbox = bbox.map((v) => v * rasterScale);
      try {
        const ocrText = await ocrCell(worker, rasterPath, scaledBbox);
        if (ocrText) {
          rows[r][c] = ocrText;
          repairedCount++;
        }
      } catch (err) {
        console.warn(`[cellRepair] OCR failed for cell [${r}][${c}]: ${err}`);
      }
    }
  }

  if (repairedCount > 0) {
    console.log(`[cellRepair] Repaired ${repairedCount} garbled cell(s) via OCR`);
  }

  return { rows, cellBboxes: table.cellBboxes };
}
