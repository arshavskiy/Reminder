export type PlanId = "free" | "basic" | "business";

export interface TierFeatureFlags {
  gmailInvoiceHistoryMonths: number | null;
  googleDriveSync: boolean;
  googleCalendarSync: boolean;
  automaticEmailReminders: boolean;
  automaticMonthlyReports: boolean;
  excelExport: boolean;
}

export const TIER_FEATURE_FLAGS: Record<PlanId, TierFeatureFlags> = {
  free: {
    gmailInvoiceHistoryMonths: 0,
    googleDriveSync: false,
    googleCalendarSync: false,
    automaticEmailReminders: false,
    automaticMonthlyReports: false,
    excelExport: false,
  },
  basic: {
    gmailInvoiceHistoryMonths: 12,
    googleDriveSync: true,
    googleCalendarSync: true,
    automaticEmailReminders: true,
    automaticMonthlyReports: true,
    excelExport: true,
  },
  business: {
    gmailInvoiceHistoryMonths: 48,
    googleDriveSync: true,
    googleCalendarSync: true,
    automaticEmailReminders: true,
    automaticMonthlyReports: true,
    excelExport: true,
  },
};

export function normalizePlanId(planOrRole: string | null | undefined): PlanId {
  const value = String(planOrRole ?? "").trim().toLowerCase();
  if (value === "business" || value === "admin") return "business";
  if (value === "basic" || value === "pro") return "basic";
  return "free";
}

export function featureFlagsForUser(user: { plan?: string | null; role?: string | null } | null | undefined): TierFeatureFlags {
  if (String(user?.role ?? "").trim().toLowerCase() === "admin") {
    return { ...TIER_FEATURE_FLAGS.business, gmailInvoiceHistoryMonths: null };
  }
  return tierFeatureFlags(user?.plan ?? user?.role);
}

export function tierFeatureFlags(planOrRole: string | null | undefined): TierFeatureFlags {
  const value = String(planOrRole ?? "").trim().toLowerCase();
  if (value === "admin") {
    return { ...TIER_FEATURE_FLAGS.business, gmailInvoiceHistoryMonths: null };
  }
  return TIER_FEATURE_FLAGS[normalizePlanId(planOrRole)];
}
