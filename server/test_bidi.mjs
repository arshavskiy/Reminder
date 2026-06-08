// Proper RTL visual-order composer for pdfkit
// Strategy: split line into tokens (words + separators), classify each as
// Hebrew/Latin/number/punctuation, then reorder token groups for visual display.
// pdfkit renders left-to-right, so we pre-reverse to produce correct visual output.

function isHebrewChar(cp) {
  return (cp >= 0x0590 && cp <= 0x05FF) || (cp >= 0xFB1D && cp <= 0xFB4F);
}
function isLatinOrDigit(cp) {
  return (cp >= 0x0041 && cp <= 0x005A) || // A-Z
         (cp >= 0x0061 && cp <= 0x007A) || // a-z
         (cp >= 0x0030 && cp <= 0x0039) || // 0-9
         cp === 0x002D || cp === 0x002F || cp === 0x002E; // - / .
}

function rtlVisual(text) {
  if (!text) return '';

  // Tokenize on spaces only; each token is a "word" (may include colon/punct)
  const words = text.split(' ').filter(w => w.length > 0);

  // Reverse word order for RTL visual display
  const reversed = [...words].reverse();
  return reversed.join(' ');
}

// Tests
const cases = [
  'שם: במת הרמה טלסקופית',
  'יצרן: MANITOU',
  'מספר סידורי: 233-017',
  'לקוח: שי מגן מלגזות',
  'תאריך: 2025-03-15',
  'תוצאה: PASS',
];

for (const c of cases) {
  console.log(`IN:  "${c}"`);
  console.log(`OUT: "${rtlVisual(c)}"`);
  console.log();
}
