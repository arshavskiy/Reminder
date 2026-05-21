// Fixes Hebrew text that PDFs store in visual (right-to-left rendered) order
// instead of logical order. Many Hebrew PDFs emit characters in the order they
// appear visually on the page — so when read left-to-right by pdf-parse, words
// come out reversed ("ןולמ" instead of "מלון").
//
// Strategy:
//   - Process line by line (line breaks are stable in both orders)
//   - Within each line, identify Hebrew runs (sequences of Hebrew letters +
//     adjacent punctuation/digits) and reverse each run's character order
//   - Latin-alphabet runs and standalone numbers are left as-is

const HEBREW_CHAR = /[֐-׿]/;
const LATIN_CHAR = /[A-Za-z]/;
// "Neutral" chars that belong to whichever run they're adjacent to:
// digits, punctuation, whitespace within a word
const NEUTRAL = /[\d.,:;()'"\-+/\\־׳״]/;

function isHebrew(ch: string): boolean {
  return HEBREW_CHAR.test(ch);
}
function isLatin(ch: string): boolean {
  return LATIN_CHAR.test(ch);
}
function isNeutral(ch: string): boolean {
  return NEUTRAL.test(ch);
}

/**
 * Reverse Hebrew runs in a single line so words read in logical order.
 * Numbers inside a Hebrew run keep their digit order (e.g. "2026" stays "2026").
 */
function fixLine(line: string): string {
  if (!HEBREW_CHAR.test(line)) return line;

  // Split into tokens: Hebrew run | Latin run | neutral (space/punct)
  type Token = { text: string; kind: "he" | "la" | "neu" };
  const tokens: Token[] = [];
  let current = "";
  let currentKind: "he" | "la" | "neu" | null = null;

  const flush = () => {
    if (current.length > 0 && currentKind) {
      tokens.push({ text: current, kind: currentKind });
      current = "";
    }
  };

  for (const ch of line) {
    let kind: "he" | "la" | "neu";
    if (isHebrew(ch)) kind = "he";
    else if (isLatin(ch)) kind = "la";
    else kind = "neu";

    if (kind !== currentKind) {
      flush();
      currentKind = kind;
    }
    current += ch;
  }
  flush();

  // Reverse the order of tokens, but keep characters inside each token in
  // their original order — because pdf-parse emits the Hebrew letters of a
  // single word in correct logical order, but words on a line are in visual
  // (reversed) order. So we reverse word ORDER, not letter order.
  //
  // BUT: some PDFs (especially scanned-then-OCR'd or RTL-encoded) emit even
  // individual Hebrew words reversed character-by-character. We detect this
  // heuristically: if reversing each Hebrew token's letters yields more
  // common Hebrew prefixes (ה, ב, ל, מ, ש, ו), we reverse letters too.
  // For simplicity here, we reverse both: word order AND letter order within
  // Hebrew tokens. This matches the most common bad-PDF case.

  const reversed: Token[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === "he") {
      // Reverse Hebrew letters within the token
      reversed.push({ text: [...t.text].reverse().join(""), kind: "he" });
    } else {
      reversed.push(t);
    }
  }

  return reversed.map((t) => t.text).join("");
}

/**
 * Decide whether a text block looks like it was extracted in visual (reversed)
 * order. We use a simple heuristic: in correct logical Hebrew text, common
 * sequences like " ה" (space + heh prefix), "תאריך", "מספר" appear; in reversed
 * text, " ך" or " ן" (final letters at word START) appear instead.
 *
 * If more lines look "reversed" than "normal", we reorder. Otherwise we
 * leave the text alone (some PDFs are already in logical order).
 */
const HEBREW_FINAL_LETTERS = /[ךםןףץ]/; // ך ם ן ף ץ
const HEBREW_NON_FINAL = /[א-ת]/; // any Hebrew letter

function looksReversed(text: string): boolean {
  // In correctly-ordered Hebrew, final letters (ך ם ן ף ץ) appear at the END
  // of words (i.e. followed by space, punctuation, or line end).
  // In reversed text, they appear at word START (i.e. preceded by space or
  // line start, and followed by other letters).
  let startFinals = 0;
  let endFinals = 0;
  const words = text.split(/[\s,.;:!?()]+/);
  for (const w of words) {
    if (w.length < 2) continue;
    const first = w[0];
    const last = w[w.length - 1];
    if (HEBREW_FINAL_LETTERS.test(first) && HEBREW_NON_FINAL.test(last)) {
      startFinals++;
    } else if (HEBREW_FINAL_LETTERS.test(last) && HEBREW_NON_FINAL.test(first)) {
      endFinals++;
    }
  }
  // If more words start with final-letters than end with them, text is reversed
  return startFinals > endFinals && startFinals >= 3;
}

export function fixHebrewBidi(text: string): string {
  if (!HEBREW_CHAR.test(text)) return text;
  if (!looksReversed(text)) return text;

  return text
    .split(/\r?\n/)
    .map((line) => fixLine(line))
    .join("\n");
}
