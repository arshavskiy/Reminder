import {config} from "dotenv";
import {execFile as execFileCb} from "child_process";
import {existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync} from "fs";
import {tmpdir} from "os";
import {basename, dirname, extname, join, resolve} from "path";
import {promisify} from "util";
import sharp from "sharp";
import {createWorker} from "tesseract.js";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb} from "../db/db";
import {resolveDocumentFilePath} from "../documents/fileResolver";
import {parsePdf} from "../pipeline/pdfParser";
import {ocrFile} from "../pipeline/ocrParser";
import {extractFromOcr} from "../pipeline/ocrExtractor";
import {parsePdfWithPlumber, tablesToText} from "../pipeline/pdfPlumberParser";
import {extractWithTemplate} from "../pipeline/extractor";
import {classifyDocumentKind, pickTemplate} from "../templates/seedTemplates";
import {getSettings} from "../settings";
import type {DocTemplate} from "../../src/shared/types.js";

config({ path: resolve(process.cwd(), ".env") });

const execFile = promisify(execFileCb);
const PDF_RENDER_DPI = readIntEnv("AUDIT_OCR_DPI", 300, 120, 600);
const PDF_RENDER_TIMEOUT_MS = readIntEnv("AUDIT_OCR_RENDER_TIMEOUT_MS", 90_000, 5_000, 300_000);
const OCR_TIMEOUT_MS = readIntEnv("AUDIT_OCR_TIMEOUT_MS", 180_000, 10_000, 600_000);

type SourceKind = "file" | "document";

interface Candidate {
  source: string;
  method: string;
  text: string;
  pageCount: number | null;
  needsOcr: boolean;
  reason: string | null;
  elapsedMs: number;
  error: string | null;
}

interface Target {
  sourceKind: SourceKind;
  id: string;
  filePath: string;
  fileName: string;
  doc?: Record<string, any>;
}

interface Args {
  files: string[];
  dirs: string[];
  documentIds: string[];
  userId: string | null;
  kind: string | null;
  supplier: string | null;
  limit: number;
  withAi: boolean;
  external: boolean;
  compareAll: boolean;
  outPath: string | null;
  includeHealthy: boolean;
}

function usage(): never {
  console.error([
    "Usage:",
    "  npm run ocr:audit-flow -- --file <pdf-path> [--with-ai] [--out report.json]",
    "  npm run ocr:audit-flow -- --dir <pdf-folder> --limit 5 [--with-ai] [--external] [--compare-all]",
    "  npm run ocr:audit-flow -- --document <document-id> [--with-ai]",
    "  npm run ocr:audit-flow -- --kind contract --limit 10 [--user <user-id>] [--with-ai]",
    "",
    "What it compares:",
    "  regular: current parsePdf -> ocrFile fallback",
    "  proposed: pdf-parse + pdfplumber/table native text, then rendered+preprocessed OCR fallback",
    "  --external: optional Docling/pdfmux/craft bridge if installed; safe to skip in Railway production",
  ].join("\n"));
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    files: [],
    dirs: [],
    documentIds: [],
    userId: null,
    kind: null,
    supplier: null,
    limit: 10,
    withAi: false,
    external: false,
    compareAll: false,
    outPath: null,
    includeHealthy: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--file" && next) {
      args.files.push(unquote(next));
      i += 1;
    } else if (arg === "--dir" && next) {
      args.dirs.push(unquote(next));
      i += 1;
    } else if (arg === "--document" && next) {
      args.documentIds.push(unquote(next));
      i += 1;
    } else if (arg === "--user" && next) {
      args.userId = unquote(next);
      i += 1;
    } else if (arg === "--kind" && next) {
      args.kind = unquote(next);
      i += 1;
    } else if (arg === "--supplier" && next) {
      args.supplier = unquote(next);
      i += 1;
    } else if (arg === "--limit" && next) {
      args.limit = Math.max(1, Math.min(Number(next) || 10, 100));
      i += 1;
    } else if (arg === "--with-ai") {
      args.withAi = true;
    } else if (arg === "--external") {
      args.external = true;
    } else if (arg === "--compare-all") {
      args.compareAll = true;
    } else if (arg === "--include-healthy") {
      args.includeHealthy = true;
    } else if (arg === "--out" && next) {
      args.outPath = unquote(next);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else {
      console.error(`Unknown or incomplete argument: ${arg}`);
      usage();
    }
  }

  if (!args.files.length && !args.dirs.length && !args.documentIds.length && !args.kind && !args.supplier) usage();
  return args;
}

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}

