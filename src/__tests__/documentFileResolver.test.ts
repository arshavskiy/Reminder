import {afterEach, describe, expect, it, vi} from "vitest";

const originalDataDir = process.env.DATA_DIR;

afterEach(() => {
  process.env.DATA_DIR = originalDataDir;
  vi.resetModules();
});

describe("localDocumentFileCandidates", () => {
  function normaliseSeparators(paths: string[]): string[] {
    return paths.map((path) => path.replace(/\\/g, "/"));
  }

  it("includes the managed data-dir path for a stored Windows file path", async () => {
    process.env.DATA_DIR = "/app/data";
    vi.resetModules();

    const {localDocumentFileCandidates} = await import("../documents/fileResolver");

    const candidates = normaliseSeparators(localDocumentFileCandidates({
      file_path:
        "E:\\Projects\\Reminder\\server\\data\\documents\\93fe250790142e57ded2b2eaefddf8f7f6c483f539c5bff4bf830ba5693a08bc.pdf",
      file_hash: "93fe250790142e57ded2b2eaefddf8f7f6c483f539c5bff4bf830ba5693a08bc",
      mime_type: "application/pdf",
    }));

    expect(candidates).toContain(
      "/app/data/documents/93fe250790142e57ded2b2eaefddf8f7f6c483f539c5bff4bf830ba5693a08bc.pdf"
    );
  });

  it("uses the object-storage key extension when file_path is unavailable", async () => {
    process.env.DATA_DIR = "/app/data";
    vi.resetModules();

    const {localDocumentFileCandidates} = await import("../documents/fileResolver");

    const candidates = normaliseSeparators(localDocumentFileCandidates({
      file_hash: "abc123",
      spaces_key: "documents/abc123.pdf",
    }));

    expect(candidates).toContain("/app/data/documents/abc123.pdf");
  });
});
