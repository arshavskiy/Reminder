import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/db", async () => await import("./helpers/memoryDb"));

import { memory } from "./helpers/memoryDb";
import { normalizeOcrLanguage, ocrLanguageForUser } from "../pipeline/ocrLanguage";

describe("normalizeOcrLanguage", () => {
  it("accepts the supported packs in any order and normalises the result", () => {
    expect(normalizeOcrLanguage("heb+eng")).toBe("heb+eng");
    expect(normalizeOcrLanguage("rus+eng+heb")).toBe("heb+eng+rus");
    expect(normalizeOcrLanguage("HEB, ENG , RUS")).toBe("heb+eng+rus");
    expect(normalizeOcrLanguage("rus")).toBe("rus");
    expect(normalizeOcrLanguage("eng+eng")).toBe("eng");
  });

  it("rejects unsupported packs and empty input, returning the fallback", () => {
    expect(normalizeOcrLanguage("fra")).toBeNull();
    expect(normalizeOcrLanguage("heb+fra")).toBeNull();
    expect(normalizeOcrLanguage("")).toBeNull();
    expect(normalizeOcrLanguage(undefined, "heb+eng")).toBe("heb+eng");
    expect(normalizeOcrLanguage("klingon", "heb+eng")).toBe("heb+eng");
  });
});

describe("ocrLanguageForUser", () => {
  beforeEach(() => memory.clear());

  it("uses the user's setting, falling back to the server default", async () => {
    memory.set("user_settings", [
      { user_id: "ru-user", ocr_language: "rus+eng+heb" },
      { user_id: "bad-user", ocr_language: "fra" },
      { user_id: "plain-user" },
    ]);
    expect(await ocrLanguageForUser("ru-user")).toBe("heb+eng+rus");
    expect(await ocrLanguageForUser("bad-user")).toBe("heb+eng");
    expect(await ocrLanguageForUser("plain-user")).toBe("heb+eng");
    expect(await ocrLanguageForUser("unknown")).toBe("heb+eng");
    expect(await ocrLanguageForUser(undefined)).toBe("heb+eng");
  });
});
