import { describe, expect, it } from "vitest";
import { buildPlanEntitlements, newTrialEndsAt, newUserSettingsDefaults } from "../plans/planEntitlements";
import { TIER_FEATURE_FLAGS, featureFlagsForUser, planAllowsEmailIn, userAllowsGmailInvoiceImport } from "../plans/tierFeatures";

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
    expect(entitlements.googleCalendarSync).toBe(true);
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
  it("is on for business, admin and digital", () => {
    expect(planAllowsEmailIn("business")).toBe(true);
    expect(planAllowsEmailIn("admin")).toBe(true);
    expect(planAllowsEmailIn("digital")).toBe(true);
    for (const plan of ["expired", "trial", "basic"]) expect(planAllowsEmailIn(plan)).toBe(false);
    expect(buildPlanEntitlements({ plan: "business" }).emailIn).toBe(true);
    expect(buildPlanEntitlements({ plan: "digital" }).emailIn).toBe(true);
    expect(buildPlanEntitlements({ plan: "basic" }).emailIn).toBe(false);
  });
});

describe("entitlements of new accounts", () => {
  const PLANS = ["trial", "digital", "basic", "business"] as const;
  const trialEndsAt = newTrialEndsAt();

  it("start on trial and carry every tier flag, including the newest ones", () => {
    const defaults = newUserSettingsDefaults("user-1") as { plan_entitlements: Record<string, unknown> };
    expect(defaults.plan_entitlements.plan).toBe("trial");
    for (const key of Object.keys(TIER_FEATURE_FLAGS.trial)) {
      expect(defaults.plan_entitlements, key).toHaveProperty(key);
    }
    expect(defaults.plan_entitlements.emailIn).toBe(false);
    expect(defaults.plan_entitlements.googleCalendarSync).toBe(true);
  });

  it("give each plan its own flags when the account is created on that plan", () => {
    for (const plan of PLANS) {
      const entitlements = (newUserSettingsDefaults("user-1", { plan, role: "user", trial_ends_at: trialEndsAt }) as { plan_entitlements: Record<string, unknown> }).plan_entitlements;
      for (const [key, value] of Object.entries(TIER_FEATURE_FLAGS[plan])) {
        expect(entitlements[key], `${plan}.${key}`).toEqual(value);
      }
    }
  });

  it("would store the expired set if the trial end date were left out", () => {
    // Regression: email sign-up once built the first snapshot without trial_ends_at.
    const entitlements = (newUserSettingsDefaults("user-1", { plan: "trial", role: "user" }) as { plan_entitlements: { plan: string } }).plan_entitlements;
    expect(entitlements.plan).toBe("expired");
  });

  it("enable email-in on business and digital, and the calendar on every plan", () => {
    const on = (plan: string) => buildPlanEntitlements({ plan, role: "user", trial_ends_at: new Date(Date.now() + 86_400_000) });
    expect(on("business")).toMatchObject({ emailIn: true, googleCalendarSync: true });
    expect(on("digital")).toMatchObject({ emailIn: true, googleCalendarSync: true });
    for (const plan of ["trial", "basic"]) {
      expect(on(plan)).toMatchObject({ emailIn: false, googleCalendarSync: true });
    }
    // A lapsed trial keeps neither.
    expect(buildPlanEntitlements({ plan: "trial", role: "user" })).toMatchObject({ emailIn: false, googleCalendarSync: false });
  });

  it("keep the Discover reminders page off for new accounts until an admin enables it", () => {
    const features = (newUserSettingsDefaults("user-1") as { features: { pages: Record<string, boolean> } }).features;
    expect(features.pages.discovery).toBe(false);
  });
});

describe("userAllowsGmailInvoiceImport", () => {
  it("treats unlimited history (admin, stored as null) as allowed, not as none", () => {
    expect(featureFlagsForUser({ role: "admin", plan: "basic" }).gmailInvoiceHistoryMonths).toBeNull();
    expect(userAllowsGmailInvoiceImport({ role: "admin", plan: "basic" })).toBe(true);
  });

  it("is allowed on business, digital and an active trial, not on basic or a lapsed trial", () => {
    expect(userAllowsGmailInvoiceImport({ plan: "business" })).toBe(true);
    expect(userAllowsGmailInvoiceImport({ plan: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) })).toBe(true);
    expect(userAllowsGmailInvoiceImport({ plan: "basic" })).toBe(false);
    expect(userAllowsGmailInvoiceImport({ plan: "digital" })).toBe(true);
    expect(userAllowsGmailInvoiceImport({ plan: "trial", trial_ends_at: "2020-01-01T00:00:00Z" })).toBe(false);
  });
});
