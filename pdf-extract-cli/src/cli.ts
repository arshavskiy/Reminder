#!/usr/bin/env node

// Tesseract.js pulls in a dependency chain that still uses the deprecated
// `punycode` module. Node prints this warning once per process by default,
// but each Tesseract worker spawn (createWorker) re-triggers it in some
// Node versions, producing one warning per OCR call — very noisy on
// documents with many cells to repair. Suppress just this one, specific
// deprecation code rather than all warnings.
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name === "DeprecationWarning" && /punycode/i.test(warning.message)) return;
  console.warn(warning);
});

import {existsSync, mkdirSync, readdirSync, statSync, writeFileSync} from "fs";
import {basename, extname, join, resolve} from "path";
import {getConfig} from "./config.js";
import {runPipeline} from "./pipeline.js";
import {runInteractive} from "./interactive.js";

interface Args {
  files: string[];
  model?: string;
  out?: string;
  ask?: string;
  verbose: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { files: [], verbose: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") args.model = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--ask") args.ask = argv[++i];
    else if (a === "--verbose" || a === "-v") args.verbose = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else args.files.push(a);
  }
  return args;
}

function printHelp() {
  console.log(`pdf-extract — universal local PDF reader: clean text via Tesseract OCR, optional AI Q&A via Ollama

Usage:
  pdf-extract                          Launch the interactive wizard (no args)
  pdf-extract <file.pdf | directory> [options]

Options:
  --ask <question> Ask a question about the document's content (local Ollama model); if omitted, no AI call is made
  --model <name>   Ollama model to use with --ask (default: from .env OLLAMA_MODEL, or qwen3:4b)
  --out <path>     Write <name>.txt (text), .json (metadata/answer), .html (viewable), .csv (if a table was found) to this directory
  --verbose, -v    Print OCR-vs-parsed decisions and timing
  --help, -h       Show this help

Examples:
  pdf-extract ./document.pdf
  pdf-extract ./reports/ --out ./results
  pdf-extract ./document.pdf --ask "What is the due date mentioned in this document?"
`);
}

function collectPdfFiles(inputPath: string): string[] {
  const resolved = resolve(inputPath);
  if (!existsSync(resolved)) {
    throw new Error(`Path not found: ${inputPath}`);
  }
  const stat = statSync(resolved);
  if (stat.isDirectory()) {
    return readdirSync(resolved)
      .filter((f) => extname(f).toLowerCase() === ".pdf")
      .map((f) => join(resolved, f));
  }
  return [resolved];
}

async function runNonInteractive(args: Args): Promise<void> {
  const config = getConfig();
  const allFiles = args.files.flatMap(collectPdfFiles);

  if (allFiles.length === 0) {
    console.error("No PDF files found for the given input(s).");
    process.exit(1);
  }

  if (args.out) {
    mkdirSync(args.out, { recursive: true });
  }

  let exitCode = 0;

  for (const file of allFiles) {
    console.log(`\n=== ${file} ===`);
    try {
      const result = await runPipeline(file, config, {
        question: args.ask,
        model: args.model,
        verbose: args.verbose,
      });

      if (args.out) {
        const base = basename(file, ".pdf");
        const meta = {
          file: result.file,
          used_ocr: result.usedOcr,
          ocr_reason: result.ocrReason ?? null,
          raw_text_chars: result.rawTextChars,
          csv_row_count: result.csvRowCount,
          answer: result.answer
            ? {
                model: result.answer.model,
                exec_ms: result.answer.execMs,
                error: result.answer.error,
                usage: result.answer.usage,
                answer: result.answer.answer,
              }
            : null,
        };
        writeFileSync(join(args.out, `${base}.txt`), result.text, "utf-8");
        writeFileSync(join(args.out, `${base}.json`), JSON.stringify(meta, null, 2), "utf-8");
        writeFileSync(join(args.out, `${base}.html`), result.html, "utf-8");
        let wrote = `${base}.txt, .json, .html`;
        if (result.csv) {
          writeFileSync(join(args.out, `${base}.csv`), result.csv, "utf-8");
          wrote += `, .csv (${result.csvRowCount} rows)`;
        }
        console.log(`Wrote ${join(args.out, wrote)}`);
      } else {
        console.log(result.text);
        if (result.csv) {
          console.log(`\n[table found: ${result.csvRowCount} rows — use --out to save as CSV]`);
        }
        if (result.answer) {
          console.log(`\n--- Answer (${result.answer.model}) ---`);
          console.log(result.answer.error ? `Error: ${result.answer.error}` : result.answer.answer);
        }
      }

      if (result.answer?.error) exitCode = 1;
    } catch (err) {
      console.error(`Failed: ${err instanceof Error ? err.message : err}`);
      exitCode = 1;
    }
  }

  process.exit(exitCode);
}

async function main() {
  const argv = process.argv.slice(2);

  // No arguments at all -> launch the interactive wizard. Any flag or
  // positional file argument keeps the existing scripted behavior unchanged.
  if (argv.length === 0) {
    await runInteractive();
    return;
  }

  const args = parseArgs(argv);

  if (args.help || args.files.length === 0) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  await runNonInteractive(args);
}

main();
