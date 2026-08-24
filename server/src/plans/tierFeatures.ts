export type PlanId = "free" | "basic" | "business";

export interface TierFeatureFlags {
  gmailInvoiceHistoryMonths: number | null;
  googleDriveSync: boolean;
  automaticEmailReminders: boolean;
  automaticMonthlyReports: boolean;
  excelExport: boolean;
}

export const TIER_FEATURE_FLAGS: Record<PlanId, TierFeatureFlags> = {
  free: {
    gmailInvoiceHistoryMonths: 0,
    googleDriveSync: false,
    automaticEmailReminders: false,
    automaticMonthlyReports: false,
    excelExport: false,
  },
  basic: {
    gmailInvoiceHistoryMonths: 12,
    googleDriveSync: true,
    automaticEmailReminders: true,
    automaticMonthlyReports: true,
    excelExport: true,
  },
  business: {
    gmailInvoiceHistoryMonths: 48,
    googleDriveSync: true,
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

export function tierFeatureFlags(planOrRole: string | null | undefined): TierFeatureFlags {
  return TIER_FEATURE_FLAGS[normalizePlanId(planOrRole)];
}
