import { describe, expect, it } from "vitest";
import { buildPlanEntitlements } from "../plans/planEntitlements";
import { TIER_FEATURE_FLAGS, featureFlagsForUser, planAllowsEmailIn } from "../plans/tierFeatures";

describe("plan entitlements", () => {
    it("treats a lapsed trial as expired for quotas and import flags", () => {
        const entitlements = buildPlanEntitlements({
            plan: "trial",
            role: "user",
            trial_ends_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
        });
        expect(entitlements.plan).toBe("expired");
        expect(entitlements.documentImport).toBe(false);
        expect(entitlements.documents.manualDocuments).toBe(0);
        expect(entitlements.reminders).toEqual({scope: "lifetime", limit: 0});
    });

    it("gives an active trial 20 lifetime documents", () => {
        const entitlements = buildPlanEntitlements({
            plan: "trial",
            trial_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        expect(entitlements.plan).toBe("trial");
        expect(entitlements.documentImport).toBe(true);
        expect(entitlements.documents.manualDocuments).toBe(20);
        expect(entitlements.documents.emailDocuments).toBe(20);
        expect(entitlements.reminders).toEqual({scope: "unlimited", limit: null});
    });

  it("gives a lapsed account the lifetime document and reminder caps", () => {
    const entitlements = buildPlanEntitlements({ plan: "expired", role: "user" });
    expect(entitlements.plan).toBe("expired");
    expect(entitlements.documents).toEqual({
      scope: "lifetime",
        invoices: 0,
        contracts: 0,
        manualDocuments: 0,
        emailDocuments: 0,
    });
      expect(entitlements.reminders).toEqual({scope: "lifetime", limit: 0});
    expect(entitlements.gmailInvoiceHistoryMonths).toBe(0);
    expect(entitlements.gmailInspectionHistoryMonths).toBe(16);
    expect(entitlements.googleDriveSync).toBe(false);
    expect(entitlements.googleCalendarSync).toBe(false);
    expect(entitlements.automaticEmailReminders).toBe(false);
    expect(entitlements.automaticMonthlyReports).toBe(false);
    expect(entitlements.excelExport).toBe(false);
    expect(entitlements.maxUsers).toBe(1);
      expect(entitlements.maxEmailAccounts).toBe(0);
    expect(entitlements.ocr).toBe(true);
  });

  it("gives basic monthly document caps and paid feature flags", () => {
    const entitlements = buildPlanEntitlements({ plan: "basic" });
    expect(entitlements.documents).toEqual({
      scope: "monthly",
      invoices: 50,
      contracts: 50,
      manualDocuments: 50,
      emailDocuments: 50,
    });
    expect(entitlements.reminders).toEqual({ scope: "unlimited", limit: null });
      expect(entitlements.gmailInvoiceHistoryMonths).toBe(0);
    expect(entitlements.gmailInspectionHistoryMonths).toBe(16);
    expect(entitlements.googleDriveSync).toBe(true);
    expect(entitlements.googleCalendarSync).toBe(false);
    expect(entitlements.automaticEmailReminders).toBe(true);
    expect(entitlements.automaticMonthlyReports).toBe(true);
    expect(entitlements.excelExport).toBe(true);
    expect(entitlements.maxUsers).toBe(2);
    expect(entitlements.maxEmailAccounts).toBe(2);
  });

  it("gives business unlimited quotas and calendar", () => {
    const entitlements = buildPlanEntitlements({ plan: "business" });
    expect(entitlements.documents).toEqual({
      scope: "unlimited",
      invoices: null,
      contracts: null,
      manualDocuments: null,
      emailDocuments: null,
    });
    expect(entitlements.reminders.scope).toBe("unlimited");
    expect(entitlements.gmailInvoiceHistoryMonths).toBe(36);
    expect(entitlements.gmailInspectionHistoryMonths).toBe(24);
    expect(entitlements.googleCalendarSync).toBe(true);
    expect(entitlements.maxUsers).toBeNull();
    expect(entitlements.maxEmailAccounts).toBeNull();
  });

  it("treats admin as business with uncapped gmail history", () => {
    const flags = featureFlagsForUser({ role: "admin", plan: "expired" });
    expect(flags.googleCalendarSync).toBe(true);
    expect(flags.gmailInvoiceHistoryMonths).toBeNull();
    expect(flags.gmailInspectionHistoryMonths).toBeNull();
    expect(flags).toMatchObject({
      googleDriveSync: true,
      automaticEmailReminders: true,
      excelExport: true,
      maxUsers: TIER_FEATURE_FLAGS.business.maxUsers,
    });
  });
});

describe("email-in entitlement", () => {
  it("is on for business and admin only", () => {
    expect(planAllowsEmailIn("business")).toBe(true);
    expect(planAllowsEmailIn("admin")).toBe(true);
    for (const plan of ["expired", "trial", "digital", "basic"]) expect(planAllowsEmailIn(plan)).toBe(false);
    expect(buildPlanEntitlements({ plan: "business" }).emailIn).toBe(true);
    expect(buildPlanEntitlements({ plan: "basic" }).emailIn).toBe(false);
  });
});
