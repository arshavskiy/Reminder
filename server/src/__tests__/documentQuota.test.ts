import { describe, expect, it } from "vitest";
import { currentUtcMonthWindow, documentImportLimit, documentImportMonthlyLimit, effectiveQuotaCategory } from "../quotas/documentImportQuota";
import {reminderLimit} from "../quotas/reminderQuota";

describe("document monthly import quota", () => {
    it("blocks new imports once the trial has lapsed", () => {
        expect(documentImportLimit("expired", "manualDocuments")).toEqual({limit: 0, scope: "lifetime"});
        expect(documentImportLimit("expired", "emailDocuments")).toEqual({limit: 0, scope: "lifetime"});
        expect(documentImportLimit("expired", "invoices")).toEqual({limit: 0, scope: "lifetime"});
        expect(documentImportLimit("expired", "contracts")).toEqual({limit: 0, scope: "lifetime"});
        expect(documentImportMonthlyLimit("expired")).toBe(0);
  });

    it("gives an active trial 20 lifetime documents across upload and Gmail", () => {
        expect(documentImportLimit("trial", "manualDocuments")).toEqual({limit: 20, scope: "lifetime"});
        expect(documentImportLimit("trial", "emailDocuments")).toEqual({limit: 20, scope: "lifetime"});
        expect(documentImportLimit("trial", "documents")).toEqual({limit: 20, scope: "lifetime"});
        expect(documentImportLimit("trial", "invoices")).toEqual({limit: 20, scope: "lifetime"});
        expect(documentImportMonthlyLimit("trial")).toBe(20);
    });

    it("charges trial upload and Gmail against the shared lifetime pool", () => {
        expect(effectiveQuotaCategory("trial", "invoices", "email")).toBe("emailDocuments");
        expect(effectiveQuotaCategory("trial", "contracts", "email")).toBe("emailDocuments");
        expect(effectiveQuotaCategory("trial", "documents", "manual")).toBe("manualDocuments");
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
      expect(documentImportMonthlyLimit("user")).toBe(0);
    expect(documentImportMonthlyLimit("pro")).toBe(50);
    expect(documentImportMonthlyLimit("admin")).toBeNull();
      expect(documentImportMonthlyLimit(null)).toBe(0);
      expect(documentImportMonthlyLimit("")).toBe(0);
  });

  it("uses a UTC calendar month window", () => {
    const { periodStart, periodEnd } = currentUtcMonthWindow(new Date("2026-08-22T12:34:56.000Z"));
    expect(periodStart.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("reminder quota", () => {
    it("blocks new reminders once the trial has lapsed", () => {
        expect(reminderLimit("expired")).toEqual({limit: 0, scope: "lifetime"});
        expect(reminderLimit("user")).toEqual({limit: 0, scope: "lifetime"});
  });

  it("does not limit paid plans", () => {
    expect(reminderLimit("basic")).toEqual({limit: null, scope: "unlimited"});
    expect(reminderLimit("business")).toEqual({limit: null, scope: "unlimited"});
  });
});
