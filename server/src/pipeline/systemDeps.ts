import {execFile as execFileCb} from "child_process";
import {promisify} from "util";
import {logger} from "../logger";
import {resolvePdftoppm} from "./ocrParser";

const execFile = promisify(execFileCb);

const PROBE_TIMEOUT_MS = 10_000;

/** Interpreter used for the Python-backed parsers; overridable per environment. */
export function pythonCommand(): string {
  return process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
}

export type SystemDepStatus = {
  name: string;
  ok: boolean;
  command: string;
  version?: string;
  error?: string;
};

export type SystemDepsReport = {
  ok: boolean;
  checkedAt: number;
  deps: SystemDepStatus[];
};

/**
 * Poppler (pdftoppm) and pdfplumber are OS / Python packages, not npm
 * dependencies. When that config is wrong the failure only surfaces mid-import
 * as `spawn pdftoppm ENOENT`, so probe them up front. OCR itself uses
 * tesseract.js and does not need a system tesseract binary.
 */
async function probe(
  name: string,
  command: string,
  args: string[],
  options: { shell?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<SystemDepStatus> {
  try {
    const {stdout, stderr} = await execFile(command, args, {
      shell: options.shell ?? false,
      env: options.env ?? process.env,
      timeout: PROBE_TIMEOUT_MS,
    });
    // pdftoppm prints its version banner on stderr
    const output = `${stdout ?? ""}${stderr ?? ""}`.trim();
    return {
      name,
      ok: true,
      command,
      version: output.split(/\r?\n/)[0]?.trim() || undefined,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      command,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkSystemDeps(): Promise<SystemDepsReport> {
  const pdftoppm = resolvePdftoppm();

  const deps = await Promise.all([
    probe("pdftoppm", pdftoppm.command, ["-v"], {
      shell: false,
      env: pdftoppm.env,
    }),
    // OCR uses tesseract.js, not the OS tesseract binary. Do not probe `tesseract`
    // — it is not installed on Windows and is not on the import path.
    // pdfplumber reads the equipment tables that pdf-parse flattens into fused
    // text. Probed through the interpreter so a present Python with the module
    // missing is reported as missing rather than as working.
    // Not run through a shell: the -c payload contains quotes that Windows cmd
    // re-splits, which made a working pdfplumber report as missing.
    probe("pdfplumber", pythonCommand(), ["-c", "import pdfplumber;print('pdfplumber', pdfplumber.__version__)"], {
      shell: false,
      // Without this Python writes Hebrew as replacement characters on any
      // machine whose stdout is not already UTF-8.
      env: {...process.env, PYTHONIOENCODING: "utf-8"},
    }),
  ]);

  return {
    ok: deps.every((dep) => dep.ok),
    checkedAt: Date.now(),
    deps,
  };
}

/**
 * Run at boot. Never throws — a missing OCR binary must not stop the server
 * from serving everything that does not need it.
 */
const MISSING_DEP_HINTS: Record<string, string> = {
  pdftoppm: "Install Poppler via railpack.json aptPackages (poppler-utils) or set PDF_THUMBNAIL_PDFTOPPM",
  pdfplumber: "Install Python and pdfplumber via railpack.json; without it equipment tables fall back to flattened text",
};

export async function logSystemDepsOnStartup(): Promise<SystemDepsReport> {
  const report = await checkSystemDeps();

  for (const dep of report.deps) {
    if (dep.ok) {
      logger.info("system_dep_ok", {
        dep: dep.name,
        command: dep.command,
        version: dep.version,
      });
    } else {
      logger.error("system_dep_missing", {
        dep: dep.name,
        command: dep.command,
        error: dep.error,
        hint: MISSING_DEP_HINTS[dep.name] ?? "Check the deploy configuration for this dependency",
      });
    }
  }

  if (!report.ok) {
    logger.error("system_deps_incomplete", {
      missing: report.deps.filter((dep) => !dep.ok).map((dep) => dep.name),
      impact: "PDF rasterization or equipment-table extract will fail until these are installed",
    });
  }

  return report;
}
