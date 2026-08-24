import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "fs";
import {tmpdir} from "os";
import {join} from "path";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const USER_ID = "6a10a0e0453ac80348bb04b3";
const DOC_ID = "6a859df167d3bd2774b16189";
const FILE_HASH = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const WINDOWS_PATH = `E:\\Projects\\Reminder\\server\\data\\documents\\${FILE_HASH}.pdf`;

const store = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  doc: null as Record<string, unknown> | null,
  documentUpdate: null as Record<string, unknown> | null,
  documentUnset: null as Record<string, unknown> | null,
  syncedCount: 0,
  spacesEnabled: true,
  signedUrl: "https://s3.example.test/signed/invoice.pdf",
}));

vi.mock("../db/db", () => ({
  col: (name: string) => ({
    findOne: async () => (name === "users" ? store.user : store.doc),
    updateOne: async (_filter: unknown, update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }) => {
      if (name === "documents" && update.$set) {
        store.documentUpdate = update.$set;
        store.doc = {...(store.doc ?? {}), ...update.$set};
      }
      if (name === "users" && store.user) {
        if (update.$set) store.user = {...store.user, ...update.$set};
        if (update.$unset) {
          for (const key of Object.keys(update.$unset)) delete store.user[key];
        }
      }
      return {modifiedCount: 1};
    },
    updateMany: async (_filter: unknown, update: { $unset?: Record<string, unknown> }) => {
      if (name === "documents") {
        store.documentUnset = update.$unset ?? null;
        return {modifiedCount: store.syncedCount};
      }
      return {modifiedCount: 0};
    },
    countDocuments: async () => store.syncedCount,
  }),
}));

vi.mock("../storage/spaces", () => ({
  spacesEnabled: () => store.spacesEnabled,
  getSpacesSignedUrl: async () => store.signedUrl,
}));

describe("syncDocumentToDrive", () => {
  let dataDir = "";

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "gdrive-sync-"));
    process.env.DATA_DIR = dataDir;
    store.spacesEnabled = true;
    store.documentUpdate = null;
    store.documentUnset = null;
    store.syncedCount = 0;
    store.user = {
      _id: USER_ID,
      drive_sync_enabled: true,
      plan: "business",
      gmail_access_token: "ya29.test-token",
      gmail_token_expires_at: new Date(Date.now() + 60 * 60 * 1000),
      drive_folder_id: "root-folder",
    };
    store.doc = {
      _id: DOC_ID,
      file_path: WINDOWS_PATH,
      file_name: "invoice-100.pdf",
      file_hash: FILE_HASH,
      mime_type: "application/pdf",
      spaces_key: `documents/${USER_ID}/${FILE_HASH}.pdf`,
    };

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === store.signedUrl) {
        return new Response(Buffer.from("%PDF-1.4 google-drive-test"), {status: 200});
      }
      if (url.includes("googleapis.com/upload/drive")) {
        return Response.json({
          id: "drive-file-1",
          name: "invoice-100.pdf",
          mimeType: "application/pdf",
          webViewLink: "https://drive.google.com/file/d/drive-file-1",
        });
      }
      return new Response("unexpected fetch", {status: 500});
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    rmSync(dataDir, {recursive: true, force: true});
  });

  it("builds a My Drive folder URL", async () => {
    const {driveFolderWebUrl} = await import("../storage/gdrive");
    expect(driveFolderWebUrl("abc123")).toBe("https://drive.google.com/drive/folders/abc123");
  });

  it("uploads from object storage when the stored Windows file_path is missing", async () => {
    const {syncDocumentToDrive} = await import("../storage/gdrive");

    await syncDocumentToDrive(DOC_ID, USER_ID);

    expect(store.documentUpdate).toMatchObject({
      drive_file_id: "drive-file-1",
      drive_web_link: "https://drive.google.com/file/d/drive-file-1",
    });
    const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(calls.some((url) => url === store.signedUrl)).toBe(true);
    expect(calls.some((url) => url.includes("googleapis.com/upload/drive"))).toBe(true);
  });

  it("uploads a remapped local copy when object storage is off", async () => {
    store.spacesEnabled = false;
    store.doc = {
      ...store.doc,
      spaces_key: null,
    };
    const docsDir = join(dataDir, "documents");
    mkdirSync(docsDir, {recursive: true});
    writeFileSync(join(docsDir, `${FILE_HASH}.pdf`), "%PDF-1.4 local-copy");

    const {syncDocumentToDrive} = await import("../storage/gdrive");
    await syncDocumentToDrive(DOC_ID, USER_ID);

    expect(store.documentUpdate).toMatchObject({drive_file_id: "drive-file-1"});
    const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(calls.some((url) => url.includes("googleapis.com/upload/drive"))).toBe(true);
    expect(readFileSync(join(docsDir, `${FILE_HASH}.pdf`), "utf8")).toContain("local-copy");
  });
});

