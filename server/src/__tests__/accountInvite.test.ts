import { describe, expect, it } from "vitest";
import { featureFlagsForUser } from "../plans/tierFeatures";

function makeUser(plan: string): any {
  return { _id: "u1", email: "test@example.com", plan, role: "user" };
}

describe("account invite — plan gating", () => {
  it("digital plan allows up to 2 users", () => {
    const flags = featureFlagsForUser(makeUser("digital"));
    expect(flags.maxUsers).toBe(2);
  });

  it("basic plan allows up to 2 users", () => {
    const flags = featureFlagsForUser(makeUser("basic"));
    expect(flags.maxUsers).toBe(2);
  });

  it("trial plan allows 1 user (no extras)", () => {
    const flags = featureFlagsForUser(makeUser("trial"));
    expect(flags.maxUsers).toBe(1);
  });

  it("business plan has unlimited users (null)", () => {
    const flags = featureFlagsForUser(makeUser("business"));
    expect(flags.maxUsers).toBeNull();
  });

  it("expired plan disallows extra users", () => {
    const flags = featureFlagsForUser(makeUser("expired"));
    expect(flags.maxUsers).toBe(1);
  });
});

describe("account invite — seat limit logic", () => {
  function canInvite(maxUsers: number | null, existingLinked: number): boolean {
    if (maxUsers !== null && maxUsers < 2) return false;
    if (maxUsers !== null && existingLinked >= maxUsers - 1) return false;
    return true;
  }

  it("digital with 0 linked members: can invite", () => {
    expect(canInvite(2, 0)).toBe(true);
  });

  it("digital with 1 linked member already: seat full", () => {
    expect(canInvite(2, 1)).toBe(false);
  });

  it("business (unlimited) with any number of members: can always invite", () => {
    expect(canInvite(null, 0)).toBe(true);
    expect(canInvite(null, 10)).toBe(true);
  });

  it("trial (maxUsers=1): cannot invite anyone", () => {
    expect(canInvite(1, 0)).toBe(false);
  });
});

describe("account invite — email validation", () => {
  function isValidEmail(email: unknown): boolean {
    return typeof email === "string" && email.includes("@");
  }

  it("accepts valid email", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("a@b.co")).toBe(true);
  });

  it("rejects non-string, missing @, empty", () => {
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail(42)).toBe(false);
  });
});

describe("account invite — locale resolution", () => {
  function resolveLocale(locale?: string): "he" | "en" | "ru" {
    return locale === "en" ? "en" : locale === "ru" ? "ru" : "he";
  }

  it("resolves known locales", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("ru")).toBe("ru");
    expect(resolveLocale("he")).toBe("he");
  });

  it("defaults unknown/missing to he", () => {
    expect(resolveLocale(undefined)).toBe("he");
    expect(resolveLocale("fr")).toBe("he");
    expect(resolveLocale("")).toBe("he");
  });
});
