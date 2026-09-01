import {createWorker} from "tesseract.js";
import {getSettings} from "../settings";
import {fixHebrewBidi} from "./hebrewBidi";
import {execFile as execFileCb} from "child_process";
import {existsSync, mkdirSync, readdirSync, rmSync, statSync} from "fs";
import {tmpdir} from "os";
import {dirname, extname, join, resolve} from "path";
import {promisify} from "util";

const OCR_TIMEOUT_MS = 120_000;
const PDF_RENDER_TIMEOUT_MS = 60_000;
const PDF_OCR_DPI = 220;

const execFile = promisify(execFileCb);

export async function ocrFile(filePath: string): Promise<string> {
  const settings = getSettings();
  const lang = settings.ocrLanguage; // e.g. "heb+eng"
  const imagePaths = isPdfPath(filePath) ? await renderPdfToImages(filePath) : [filePath];

  const worker = await createWorker(lang);
  try {
    // PSM 6 = uniform block of text (best for structured documents / forms)
    // preserve_interword_spaces keeps column spacing intact so Hebrew+Latin
    // table cells don't get merged into garbled runs
    await worker.setParameters({
      tessedit_pageseg_mode: "6" as any,
      preserve_interword_spaces: "1" as any,
    });

    const textParts: string[] = [];
    for (const imagePath of imagePaths) {
      const result = await Promise.race([
        worker.recognize(imagePath),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("OCR timed out after 120s")), OCR_TIMEOUT_MS)
        ),
      ]);
      textParts.push(result.data.text ?? "");
    }

    let text = textParts.join("\n\n");
    text = fixHebrewBidi(text);
    return text;
  } finally {
    worker.terminate().catch(() => {});
    if (imagePaths.length !== 1 || imagePaths[0] !== filePath) {
      rmSync(dirname(imagePaths[0] ?? ""), { recursive: true, force: true });
    }
  }
}

function isPdfPath(filePath: string): boolean {
  return extname(filePath).toLowerCase() === ".pdf";
}

async function renderPdfToImages(pdfPath: string): Promise<string[]> {
  const tempDir = join(tmpdir(), `reminder-pdf-ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
  const prefix = join(tempDir, "page");
  try {
    const pdftoppm = resolvePdftoppm();
    await execFile(
      pdftoppm.command,
      ["-png", "-r", String(PDF_OCR_DPI), pdfPath, prefix],
      { shell: pdftoppm.shell, env: pdftoppm.env, timeout: PDF_RENDER_TIMEOUT_MS }
    );

    const pages = renderedPages(tempDir, "page");
    if (!pages.length) throw new Error("pdftoppm did not create OCR page images");
    for (const page of pages) {
      if (!existsSync(page) || statSync(page).size === 0) {
        throw new Error(`pdftoppm created an empty OCR image: ${page}`);
      }
    }
    return pages;
  } catch (err) {
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Could not render PDF for OCR. Install Poppler/pdftoppm or set PDF_THUMBNAIL_PDFTOPPM. Details: ${err}`);
  }
}

function renderedPages(dir: string, prefix: string): string[] {
  const direct = join(dir, `${prefix}.png`);
  if (existsSync(direct)) return [direct];
  return readdirSync(dir)
    .filter((name) => /^page-\d+\.png$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0))
    .map((name) => join(dir, name));
}

export function resolvePdftoppm(): { command: string; shell: boolean; env: NodeJS.ProcessEnv } {
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
