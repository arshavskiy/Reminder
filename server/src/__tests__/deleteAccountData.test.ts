import {beforeEach, describe, expect, it, vi} from "vitest";

const deleteMany = vi.fn(async () => ({deletedCount: 1}));
const deleteOne = vi.fn(async () => ({deletedCount: 1}));
const findOne = vi.fn();
const findToArray = vi.fn(async () => []);
const find = vi.fn(() => ({toArray: findToArray}));
const deleteFromSpaces = vi.fn(async () => undefined);
const fetchMock = vi.fn(async () => ({ok: true, status: 200}));

vi.stubGlobal("fetch", fetchMock);

vi.mock("../db/db", () => ({
  col: vi.fn((name: string) => ({
    findOne: name === "users" ? findOne : vi.fn(),
    find,
    deleteMany,
    deleteOne,
  })),
}));

vi.mock("../storage/spaces", () => ({
  deleteFromSpaces,
}));

vi.mock("../logger", () => ({
  logger: {warn: vi.fn(), info: vi.fn()},
}));

vi.mock("../settings", () => ({
  getDataDir: () => "E:/data",
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(() => false),
  unlinkSync: vi.fn(),
}));

describe("spacesKeyFromUrl", () => {
  it("accepts images and equipment-photos prefixes including s3:", async () => {
    const {spacesKeyFromUrl} = await import("../account/deleteAccountData");
    expect(spacesKeyFromUrl("images/u1/logo.png")).toBe("images/u1/logo.png");
    expect(spacesKeyFromUrl("s3:equipment-photos/eq1/a.jpg")).toBe("equipment-photos/eq1/a.jpg");
    expect(spacesKeyFromUrl("https://cdn.example/users/u1/avatar/a.png")).toBe("users/u1/avatar/a.png");
  });
});

describe("deleteAccountData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findToArray.mockResolvedValue([]);
    findOne.mockImplementation(async (filter: any) => {
      if (filter?._id) {
        return {
          _id: filter._id,
          email: "u@test.com",
          picture_url: null,
          picture_storage_key: "users/u/avatar/a.png",
          gmail_refresh_token: "rt",
          company_logo_url: "https://cdn.example/images/u/logo.png",
        };
      }
      return null;
    });
  });

  it("rejects invalid user ids", async () => {
    const {deleteAccountData} = await import("../account/deleteAccountData");
    await expect(deleteAccountData("bad")).rejects.toThrow("invalid_user_id");
  });

  it("deletes user-scoped collections and the user document", async () => {
    const {ObjectId} = await import("mongodb");
    const userId = new ObjectId().toString();
    findToArray
      .mockResolvedValueOnce([]) // documents
      .mockResolvedValueOnce([]) // invoices
      .mockResolvedValueOnce([]) // certificates
      .mockResolvedValueOnce([]); // equipment

    const {deleteAccountData} = await import("../account/deleteAccountData");
    const result = await deleteAccountData(userId);

    expect(result.userId).toBe(userId);
    expect(deleteMany).toHaveBeenCalled();
    expect(deleteOne).toHaveBeenCalled();
    expect(result.deletedCollections.users).toBe(1);
    expect(result.deletedCollections.supplier_category_rules).toBe(1);
    expect(result.deletedCollections.whatsapp_inbox).toBe(1);
    expect(deleteFromSpaces).toHaveBeenCalledWith("users/u/avatar/a.png");
    expect(deleteFromSpaces).toHaveBeenCalledWith("images/u/logo.png");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("removes document storage keys and equipment photos before deleting rows", async () => {
    const {ObjectId} = await import("mongodb");
    const userId = new ObjectId().toString();
    const docId = new ObjectId();
    const eqId = new ObjectId();
    findOne.mockResolvedValue({_id: new ObjectId(userId), email: "u@test.com"});
    findToArray
      .mockResolvedValueOnce([{
        _id: docId,
        spaces_key: "documents/a.pdf",
        thumbnail_key: "documents/a-thumb.webp",
        thumbnail_path: null,
        file_path: null,
      }] as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        _id: eqId,
        photo_urls: [{key: "s3:equipment-photos/eq/x.jpg"}],
      }] as any);

    const {deleteAccountData} = await import("../account/deleteAccountData");
    const result = await deleteAccountData(userId);

    expect(deleteFromSpaces).toHaveBeenCalledWith("documents/a.pdf");
    expect(deleteFromSpaces).toHaveBeenCalledWith("documents/a-thumb.webp");
    expect(deleteFromSpaces).toHaveBeenCalledWith("equipment-photos/eq/x.jpg");
    expect(result.storageObjectsRemoved).toBeGreaterThanOrEqual(3);
  });
});
