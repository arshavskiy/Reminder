import { describe, expect, it } from "vitest";
import { currentUtcMonthWindow, documentImportMonthlyLimit } from "../quotas/documentImportQuota";

describe("document monthly import quota", () => {
  it("limits regular users to 30 documents per month", () => {
    expect(documentImportMonthlyLimit("user")).toBe(30);
  });

  it("limits pro users to 100 documents per month", () => {
    expect(documentImportMonthlyLimit("pro")).toBe(100);
  });

  it("does not limit admins", () => {
    expect(documentImportMonthlyLimit("admin")).toBeNull();
  });

  it("treats unknown roles as regular users", () => {
    expect(documentImportMonthlyLimit(null)).toBe(30);
    expect(documentImportMonthlyLimit("")).toBe(30);
  });

  it("uses a UTC calendar month window", () => {
    const { periodStart, periodEnd } = currentUtcMonthWindow(new Date("2026-08-22T12:34:56.000Z"));
    expect(periodStart.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
