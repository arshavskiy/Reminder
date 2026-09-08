import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const db = vi.hoisted(() => ({
  closeDb: vi.fn(),
  col: vi.fn(),
  connectDb: vi.fn(),
  // Do not execute the account-writing callback in these CLI routing tests.
  runWithDbTarget: vi.fn((_target: string, _fn: () => Promise<void>) => Promise.resolve()),
}));
vi.mock("../scripts/loadEnv", () => ({}));
vi.mock("../db/db", () => db);
vi.mock("../auth/session", () => ({createMagicLinkToken: vi.fn(), magicLinkTtlMinutes: vi.fn(() => 15)}));
vi.mock("../plans/planEntitlements", () => ({
  DEFAULT_NEW_USER_PLAN: "trial",
  ensureUserSettingsWithEntitlements: vi.fn(),
}));

const originalArgv = process.argv;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("MONGODB_PRODUCTION_URI", "mongodb://production.example/test");
  vi.stubEnv("SERVER_URL", "https://api.example.com");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("magic-link database flag", () => {
  it.each(["--production", "--target=production"])("routes %s to production", async (flag) => {
    process.argv = ["node", "script", flag];
    await import("../scripts/createMagicLinkUser");
    expect(db.runWithDbTarget).toHaveBeenCalledWith("production", expect.any(Function));
  });

  it("defaults to local even when the environment selects production", async () => {
    vi.stubEnv("MONGODB_TARGET", "production");
    process.argv = ["node", "script"];
    await import("../scripts/createMagicLinkUser");
    expect(db.runWithDbTarget).toHaveBeenCalledWith("local", expect.any(Function));
  });

  it.each(["MONGODB_PRODUCTION_URI"])("requires %s for production", async (name) => {
    vi.stubEnv(name, "");
    process.argv = ["node", "script", "--production"];
    await expect(import("../scripts/createMagicLinkUser")).rejects.toThrow(name);
    expect(db.runWithDbTarget).not.toHaveBeenCalled();
  });

  it.each([
    ["", "https://api.remindocr.com"],
    ["   ", "https://api.remindocr.com"],
    ["https://custom.example.com/", "https://custom.example.com"],
  ])("prints the production link with SERVER_URL=%s", async (serverUrl, expectedBase) => {
    vi.stubEnv("SERVER_URL", serverUrl);
    process.argv = ["node", "script", "--production", "--email=test@example.com"];
    db.col.mockReturnValue({
      findOne: vi.fn().mockResolvedValue({_id: "user-1", email: "test@example.com"}),
      updateOne: vi.fn().mockResolvedValue({}),
    });
    const {createMagicLinkToken} = await import("../auth/session");
    vi.mocked(createMagicLinkToken).mockResolvedValue("test-token");
    db.runWithDbTarget.mockImplementationOnce((_target, fn) => fn());
    await import("../scripts/createMagicLinkUser");
    await vi.waitFor(() => expect(db.closeDb).toHaveBeenCalled());
    expect(console.log).toHaveBeenCalledWith(`${expectedBase}/auth/magic?token=test-token`);
  });

  it.each([["--target=typo"], ["--production", "--target=local"]])("rejects invalid target arguments %s", async (...args) => {
    process.argv = ["node", "script", ...args];
    await expect(import("../scripts/createMagicLinkUser")).rejects.toThrow();
    expect(db.runWithDbTarget).not.toHaveBeenCalled();
  });
});
