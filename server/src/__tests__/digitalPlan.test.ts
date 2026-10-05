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

  it("is the family tier: Gmail for invoices and discovery, files kept", () => {
    const flags = tierFeatureFlags("digital");
    expect(flags.documentImport).toBe(true);
    expect(flags.fileStorage).toBe(true);
    expect(flags.gmailInvoiceHistoryMonths).toBe(12);
    expect(flags.gmailInspectionHistoryMonths).toBe(0);
    expect(flags.maxEmailAccounts).toBe(2);
    expect(planAllowsDocumentImport("digital")).toBe(true);
    expect(planAllowsFileStorage("digital")).toBe(true);
  });

  it("keeps reminders, Excel export and monthly reports", () => {
    const flags = tierFeatureFlags("digital");
    expect(flags.automaticEmailReminders).toBe(true);
    expect(flags.excelExport).toBe(true);
    expect(flags.automaticMonthlyReports).toBe(true);
    expect(flags.emailIn).toBe(true);
  });

  it("syncs Google Calendar but not Google Drive", () => {
    const flags = tierFeatureFlags("digital");
    expect(flags.googleDriveSync).toBe(false);
    expect(flags.googleCalendarSync).toBe(true);
  });

  it("allows unlimited imports; history cap (12 months) is enforced in Gmail layer not quota", () => {
    for (const category of ["documents", "contracts", "invoices", "manualDocuments", "emailDocuments"] as const) {
      expect(documentImportLimit("digital", category)).toEqual({limit: null, scope: "unlimited"});
    }
    expect(reminderLimit("digital")).toEqual({limit: null, scope: "unlimited"});
  });

  it("is assignable as a plan", () => {
    expect(VALID_PLAN_IDS).toContain("digital");
    expect(parsePlanId("digital")).toBe("digital");
  });

  it("keeps file storage on for every plan", () => {
    for (const plan of ["expired", "trial", "digital", "basic", "business"] as const) {
      expect(tierFeatureFlags(plan).fileStorage).toBe(true);
    }
      expect(tierFeatureFlags("expired").documentImport).toBe(false);
      for (const plan of ["trial", "digital", "basic", "business"] as const) {
      expect(tierFeatureFlags(plan).documentImport).toBe(true);
    }
  });

  it("resolves flags for a digital user without trial handling", () => {
    const flags = featureFlagsForUser({plan: "digital", role: "user"});
    expect(flags.documentImport).toBe(true);
    expect(flags.automaticEmailReminders).toBe(true);
  });
});
