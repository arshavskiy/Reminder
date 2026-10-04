import {describe, expect, it} from "vitest";
import {
  featureFlagsForUser,
  normalizePlanId,
  planAllowsDocumentImport,
  planAllowsFileStorage,
  tierFeatureFlags,
} from "../plans/tierFeatures";
import {documentImportLimit} from "../quotas/documentImportQuota";
import {reminderLimit} from "../quotas/reminderQuota";
import {parsePlanId, VALID_PLAN_IDS} from "../plans/updateUserTier";

describe("digital plan", () => {
  it("resolves as its own plan rather than collapsing to expired", () => {
    // Without a branch in normalizePlanId a digital account fell through to
    // "expired", which closed the reminders and reports it pays for.
    expect(normalizePlanId("digital")).toBe("digital");
    expect(normalizePlanId("DIGITAL")).toBe("digital");
  });

  it("has no file storage and no document import", () => {
    const flags = tierFeatureFlags("digital");
    expect(flags.fileStorage).toBe(false);
    expect(flags.documentImport).toBe(false);
    expect(planAllowsFileStorage("digital")).toBe(false);
    expect(planAllowsDocumentImport("digital")).toBe(false);
  });

  it("keeps the automation the plan is sold on", () => {
    const flags = tierFeatureFlags("digital");
    expect(flags.automaticEmailReminders).toBe(true);
    expect(flags.automaticMonthlyReports).toBe(true);
    expect(flags.excelExport).toBe(true);
  });

  it("syncs Google Calendar but not Google Drive", () => {
    // Drive is file storage by another name, so it stays off with S3.
    const flags = tierFeatureFlags("digital");
    expect(flags.googleDriveSync).toBe(false);
    // Calendar sync is open to every plan; only a lapsed trial loses it.
    expect(flags.googleCalendarSync).toBe(true);
    expect(flags.maxEmailAccounts).toBe(0);
  });

  it("meters nothing — no storage or extraction cost per document", () => {
    for (const category of ["documents", "contracts", "invoices", "manualDocuments", "emailDocuments"] as const) {
      expect(documentImportLimit("digital", category)).toEqual({limit: null, scope: "unlimited"});
    }
    expect(reminderLimit("digital")).toEqual({limit: null, scope: "unlimited"});
  });

  it("is assignable as a plan", () => {
    expect(VALID_PLAN_IDS).toContain("digital");
    expect(parsePlanId("digital")).toBe("digital");
  });

  it("keeps file storage on for every other plan", () => {
    for (const plan of ["expired", "trial", "basic", "business"] as const) {
      expect(tierFeatureFlags(plan).fileStorage).toBe(true);
    }
      expect(tierFeatureFlags("expired").documentImport).toBe(false);
      for (const plan of ["trial", "basic", "business"] as const) {
      expect(tierFeatureFlags(plan).documentImport).toBe(true);
    }
  });

  it("resolves flags for a digital user without trial handling", () => {
    const flags = featureFlagsForUser({plan: "digital", role: "user"});
    expect(flags.documentImport).toBe(false);
    expect(flags.automaticEmailReminders).toBe(true);
  });
});
