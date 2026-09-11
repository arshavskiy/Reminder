import {mkdirSync, mkdtempSync, existsSync, rmSync, utimesSync, writeFileSync} from "fs";
import {join} from "path";
import {tmpdir} from "os";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

// The sweeper reads pause state from Mongo. These tests are about file handling,
// so the control module is stubbed to "never paused" rather than standing up a DB.
vi.mock("../ops/processControl", () => ({
  isProcessPaused: async () => false,
}));

const originalDataDir = process.env.DATA_DIR;
const originalRetention = process.env.TEMP_FILE_RETENTION_HOURS;
let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "temp-files-test-"));
  process.env.DATA_DIR = dataDir;
  process.env.TEMP_FILE_RETENTION_HOURS = "6";
  vi.resetModules();
});

afterEach(() => {
  process.env.DATA_DIR = originalDataDir;
  process.env.TEMP_FILE_RETENTION_HOURS = originalRetention;
  rmSync(dataDir, { recursive: true, force: true });
  vi.resetModules();
});

/** Write a file and backdate its mtime, so the sweeper sees it as old. */
function writeAged(path: string, ageHours: number, contents = "x") {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents);
  const when = new Date(Date.now() - ageHours * 3600_000);
  utimesSync(path, when, when);
}

describe("releaseTempFile", () => {
  it("deletes a file inside a managed temp directory", async () => {
    const {releaseTempFile, tempDir} = await import("../storage/tempFiles");
    const path = join(tempDir("uploads"), "staged.pdf");
    writeFileSync(path, "data");

    releaseTempFile(path);

    expect(existsSync(path)).toBe(false);
  });

  it("refuses to delete a managed document, which may be the only local copy", async () => {
    const {releaseTempFile} = await import("../storage/tempFiles");
    const docsDir = join(dataDir, "documents");
    mkdirSync(docsDir, { recursive: true });
    const path = join(docsDir, "hash.pdf");
    writeFileSync(path, "the real document");

    releaseTempFile(path);

    expect(existsSync(path)).toBe(true);
  });

  it("refuses a sibling directory that merely shares a name prefix", async () => {
    const {releaseTempFile} = await import("../storage/tempFiles");
    const sibling = join(dataDir, "uploads-archive");
    mkdirSync(sibling, { recursive: true });
    const path = join(sibling, "keep.pdf");
    writeFileSync(path, "archived");

    releaseTempFile(path);

    expect(existsSync(path)).toBe(true);
  });

  it("refuses a path that escapes the temp dir with .. segments", async () => {
    const {releaseTempFile, tempDir} = await import("../storage/tempFiles");
    tempDir("uploads");
    const docsDir = join(dataDir, "documents");
    mkdirSync(docsDir, { recursive: true });
    const real = join(docsDir, "hash.pdf");
    writeFileSync(real, "the real document");

    releaseTempFile(join(dataDir, "uploads", "..", "documents", "hash.pdf"));

    expect(existsSync(real)).toBe(true);
  });

  it("ignores a missing file and a null path without throwing", async () => {
    const {releaseTempFile, tempDir} = await import("../storage/tempFiles");
    const missing = join(tempDir("tmp"), "never-existed.pdf");

    expect(() => releaseTempFile(missing)).not.toThrow();
    expect(() => releaseTempFile(null)).not.toThrow();
  });
});

describe("sweepTempFiles", () => {
  it("removes files past retention and keeps fresh ones", async () => {
    const {sweepTempFiles, tempDir} = await import("../storage/tempFiles");
    const uploads = tempDir("uploads");
    writeAged(join(uploads, "old.pdf"), 10);
    writeAged(join(uploads, "fresh.pdf"), 1);

    const result = sweepTempFiles();

    expect(existsSync(join(uploads, "old.pdf"))).toBe(false);
    expect(existsSync(join(uploads, "fresh.pdf"))).toBe(true);
    expect(result.deleted_count).toBe(1);
  });

  it("never touches data/documents, which the cache release owns", async () => {
    const {sweepTempFiles} = await import("../storage/tempFiles");
    const docsDir = join(dataDir, "documents");
    mkdirSync(docsDir, { recursive: true });
    writeAged(join(docsDir, "ancient.pdf"), 500);

    sweepTempFiles();

    expect(existsSync(join(docsDir, "ancient.pdf"))).toBe(true);
  });

  it("sweeps every managed directory in one pass", async () => {
    const {sweepTempFiles, tempDir} = await import("../storage/tempFiles");
    for (const name of ["uploads", "gmail-tmp", "template_samples", "tmp"] as const) {
      writeAged(join(tempDir(name), "old.bin"), 48);
    }

    const result = sweepTempFiles();

    expect(result.deleted_count).toBe(4);
    expect(result.per_dir.every((d) => d.deleted_count === 1)).toBe(true);
  });

  it("copes with a temp directory that was never created", async () => {
    const {sweepTempFiles} = await import("../storage/tempFiles");
    expect(() => sweepTempFiles()).not.toThrow();
  });
});

describe("tempDirUsage", () => {
  it("reports totals and separates the portion past retention", async () => {
    const {tempDirUsage, tempDir} = await import("../storage/tempFiles");
    const uploads = tempDir("uploads");
    writeAged(join(uploads, "old.pdf"), 10, "0123456789");
    writeAged(join(uploads, "fresh.pdf"), 1, "01234");

    const uploadsUsage = tempDirUsage().find((d) => d.name === "uploads")!;

    expect(uploadsUsage.file_count).toBe(2);
    expect(uploadsUsage.total_bytes).toBe(15);
    expect(uploadsUsage.stale_count).toBe(1);
    expect(uploadsUsage.stale_bytes).toBe(10);
    expect(uploadsUsage.oldest_file_age_minutes).toBeGreaterThanOrEqual(599);
  });

  it("reports a directory that does not exist as empty rather than failing", async () => {
    const {tempDirUsage} = await import("../storage/tempFiles");
    const usage = tempDirUsage().find((d) => d.name === "gmail-tmp")!;

    expect(usage.exists).toBe(false);
    expect(usage.file_count).toBe(0);
    expect(usage.oldest_file_age_minutes).toBeNull();
  });
});

describe("retention setting", () => {
  it("falls back to the default when the env value is not a positive number", async () => {
    process.env.TEMP_FILE_RETENTION_HOURS = "0";
    vi.resetModules();
    const {getSettings} = await import("../settings");

    expect(getSettings().tempFileRetentionHours).toBe(6);
  });

  it("falls back to the default when the env value is not numeric", async () => {
    process.env.TEMP_FILE_RETENTION_HOURS = "soon";
    vi.resetModules();
    const {getSettings} = await import("../settings");

    expect(getSettings().tempFileRetentionHours).toBe(6);
  });

  it("honours a valid override", async () => {
    process.env.TEMP_FILE_RETENTION_HOURS = "48";
    vi.resetModules();
    const {getSettings} = await import("../settings");

    expect(getSettings().tempFileRetentionHours).toBe(48);
  });
});