function isPdf(path: string): boolean {
  return extname(path).toLowerCase() === ".pdf";
}

function countMatches(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

function quality(text: string) {
  const trimmed = text.trim();
  const chars = trimmed.length;
  const hebrew = countMatches(trimmed, /[\u0590-\u05ff]/g);
  const latin = countMatches(trimmed, /[A-Za-z]/g);
  const digits = countMatches(trimmed, /\d/g);
  const useful = hebrew + latin + digits;
  const usefulRatio = chars ? useful / chars : 0;
  const tableSignals = countMatches(trimmed, /(?:\t| {2,}|מספר|תאריך|סכום|בתוקף|ציוד|לקוח|חשבון|invoice|amount|date)/gi);
  const score = Math.round(
    Math.min(chars, 12_000) * 0.25 +
    usefulRatio * 800 +
    Math.min(tableSignals, 80) * 20 +
    Math.min(hebrew, 2_000) * 0.35
  );
  return { chars, hebrew, latin, digits, usefulRatio: Number(usefulRatio.toFixed(3)), tableSignals, score };
}

function isTextUsable(text: string): boolean {
  const q = quality(text);
  return q.chars >= 120 && q.usefulRatio >= 0.35 && (q.hebrew > 10 || q.latin > 50);
}

function extractedFieldScore(text: string): number {
  const fields = extractFromOcr(text);
  let score = 0;
  if (fields.expiry_date) score += 600;
  if (fields.contact_name) score += 220;
  if (fields.contact_phone) score += 180;
  if (fields.contact_email) score += 180;
  if (fields.client_address) score += 80;
  if (fields.po_box) score += 40;
  if (fields.document_type) score += 120;
  return score;
}

function candidateScore(candidate: Candidate): number {
  if (candidate.error) return -1;
  const fields = extractFromOcr(candidate.text);
  const usableBonus = isTextUsable(candidate.text) ? 500 : 0;
  const q = quality(candidate.text);
  const qualityScore = isTextUsable(candidate.text) ? q.score : Math.min(q.score, 500);
  const missingActionDatePenalty = fields.expiry_date ? 0 : 1_800;
  const weakAddressPenalty = fields.client_address === "פקס" ? 200 : 0;
  const weakContactNamePenalty = fields.contact_name && /נייד|טלפון|פקס/.test(fields.contact_name) ? 120 : 0;
  return qualityScore + extractedFieldScore(candidate.text) + usableBonus
    - missingActionDatePenalty
    - weakAddressPenalty
    - weakContactNamePenalty;
}

function pickBestCandidate(candidates: Candidate[]): Candidate | null {
  const usable = candidates.filter((candidate) => isTextUsable(candidate.text));
  const pool = usable.length ? usable : candidates;
  return [...pool].sort((a, b) => candidateScore(b) - candidateScore(a))[0] ?? null;
}

function firstErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function timedCandidate(
  source: string,
  method: string,
  fn: () => Promise<Omit<Candidate, "source" | "method" | "elapsedMs" | "error">>
): Promise<Candidate> {
  const started = Date.now();
  try {
    return { source, method, elapsedMs: Date.now() - started, error: null, ...(await fn()) };
  } catch (err) {
    return {
      source,
      method,
      text: "",
      pageCount: null,
      needsOcr: true,
      reason: firstErrorMessage(err),
      elapsedMs: Date.now() - started,
      error: firstErrorMessage(err),
    };
  }
}

async function regularFlow(filePath: string): Promise<Candidate> {
  return timedCandidate("regular", "parsePdf->ocrFile fallback", async () => {
    const parsed = await parsePdf(filePath);
    if (parsed.needsOcr) {
      return {
        text: await ocrFile(filePath),
        pageCount: parsed.pageCount,
        needsOcr: true,
        reason: parsed.reason ?? null,
      };
    }
    return {
      text: parsed.text,
      pageCount: parsed.pageCount,
      needsOcr: false,
      reason: null,
    };
  });
}

async function nativePdfCandidates(filePath: string): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  candidates.push(await timedCandidate("proposed", "pdf-parse native text", async () => {
    const parsed = await parsePdf(filePath);
    return {
      text: parsed.text,
      pageCount: parsed.pageCount,
      needsOcr: parsed.needsOcr,
      reason: parsed.reason ?? null,
    };
  }));

  candidates.push(await timedCandidate("proposed", "pdfplumber native text + tables", async () => {
    const parsed = parsePdfWithPlumber(filePath);
    if (!parsed) throw new Error("pdfplumber returned no result");
    const tableText = tablesToText(parsed.tables);
    const text = [parsed.text, tableText ? `\n\n--- extracted tables ---\n${tableText}` : ""].join("").trim();
    return {
      text,
      pageCount: parsed.pageCount,
      needsOcr: parsed.needsOcr || !isTextUsable(text),
      reason: parsed.needsOcr ? "pdfplumber says OCR needed" : null,
    };
  }));

  return candidates;
}

