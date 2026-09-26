import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ updateOne: vi.fn(), findOne: vi.fn() }));
vi.mock("../db/db", () => ({ col: () => db }));
vi.mock("../settings", () => ({ getDataDir: () => "/test-data" }));
vi.mock("fs/promises", () => ({ mkdir: vi.fn(), writeFile: vi.fn(), unlink: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../storage/spaces", () => ({ spacesEnabled: vi.fn(), uploadToSpaces: vi.fn() }));

import { discoveryId, discoverySummary, persistDiscovery, plainEmailHtml, saveDiscoveryPdf, type DiscoveryRecord } from "../gmail/discoveryStore";
import { spacesEnabled, uploadToSpaces } from "../storage/spaces";
import { unlink } from "fs/promises";

const row: DiscoveryRecord = {
  _id: "record", user_id: "owner", account: "mail@example.com", messageId: "message", subject: "Warranty", from: "Vendor",
  date: "2026-09-27", kind: "warranty", title: "Warranty", entity_name: "Washer", due_date: "2027-09-27",
  evidence_quote: "Expires 2027-09-27", confidence: "high", attachment_name: "proof.pdf", preview_html: "<b>Original</b>",
  plain_text: "Original", pdfs: [{ id: "pdf", filename: "proof.pdf", size: 4, spaces_key: "private/key", local_path: null }],
  status: "created", created_at: new Date(), updated_at: new Date(),
};

describe("saved reminder discoveries", () => {
  beforeEach(() => vi.clearAllMocks());
  it("deduplicates the same email and separates users and connected accounts", () => {
    const id = discoveryId("user", "account", "message");
    expect(discoveryId("user", "account", "message")).toBe(id);
    expect(discoveryId("other", "account", "message")).not.toBe(id);
    expect(discoveryId("user", "other", "message")).not.toBe(id);
  });
  it("stores original HTML and PDFs without resetting review status on rescan", async () => {
    db.findOne.mockResolvedValue(row);
    const { status, created_at, updated_at, ...input } = row;
    const result = await persistDiscovery(input);
    expect(db.updateOne).toHaveBeenCalledWith({ _id: "record", user_id: "owner" }, {
      $set: expect.objectContaining({ preview_html: row.preview_html, pdfs: row.pdfs }),
      $setOnInsert: { status: "new", created_at: expect.any(Date) },
    }, { upsert: true });
    expect(db.updateOne.mock.calls[0][1].$set).not.toHaveProperty("status");
    expect(result.status).toBe("created");
  });
  it("does not include raw HTML or storage paths in list responses", () => {
    const result = discoverySummary(row);
    expect(result).not.toHaveProperty("preview_html");
    expect(result).not.toHaveProperty("plain_text");
    expect(result.pdfs).toEqual([{ id: "pdf", filename: "proof.pdf", size: 4 }]);
  });
  it("escapes plain text when no HTML part exists", () => {
    expect(plainEmailHtml("<script>&")).toBe("<pre>&lt;script&gt;&amp;</pre>");
  });
  it("uploads PDFs using private document storage and removes only the cached copy", async () => {
    vi.mocked(spacesEnabled).mockReturnValue(true);
    vi.mocked(uploadToSpaces).mockResolvedValue("unused");
    const file = await saveDiscoveryPdf("record", "attachment", "../../proof.pdf", Buffer.from("%PDF"));
    expect(file.local_path).toBeNull();
    expect(file.spaces_key).toMatch(/^reminder-discoveries\/record\/[a-f0-9]+\.pdf$/);
    expect(uploadToSpaces).toHaveBeenCalledWith(expect.any(String), file.spaces_key, "application/pdf");
    expect(unlink).toHaveBeenCalledTimes(1);
  });
  it("keeps the cached source and reports upload failure instead of claiming persistence", async () => {
    vi.mocked(spacesEnabled).mockReturnValue(true);
    vi.mocked(uploadToSpaces).mockRejectedValue(new Error("storage unavailable"));
    await expect(saveDiscoveryPdf("record", "attachment", "proof.pdf", Buffer.from("%PDF"))).rejects.toThrow("storage unavailable");
    expect(unlink).not.toHaveBeenCalled();
  });
});
