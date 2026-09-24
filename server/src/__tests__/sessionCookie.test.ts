import {afterEach, describe, expect, it} from "vitest";
import {extractSessionIds, sessionCookieHeaders} from "../auth/session.js";

const ENV_KEYS = ["COOKIE_DOMAIN", "COOKIE_SECURE", "COOKIE_SAMESITE"] as const;
const previous: Record<string, string | undefined> = {};

function saveEnv() {
  for (const key of ENV_KEYS) previous[key] = process.env[key];
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

describe("session cookies", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("does not pin the session cookie to the shared parent domain", () => {
    saveEnv();
    process.env.COOKIE_DOMAIN = ".remindocr.com";
    process.env.COOKIE_SECURE = "true";
    process.env.COOKIE_SAMESITE = "Lax";

    const headers = sessionCookieHeaders("dev-session", 60);
    const live = headers[0];

    expect(headers).toHaveLength(1);
    expect(live.startsWith("session=dev-session")).toBe(true);
    expect(live).not.toContain("Domain=");
  });

  it("keeps an explicit host domain", () => {
    saveEnv();
    process.env.COOKIE_DOMAIN = "dev.remindocr.com";
    process.env.COOKIE_SECURE = "true";
    process.env.COOKIE_SAMESITE = "Lax";

    const [live] = sessionCookieHeaders("dev-session", 60);
    expect(live).toContain("Domain=dev.remindocr.com");
  });

  it("reads every session cookie, not only the first", () => {
    const header = "session=from-app; session=from-dev; other=1";
    expect(extractSessionIds(header)).toEqual(["from-app", "from-dev"]);
  });
});
