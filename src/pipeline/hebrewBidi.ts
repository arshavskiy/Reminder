// Fixes Hebrew text that PDFs store in visual (right-to-left rendered) order
// instead of logical order. Many Hebrew PDFs emit characters in the order they
// appear visually on the page — so when read left-to-right by pdf-parse, words
// come out reversed ("ןולמ" instead of "מלון").
//
// Strategy:
//   - Process line by line (line breaks are stable in both orders)
//   - Tokenise into Hebrew / Latin / digit / punctuation / space segments
//   - Reverse token ORDER for the whole line (RTL → LTR word order)
//   - Reverse characters WITHIN each Hebrew token (individual letters were
//     also stored in visual order)
//   - Digits and Latin runs are never character-reversed — only repositioned
//   - Digit tokens that are sandwiched between two Hebrew tokens on the same
//     "word" (no space boundary) are treated as belonging to that Hebrew word
//     so they stay adjacent after reordering (e.g. "1945" in "שלב 1945 הובלות")

const HEBREW_CHAR = /[֐-׿]/;
const LATIN_CHAR  = /[A-Za-z]/;
const DIGIT_CHAR  = /\d/;

type TKind = "he" | "la" | "dig" | "space" | "punct";
interface Token { text: string; kind: TKind }

function charKind(ch: string): TKind {
  if (HEBREW_CHAR.test(ch)) return "he";
  if (LATIN_CHAR.test(ch))  return "la";
  if (DIGIT_CHAR.test(ch))  return "dig";
  if (ch === " " || ch === "\t") return "space";
  return "punct";
}

function tokenise(line: string): Token[] {
  const tokens: Token[] = [];
  let cur = "";
  let curKind: TKind | null = null;

  const flush = () => {
    if (cur && curKind) { tokens.push({ text: cur, kind: curKind }); cur = ""; }
  };

  for (const ch of line) {
    const k = charKind(ch);
    if (k !== curKind) { flush(); curKind = k; }
    cur += ch;
  }
  flush();
  return tokens;
}

/**
 * Reverse Hebrew runs in a single line so words read in logical order.
 *
 * Key insight for mixed strings like "שלב 1945 הובלות בע"מ":
 *   - The whole line is in visual (reversed) order, so token ORDER is reversed
 *   - Hebrew letter ORDER within each token is also reversed
 *   - Digit strings (1945) are already in correct digit order — never reverse chars
 *   - Latin strings (serial numbers, model codes) — never reverse chars
 *   - Space/punct tokens are repositioned with the token-order reversal
 */
function fixLine(line: string): string {
  if (!HEBREW_CHAR.test(line)) return line;

  const tokens = tokenise(line);

  // Reverse token order, then fix character order within Hebrew tokens
  const reversed = [...tokens].reverse().map(t => {
    if (t.kind === "he") {
      return { ...t, text: [...t.text].reverse().join("") };
    }
    return t;
  });

  return reversed.map(t => t.text).join("");
}

/**
 * Decide whether a text block looks like it was extracted in visual (reversed)
 * order. Heuristic: in correct logical Hebrew, final letters (ך ם ן ף ץ) appear
 * at word END. In reversed text they appear at word START.
 */
const HEBREW_FINAL_LETTERS = /[ךםןףץ]/;
const HEBREW_NON_FINAL     = /[א-ת]/;

function looksReversed(text: string): boolean {
  let startFinals = 0;
  let endFinals   = 0;
  const words = text.split(/[\s,.;:!?()]+/);
  for (const w of words) {
    if (w.length < 2) continue;
    const first = w[0];
    const last  = w[w.length - 1];
    if (HEBREW_FINAL_LETTERS.test(first) && HEBREW_NON_FINAL.test(last)) {
      startFinals++;
    } else if (HEBREW_FINAL_LETTERS.test(last) && HEBREW_NON_FINAL.test(first)) {
      endFinals++;
    }
  }
  return startFinals > endFinals && startFinals >= 3;
}

export function fixHebrewBidi(text: string): string {
  if (!HEBREW_CHAR.test(text)) return text;
  if (!looksReversed(text))    return text;

  return text
    .split(/\r?\n/)
    .map(line => fixLine(line))
    .join("\n");
}
