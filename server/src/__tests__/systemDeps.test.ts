import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  execCalls: [] as { command: string; args: string[] }[],
  failures: new Set<string>(),
  logs: [] as { level: string; event: string; payload: unknown }[],
}));

// The module under test wraps execFile with util.promisify, which honours
// promisify.custom. Node's real execFile uses it to resolve {stdout, stderr};
// the mock must do the same or the destructure yields undefined.
vi.mock("child_process", async () => {
  const {promisify} = await import("util");

  const run = (command: string, args: string[]) => {
    state.execCalls.push({ command, args });
    // Match on substring: resolvePdftoppm may return an absolute path
    // (bundled Poppler on Windows) rather than the bare binary name.
    for (const failing of state.failures) {
      if (command.toLowerCase().includes(failing.toLowerCase())) {
        throw new Error(`spawn ${failing} ENOENT`);
      }
    }
    // pdftoppm reports its version on stderr, tesseract on stdout
    if (command.toLowerCase().includes("pdftoppm")) {
      return { stdout: "", stderr: "pdftoppm version 22.12.0\n" };
    }
    return { stdout: "tesseract 5.3.0\n leptonica-1.82.0\n", stderr: "" };
  };

  const execFile = (
    command: string,
    args: string[],
    _options: unknown,
    callback?: (error: Error | null, stdout?: string, stderr?: string) => void,
  ) => {
    try {
      const {stdout, stderr} = run(command, args);
      callback?.(null, stdout, stderr);
    } catch (err) {
      callback?.(err as Error);
    }
  };

  Object.defineProperty(execFile, promisify.custom, {
    value: async (command: string, args: string[]) => run(command, args),
  });

  return { execFile };
});

vi.mock("../logger", () => ({
  logger: {
    info: (event: string, payload: unknown) => state.logs.push({ level: "info", event, payload }),
    warn: (event: string, payload: unknown) => state.logs.push({ level: "warn", event, payload }),
    error: (event: string, payload: unknown) => state.logs.push({ level: "error", event, payload }),
  },
}));

describe("checkSystemDeps", () => {
  beforeEach(() => {
    state.execCalls = [];
    state.failures = new Set();
    state.logs = [];
    delete process.env.PDF_THUMBNAIL_PDFTOPPM;
  });

  afterEach(() => {
    vi.resetModules();
    delete process.env.PDF_THUMBNAIL_PDFTOPPM;
  });

  it("reports ok when both binaries respond", async () => {
    const {checkSystemDeps} = await import("../pipeline/systemDeps");

    const report = await checkSystemDeps();

    expect(report.ok).toBe(true);
    expect(report.deps.map((dep) => dep.name).sort()).toEqual(["pdfplumber", "pdftoppm", "tesseract"]);
    expect(report.deps.every((dep) => dep.ok)).toBe(true);
    expect(report.deps.find((dep) => dep.name === "pdftoppm")?.version).toContain("pdftoppm version");
    expect(report.deps.find((dep) => dep.name === "tesseract")?.version).toContain("tesseract 5.3.0");
  });

  it("flags the exact binary that is missing", async () => {
    state.failures.add("pdftoppm");
    const {checkSystemDeps} = await import("../pipeline/systemDeps");

    const report = await checkSystemDeps();

    expect(report.ok).toBe(false);
    const poppler = report.deps.find((dep) => dep.name === "pdftoppm");
    expect(poppler?.ok).toBe(false);
    expect(poppler?.error).toContain("ENOENT");
    expect(report.deps.find((dep) => dep.name === "tesseract")?.ok).toBe(true);
  });

  it("probes the same pdftoppm path the OCR pipeline uses", async () => {
    process.env.PDF_THUMBNAIL_PDFTOPPM = "/opt/poppler/bin/pdftoppm";
    const {checkSystemDeps} = await import("../pipeline/systemDeps");

    await checkSystemDeps();

    expect(state.execCalls.map((call) => call.command)).toContain("/opt/poppler/bin/pdftoppm");
  });

  it("logs an actionable error at startup instead of throwing", async () => {
    state.failures.add("pdftoppm");
    const {logSystemDepsOnStartup} = await import("../pipeline/systemDeps");

    const report = await logSystemDepsOnStartup();

    expect(report.ok).toBe(false);
    const missing = state.logs.find((log) => log.event === "system_dep_missing");
    expect(missing?.level).toBe("error");
    expect(JSON.stringify(missing?.payload)).toContain("poppler-utils");
    expect(state.logs.some((log) => log.event === "system_deps_incomplete")).toBe(true);
  });
});
