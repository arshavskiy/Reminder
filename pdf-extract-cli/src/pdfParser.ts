import pdfParse from "pdf-parse";
import {readFileSync} from "fs";
import {fixHebrewBidi} from "./hebrewBidi.js";

// Hebrew Unicode range: U+0590–U+05FF
const HEBREW_RE = /[֐-׿]/g;

/**
 * Strip every character that's not Hebrew, Latin, a digit, whitespace, or
 * common punctuation. This removes the Armenian / Private-Use / Braille
 * "garbage" glyphs that pdf-parse emits when a PDF uses a custom CID-encoded
 * Hebrew font without a ToUnicode CMap. The pipe "|" is excluded — it only
 * ever shows up as an OCR/extraction artifact around Hebrew text, never as
 * intentional content.
 */
const KEEP_RE = /[֐-׿A-Za-z0-9\s.,:;!?@#%&()\[\]{}<>\/\\"'`~+\-=*_]/g;

export function stripGarbage(text: string): string {
  const kept = text.match(KEEP_RE);
  if (!kept) return "";
  return kept
    .join("")
    .replace(/�-?/g, "") // replacement char, optionally followed by a stray "-"
    .replace(/,\./g, "") // OCR junk sequence
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
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

/**
 * Thrown for PDFs that no fallback can recover from — e.g. password-protected
 * files. Tesseract OCR can't read an encrypted PDF stream any better than
 * pdf-parse can, so falling back to OCR for these just trades one failure
 * for a slower, more confusing one (or an engine crash). Callers should
 * treat this as terminal for the file, not retry via OCR.
 */
export class UnrecoverablePdfError extends Error {}

const PDF_PARSE_TIMEOUT_MS = 30_000;

export async function parsePdf(filePath: string): Promise<PdfResult> {
  const buffer = readFileSync(filePath);

  let data: Awaited<ReturnType<typeof pdfParse>>;
  try {
    data = await Promise.race([
      pdfParse(buffer),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("pdf-parse timed out after 30s")), PDF_PARSE_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/password/i.test(message)) {
      throw new UnrecoverablePdfError(
        "PDF is password-protected — cannot extract text or run OCR on it."
      );
    }
    console.warn(`[pdfParser] pdf-parse failed (${err}), falling back to OCR`);
    return { text: "", pageCount: 0, needsOcr: true, reason: `pdf-parse error: ${err}` };
  }

  const rawText = data.text ?? "";
  const pageCount = data.numpages ?? 0;

  let text = stripGarbage(rawText);
  text = fixHebrewBidi(text);

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
  } else if (trimmedLen > 0 && heRatio < 0.05 && trimmedLen < 300) {
    needsOcr = true;
    reason = "sparse Hebrew after garbage strip — likely scanned table document";
  }

  if (needsOcr) {
    console.warn(`[pdfParser] Will fall back to OCR: ${reason}`);
  }

  const stripped = rawText.length - text.length;
  if (stripped > 50) {
    console.log(
      `[pdfParser] Stripped ${stripped} non-Hebrew/Latin chars from PDF text ` +
        `(${rawText.length} → ${text.length})`
    );
  }

  return { text, pageCount, needsOcr, reason };
}
