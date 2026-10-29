import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const PRIMARY = "https://storage.example.com";
const R2 = "https://abc.r2.cloudflarestorage.com";

const {calls, handler, docs} = vi.hoisted(() => ({
  calls: [] as Array<{endpoint: string; command: string; input: any}>,
  handler: {fn: null as null | ((endpoint: string, command: string, input: any) => any)},
  docs: [] as Array<{spaces_key: string}>,
}));

vi.mock("@aws-sdk/client-s3", async (importOriginal) => ({
  ...await importOriginal<typeof import("@aws-sdk/client-s3")>(),
  S3Client: class {
    endpoint: string;
    constructor(options: any) { this.endpoint = options.endpoint; }
    send = async (cmd: any) => {
      const command = cmd.constructor.name;
      calls.push({endpoint: this.endpoint, command, input: cmd.input});
      return handler.fn ? handler.fn(this.endpoint, command, cmd.input) : {};
    };
  },
}));

vi.mock("../db/db", () => ({
  col: () => ({find: () => ({async *[Symbol.asyncIterator]() { yield* docs; }})}),
}));
vi.mock("../ops/processControl", () => ({isProcessPaused: vi.fn().mockResolvedValue(false)}));
vi.mock("../outreach/unsubscribeScan", () => ({recordJobHealth: vi.fn()}));

import {copyWithinSpaces, deleteManyFromSpaces, uploadBufferToSpaces} from "../storage/spaces";
import {runR2Reconcile} from "../storage/r2Reconcile";

const notFound = () => Object.assign(new Error("NotFound"), {name: "NotFound", $metadata: {httpStatusCode: 404}});
const on = (endpoint: string, command: string) => calls.filter((c) => c.endpoint === endpoint && c.command === command);

function enableMirror() {
  vi.stubEnv("MIRROR_R2_ENDPOINT", R2);
  vi.stubEnv("MIRROR_R2_BUCKET", "mirror");
  vi.stubEnv("MIRROR_R2_ACCESS_KEY_ID", "r2-key");
  vi.stubEnv("MIRROR_R2_SECRET_ACCESS_KEY", "r2-secret");
}

beforeEach(() => {
  vi.stubEnv("ENDPOINT", PRIMARY);
  vi.stubEnv("BUCKET", "documents");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "secret");
  for (const name of ["BUCKET_ENDPOINT", "BUCKET_NAME", "MIRROR_R2_ENDPOINT", "MIRROR_R2_BUCKET", "MIRROR_R2_ACCESS_KEY_ID", "MIRROR_R2_SECRET_ACCESS_KEY"]) {
    vi.stubEnv(name, undefined);
  }
  calls.length = 0;
  docs.length = 0;
  handler.fn = null;
});

afterEach(() => vi.unstubAllEnvs());

describe("R2 mirror", () => {
  it("writes only to the primary bucket when the mirror is not configured", async () => {
    await uploadBufferToSpaces(Buffer.from("pdf"), "u/documents/a.pdf", "application/pdf");
    expect(calls.map((c) => c.endpoint)).toEqual([PRIMARY]);
  });

  it("copies uploads to R2 without the public-read ACL", async () => {
    enableMirror();
    await uploadBufferToSpaces(Buffer.from("pdf"), "u/documents/a.pdf", "application/pdf");
    const [put] = on(R2, "PutObjectCommand");
    expect(put.input).toMatchObject({Bucket: "mirror", Key: "u/documents/a.pdf", ContentType: "application/pdf"});
    expect(put.input.ACL).toBeUndefined();
  });

  it("does not fail the upload when the R2 write fails", async () => {
    enableMirror();
    handler.fn = (endpoint) => { if (endpoint === R2) throw new Error("r2 down"); return {}; };
    await expect(uploadBufferToSpaces(Buffer.from("pdf"), "u/documents/a.pdf", "application/pdf")).resolves.toContain("u/documents/a.pdf");
  });

  it("reads the copied object from the primary bucket when R2 lacks the source", async () => {
    enableMirror();
    handler.fn = (endpoint, command) => {
      if (endpoint === R2 && command === "CopyObjectCommand") throw notFound();
      if (endpoint === PRIMARY && command === "GetObjectCommand") {
        return {Body: {transformToByteArray: async () => new Uint8Array([1, 2])}, ContentType: "application/pdf"};
      }
      return {};
    };
    expect(await copyWithinSpaces("u/old.pdf", "u/new.pdf")).toBe(true);
    expect(on(PRIMARY, "GetObjectCommand")[0].input.Key).toBe("u/new.pdf");
    expect(on(R2, "PutObjectCommand")[0].input).toMatchObject({Key: "u/new.pdf", ContentType: "application/pdf"});
  });

  it("mirrors only the deletes the primary bucket accepted", async () => {
    enableMirror();
    handler.fn = (endpoint) => endpoint === PRIMARY
      ? {Deleted: [{Key: "a"}], Errors: [{Key: "b", Message: "denied"}]}
      : {};
    await deleteManyFromSpaces(["a", "b"]);
    expect(on(R2, "DeleteObjectsCommand")[0].input.Delete.Objects).toEqual([{Key: "a"}]);
  });
});

describe("R2 reconcile", () => {
  it("copies only keys missing from R2 and never overwrites", async () => {
    enableMirror();
    docs.push({spaces_key: "u/in-r2.pdf"}, {spaces_key: "u/missing.pdf"}, {spaces_key: "u/gone.pdf"});
    handler.fn = (endpoint, command, input) => {
      if (endpoint === R2 && command === "HeadObjectCommand" && input.Key !== "u/in-r2.pdf") throw notFound();
      if (endpoint === PRIMARY && command === "GetObjectCommand") {
        if (input.Key === "u/gone.pdf") throw Object.assign(new Error("NoSuchKey"), {name: "NoSuchKey"});
        return {Body: {transformToByteArray: async () => new Uint8Array([1])}, ContentType: "application/pdf"};
      }
      return {};
    };
    const result = await runR2Reconcile({full: true});
    expect(result).toMatchObject({checked: 3, copied: 1, missingSource: 1, failed: 0});
    expect(on(R2, "PutObjectCommand").map((c) => c.input.Key)).toEqual(["u/missing.pdf"]);
  });

  it("refuses to run when the mirror is not configured", async () => {
    await expect(runR2Reconcile()).rejects.toThrow("R2 mirror not configured");
  });
});