describe("inspectDriveFolder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("treats a 404 as a missing folder", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", {status: 404})));
    const {inspectDriveFolder} = await import("../storage/gdrive");
    await expect(inspectDriveFolder("token", "gone-folder")).resolves.toEqual({
      state: "missing",
      folderId: "gone-folder",
    });
  });

  it("treats trashed=true as a trashed folder", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      id: "trash-folder",
      name: "RemindOCR",
      trashed: true,
    })));
    const {inspectDriveFolder} = await import("../storage/gdrive");
    await expect(inspectDriveFolder("token", "trash-folder")).resolves.toEqual({
      state: "trashed",
      folderId: "trash-folder",
      name: "RemindOCR",
    });
  });

  it("treats a live folder as ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      id: "live-folder",
      name: "RemindOCR",
      trashed: false,
    })));
    const {inspectDriveFolder} = await import("../storage/gdrive");
    await expect(inspectDriveFolder("token", "live-folder")).resolves.toEqual({
      state: "ok",
      folderId: "live-folder",
      name: "RemindOCR",
    });
  });

  it("does not treat a 403 as a deleted folder", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("forbidden", {status: 403})));
    const {inspectDriveFolder} = await import("../storage/gdrive");
    await expect(inspectDriveFolder("token", "live-folder")).resolves.toEqual({
      state: "unknown",
      folderId: "live-folder",
    });
  });
});

describe("ensureHealthyDriveFolder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("recreates a missing folder and clears stale Drive file ids", async () => {
    store.user = {
      _id: USER_ID,
      drive_folder_id: "gone-folder",
      drive_folder_name: "RemindOCR",
      drive_subfolder_invoice: "old-invoices",
    };
    store.syncedCount = 37;
    store.documentUnset = null;

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();
      if (url.includes("/files/gone-folder")) {
        return new Response("not found", {status: 404});
      }
      if (method === "GET" && url.includes("/files?") && url.includes("q=")) {
        return Response.json({files: []});
      }
      if (method === "POST" && url.includes("/files")) {
        return Response.json({id: "new-folder"});
      }
      if (url.includes("/files/new-folder")) {
        return Response.json({id: "new-folder", parents: ["root"]});
      }
      return new Response(`unexpected fetch ${method} ${url}`, {status: 500});
    }));

    const {ensureHealthyDriveFolder} = await import("../storage/gdrive");
    const result = await ensureHealthyDriveFolder(USER_ID, "token");

    expect(result).toEqual({
      folderId: "new-folder",
      resetCount: 37,
      recreated: true,
    });
    expect(store.documentUnset).toMatchObject({drive_file_id: "", drive_web_link: ""});
    expect(store.user?.drive_folder_id).toBe("new-folder");
    expect(store.user?.drive_subfolder_invoice).toBeUndefined();
  });

  it("leaves an existing live folder and Drive file ids untouched", async () => {
    store.user = {
      _id: USER_ID,
      drive_folder_id: "live-folder",
      drive_folder_name: "RemindOCR",
    };
    store.syncedCount = 37;
    store.documentUnset = null;

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      id: "live-folder",
      name: "RemindOCR",
      trashed: false,
    })));

    const {ensureHealthyDriveFolder} = await import("../storage/gdrive");
    const result = await ensureHealthyDriveFolder(USER_ID, "token");

    expect(result).toEqual({
      folderId: "live-folder",
      resetCount: 0,
      recreated: false,
    });
    expect(store.documentUnset).toBeNull();
  });
});
