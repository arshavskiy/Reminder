import { describe, expect, it } from "vitest";
import { currentUtcMonthWindow, documentImportLimit, documentImportMonthlyLimit, effectiveQuotaCategory } from "../quotas/documentImportQuota";
import {reminderLimit} from "../quotas/reminderQuota";

describe("document monthly import quota", () => {
  it("limits free users to separate 25-document lifetime import buckets", () => {
    expect(documentImportLimit("free", "manualDocuments")).toEqual({limit: 25, scope: "lifetime"});
    expect(documentImportLimit("free", "emailDocuments")).toEqual({limit: 25, scope: "lifetime"});
    expect(documentImportLimit("free", "invoices")).toEqual({limit: 25, scope: "lifetime"});
    expect(documentImportLimit("free", "contracts")).toEqual({limit: 25, scope: "lifetime"});
    expect(documentImportMonthlyLimit("free")).toBe(25);
  });

  it("gives the trial the same 25-document allowance as free", () => {
    expect(documentImportLimit("trial", "manualDocuments")).toEqual({limit: 25, scope: "lifetime"});
    expect(documentImportMonthlyLimit("trial")).toBe(25);
  });

  it("limits basic users to 50 documents per month", () => {
    expect(documentImportLimit("basic", "invoices")).toEqual({ limit: 50, scope: "monthly" });
    expect(documentImportMonthlyLimit("basic")).toBe(50);
  });

  it("pools every basic category into the same monthly 50", () => {
    for (const category of ["invoices", "contracts", "documents"] as const) {
      expect(documentImportLimit("basic", category)).toEqual({ limit: 50, scope: "monthly" });
    }
  });

  it("charges every basic import against one category so the pool is shared", () => {
    expect(effectiveQuotaCategory("basic", "invoices", "email")).toBe("documents");
    expect(effectiveQuotaCategory("basic", "contracts", "manual")).toBe("documents");
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

describe("reminder quota", () => {
  it("limits free users to 25 reminders for their lifetime", () => {
    expect(reminderLimit("free")).toEqual({limit: 25, scope: "lifetime"});
    expect(reminderLimit("user")).toEqual({limit: 25, scope: "lifetime"});
  });

  it("does not limit paid plans", () => {
    expect(reminderLimit("basic")).toEqual({limit: null, scope: "unlimited"});
    expect(reminderLimit("business")).toEqual({limit: null, scope: "unlimited"});
  });
});
