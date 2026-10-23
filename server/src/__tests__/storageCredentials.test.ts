import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const {clientOptions, send} = vi.hoisted(() => ({
  clientOptions: vi.fn(),
  send: vi.fn().mockResolvedValue({}),
}));

vi.mock("@aws-sdk/client-s3", async (importOriginal) => ({
  ...await importOriginal<typeof import("@aws-sdk/client-s3")>(),
  S3Client: class {
    constructor(options: unknown) { clientOptions(options); }
    send = send;
  },
}));

import {fileExistsInSpaces, publicBucketEnabled, spacesEnabled, uploadBufferToPublicSpaces} from "../storage/spaces";

beforeEach(() => {
  vi.stubEnv("ENDPOINT", "https://storage.example.com");
  vi.stubEnv("BUCKET", "documents");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "private-key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "private-secret");
  for (const name of ["BUCKET_ENDPOINT", "BUCKET_NAME", "BUCKET_ACCESS_KEY_ID", "BUCKET_SECRET_ACCESS_KEY", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "DO_SPACES_KEY", "DO_SPACES_SECRET", "BUCKET_PUBLIC_ACCESS_KEY_ID", "BUCKET_PUBLIC_SECRET_ACCESS_KEY"]) {
    vi.stubEnv(name, undefined);
  }
  vi.clearAllMocks();
});

afterEach(() => vi.unstubAllEnvs());

describe("storage credential names", () => {
  it("checks document objects using only the AWS credential pair", async () => {
    expect(spacesEnabled()).toBe(true);
    expect(await fileExistsInSpaces("user/documents/file.pdf")).toBe(true);
    expect(clientOptions).toHaveBeenCalledWith(expect.objectContaining({
      credentials: {accessKeyId: "private-key", secretAccessKey: "private-secret"},
    }));
  });

  it("does not enable private storage with legacy credentials", () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");
    vi.stubEnv("ACCESS_KEY_ID", "legacy-key");
    vi.stubEnv("SECRET_ACCESS_KEY", "legacy-secret");
    expect(spacesEnabled()).toBe(false);
  });

  it("keeps public asset credentials separate from private documents", async () => {
    vi.stubEnv("BUCKET_PUBLIC_ENDPOINT", "https://storage.example.com");
    vi.stubEnv("BUCKET_PUBLIC_NAME", "assets");
    expect(publicBucketEnabled()).toBe(false);
    vi.stubEnv("BUCKET_PUBLIC_ACCESS_KEY_ID", "public-key");
    vi.stubEnv("BUCKET_PUBLIC_SECRET_ACCESS_KEY", "public-secret");
    expect(publicBucketEnabled()).toBe(true);
    await uploadBufferToPublicSpaces(Buffer.from("image"), "logo.png", "image/png");
    expect(clientOptions).toHaveBeenCalledWith(expect.objectContaining({
      credentials: {accessKeyId: "public-key", secretAccessKey: "public-secret"},
    }));
  });
});
