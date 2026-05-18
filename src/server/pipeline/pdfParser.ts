import pdfParse from "pdf-parse";
import { readFileSync } from "fs";
import { fixHebrewBidi } from "./hebrewBidi.js";

// Hebrew Unicode range: U+0590–U+05FF
const HEBREW_RE = /[֐-׿]/g;

function hebrewRatio(text: string): number {
  if (!text.length) return 0;
  const matches = text.match(HEBREW_RE);
  return (matches?.length ?? 0) / text.length;
}

export interface PdfResult {
  text: string;
  pageCount: number;
  needsOcr: boolean;
}

export async function parsePdf(filePath: string): Promise<PdfResult> {
  const buffer = readFileSync(filePath);
  const data = await pdfParse(buffer);
  let text = data.text ?? "";
  const pageCount = data.numpages ?? 0;

  // Many Hebrew PDFs emit text in visual (right-to-left rendered) order.
  // Detect and fix so the saved raw_text is in logical order.
  text = fixHebrewBidi(text);

  // If extracted text is very short or has no Hebrew/Latin — likely scanned PDF
  const needsOcr = text.trim().length < 100 || hebrewRatio(text) < 0.02;

  return { text, pageCount, needsOcr };
}
