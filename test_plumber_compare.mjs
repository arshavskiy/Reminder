/**
 * Show pdfplumber extraction results on real PDFs.
 * Usage: node test_plumber_compare.mjs [optional/path/to/file.pdf]
 */
import {readdirSync} from "fs";
import {dirname, join} from "path";
import {fileURLToPath} from "url";
import {spawnSync} from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "src", "pipeline", "pdfplumber_extract.py");
const DOCS_DIR = join(__dirname, "data", "documents");

function runPlumber(filePath) {
  const r = spawnSync("python", [SCRIPT, filePath], {
    timeout: 30000,
    maxBuffer: 20 * 1024 * 1024,
    encoding: "utf-8",
  });
  if (r.status !== 0 || r.error) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function countHebrew(text) {
  return [...text].filter(c => c >= "א" && c <= "ת").length;
}

let files;
if (process.argv[2]) {
  files = [process.argv[2]];
} else {
  files = readdirSync(DOCS_DIR)
    .filter(f => f.endsWith(".pdf"))
    .slice(0, 5)
    .map(f => join(DOCS_DIR, f));
}

for (const filePath of files) {
  console.log("\n" + "=".repeat(70));
  console.log("FILE:", filePath.split(/[\\/]/).pop());
  console.log("=".repeat(70));

  const plumber = runPlumber(filePath);
  if (!plumber) { console.log("  [pdfplumber] FAILED"); continue; }

  const plumberText = plumber.text ?? "";
  const plumberTables = plumber.tables ?? [];
  const totalTables = plumberTables.reduce((s, p) => s + p.length, 0);
  const totalRows = plumberTables.flat(1).reduce((s, t) => s + t.length, 0);

  console.log(`pages: ${plumber.page_count}  |  chars: ${plumberText.length}  |  Hebrew chars: ${countHebrew(plumberText)}  |  needs_ocr: ${plumber.needs_ocr}`);
  console.log(`tables detected: ${totalTables}  |  total rows: ${totalRows}`);

  console.log("\nTEXT SAMPLE (first 500 non-empty chars):");
  const nonEmpty = plumberText.split("\n").filter(l => l.trim()).join("\n");
  console.log(nonEmpty.slice(0, 500));

  if (totalTables > 0) {
    console.log("\nFIRST TABLE:");
    const firstTable = plumberTables.flat(1)[0] ?? [];
    for (const row of firstTable.slice(0, 10)) {
      const cells = row.map(c => (c ?? "").trim()).filter(Boolean);
      if (cells.length) console.log("  " + cells.join(" | "));
    }
  }
}