async function externalEngineCandidates(filePath: string): Promise<Candidate[]> {
  if (!isPdf(filePath)) return [];
  const engines = ["docling", "pdfmux", "craft"];
  const script = resolve("src", "pipeline", "external_ocr_engines.py");
  const candidates: Candidate[] = [];

  for (const engine of engines) {
    candidates.push(await timedCandidate("external", `${engine} optional engine`, async () => {
      const {stdout} = await execFile(
        "python",
        [script, "--engine", engine, "--file", filePath],
        {
          timeout: readIntEnv("EXTERNAL_OCR_TIMEOUT_MS", 130_000, 5_000, 600_000),
          maxBuffer: 20 * 1024 * 1024,
          encoding: "utf-8",
        }
      );
      const parsed = JSON.parse(stdout) as {
        engine: string;
        available: boolean;
        text?: string;
        error?: string | null;
        meta?: Record<string, unknown>;
      };
      if (!parsed.available) {
        throw new Error(parsed.error ?? `${engine} unavailable`);
      }
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      return {
        text: parsed.text ?? "",
        pageCount: null,
        needsOcr: true,
        reason: parsed.meta ? JSON.stringify(parsed.meta) : null,
      };
    }));
  }

  return candidates;
}

async function proposedFlow(filePath: string, includeExternal: boolean, compareAll: boolean): Promise<{ selected: Candidate; candidates: Candidate[] }> {
  if (!isPdf(filePath)) {
    const selected = await timedCandidate("proposed", "preprocessed image OCR", async () => ({
      text: await ocrPreprocessedImages([filePath]),
      pageCount: null,
      needsOcr: true,
      reason: "image input",
    }));
    return { selected, candidates: [selected] };
  }

  const candidates = await nativePdfCandidates(filePath);
  if (includeExternal) {
    candidates.push(...await externalEngineCandidates(filePath));
  }
  const bestNative = pickBestCandidate(candidates);
  if (bestNative && isTextUsable(bestNative.text) && !compareAll) {
    return { selected: { ...bestNative, needsOcr: false, reason: bestNative.reason }, candidates };
  }

  const rawOcr = await timedCandidate("proposed", "render->ocr heb+eng", async () => ({
    text: await ocrFile(filePath),
    pageCount: bestNative?.pageCount ?? null,
    needsOcr: true,
    reason: bestNative ? `native text weak: ${JSON.stringify(quality(bestNative.text))}` : "native text unavailable",
  }));
  candidates.push(rawOcr);

  const ocr = await timedCandidate("proposed", "render->preprocess->ocr heb+eng", async () => ({
    text: await ocrRenderedPdf(filePath),
    pageCount: bestNative?.pageCount ?? null,
    needsOcr: true,
    reason: bestNative ? `native text weak: ${JSON.stringify(quality(bestNative.text))}` : "native text unavailable",
  }));
  candidates.push(ocr);
  const selected = pickBestCandidate(candidates) ?? ocr;
  return { selected, candidates };
}

