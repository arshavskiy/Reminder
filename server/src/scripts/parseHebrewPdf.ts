import {config} from "dotenv";
import {execFile as execFileCb} from "child_process";
import {existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from "fs";
import {tmpdir} from "os";
import {dirname, extname, join, resolve} from "path";
import {promisify} from "util";
import {parsePdf} from "../pipeline/pdfParser";
import {ocrFile} from "../pipeline/ocrParser";
import {type OcrExtraction, extractFromOcr} from "../pipeline/ocrExtractor";
import {normalizeDate} from "../pipeline/dateNormalizer";

config({ path: resolve(process.cwd(), ".env") });
const execFile = promisify(execFileCb);

function usage(): never {
  console.error([
    "Usage:",
    "  npm run pdf:hebrew -- <pdf-path> [--ocr-only] [--fields-only] [--out <txt-path>]",
    "",
    "Examples:",
    "  npm run pdf:hebrew -- C:\\docs\\inspection.pdf",
    "  npm run pdf:hebrew -- C:\\docs\\inspection.pdf --ocr-only",
    "  npm run pdf:hebrew -- C:\\docs\\inspection.pdf --out C:\\tmp\\ocr.txt",
  ].join("\n"));
  process.exit(1);
}

const args = process.argv.slice(2);
function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

const fileArg = args.find((arg) => !arg.startsWith("--"));
if (!fileArg) usage();

const filePath = resolve(unquote(fileArg));
if (!existsSync(filePath)) {
  console.error(`PDF not found: ${filePath}`);
  process.exit(1);
}

const ocrOnly = args.includes("--ocr-only");
const fieldsOnly = args.includes("--fields-only");
const outIndex = args.indexOf("--out");
const outPath = outIndex >= 0 ? unquote(args[outIndex + 1]) : null;
if (outIndex >= 0 && !outPath) usage();

function normalisePhone(raw: string): string {
  const digits = raw.replace(/[\s\-]/g, "");
  if (digits.length === 10 && /^0/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return raw.trim();
}

function extractClientSection(rawText: string): string | null {
  const match = rawText.match(/(?:^|\n)\s*לכבוד\s*:?\s*([\s\S]+)/);
  if (!match?.[1]) return null;

  const after = match[1];
  const stopAt = after.search(
    /\n\s*(?:חשבון\s+עסקה|מקור|סה["״]?כ|פירוט|כמות|חתימה|בנק)\b/
  );
  return (stopAt >= 0 ? after.slice(0, stopAt) : after.slice(0, 600)).trim();
}

function extractInvoiceDueDate(rawText: string): string | null {
  const match = rawText.match(/(?:לתשלום|תשלום)\s+עד[^\d]{0,120}(\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{2}-\d{2})/s);
  return match?.[1] ? normalizeDate(match[1]) : null;
}

function extractInvoiceRecipient(rawText: string): string | null {
  const match = rawText.match(/(?:^|\n)\s*לכבוד\s*:?\s*([^\n\r\t|:]{2,80})/m);
  const raw = match?.[1]?.trim();
  if (!raw) return null;

  const compact = raw.replace(/\s{2,}/g, " ");
  const company = compact.match(/^(.+?בע["״']?מ)/);
  if (company?.[1]) return company[1].trim();

  return compact
    .replace(/\s+(?:לתשלום|תשלום|סה["״]?כ|עד)\b.*$/, "")
    .trim() || null;
}

function extractCliPhone(rawText: string): string | null {
  const attachedBeforeLabel = rawText.match(/(0[0-9]{8,9})\s*(?:נייד|טלפון)/);
  if (attachedBeforeLabel?.[1]) return normalisePhone(attachedBeforeLabel[1]);

  const labelled = rawText.match(/(?:נייד|טלפון|טל[.'"]?)\s*:?\s*(0[0-9]{1,2}[-\s]?[0-9]{3}[-\s]?[0-9]{4})/);
  if (labelled?.[1]) return normalisePhone(labelled[1]);

  const bare = rawText.match(/\b(0[235789][0-9][-\s]?[0-9]{3}[-\s]?[0-9]{4})\b/);
  return bare?.[1] ? normalisePhone(bare[1]) : null;
}

function extractCliEmail(rawText: string): string | null {
  const match = rawText.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+/);
  return match?.[0] ?? null;
}

function extractCliFields(rawText: string): OcrExtraction {
  const base = extractFromOcr(rawText);
  const clientSection = extractClientSection(rawText);

  return {
    ...base,
    expiry_date: extractInvoiceDueDate(rawText) ?? base.expiry_date,
    contact_name: extractInvoiceRecipient(rawText) ?? base.contact_name,
    contact_phone: (clientSection ? extractCliPhone(clientSection) : null) ?? base.contact_phone,
    contact_email: clientSection ? extractCliEmail(clientSection) : base.contact_email,
    document_type: /חשבון\s+עסקה/.test(rawText) ? "חשבונית" : base.document_type,
  };
}

async function renderPdfToPngs(pdfPath: string): Promise<string[]> {
  const dir = mkdtempSync(join(tmpdir(), "hebrew-pdf-ocr-"));
  const prefix = join(dir, "page");
  const bundledPoppler = resolve(
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
  const pdftoppm = existsSync(bundledPoppler) ? bundledPoppler : "pdftoppm";
  try {
    await execFile(
      pdftoppm,
      ["-r", "300", "-png", pdfPath, prefix],
      {
        shell: process.platform === "win32" && pdftoppm === "pdftoppm",
        env: existsSync(bundledPoppler)
          ? { ...process.env, PATH: `${dirname(bundledPoppler)};${process.env.PATH ?? ""}` }
          : process.env,
      }
    );
  } catch (error: any) {
    rmSync(dir, { recursive: true, force: true });
    const message = error?.message ?? String(error);
    throw new Error(
      `Could not render PDF pages for OCR. Install Poppler/pdftoppm or run without --ocr-only. Details: ${message}`
    );
  }

  const pages = readdirSync(dir)
    .filter((name) => /^page-\d+\.png$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0))
    .map((name) => join(dir, name));

  if (!pages.length) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error("PDF rendered successfully, but no page images were produced.");
  }

  return pages;
}

async function ocrPdfFile(pdfPath: string): Promise<string> {
  const pages = await renderPdfToPngs(pdfPath);
  const dir = pages.length ? resolve(pages[0], "..") : null;
  try {
    const chunks: string[] = [];
    for (let i = 0; i < pages.length; i += 1) {
      chunks.push(`\n--- page ${i + 1} ---\n${await ocrFile(pages[i])}`);
    }
    return chunks.join("\n").trim();
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

async function ocrPath(path: string): Promise<string> {
  return extname(path).toLowerCase() === ".pdf" ? ocrPdfFile(path) : ocrFile(path);
}

let text = "";
let method = "pdf-parse";
let pageCount: number | null = null;
let fallbackReason: string | null = null;

if (ocrOnly) {
  method = "ocr";
  text = await ocrPath(filePath);
} else {
  const pdf = await parsePdf(filePath);
  pageCount = pdf.pageCount;
  if (pdf.needsOcr) {
    method = "ocr-fallback";
    fallbackReason = pdf.reason ?? null;
    text = await ocrPath(filePath);
  } else {
    text = pdf.text;
  }
}

const fields = extractCliFields(text);

if (outPath) {
  writeFileSync(resolve(outPath), text, "utf-8");
}

if (fieldsOnly) {
  console.log(JSON.stringify(fields, null, 2));
} else {
  console.log("=== Hebrew PDF Parse ===");
  console.log(`file: ${filePath}`);
  console.log(`method: ${method}`);
  if (pageCount != null) console.log(`pages: ${pageCount}`);
  if (fallbackReason) console.log(`fallback_reason: ${fallbackReason}`);
  if (outPath) console.log(`text_saved_to: ${resolve(outPath)}`);
  console.log("");
  console.log("=== Extracted Fields ===");
  console.log(JSON.stringify(fields, null, 2));
  console.log("");
  console.log("=== Text ===");
  console.log(text);
}

process.exit(0);
