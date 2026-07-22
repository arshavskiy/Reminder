import {config as loadDotenv} from "dotenv";
import {fileURLToPath} from "url";
import {dirname, join} from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from the package install directory, not process.cwd() — once
// installed globally (npm link / npm i -g), the CLI is run from arbitrary
// directories, and dotenv/config's default cwd-relative lookup would silently
// miss the .env file sitting next to this package.
loadDotenv({ path: join(__dirname, "..", ".env"), quiet: true });

export interface Config {
  ollamaUrl: string;
  ollamaModel: string;
  ocrLanguage: string;
  extractionMaxChars: number;
  ollamaNumCtx: number;
  pythonPath: string;
}

export function getConfig(): Config {
  return {
    // 127.0.0.1, not "localhost" — Node's fetch (undici) resolves "localhost"
    // to ::1 first, and Ollama listens on IPv4 only by default, which makes
    // every request fail instantly with ECONNREFUSED.
    ollamaUrl: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "qwen3:4b",
    ocrLanguage: process.env.OCR_LANGUAGE ?? "heb+eng",
    // 24000 chars covers a realistic multi-page document (a few pages of
    // Hebrew text) without silently dropping a reminder date that happens to
    // sit on a later page — the previous 8000-char default truncated well
    // before the end of longer PDFs. Must stay paired with ollamaNumCtx
    // below (~1.5-2 chars/token for Hebrew) or truncation just moves from
    // this slice to Ollama's own context window instead of being fixed.
    extractionMaxChars: Number(process.env.EXTRACTION_MAX_CHARS ?? 24000),
    // Ollama defaults num_ctx to 65536 regardless of model size, which forces
    // most of the model's weight + KV cache off a 4GB GPU and onto slow CPU
    // inference. 16384 covers 24000 input chars (~12-16k tokens for Hebrew)
    // plus the system prompt and output, while still fitting a 4B Q4 model
    // mostly on a 4GB GPU. Raise both together if you increase either.
    ollamaNumCtx: Number(process.env.OLLAMA_NUM_CTX ?? 16384),
    // "python" on PATH can resolve to a different interpreter than the one
    // with pdfplumber/pypdfium2 installed (confirmed on this machine: bash's
    // python3 and Windows' python.exe were different installs with different
    // packages). Point this at the interpreter you actually installed
    // pdfplumber into if the default doesn't work — see README setup.
    pythonPath: process.env.PYTHON_PATH ?? "python",
  };
}