async function ocrRenderedPdf(pdfPath: string): Promise<string> {
  const pages = await renderPdfToImages(pdfPath);
  const dir = pages[0] ? dirname(pages[0]) : null;
  try {
    return await ocrPreprocessedImages(pages);
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

async function renderPdfToImages(pdfPath: string): Promise<string[]> {
  const dir = join(tmpdir(), `reminder-audit-ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const prefix = join(dir, "page");
  const pdftoppm = resolvePdftoppm();

  try {
    await execFile(
      pdftoppm.command,
      ["-png", "-r", String(PDF_RENDER_DPI), pdfPath, prefix],
      { shell: pdftoppm.shell, env: pdftoppm.env, timeout: PDF_RENDER_TIMEOUT_MS }
    );

    const pages = readdirSync(dir)
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0))
      .map((name) => join(dir, name));
    if (!pages.length) throw new Error("pdftoppm did not create page images");
    for (const page of pages) {
      if (!existsSync(page) || statSync(page).size === 0) throw new Error(`empty rendered page: ${page}`);
    }
    return pages;
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

function resolvePdftoppm(): { command: string; shell: boolean; env: NodeJS.ProcessEnv } {
  const configured = process.env.PDF_THUMBNAIL_PDFTOPPM?.trim();
  if (configured) return { command: configured, shell: false, env: process.env };

  const bundled = resolve(
    process.env.USERPROFILE ?? "",
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "native",
    "poppler",
    "Library",
    "bin",
    "pdftoppm.exe"
  );
  if (process.platform === "win32" && existsSync(bundled)) {
    return {
      command: bundled,
      shell: false,
      env: { ...process.env, PATH: `${dirname(bundled)};${process.env.PATH ?? ""}` },
    };
  }

  return { command: "pdftoppm", shell: process.platform === "win32", env: process.env };
}

async function preprocessImage(imagePath: string): Promise<string> {
  const outPath = imagePath.replace(/\.png$/i, ".preprocessed.png");
  await sharp(imagePath)
    .grayscale()
    .normalize()
    .median(1)
    .sharpen()
    .threshold(170)
    .png()
    .toFile(outPath);
  return outPath;
}

async function ocrPreprocessedImages(imagePaths: string[]): Promise<string> {
  const lang = getSettings().ocrLanguage || "heb+eng";
  const worker = await createWorker(lang);
  const preprocessed: string[] = [];
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: "6" as any,
      preserve_interword_spaces: "1" as any,
    });

    const chunks: string[] = [];
    for (let i = 0; i < imagePaths.length; i += 1) {
      const imagePath = await preprocessImage(imagePaths[i]);
      preprocessed.push(imagePath);
      const result = await Promise.race([
        worker.recognize(imagePath),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("OCR timed out")), OCR_TIMEOUT_MS)
        ),
      ]);
      chunks.push(`--- page ${i + 1} ---\n${result.data.text ?? ""}`.trim());
    }
    return chunks.join("\n\n").trim();
  } finally {
    await worker.terminate().catch(() => {});
    for (const path of preprocessed) {
      try { rmSync(path, { force: true }); } catch {}
    }
  }
}

function summarizeCandidate(candidate: Candidate) {
  return {
    source: candidate.source,
    method: candidate.method,
    pageCount: candidate.pageCount,
    needsOcr: candidate.needsOcr,
    reason: candidate.reason,
    elapsedMs: candidate.elapsedMs,
    error: candidate.error,
    quality: quality(candidate.text),
    fieldScore: extractedFieldScore(candidate.text),
    candidateScore: candidateScore(candidate),
    fields: extractFromOcr(candidate.text),
    kind: classifyDocumentKind(candidate.text),
    preview: candidate.text.replace(/\s+/g, " ").slice(0, 500),
  };
}

function markdownEscape(value: unknown): string {
  return String(value ?? "-")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "/")
    .trim() || "-";
}

function writeMarkdownSummary(outPath: string, report: any[]): string {
  const mdPath = outPath.replace(/\.json$/i, ".md");
  const same = report.filter((r) =>
    r.comparison.scoreDelta === 0 &&
    JSON.stringify(r.comparison.regularFields) === JSON.stringify(r.comparison.proposedFields)
  ).length;
  const selectedByMethod = new Map<string, number>();
  for (const row of report) {
    const method = row.proposed?.selected?.method ?? "unknown";
    selectedByMethod.set(method, (selectedByMethod.get(method) ?? 0) + 1);
  }

  const lines: string[] = [];
  lines.push("# OCR Engine Benchmark");
  lines.push("");
  lines.push(`Compared files: ${report.length}`);
  lines.push(`Same selected result as regular flow: ${same}`);
  lines.push(`Selected text unusable: ${report.filter((r) => !r.gate.textUsable).length}`);
  lines.push(`Missing expiry_date: ${report.filter((r) => !r.proposed?.selected?.fields?.expiry_date).length}`);
  lines.push(`Missing contact_phone: ${report.filter((r) => !r.proposed?.selected?.fields?.contact_phone).length}`);
  lines.push(`Missing contact_email: ${report.filter((r) => !r.proposed?.selected?.fields?.contact_email).length}`);
  lines.push("");
  lines.push("## Selected Engines");
  lines.push("");
  for (const [method, count] of [...selectedByMethod.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${method}: ${count}`);
  }
  lines.push("");
  lines.push("## Per File Winner");
  lines.push("");
  lines.push("| File | Winner | Score | Expiry | Phone | Email | Gate |");
  lines.push("|---|---|---:|---|---|---|---|");
  for (const row of report) {
    const fields = row.proposed?.selected?.fields ?? {};
    lines.push([
      markdownEscape(row.target.fileName),
      markdownEscape(row.proposed?.selected?.method),
      markdownEscape(row.proposed?.selected?.candidateScore),
      markdownEscape(fields.expiry_date),
      markdownEscape(fields.contact_phone),
      markdownEscape(fields.contact_email),
      row.gate?.wouldCreateAfterDryRun ? "pass" : "blocked",
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("");
  lines.push("## Candidate Matrix");
  lines.push("");
  lines.push("| File | Candidate | Available | Score | Chars | Hebrew | Expiry | Phone | Email | Error |");
  lines.push("|---|---|---|---:|---:|---:|---|---|---|---|");
  for (const row of report) {
    for (const candidate of row.proposed?.candidates ?? []) {
      const fields = candidate.fields ?? {};
      lines.push([
        markdownEscape(row.target.fileName),
        markdownEscape(candidate.method),
        candidate.error ? "no" : "yes",
        markdownEscape(candidate.candidateScore),
        markdownEscape(candidate.quality?.chars),
        markdownEscape(candidate.quality?.hebrew),
        markdownEscape(fields.expiry_date),
        markdownEscape(fields.contact_phone),
        markdownEscape(fields.contact_email),
        markdownEscape(candidate.error),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
  }

  writeFileSync(mdPath, lines.join("\n"), "utf-8");
  return mdPath;
}

function requiredTemplateFields(template: DocTemplate | null): string[] {
  return (template?.fields ?? [])
    .filter((field) => Boolean(field.required))
    .map((field) => field.key);
}

function missingTemplateFields(template: DocTemplate | null, fields: Record<string, unknown> | null | undefined): string[] {
  if (!template) return [];
  const data = fields ?? {};
  return requiredTemplateFields(template).filter((key) => {
    const value = data[key];
    return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  });
}

async function runAiDryRun(text: string, target: Target) {
  const template = await pickTemplate(text, target.doc?.user_id ? String(target.doc.user_id) : undefined);
  if (!template) {
    return {
      template: null,
      extraction: null,
      missingRequired: [],
      wouldCreateEntity: false,
      reason: "no template matched",
    };
  }

  const extraction = await extractWithTemplate(
    text,
    template,
    target.sourceKind === "document" ? target.id : undefined,
    target.fileName,
  );
  const fields = extraction.fields as Record<string, unknown> | null;
  const missingRequired = missingTemplateFields(template, fields);
  return {
    template: { id: template.id, name: template.name, document_kind: template.document_kind },
    extraction: {
      error: extraction.error,
      execMs: extraction.execMs,
      usage: extraction.usage,
      fields,
    },
    missingRequired,
    wouldCreateEntity: !extraction.error && Boolean(fields) && missingRequired.length === 0,
    reason: extraction.error
      ? extraction.error
      : missingRequired.length
        ? `missing required fields: ${missingRequired.join(", ")}`
        : "storage + extraction/classification passed",
  };
}

async function loadTargets(args: Args): Promise<Target[]> {
  const targets: Target[] = [];

  for (const file of args.files) {
    const filePath = resolve(file);
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    targets.push({ sourceKind: "file", id: filePath, filePath, fileName: basename(filePath) });
  }

  for (const dir of args.dirs) {
    const dirPath = resolve(dir);
    if (!existsSync(dirPath)) throw new Error(`Directory not found: ${dirPath}`);
    const files = readdirSync(dirPath)
      .filter((name) => extname(name).toLowerCase() === ".pdf")
      .sort()
      .slice(0, args.limit)
      .map((name) => resolve(dirPath, name));
    for (const filePath of files) {
      targets.push({ sourceKind: "file", id: filePath, filePath, fileName: basename(filePath) });
    }
  }

  if (args.documentIds.length || args.kind || args.supplier || args.withAi) {
    await connectDb();
  }

  for (const documentId of args.documentIds) {
    const doc = await col("documents").findOne({ _id: toObjectId(documentId) } as any) as Record<string, any> | null;
    if (!doc) throw new Error(`Document not found: ${documentId}`);
    targets.push(await targetFromDoc(doc));
  }

  if (args.kind || args.supplier) {
    const filter: Record<string, any> = { mime_type: "application/pdf" };
    if (args.userId) filter.user_id = args.userId;
    if (args.kind) {
      if (args.kind === "contract") {
        filter.$or = [
          { document_kind: "contract" },
          { document_type: "contract" },
          { document_type: "חוזה" },
          { "extracted_fields": /חוזה|הסכם|contract/i },
        ];
      } else {
        filter.$or = [{ document_kind: args.kind }, { document_type: args.kind }];
      }
    }
    if (args.supplier) {
      filter.$or = [
        ...(filter.$or ?? []),
        { file_name: { $regex: args.supplier, $options: "i" } },
        { raw_text: { $regex: args.supplier, $options: "i" } },
      ];
    }

    const docs = await col("documents")
      .find(filter)
      .sort({ updated_at: -1, created_at: -1 })
      .limit(args.limit)
      .toArray() as Record<string, any>[];

    for (const doc of docs) {
      if (!args.includeHealthy && doc.raw_text && isTextUsable(String(doc.raw_text))) continue;
      targets.push(await targetFromDoc(doc));
      if (targets.length >= args.limit + args.files.length + args.dirs.length + args.documentIds.length) break;
    }
  }

  return targets;
}

function toObjectId(value: string): ObjectId | string {
  try { return new ObjectId(value); } catch { return value; }
}

async function targetFromDoc(doc: Record<string, any>): Promise<Target> {
  const filePath = await resolveDocumentFilePath(doc as any);
  return {
    sourceKind: "document",
    id: String(doc._id),
    filePath,
    fileName: String(doc.file_name ?? basename(filePath)),
    doc,
  };
}

async function auditTarget(target: Target, withAi: boolean, includeExternal: boolean, compareAll: boolean) {
  const storageOk = existsSync(target.filePath);
  const regular = await regularFlow(target.filePath);
  const proposed = await proposedFlow(target.filePath, includeExternal, compareAll);
  const selectedSummary = summarizeCandidate(proposed.selected);
  const regularSummary = summarizeCandidate(regular);
  const ai = withAi ? await runAiDryRun(proposed.selected.text, target) : null;

  return {
    target: {
      sourceKind: target.sourceKind,
      id: target.id,
      fileName: target.fileName,
      filePath: target.filePath,
      storageOk,
      existing: target.doc ? {
        processing_status: target.doc.processing_status ?? null,
        document_kind: target.doc.document_kind ?? null,
        document_type: target.doc.document_type ?? null,
        raw_text_quality: quality(String(target.doc.raw_text ?? "")),
        invoice_saved: target.doc.invoice_saved ?? null,
        invoice_rejected: target.doc.invoice_rejected ?? null,
        invoice_rejection_label: target.doc.invoice_rejection_label ?? null,
      } : null,
    },
    regular: regularSummary,
    proposed: {
      selected: selectedSummary,
      candidates: proposed.candidates.map(summarizeCandidate),
    },
    comparison: {
      charsDelta: quality(proposed.selected.text).chars - quality(regular.text).chars,
      scoreDelta: quality(proposed.selected.text).score - quality(regular.text).score,
      regularFields: regularSummary.fields,
      proposedFields: selectedSummary.fields,
    },
    aiDryRun: ai,
    gate: {
      storageOk,
      textUsable: isTextUsable(proposed.selected.text),
      classification: selectedSummary.kind,
      wouldCreateAfterDryRun: storageOk && isTextUsable(proposed.selected.text) && (!withAi || Boolean(ai?.wouldCreateEntity)),
      reason: !storageOk
        ? "source file missing / storage unavailable"
        : !isTextUsable(proposed.selected.text)
          ? "text extraction still weak"
          : withAi
            ? ai?.reason
            : "run with --with-ai to validate template extraction before entity creation",
    },
  };
}

const args = parseArgs(process.argv.slice(2));
const targets = await loadTargets(args);
if (!targets.length) {
  console.log("No matching PDF targets found.");
  await closeDb().catch(() => {});
  process.exit(0);
}

const report = [];
for (const target of targets) {
  console.log(`\n=== OCR audit: ${target.fileName} (${target.id}) ===`);
  const result = await auditTarget(target, args.withAi, args.external, args.compareAll);
  report.push(result);
  console.log(JSON.stringify({
    target: result.target,
    regular: {
      method: result.regular.method,
      quality: result.regular.quality,
      fields: result.regular.fields,
      kind: result.regular.kind,
      error: result.regular.error,
    },
    proposed: {
      method: result.proposed.selected.method,
      quality: result.proposed.selected.quality,
      fields: result.proposed.selected.fields,
      kind: result.proposed.selected.kind,
      error: result.proposed.selected.error,
    },
    comparison: result.comparison,
    gate: result.gate,
    aiDryRun: result.aiDryRun,
  }, null, 2));
}

if (args.outPath) {
  const outPath = resolve(args.outPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ createdAt: new Date().toISOString(), report }, null, 2), "utf-8");
  console.log(`\nFull audit report saved to ${outPath}`);
  const mdPath = writeMarkdownSummary(outPath, report);
  console.log(`Markdown summary saved to ${mdPath}`);
}

await closeDb().catch(() => {});
process.exit(0);
