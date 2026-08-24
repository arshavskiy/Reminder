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
  spacesEnabled: true,
  signedUrl: "https://s3.example.test/signed/invoice.pdf",
}));

vi.mock("../db/db", () => ({
  col: (name: string) => ({
    findOne: async () => (name === "users" ? store.user : store.doc),
    updateOne: async (_filter: unknown, update: { $set?: Record<string, unknown> }) => {
      if (name === "documents" && update.$set) {
        store.documentUpdate = update.$set;
        store.doc = {...(store.doc ?? {}), ...update.$set};
      }
      if (name === "users" && update.$set && store.user) {
        store.user = {...store.user, ...update.$set};
      }
      return {modifiedCount: 1};
    },
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
