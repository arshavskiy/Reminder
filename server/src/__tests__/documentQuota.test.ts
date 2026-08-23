import { describe, expect, it } from "vitest";
import { currentUtcMonthWindow, documentImportLimit, documentImportMonthlyLimit } from "../quotas/documentImportQuota";

describe("document monthly import quota", () => {
  it("limits free users to 25 invoice documents for their lifetime", () => {
    expect(documentImportLimit("free", "invoices")).toEqual({ limit: 25, scope: "lifetime" });
    expect(documentImportMonthlyLimit("free")).toBe(25);
  });

  it("limits basic users to 50 invoice documents per month", () => {
    expect(documentImportLimit("basic", "invoices")).toEqual({ limit: 50, scope: "monthly" });
    expect(documentImportMonthlyLimit("basic")).toBe(50);
  });

  it("limits free/basic contract documents separately", () => {
    expect(documentImportLimit("free", "contracts")).toEqual({ limit: 20, scope: "lifetime" });
    expect(documentImportLimit("basic", "contracts")).toEqual({ limit: 40, scope: "monthly" });
  });

  it("does not limit business users", () => {
    expect(documentImportMonthlyLimit("business")).toBeNull();
  });

  it("keeps legacy roles mapped to equivalent plans", () => {
    expect(documentImportMonthlyLimit("user")).toBe(25);
    expect(documentImportMonthlyLimit("pro")).toBe(50);
    expect(documentImportMonthlyLimit("admin")).toBeNull();
    expect(documentImportMonthlyLimit(null)).toBe(25);
    expect(documentImportMonthlyLimit("")).toBe(25);
  });

  it("uses a UTC calendar month window", () => {
    const { periodStart, periodEnd } = currentUtcMonthWindow(new Date("2026-08-22T12:34:56.000Z"));
    expect(periodStart.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
