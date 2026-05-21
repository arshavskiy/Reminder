import pdfParse from "pdf-parse";
import { readFileSync } from "fs";
import { fixHebrewBidi } from "./hebrewBidi";

// Hebrew Unicode range: U+0590–U+05FF
const HEBREW_RE = /[֐-׿]/g;

/**
 * Strip every character that's not Hebrew, Latin, a digit, whitespace, or
 * common punctuation. This removes the Armenian / Private-Use / Braille
 * "garbage" glyphs that pdf-parse emits when a PDF uses a custom CID-encoded
 * Hebrew font without a ToUnicode CMap.
 *
 * Kept characters:
 *   - Hebrew letters + niqqud + Hebrew punctuation: U+0590..U+05FF
 *   - ASCII Latin letters + digits
 *   - Whitespace
 *   - Common ASCII punctuation: . , : ; ! ? @ # % & ( ) [ ] { } < > / \ | " ' ` ~ + - = * _
 */
const KEEP_RE = /[֐-׿A-Za-z0-9\s.,:;!?@#%&()\[\]{}<>\/\\|"'`~+\-=*_]/g;

function stripGarbage(text: string): string {
  const kept = text.match(KEEP_RE);
  if (!kept) return "";
  return kept
    .join("")
    .replace(/[ \t]+/g, " ")      // collapse runs of spaces/tabs
    .replace(/ ?\n ?/g, "\n")     // tidy spaces around newlines
    .replace(/\n{3,}/g, "\n\n")   // collapse 3+ newlines
    .trim();
}

function ratio(re: RegExp, text: string): number {
  if (!text.length) return 0;
  const matches = text.match(re);
  return (matches?.length ?? 0) / text.length;
}

export interface PdfResult {
  text: string;
  pageCount: number;
  needsOcr: boolean;
  reason?: string;
}

export async function parsePdf(filePath: string): Promise<PdfResult> {
  const buffer = readFileSync(filePath);
  const data = await pdfParse(buffer);
  const rawText = data.text ?? "";
  const pageCount = data.numpages ?? 0;

  // 1. Strip non-Hebrew/Latin glyph garbage (Armenian/PUA/Braille/etc.)
  let text = stripGarbage(rawText);

  // 2. Reverse visually-ordered Hebrew runs back to logical order
  text = fixHebrewBidi(text);

  // 3. Decide whether the result is still too poor and OCR would help
  const trimmedLen = text.trim().length;
  const heRatio = ratio(HEBREW_RE, text);

  let needsOcr = false;
  let reason: string | undefined;

  if (trimmedLen < 100) {
    needsOcr = true;
    reason = "text too short — probably scanned PDF";
  } else if (heRatio < 0.02 && trimmedLen < 500) {
    needsOcr = true;
    reason = "almost no Hebrew or Latin text after cleanup";
  }

  if (needsOcr) {
    console.warn(`[pdfParser] Will fall back to OCR: ${reason}`);
  }

  // Diagnostic: how much was stripped?
  const stripped = rawText.length - text.length;
  if (stripped > 50) {
    console.log(
      `[pdfParser] Stripped ${stripped} non-Hebrew/Latin chars from PDF text ` +
        `(${rawText.length} → ${text.length})`
    );
  }

  return { text, pageCount, needsOcr, reason };
}
