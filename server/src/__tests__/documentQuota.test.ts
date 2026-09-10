import { describe, expect, it } from "vitest";
import { currentUtcMonthWindow, documentImportLimit, documentImportMonthlyLimit, effectiveQuotaCategory } from "../quotas/documentImportQuota";
import {reminderLimit} from "../quotas/reminderQuota";

describe("document monthly import quota", () => {
  it("limits lapsed accounts to separate 50-document lifetime import buckets", () => {
    expect(documentImportLimit("expired", "manualDocuments")).toEqual({limit: 50, scope: "lifetime"});
    expect(documentImportLimit("expired", "emailDocuments")).toEqual({limit: 50, scope: "lifetime"});
    expect(documentImportLimit("expired", "invoices")).toEqual({limit: 50, scope: "lifetime"});
    expect(documentImportLimit("expired", "contracts")).toEqual({limit: 50, scope: "lifetime"});
    expect(documentImportMonthlyLimit("expired")).toBe(50);
  });

  it("gives the trial the same 50-document allowance as a lapsed account", () => {
    expect(documentImportLimit("trial", "manualDocuments")).toEqual({limit: 50, scope: "lifetime"});
      expect(documentImportLimit("trial", "documents")).toEqual({limit: 50, scope: "lifetime"});
  });

    it("meters trial invoices separately from the document pool", () => {
        // Invoices arrive in bulk from a Gmail sync, so they get their own smaller
        // allowance rather than consuming the documents budget.
        expect(documentImportLimit("trial", "invoices")).toEqual({limit: 20, scope: "lifetime"});
        expect(documentImportMonthlyLimit("trial")).toBe(20);
    });

    it("charges a trial invoice import against the invoice category", () => {
        // Without this the import would be folded into the shared manual/email pool
        // and the 20-invoice cap would never apply.
        expect(effectiveQuotaCategory("trial", "invoices", "email")).toBe("invoices");
        expect(effectiveQuotaCategory("trial", "contracts", "email")).toBe("emailDocuments");
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
    expect(documentImportMonthlyLimit("user")).toBe(50);
    expect(documentImportMonthlyLimit("pro")).toBe(50);
    expect(documentImportMonthlyLimit("admin")).toBeNull();
    expect(documentImportMonthlyLimit(null)).toBe(50);
    expect(documentImportMonthlyLimit("")).toBe(50);
  });

  it("uses a UTC calendar month window", () => {
    const { periodStart, periodEnd } = currentUtcMonthWindow(new Date("2026-08-22T12:34:56.000Z"));
    expect(periodStart.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("reminder quota", () => {
  it("limits lapsed accounts to 25 reminders for their lifetime", () => {
    expect(reminderLimit("expired")).toEqual({limit: 50, scope: "lifetime"});
    expect(reminderLimit("user")).toEqual({limit: 50, scope: "lifetime"});
  });

  it("does not limit paid plans", () => {
    expect(reminderLimit("basic")).toEqual({limit: null, scope: "unlimited"});
    expect(reminderLimit("business")).toEqual({limit: null, scope: "unlimited"});
  });
});
