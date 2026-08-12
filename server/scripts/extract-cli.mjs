/**
 * CLI: run extraction on one or more PDF/image files and print extracted fields.
 *
 * Usage (from server/):
 *   node --import tsx/esm scripts/extract-cli.mjs <file1.pdf> [file2.pdf ...]
 *
 * Options:
 *   --template <name>   Use a specific doc template by name (from DB)
 *   --no-db             Skip DB connection (uses env AI key directly, no template lookup)
 */

import { resolve, extname, basename, dirname } from "path";
import { existsSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const templateNameIdx = args.indexOf("--template");
const TEMPLATE_NAME = templateNameIdx !== -1 ? args[templateNameIdx + 1] : null;
const NO_DB = args.includes("--no-db");
const files = args.filter(a => !a.startsWith("--") && a !== (TEMPLATE_NAME ?? ""));

if (!files.length) {
  console.error("Usage: node --import tsx/esm scripts/extract-cli.mjs <file.pdf> [file2.pdf ...] [--template <name>]");
  process.exit(1);
}

// ── Imports ──────────────────────────────────────────────────────────────────
const { parsePdf }         = await import(pathToFileURL(resolve(__dirname, "../src/pipeline/pdfParser.ts")).href);
const { ocrFile }          = await import(pathToFileURL(resolve(__dirname, "../src/pipeline/ocrParser.ts")).href);
const { extractDocument, extractWithTemplate } = await import(pathToFileURL(resolve(__dirname, "../src/pipeline/extractor.ts")).href);

let db, connectDb, col;
if (!NO_DB) {
  ({ connectDb } = await import(pathToFileURL(resolve(__dirname, "../src/db/db.ts")).href));
  ({ col } = await import(pathToFileURL(resolve(__dirname, "../src/db/db.ts")).href));
  await connectDb();
}

// ── Template lookup ───────────────────────────────────────────────────────────
let template = null;
if (TEMPLATE_NAME && !NO_DB) {
  const { MongoClient } = await import("mongodb");
  // col() is already set up by connectDb
  const tpl = await col("doc_templates").findOne({ name: TEMPLATE_NAME });
  if (!tpl) {
    console.warn(`[warn] Template "${TEMPLATE_NAME}" not found — falling back to generic extraction`);
  } else {
    template = tpl;
    console.log(`[info] Using template: ${tpl.name}`);
  }
}

// ── Process each file ─────────────────────────────────────────────────────────
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff"]);

for (const filePath of files) {
  const absPath = resolve(process.cwd(), filePath);
  if (!existsSync(absPath)) {
    console.error(`[skip] File not found: ${absPath}`);
    continue;
  }

  const ext = extname(absPath).toLowerCase();
  const name = basename(absPath);
  console.log(`\n${"─".repeat(60)}`);
  console.log(`FILE: ${name}`);
  console.log("─".repeat(60));

  // ── Parse text ──────────────────────────────────────────────────────────────
  let rawText = "";
  try {
    if (ext === ".pdf") {
      const parsed = await parsePdf(absPath);
      rawText = parsed.text ?? "";
      console.log(`[parse] PDF pages: ${parsed.pageCount ?? "?"}, chars: ${rawText.length}`);
    } else if (IMAGE_EXTS.has(ext)) {
      rawText = await ocrFile(absPath) ?? "";
      console.log(`[parse] OCR chars: ${rawText.length}`);
    } else {
      const { readFileSync } = await import("fs");
      rawText = readFileSync(absPath, "utf8");
      console.log(`[parse] Text chars: ${rawText.length}`);
    }
  } catch (err) {
    console.error(`[error] Parse failed: ${err.message}`);
    continue;
  }

  if (!rawText.trim()) {
    console.warn("[warn] No text extracted — skipping AI step");
    continue;
  }

  // ── Extract ─────────────────────────────────────────────────────────────────
  let result;
  try {
    if (template) {
      result = await extractWithTemplate(rawText, template, undefined, name);
    } else {
      result = await extractDocument(rawText, undefined, name);
    }
  } catch (err) {
    console.error(`[error] Extraction failed: ${err.message}`);
    continue;
  }

  // ── Print fields ─────────────────────────────────────────────────────────────
  if (result?.error) {
    console.error(`[error] AI extraction error: ${result.error}`);
    continue;
  }

  // extractDocument → result.result; extractWithTemplate → result.fields
  const fields = result?.fields ?? result?.result ?? result;
  console.log("\nEXTRACTED FIELDS:");
  if (fields && typeof fields === "object") {
    const entries = Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0));
    if (entries.length) {
      const maxKey = Math.max(...entries.map(([k]) => k.length));
      for (const [key, val] of entries) {
        const display = Array.isArray(val) ? JSON.stringify(val) : String(val);
        console.log(`  ${key.padEnd(maxKey)}  ${display}`);
      }
    }
    const nullKeys = Object.entries(fields).filter(([, v]) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)).map(([k]) => k);
    if (nullKeys.length) {
      console.log(`\n  [null/empty]: ${nullKeys.join(", ")}`);
    }
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  if (result?.usage) {
    console.log(`\n  tokens: prompt=${result.usage.prompt_tokens} completion=${result.usage.completion_tokens} total=${result.usage.total_tokens}`);
  }
  if (result?.execMs) {
    console.log(`  time: ${result.execMs}ms  model: ${result.model}`);
  }
}

console.log(`\n${"─".repeat(60)}`);
console.log("Done.");
process.exit(0);
