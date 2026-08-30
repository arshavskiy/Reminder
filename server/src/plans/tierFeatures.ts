export type PlanId = "free" | "trial" | "basic" | "business";

export interface TierFeatureFlags {
  gmailInspectionHistoryMonths: number | null;
  gmailInvoiceHistoryMonths: number | null;
  googleDriveSync: boolean;
  googleCalendarSync: boolean;
  automaticEmailReminders: boolean;
  automaticMonthlyReports: boolean;
  excelExport: boolean;
  /** null = unlimited */
  maxUsers: number | null;
  /** null = unlimited */
  maxEmailAccounts: number | null;
}

export const TIER_FEATURE_FLAGS: Record<PlanId, TierFeatureFlags> = {
  free: {
    gmailInspectionHistoryMonths: 16,
    gmailInvoiceHistoryMonths: 0,
    googleDriveSync: false,
    googleCalendarSync: false,
    automaticEmailReminders: false,
    automaticMonthlyReports: false,
    excelExport: false,
    maxUsers: 1,
    maxEmailAccounts: 0,
  },
  // 30-day trial: basic entitlements, plus one month of Gmail invoice history —
  // enough to demonstrate the import on recent receipts without offering the
  // historical backfill that business pays for.
  trial: {
    gmailInspectionHistoryMonths: 16,
    gmailInvoiceHistoryMonths: 1,
    googleDriveSync: true,
    googleCalendarSync: false,
    automaticEmailReminders: true,
    automaticMonthlyReports: true,
    excelExport: true,
    maxUsers: 2,
    maxEmailAccounts: 2,
  },
  // Invoice backfill stays a business feature, so basic gets none.
  basic: {
    gmailInspectionHistoryMonths: 16,
    gmailInvoiceHistoryMonths: 0,
    googleDriveSync: true,
    googleCalendarSync: false,
    automaticEmailReminders: true,
    automaticMonthlyReports: true,
    excelExport: true,
    maxUsers: 2,
    maxEmailAccounts: 2,
  },
  business: {
    gmailInspectionHistoryMonths: 24,
    gmailInvoiceHistoryMonths: 24,
    googleDriveSync: true,
    googleCalendarSync: true,
    automaticEmailReminders: true,
    automaticMonthlyReports: true,
    excelExport: true,
    maxUsers: null,
    maxEmailAccounts: null,
  },
};

export const PLAN_GATE_MESSAGES = {
  calendar: "סנכרון Google Calendar זמין במסלול עסקי בלבד.",
  automaticEmailReminders: "תזכורות אימייל אוטומטיות זמינות במסלולים בסיסי ועסקי בלבד.",
  automaticMonthlyReports: "דוחות חודשיים אוטומטיים זמינים במסלולים בסיסי ועסקי בלבד.",
  excelExport: "ייצוא לאקסל זמין במסלולים בסיסי ועסקי בלבד.",
  extraUsers: "הוספת משתמשים זמינה במסלולים בסיסי ועסקי בלבד.",
  extraEmailAccounts: "חיבור חשבונות דוא״ל נוספים זמין במסלולים בסיסי ועסקי בלבד.",
} as const;

export function normalizePlanId(planOrRole: string | null | undefined): PlanId {
  const value = String(planOrRole ?? "").trim().toLowerCase();
  if (value === "business" || value === "admin") return "business";
  if (value === "basic" || value === "pro") return "basic";
  if (value === "trial") return "trial";
  return "free";
}

/** Trial length for new signups. */
export const TRIAL_DAYS = 30;

/**
 * A trial only counts while it has not run out.
 *
 * Resolved from trial_ends_at rather than from the plan alone, so an expired
 * trial degrades to free entitlements the moment the date passes — no cron job
 * has to rewrite the row for the gates to close.
 */
export function isTrialActive(
  user: { plan?: string | null; trial_ends_at?: Date | string | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (normalizePlanId(user?.plan) !== "trial") return false;
  const endsAt = user?.trial_ends_at;
  if (!endsAt) return false;
  const parsed = endsAt instanceof Date ? endsAt : new Date(endsAt);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime();
}

export function featureFlagsForUser(
  user: { plan?: string | null; role?: string | null; trial_ends_at?: Date | string | null } | null | undefined,
): TierFeatureFlags {
  if (String(user?.role ?? "").trim().toLowerCase() === "admin") {
    return {
      ...TIER_FEATURE_FLAGS.business,
      gmailInspectionHistoryMonths: null,
      gmailInvoiceHistoryMonths: null,
    };
  }
  // Every gate in the app reads its flags from here, so expiring the trial in this
  // one place closes calendar, reminders, reports and export together.
  if (normalizePlanId(user?.plan) === "trial") {
    return isTrialActive(user) ? TIER_FEATURE_FLAGS.trial : TIER_FEATURE_FLAGS.free;
  }
  return tierFeatureFlags(user?.plan ?? user?.role);
}

export function planAllowsGoogleCalendar(planOrRole: string | null | undefined): boolean {
  return tierFeatureFlags(planOrRole).googleCalendarSync;
}

export function planAllowsAutomaticEmailReminders(planOrRole: string | null | undefined): boolean {
  return tierFeatureFlags(planOrRole).automaticEmailReminders;
}

export function planAllowsAutomaticMonthlyReports(planOrRole: string | null | undefined): boolean {
  return tierFeatureFlags(planOrRole).automaticMonthlyReports;
}

export function planAllowsExcelExport(planOrRole: string | null | undefined): boolean {
  return tierFeatureFlags(planOrRole).excelExport;
}

export function tierFeatureFlags(planOrRole: string | null | undefined): TierFeatureFlags {
  const value = String(planOrRole ?? "").trim().toLowerCase();
  if (value === "admin") {
    return {
      ...TIER_FEATURE_FLAGS.business,
      gmailInspectionHistoryMonths: null,
      gmailInvoiceHistoryMonths: null,
    };
  }
  return TIER_FEATURE_FLAGS[normalizePlanId(planOrRole)];
}
