import {mkdtempSync, rmSync, writeFileSync} from "fs";
import {tmpdir} from "os";
import {join} from "path";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  recognized: [] as string[],
  terminated: 0,
  execCalls: [] as { command: string; args: string[] }[],
}));

vi.mock("tesseract.js", () => ({
  createWorker: vi.fn(async () => ({
    setParameters: vi.fn(async () => {}),
    recognize: vi.fn(async (path: string) => {
      state.recognized.push(path);
      return { data: { text: `text from ${path}` } };
    }),
    terminate: vi.fn(async () => {
      state.terminated += 1;
    }),
  })),
}));

vi.mock("child_process", () => ({
  execFile: (command: string, args: string[], options: unknown, callback: (error: Error | null) => void) => {
    state.execCalls.push({ command, args });
    const prefix = args[args.length - 1];
    writeFileSync(`${prefix}-1.png`, "png-page-1");
    writeFileSync(`${prefix}-2.png`, "png-page-2");
    callback(null);
  },
}));

vi.mock("../settings", () => ({
  getSettings: () => ({ ocrLanguage: "heb+eng" }),
}));

describe("ocrFile", () => {
  let dir = "";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ocr-parser-test-"));
    state.recognized = [];
    state.terminated = 0;
    state.execCalls = [];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("renders PDF pages before sending them to Tesseract", async () => {
    const pdfPath = join(dir, "scan.pdf");
    writeFileSync(pdfPath, "%PDF-1.4");
    const {ocrFile} = await import("../pipeline/ocrParser");

    const text = await ocrFile(pdfPath);

    expect(state.execCalls).toHaveLength(1);
    expect(state.execCalls[0].command.toLowerCase()).toContain("pdftoppm");
    expect(state.recognized).toHaveLength(2);
    expect(state.recognized.every((path) => path.endsWith(".png"))).toBe(true);
    expect(state.recognized).not.toContain(pdfPath);
    expect(text).toContain("text from");
    expect(state.terminated).toBe(1);
  });

  it("passes image files directly to Tesseract", async () => {
    const imagePath = join(dir, "scan.png");
    writeFileSync(imagePath, "png");
    const {ocrFile} = await import("../pipeline/ocrParser");

    await ocrFile(imagePath);

    expect(state.execCalls).toHaveLength(0);
    expect(state.recognized).toEqual([imagePath]);
  });
});
