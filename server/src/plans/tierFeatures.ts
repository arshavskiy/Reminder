/**
 * "expired" is not a plan anyone signs up to or is assigned: it is the
 * entitlement set a lapsed trial resolves to. featureFlagsForUser maps an
 * expired trial onto it, so the account stays readable while imports and
 * automation stop. Nothing writes it to users.plan.
 */
export type PlanId = "expired" | "trial" | "digital" | "basic" | "business";

export interface TierFeatureFlags {
  gmailInspectionHistoryMonths: number | null;
  gmailInvoiceHistoryMonths: number | null;
  googleDriveSync: boolean;
  googleCalendarSync: boolean;
  /** Per-user forwarding address: documents emailed to in+<token>@ are imported. Business only. */
  emailIn: boolean;
  automaticEmailReminders: boolean;
  automaticMonthlyReports: boolean;
  excelExport: boolean;
  /**
   * Whether the account may keep files at all — object storage, local disk, or
   * a Gmail import that pulls attachments in. False on the digital plan, whose
   * whole premise is that nothing is uploaded: the user types the details and
   * the app generates the inspection documents and reminders from them.
   */
  fileStorage: boolean;
  /** Whether the account may import documents from files (upload, Gmail, OCR/AI extraction). */
  documentImport: boolean;
  /** null = unlimited */
  maxUsers: number | null;
  /** null = unlimited */
  maxEmailAccounts: number | null;
}

export const TIER_FEATURE_FLAGS: Record<PlanId, TierFeatureFlags> = {
  // What a trial degrades to once its window closes. Read-only in effect:
  // everything that costs money to run is off, the data stays reachable.
  expired: {
    gmailInspectionHistoryMonths: 16,
    gmailInvoiceHistoryMonths: 0,
    googleDriveSync: false,
    googleCalendarSync: false,

    emailIn: false,
    automaticEmailReminders: false,
    automaticMonthlyReports: false,
    excelExport: false,
    // Expired keeps fileStorage true: object storage for these accounts is
    // already opted out via the per-user s3_store_* settings, and flipping this
    // flag would also strip their local-disk copies. Only digital is
    // storage-free by design.
    fileStorage: true,
      documentImport: false,
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

    emailIn: false,
    automaticEmailReminders: true,
    automaticMonthlyReports: true,
    excelExport: true,
    fileStorage: true,
    documentImport: true,
    maxUsers: 2,
    maxEmailAccounts: 2,
  },
  // Manual-only tier: no upload, no Gmail import, no OCR/AI — so nothing is ever
  // written to object storage and nothing costs per-document AI spend. What the
  // user gets is the record keeping: clients, equipment, generated inspection
  // documents and the reminder schedule, all typed in by hand. With no storage
  // or extraction cost per document there is nothing to meter, so the quotas are
  // unlimited (see documentImportQuota / reminderQuota).
  digital: {
    gmailInspectionHistoryMonths: 0,
    gmailInvoiceHistoryMonths: 0,
    googleDriveSync: false,
    googleCalendarSync: false,

    emailIn: false,
    automaticEmailReminders: true,
    automaticMonthlyReports: true,
    excelExport: true,
    fileStorage: false,
    documentImport: false,
    maxUsers: 2,
    maxEmailAccounts: 0,
  },
  // Invoice backfill stays a business feature, so basic gets none.
  basic: {
    gmailInspectionHistoryMonths: 16,
    gmailInvoiceHistoryMonths: 0,
    googleDriveSync: true,
    googleCalendarSync: false,

    emailIn: false,
    automaticEmailReminders: true,
    automaticMonthlyReports: true,
    excelExport: true,
    fileStorage: true,
    documentImport: true,
    maxUsers: 2,
    maxEmailAccounts: 2,
  },
  business: {
    gmailInspectionHistoryMonths: 24,
    // Invoices reach further back than inspections: a business importing its
    // expense history wants full tax years, and three of them covers the period
    // records have to be kept for.
    gmailInvoiceHistoryMonths: 36,
    googleDriveSync: true,
    googleCalendarSync: true,

    emailIn: true,
    automaticEmailReminders: true,
    automaticMonthlyReports: true,
    excelExport: true,
    fileStorage: true,
    documentImport: true,
    maxUsers: null,
    maxEmailAccounts: null,
  },
};

