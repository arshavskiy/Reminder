import {PDFDocument, rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';

// pdf-lib renders glyphs exactly as given — no bidi processing.
// We pre-reorder Hebrew text into visual (left-to-right) order ourselves.
// Rule: reverse word order. Hebrew chars within each word stay intact.
function he(text) {
  if (!text) return '';
  return text.split(' ').filter(Boolean).reverse().join(' ');
}

const pdfDoc = await PDFDocument.create();
pdfDoc.registerFontkit(fontkit);

const fontBytes = fs.readFileSync('C:/Windows/Fonts/calibri.ttf');
const calibri = await pdfDoc.embedFont(fontBytes, { subset: true });

const page = pdfDoc.addPage([595, 842]); // A4
const { width, height } = page.getSize();
const margin = 50;

let y = height - margin;
const lineH = 18;

function drawText(text, opts = {}) {
  const fontSize = opts.fontSize ?? 11;
  const color = opts.color ?? rgb(0, 0, 0);
  const tw = calibri.widthOfTextAtSize(text, fontSize);
  const x = opts.align === 'right' ? width - margin - tw : margin;
  page.drawText(text, { x, y, size: fontSize, font: calibri, color });
  y -= (opts.lineH ?? lineH) + (opts.gap ?? 4);
}

function drawRow(label, value) {
  const fontSize = 11;
  const labelText = he(label) + ':';
  const str = String(value ?? '');

  // Classify value: if it starts with Hebrew use he(), otherwise keep as-is
  // Numbers/dates/Latin: keep original order, place to left of label
  const firstCp = str.trimStart().codePointAt(0) ?? 0;
  const startsHebrew = firstCp >= 0x05D0 && firstCp <= 0x05EA;
  // Wrap non-Hebrew values in LRM marks so PDF viewers don't bidi-reorder digits
  const valueText = startsHebrew ? he(str) : ('‎' + str + '‎');

  const labelW = calibri.widthOfTextAtSize(labelText, fontSize);
  const valueW = calibri.widthOfTextAtSize(valueText, fontSize);
  const gap = 8;

  const labelX = width - margin - labelW;
  const valueX = Math.max(margin, labelX - gap - valueW);

  page.drawText(labelText, { x: labelX, y, size: fontSize, font: calibri, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(valueText, { x: valueX, y, size: fontSize, font: calibri, color: rgb(0, 0, 0) });
  y -= lineH + 4;
}

// ── Title ──────────────────────────────────────────────────────────────────
const title = he('במת הרמה טלסקופית');
const titleSize = 20;
const titleW = calibri.widthOfTextAtSize(title, titleSize);
page.drawText(title, { x: width - margin - titleW, y, size: titleSize, font: calibri, color: rgb(0, 0, 0) });
y -= titleSize + 8;

const dateStr = new Date().toLocaleDateString('he-IL');
const dateW = calibri.widthOfTextAtSize(dateStr, 10);
page.drawText(dateStr, { x: width - margin - dateW, y, size: 10, font: calibri, color: rgb(0.5, 0.5, 0.5) });
y -= 14 + 8;

// Divider
page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
y -= 16;

// ── Section header ────────────────────────────────────────────────────────
drawText(he('פרטי הציוד'), { fontSize: 13, align: 'right', gap: 8 });

// ── Detail rows ───────────────────────────────────────────────────────────
drawRow('יצרן', 'MANITOU');
drawRow('דגם', 'T420');
drawRow('מספר סידורי', '233-017');
drawRow('לקוח', 'שי מגן מלגזות בע"מ');
drawRow('תאריך', '2025-03-15');
drawRow('תוצאה', 'PASS');
drawRow('עומס עבודה', '3000 ק"ג');

const pdfBytes = await pdfDoc.save();
fs.writeFileSync('../scripts/test_pdflib.pdf', pdfBytes);
console.log('Written, size:', pdfBytes.length);
