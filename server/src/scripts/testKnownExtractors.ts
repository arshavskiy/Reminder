import "./loadEnv"; // must precede any module that reads env at import time
import {existsSync, readdirSync, writeFileSync} from "fs";
import {extname, join} from "path";
import {parsePdf} from "../pipeline/pdfParser";
import {parseDocx} from "../pipeline/docxParser";
import {parseXlsx} from "../pipeline/xlsxParser";
import {extractKnownInvoiceFields} from "../pipeline/importer";
import {getDataDir} from "../settings";

/**
 * Runs the known-vendor invoice extractors over a folder of real attachments
 * and reports which files they recognize and what they pull out.
 *
 * This exercises only the deterministic regex layer (extractKnownInvoiceFields),
 * not the AI path — so it is free, fast and repeatable. Use it to see which
 * vendors are covered, to spot extraction regressions, and to find candidates
 * for new extractors.
 *
 *   --dir PATH      folder to scan (default: {dataDir}/gmail-tmp)
 *   --limit N       stop after N files
 *   --filter TEXT   only files whose name contains TEXT (case-insensitive)
 *   --misses        list unrecognized files instead of the recognized ones
 *   --json PATH     write the full per-file result as JSON
 *   --verbose       print every extracted field, not just a summary
 */

const dir = readArg("--dir") ?? join(getDataDir(), "gmail-tmp");
const limit = readNumberArg("--limit");
const filter = readArg("--filter")?.toLowerCase() ?? null;
const showMisses = process.argv.includes("--misses");
const jsonOut = readArg("--json");
const verbose = process.argv.includes("--verbose");

const TEXT_EXTENSIONS = new Set([".pdf", ".docx", ".xlsx"]);

if (!existsSync(dir)) {
  console.error(`Folder not found: ${dir}`);
  process.exit(1);
}

interface FileResult {
  file: string;
  ext: string;
  ok: boolean;
  matched: boolean;
  supplier: string | null;
  invoiceNumber: string | null;
  amount: number | null;
  currency: string | null;
  issueDate: string | null;
  subtype: string | null;
  textChars: number;
  error?: string;
}

const names = readdirSync(dir)
  .filter((name) => TEXT_EXTENSIONS.has(extname(name).toLowerCase()))
  .filter((name) => !filter || name.toLowerCase().includes(filter));

const targets = limit ? names.slice(0, limit) : names;

const results: FileResult[] = [];
let processed = 0;

for (const name of targets) {
  const full = join(dir, name);
  const ext = extname(name).toLowerCase();
  processed += 1;
  if (processed % 100 === 0) process.stderr.write(`  ...${processed}/${targets.length}\n`);

  let text = "";
  try {
    if (ext === ".pdf") {
      const parsed = await parsePdf(full);
      // Deliberately no OCR fallback: this measures the regex layer against
      // embedded text, and OCR would make the run slow and non-deterministic.
      text = parsed.text ?? "";
    } else if (ext === ".docx") {
      text = await parseDocx(full);
    } else if (ext === ".xlsx") {
      text = parseXlsx(full);
    }
  } catch (err) {
    results.push({
      file: name, ext, ok: false, matched: false, supplier: null, invoiceNumber: null,
      amount: null, currency: null, issueDate: null, subtype: null, textChars: 0,
      error: String(err).slice(0, 200),
    });
    continue;
  }

  const fields = text ? extractKnownInvoiceFields(text, name) : null;
  results.push({
    file: name,
    ext,
    ok: true,
    matched: Boolean(fields),
    supplier: str(fields?.supplier_name),
    invoiceNumber: str(fields?.invoice_number),
    amount: typeof fields?.amount === "number" ? fields.amount : null,
    currency: str(fields?.currency),
    issueDate: str(fields?.issue_date),
    subtype: str(fields?.document_subtype),
    textChars: text.length,
  });
}

const matched = results.filter((r) => r.matched);
const unmatched = results.filter((r) => r.ok && !r.matched);
const failed = results.filter((r) => !r.ok);
const noText = unmatched.filter((r) => r.textChars < 50);

console.log("\n=== summary ===");
console.log(JSON.stringify({
  folder: dir,
  files_scanned: results.length,
  matched_by_known_extractor: matched.length,
  unmatched: unmatched.length,
  unmatched_with_no_embedded_text: noText.length,
  parse_failed: failed.length,
}, null, 2));

console.log("\n=== matches by supplier ===");
const bySupplier: Record<string, number> = {};
for (const r of matched) {
  const key = r.supplier ?? "(no supplier)";
  bySupplier[key] = (bySupplier[key] ?? 0) + 1;
}
for (const [supplier, n] of Object.entries(bySupplier).sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(4)}  ${supplier}`);
}

if (matched.length) {
  console.log("\n=== sample matches ===");
  for (const r of matched.slice(0, verbose ? matched.length : 15)) {
    console.log(`  ${r.file}`);
    console.log(`      supplier=${r.supplier} number=${r.invoiceNumber} amount=${r.amount} ${r.currency ?? ""} date=${r.issueDate} subtype=${r.subtype}`);
  }
}

if (showMisses) {
  console.log("\n=== unmatched files with readable text (extractor candidates) ===");
  const candidates = unmatched.filter((r) => r.textChars >= 50);
  const byName: Record<string, number> = {};
  for (const r of candidates) {
    const stem = r.file.replace(/^\d+-/, "");
    byName[stem] = (byName[stem] ?? 0) + 1;
  }
  for (const [name, n] of Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    console.log(`${String(n).padStart(4)}  ${name}`);
  }
}

if (failed.length) {
  console.log("\n=== parse failures ===");
  for (const r of failed.slice(0, 10)) console.log(`  ${r.file}: ${r.error}`);
  if (failed.length > 10) console.log(`  ...and ${failed.length - 10} more`);
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(results, null, 2));
  console.log(`\nFull results written to ${jsonOut}`);
}

function str(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function readNumberArg(name: string): number | null {
  const raw = readArg(name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