export const PLAN_GATE_MESSAGES = {
  emailIn: "קליטת מסמכים בדואר (כתובת אישית להעברת מסמכים) זמינה במסלול עסקי בלבד.",
  calendar: "סנכרון Google Calendar זמין במסלול עסקי בלבד.",
  automaticEmailReminders: "תזכורות אימייל אוטומטיות זמינות במסלולים בסיסי ועסקי בלבד.",
  automaticMonthlyReports: "דוחות חודשיים אוטומטיים זמינים במסלולים בסיסי ועסקי בלבד.",
  excelExport: "ייצוא לאקסל זמין במסלולים בסיסי ועסקי בלבד.",
  extraUsers: "הוספת משתמשים זמינה במסלולים בסיסי ועסקי בלבד.",
  extraEmailAccounts: "חיבור חשבונות דוא״ל נוספים זמין במסלולים בסיסי ועסקי בלבד.",
  fileStorage: "שמירת קבצים אינה זמינה במסלול הדיגיטלי. שדרגו למסלול בסיסי או עסקי כדי להעלות ולשמור מסמכים.",
    documentImport: "יבוא מסמכים מקובץ או מ-Gmail אינו זמין במסלול זה. שדרגו כדי להעלות ולייבא מסמכים.",
} as const;

export function normalizePlanId(planOrRole: string | null | undefined): PlanId {
  const value = String(planOrRole ?? "").trim().toLowerCase();
  if (value === "business" || value === "admin") return "business";
  if (value === "basic" || value === "pro") return "basic";
  if (value === "digital") return "digital";
  if (value === "trial") return "trial";
  return "expired";
}

/** Trial length for new signups. */
export const TRIAL_DAYS = 30;

/**
 * A trial only counts while it has not run out.
 *
 * Resolved from trial_ends_at rather than from the plan alone, so an expired
 * trial degrades to expired entitlements the moment the date passes — no cron job
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

/** Trial rows stay plan "trial" after the window; quotas and gates must use this. */
export function effectivePlanId(
    user: { plan?: string | null; role?: string | null; trial_ends_at?: Date | string | null } | null | undefined,
): PlanId {
    if (String(user?.role ?? "").trim().toLowerCase() === "admin") return "business";
    if (normalizePlanId(user?.plan) === "trial") {
        return isTrialActive(user) ? "trial" : "expired";
    }
    return normalizePlanId(user?.plan ?? user?.role);
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
    return isTrialActive(user) ? TIER_FEATURE_FLAGS.trial : TIER_FEATURE_FLAGS.expired;
  }
  return tierFeatureFlags(user?.plan ?? user?.role);
}

export function planAllowsGoogleCalendar(planOrRole: string | null | undefined): boolean {
  return tierFeatureFlags(planOrRole).googleCalendarSync;
}

/** Whether this plan gets a personal address to forward documents to (and may import documents). */
export function planAllowsEmailIn(planOrRole: string | null | undefined): boolean {
  const flags = tierFeatureFlags(planOrRole);
  return flags.emailIn && flags.documentImport;
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

/** Whether this plan may persist files (object storage or disk) at all. */
export function planAllowsFileStorage(planOrRole: string | null | undefined): boolean {
  return tierFeatureFlags(planOrRole).fileStorage;
}

/** Whether this plan may import documents from files — upload, Gmail, OCR/AI. */
export function planAllowsDocumentImport(planOrRole: string | null | undefined): boolean {
  return tierFeatureFlags(planOrRole).documentImport;
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
