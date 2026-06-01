/**
 * Test: run parsePdf → extractFromOcr on a real Hebrew PDF and print both outputs.
 * For scanned PDFs (needsOcr=true), pass --force-ocr to attempt Tesseract anyway
 * (only works if the PDF was already rasterised to images).
 *
 * Run: npx tsx test_ocr_pipeline.mjs "path/to/file.pdf"
 */

import {fileURLToPath} from "url";
import {dirname, resolve} from "path";
import {existsSync} from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const forceOcr = process.argv.includes("--force-ocr");
let targetFile = process.argv.find(a => !a.startsWith("-") && a !== process.argv[0] && a !== process.argv[1]);

if (!targetFile) {
  console.error("Usage: npx tsx test_ocr_pipeline.mjs <path/to/file.pdf>");
  process.exit(1);
}

targetFile = resolve(targetFile);

if (!existsSync(targetFile)) {
  console.error("File not found:", targetFile);
  process.exit(1);
}

const { parsePdf } = await import("./src/pipeline/pdfParser.ts");
const { ocrFile }  = await import("./src/pipeline/ocrParser.ts");
const { extractFromOcr } = await import("./src/pipeline/ocrExtractor.ts");

console.log("════════════════════════════════════════════════════════════");
console.log("FILE:", targetFile);
console.log("════════════════════════════════════════════════════════════\n");

// ── Step 1: parsePdf ─────────────────────────────────────────────────────────
console.log("⏳ Running parsePdf...\n");
const pdfResult = await parsePdf(targetFile);

console.log(`  pageCount : ${pdfResult.pageCount}`);
console.log(`  needsOcr  : ${pdfResult.needsOcr}${pdfResult.reason ? " — " + pdfResult.reason : ""}`);
console.log(`  text len  : ${pdfResult.text.length} chars\n`);

let rawText = pdfResult.text;
let source = "parsePdf";

if (pdfResult.needsOcr) {
  if (forceOcr) {
    console.log("⚠️  needsOcr=true but --force-ocr passed — attempting Tesseract...\n");
    try {
      rawText = await ocrFile(targetFile);
      source = "ocrFile";
      console.log(`✅ OCR done — ${rawText.length} chars extracted\n`);
    } catch (e) {
      console.error("❌ ocrFile failed:", e.message);
      console.error("   (Tesseract.js cannot read PDF directly — convert to PNG first)\n");
      rawText = pdfResult.text; // fall back to whatever parsePdf got
      source = "parsePdf (fallback after OCR error)";
    }
  } else {
    console.log("⚠️  needsOcr=true — in production the server would call Tesseract.");
    console.log("   Tesseract.js cannot read PDFs directly (needs PNG/JPG).");
    console.log("   Using parsePdf text for extraction test.\n");
    console.log("   → To force OCR anyway: add --force-ocr flag\n");
  }
}

console.log(`════════════════════ RAW TEXT (source: ${source}) ════════════════`);
console.log(rawText || "(empty)");
console.log("════════════════════ END RAW TEXT ══════════════════════════\n");

// ── Step 2: extractFromOcr ───────────────────────────────────────────────────
const extracted = extractFromOcr(rawText);

console.log("════════════════════ EXTRACTED FIELDS ══════════════════════");
const fields = [
  ["expiry_date",    extracted.expiry_date],
  ["contact_name",   extracted.contact_name],
  ["contact_phone",  extracted.contact_phone],
  ["contact_email",  extracted.contact_email],
  ["client_address", extracted.client_address],
  ["po_box",         extracted.po_box],
  ["document_type",  extracted.document_type],
];

let found = 0;
for (const [key, val] of fields) {
  const mark = val ? "✅" : "❌";
  console.log(`  ${mark} ${key.padEnd(16)} ${val ?? "(not found)"}`);
  if (val) found++;
}

console.log(`\n  ${found}/${fields.length} fields extracted`);
console.log("════════════════════════════════════════════════════════════");
