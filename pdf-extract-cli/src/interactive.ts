import * as p from "@clack/prompts";
import {existsSync, mkdirSync, readdirSync, statSync, writeFileSync} from "fs";
import {basename, extname, join, resolve} from "path";
import {getConfig} from "./config.js";
import {type PipelineResult, runPipeline} from "./pipeline.js";
import {formatSummary} from "./summary.js";
import {listOllamaModels, RECOMMENDED_MODEL} from "./ollamaModels.js";

function cancelAndExit(): never {
  p.cancel("Cancelled.");
  process.exit(1);
}

function collectPdfsUnder(dirPath: string): string[] {
  return readdirSync(dirPath)
    .filter((f) => extname(f).toLowerCase() === ".pdf")
    .map((f) => join(dirPath, f));
}

async function pickFiles(): Promise<string[]> {
  const inputPath = await p.path({
    message: "Select a PDF file or a folder of PDFs",
    root: process.cwd(),
    validate: (val) => {
      if (!val) return "Please enter a path";
      const resolved = resolve(val);
      if (!existsSync(resolved)) return "Path does not exist";
      const stat = statSync(resolved);
      if (stat.isFile() && extname(resolved).toLowerCase() !== ".pdf") {
        return "File must be a .pdf";
      }
      if (stat.isDirectory() && collectPdfsUnder(resolved).length === 0) {
        return "Folder contains no .pdf files";
      }
      return undefined;
    },
  });
  if (p.isCancel(inputPath)) cancelAndExit();

  const resolved = resolve(inputPath);
  const stat = statSync(resolved);
  if (stat.isFile()) return [resolved];

  const pdfs = collectPdfsUnder(resolved);
  const selected = await p.multiselect({
    message: `Found ${pdfs.length} PDF(s) — choose which to process`,
    options: pdfs.map((f) => ({ value: f, label: basename(f) })),
    initialValues: pdfs,
    required: true,
  });
  if (p.isCancel(selected)) cancelAndExit();
  return selected;
}

async function pickQuestion(): Promise<{ question?: string; model?: string }> {
  const wantsAsk = await p.confirm({
    message: "Ask the AI a question about this document?",
    initialValue: false,
  });
  if (p.isCancel(wantsAsk)) cancelAndExit();
  if (!wantsAsk) return {};

  const question = await p.text({
    message: "What do you want to know?",
    placeholder: "מה תאריך הבדיקה הבאה?",
    validate: (v) => (v ? undefined : "Question is required"),
  });
  if (p.isCancel(question)) cancelAndExit();

  const localModels = await listOllamaModels();
  const options: { value: string; label: string; hint?: string }[] = localModels.map((m) => ({
    value: m,
    label: m,
    hint: m === RECOMMENDED_MODEL ? "recommended — see README" : undefined,
  }));
  options.push({ value: "__custom__", label: "Enter a different model name..." });

  const choice = await p.select({
    message: "Choose an Ollama model",
    options,
    initialValue: localModels.includes(RECOMMENDED_MODEL) ? RECOMMENDED_MODEL : options[0]?.value,
  });
  if (p.isCancel(choice)) cancelAndExit();

  if (choice === "__custom__") {
    const custom = await p.text({
      message: "Model name (as shown by `ollama list`)",
      placeholder: "qwen3:4b",
      validate: (v) => (v ? undefined : "Model name is required"),
    });
    if (p.isCancel(custom)) cancelAndExit();
    return { question, model: custom };
  }

  return { question, model: choice };
}

async function pickOutput(): Promise<string | null> {
  const wantsSave = await p.confirm({
    message: "Save results to disk (text + metadata)?",
    initialValue: true,
  });
  if (p.isCancel(wantsSave)) cancelAndExit();
  if (!wantsSave) return null;

  const dir = await p.text({
    message: "Output folder",
    initialValue: "./output",
    validate: (v) => (v ? undefined : "Output folder is required"),
  });
  if (p.isCancel(dir)) cancelAndExit();
  return dir;
}

function writeResult(result: PipelineResult, outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const base = basename(result.file, ".pdf");

  const jsonOutput = {
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

  writeFileSync(join(outDir, `${base}.txt`), result.text, "utf-8");
  writeFileSync(join(outDir, `${base}.json`), JSON.stringify(jsonOutput, null, 2), "utf-8");
  writeFileSync(join(outDir, `${base}.html`), result.html, "utf-8");
  if (result.csv) {
    writeFileSync(join(outDir, `${base}.csv`), result.csv, "utf-8");
  }
}

export async function runInteractive(): Promise<void> {
  p.intro("pdf-extract — universal local PDF reader (Tesseract OCR + optional Ollama Q&A)");

  const files = await pickFiles();
  const { question, model } = await pickQuestion();
  const outDir = await pickOutput();

  p.note(
    [
      `Files: ${files.length === 1 ? basename(files[0]) : `${files.length} files`}`,
      `AI question: ${question ? `"${question}" (${model})` : "none — text extraction only"}`,
      `Output: ${outDir ? `save to ${outDir}` : "screen only"}`,
    ].join("\n"),
    "Ready to run"
  );

  const config = getConfig();
  const results: PipelineResult[] = [];
  let failures = 0;

  for (const file of files) {
    const s = p.spinner();
    s.start(`Processing ${basename(file)}`);
    try {
      const result = await runPipeline(file, config, { question, model });
      results.push(result);
      if (result.answer?.error) {
        failures++;
        s.stop(`✗ ${basename(file)} — AI question failed: ${result.answer.error}`);
      } else {
        const tableNote = result.csv ? `, table found (${result.csvRowCount} rows)` : "";
        s.stop(`✓ ${basename(file)} — done${result.usedOcr ? " (used OCR)" : ""}${tableNote}`);
      }
    } catch (err) {
      failures++;
      s.stop(`✗ ${basename(file)} — failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  for (const result of results) {
    p.note(formatSummary(result), basename(result.file));
    if (outDir) writeResult(result, outDir);
  }

  const summaryLine =
    failures > 0
      ? `Processed ${results.length} file(s), ${failures} failed.`
      : `Processed ${results.length} file(s) successfully.`;

  p.outro(outDir ? `${summaryLine} Saved to ${resolve(outDir)}` : summaryLine);

  if (failures > 0) process.exitCode = 1;
}
