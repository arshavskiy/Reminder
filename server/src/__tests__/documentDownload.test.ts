import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import express from "express";
import type {Server} from "http";

const mocks = vi.hoisted(() => ({
  sign: vi.fn(),
  exists: vi.fn(),
}));
vi.mock("../db/db", async () => await import("./helpers/memoryDb"));
vi.mock("../auth/middleware", () => ({
  requireAuth: async () => ({userId: "user-1"}),
  HTTPException: class extends Error {},
}));
vi.mock("../pipeline/importer", () => ({}));
vi.mock("../storage/spaces", () => ({
  getSpacesSignedUrl: mocks.sign,
  fileExistsInSpaces: mocks.exists,
}));

import {memory} from "./helpers/memoryDb";
import {registerDocumentRoutes} from "../routes/documents";

let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  registerDocumentRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  memory.clear();
  mocks.sign.mockReset().mockResolvedValue("https://storage.example.com/fresh.pdf");
  mocks.exists.mockReset().mockResolvedValue(true);
  memory.set("documents", [{
    _id: "document-1", user_id: "user-1", spaces_key: "user-1/documents/file.pdf",
    file_name: "report.pdf", download_url: "https://storage.example.com/old-signature.pdf",
    signed_url_expires_at: new Date(Date.now() + 4 * 86_400_000),
  }]);
});

describe("document download after storage credentials change", () => {
  it("signs the preview with current credentials even when the cached URL has not expired", async () => {
    const response = await fetch(`${base}/api/documents/document-1/download`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({url: "https://storage.example.com/fresh.pdf", source: "s3"});
    expect(mocks.sign).toHaveBeenCalledWith("user-1/documents/file.pdf", 7 * 24 * 3600, "report.pdf");
  });

  it("uses a fresh attachment signature for downloads", async () => {
    const response = await fetch(`${base}/api/documents/document-1/download?dl=1`, {redirect: "manual"});
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://storage.example.com/fresh.pdf");
    expect(mocks.sign).toHaveBeenCalledWith("user-1/documents/file.pdf", 300, "report.pdf", true);
  });

  it("does not sign a document belonging to another user", async () => {
    memory.get("documents")![0].user_id = "user-2";
    expect((await fetch(`${base}/api/documents/document-1/download`)).status).toBe(404);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
