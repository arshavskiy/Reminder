import { describe, expect, it } from "vitest";
import { featureFlagsForUser, isTrialActive, TIER_FEATURE_FLAGS } from "../plans/tierFeatures";
import { reminderLimit } from "../quotas/reminderQuota";

const DAY = 24 * 60 * 60 * 1000;

describe("trial plan", () => {
  it("treats a future trial_ends_at as active", () => {
    expect(isTrialActive({plan: "trial", trial_ends_at: new Date(Date.now() + DAY)})).toBe(true);
  });

  it("treats a past trial_ends_at as expired", () => {
    expect(isTrialActive({plan: "trial", trial_ends_at: new Date(Date.now() - DAY)})).toBe(false);
  });

  it("treats a missing trial_ends_at as expired rather than unlimited", () => {
    expect(isTrialActive({plan: "trial", trial_ends_at: null})).toBe(false);
  });

    it("gives an active trial basic-level automation without Gmail invoice history", () => {
    const flags = featureFlagsForUser({plan: "trial", trial_ends_at: new Date(Date.now() + DAY)});
    expect(flags.automaticEmailReminders).toBe(true);
    expect(flags.excelExport).toBe(true);
        expect(flags.gmailInvoiceHistoryMonths).toBe(0);
    expect(flags.googleCalendarSync).toBe(false);
  });

  it("drops an expired trial to free entitlements without rewriting the plan", () => {
    const flags = featureFlagsForUser({plan: "trial", trial_ends_at: new Date(Date.now() - DAY)});
    expect(flags).toEqual(TIER_FEATURE_FLAGS.free);
    expect(flags.automaticEmailReminders).toBe(false);
  });

  it("lets a trial send reminders", () => {
    expect(reminderLimit("trial")).toEqual({limit: null, scope: "unlimited"});
  });
});
