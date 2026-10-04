import pricingCatalog from "./pricingCatalog.json";

/**
 * "expired" is not a plan anyone signs up to or is assigned: it is the
 * entitlement set a lapsed trial resolves to. Mirrors server/src/plans/tierFeatures.ts.
 */
export type PlanId = "expired" | "trial" | "digital" | "basic" | "business";

// New subscriptions use a quote until Morning links match this catalog revision.
// Existing renewal links remain under the server's existing billing agreement.
export const PRICING_COPY = pricingCatalog.locales;

export const PLAN_LABELS: Record<PlanId, string> = {
  expired: "הסתיים",
  ...Object.fromEntries(pricingCatalog.plans.map((plan) => [plan.id, plan.copy.he.label])),
} as Record<PlanId, string>;

export const PLAN_LABELS_EN: Record<PlanId, string> = {
  expired: "Ended",
  ...Object.fromEntries(pricingCatalog.plans.map((plan) => [plan.id, plan.copy.en.label])),
} as Record<PlanId, string>;

export const PLAN_LABELS_RU: Record<PlanId, string> = {
  expired: "Закончился",
  ...Object.fromEntries(pricingCatalog.plans.map((plan) => [plan.id, plan.copy.ru.label])),
} as Record<PlanId, string>;

/** Locales the plan catalog has copy for. Matches the app's UI locales. */
export type PricingLocale = "he" | "en" | "ru";

export type QuotaScope = "monthly" | "lifetime" | "unlimited";

export interface PricingPlan {
    id: PlanId;
    name: string;
    price: number;
    /** Monthly billing price period label, e.g. "/ חודש". */
    period: string;
    /** Annual billed total in the locale currency, when payment is yearly. */
    yearlyPrice?: number;
    blurb: string;
    highlighted?: boolean;
    features: string[];
}

export interface TierFeatureFlags {
    gmailInspectionHistoryMonths: number | null;
    gmailInvoiceHistoryMonths: number | null;
    googleDriveSync: boolean;
    googleCalendarSync: boolean;
    /** Personal forwarding address for documents. Business only. */
    emailIn: boolean;
    automaticEmailReminders: boolean;
    automaticMonthlyReports: boolean;
    excelExport: boolean;
    /**
     * Whether the account may keep files at all — object storage or disk. False
     * on the digital plan, which stores extracted data only.
     */
    fileStorage: boolean;
    /** Whether the account may import documents from files (upload, Gmail, OCR/AI). */
    documentImport: boolean;
    /** null = unlimited */
    maxUsers: number | null;
    /** null = unlimited */
    maxEmailAccounts: number | null;
}

export interface PlanEntitlements extends TierFeatureFlags {
    plan: PlanId;
    ocr: true;
    previewAndExtraction: true;
    documents: {
        scope: QuotaScope;
        invoices: number | null;
        contracts: number | null;
        manualDocuments: number | null;
        emailDocuments: number | null;
    };
    reminders: {
        scope: QuotaScope;
        limit: number | null;
    };
}

export const TIER_FEATURE_FLAGS: Record<PlanId, TierFeatureFlags> = {
    // Mirrors server/src/plans/tierFeatures.ts — keep the two in step.
    // What a trial degrades to once its window closes.
    expired: {
        gmailInspectionHistoryMonths: 16,
        gmailInvoiceHistoryMonths: 0,
        googleDriveSync: false,
        googleCalendarSync: false,
        emailIn: false,
        automaticEmailReminders: false,
        automaticMonthlyReports: false,
        excelExport: false,
        fileStorage: true,
        documentImport: false,
        maxUsers: 1,
        maxEmailAccounts: 0,
    },
    trial: {
        gmailInspectionHistoryMonths: 16,
        gmailInvoiceHistoryMonths: 1,
        googleDriveSync: true,
        googleCalendarSync: true,
        emailIn: false,
        automaticEmailReminders: true,
        automaticMonthlyReports: true,
        excelExport: true,
        fileStorage: true,
        documentImport: true,
        maxUsers: 2,
        maxEmailAccounts: 2,
    },
    // Manual entry only: no upload, no Gmail, no OCR/AI, nothing written to
    // object storage. Quotas are unlimited because nothing costs per document.
    digital: {
        gmailInspectionHistoryMonths: 0,
        gmailInvoiceHistoryMonths: 0,
        googleDriveSync: false,
        googleCalendarSync: true,
        emailIn: false,
        automaticEmailReminders: true,
        automaticMonthlyReports: true,
        excelExport: true,
        fileStorage: false,
        documentImport: false,
        maxUsers: 2,
        maxEmailAccounts: 0,
    },
    basic: {
        gmailInspectionHistoryMonths: 16,
        gmailInvoiceHistoryMonths: 0,
        googleDriveSync: true,
        googleCalendarSync: true,
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
    calendar: "סנכרון Google Calendar אינו זמין לאחר סיום תקופת הניסיון. בחרו מסלול כדי להפעיל אותו.",
    automaticEmailReminders: "תזכורות אימייל אוטומטיות זמינות במסלולים בסיסי ועסקי בלבד.",
    automaticMonthlyReports: "דוחות חודשיים אוטומטיים זמינים במסלולים בסיסי ועסקי בלבד.",
    excelExport: "ייצוא לאקסל זמין במסלולים בסיסי ועסקי בלבד.",
    extraUsers: "הוספת משתמשים זמינה במסלולים בסיסי ועסקי בלבד.",
    extraEmailAccounts: "חיבור חשבונות דוא״ל נוספים זמין במסלולים בסיסי ועסקי בלבד.",
    fileStorage: "שמירת קבצים אינה זמינה במסלול הדיגיטלי. שדרגו למסלול בסיסי או עסקי כדי להעלות ולשמור מסמכים.",
    documentImport: "יבוא מסמכים מקובץ או מ-Gmail אינו זמין במסלול זה. שדרגו כדי להעלות ולייבא מסמכים.",
} as const;

export const PRICING_PAGE_URL = "https://remindocr.com/pricing";

/** List prices and localized feature lists come only from pricingCatalog.json. */
export function plansForLocale(locale: PricingLocale): PricingPlan[] {
  return pricingCatalog.plans.map((plan) => ({
    id: plan.id as PlanId,
    ...plan.copy[locale],
    price: plan.amounts[locale].monthly,
    yearlyPrice: plan.amounts[locale].yearly,
    period: plan.id === "trial" ? PRICING_COPY[locale].trialPeriod : PRICING_COPY[locale].monthlyPeriod,
    highlighted: plan.highlighted ?? false,
  }));
}

export const PRICING_PLANS: PricingPlan[] = plansForLocale("he");

export function moneySymbol(locale: PricingLocale): string {
  return PRICING_COPY[locale].symbol;
}

export function getPricingPlanForLocale(planId: PlanId, locale: PricingLocale): PricingPlan {
  const plan = plansForLocale(locale).find((item) => item.id === planId);
  if (plan) return plan;
  return {
    id: "expired", name: PRICING_COPY[locale].expiredName, price: 0, period: "",
    blurb: PRICING_COPY[locale].expiredBlurb, features: [],
  };
}

export function yearlyMonthly(plan: PricingPlan): number {
  return plan.yearlyPrice ? plan.yearlyPrice / 12 : plan.price;
}

export function planBillingTerms(plan: PricingPlan, locale: PricingLocale): string {
  return formatPlanPrice(plan, locale);
}

export function planPurchaseUrl(plan: PricingPlan, locale: PricingLocale): string {
  const terms = planBillingTerms(plan, locale);
  const message = locale === "he"
    ? `שלום, אני מעוניין לרכוש את המסלול ${plan.name} של RemindOCR. ${terms}`
    : locale === "ru"
      ? `Здравствуйте, я хочу приобрести тариф ${plan.name} в RemindOCR. ${terms}`
      : `Hi, I would like to purchase the RemindOCR ${plan.name} plan. ${terms}`;
  return `https://wa.me/${pricingCatalog.contactPhone}?text=${encodeURIComponent(message)}`;
}

export function planFromRole(role: string | null | undefined): PlanId {
    // Only a fallback for accounts with no plan stored. Roles no longer imply a
    // tier — admin administers, everyone else is a user, and what an account can
    // do comes from its plan.
    if (role === "admin") return "business";
    return "expired";
}

export function resolveUserPlan(user: {
    plan?: string | null;
    role?: string | null;
    trial_ends_at?: string | Date | null
} | null | undefined): PlanId {
    if (String(user?.role ?? "").trim().toLowerCase() === "admin") return "business";
    if (isLapsedTrial(user)) return "expired";
    const raw = String(user?.plan ?? "").trim().toLowerCase();
    if (raw === "trial" || raw === "digital" || raw === "basic" || raw === "business") return raw;
    if (raw === "expired" || raw === "free") return "expired";
    return planFromRole(user?.role);
}

/** Google Drive sync/export is available on paid plans only (basic + business). */
export function planAllowsGoogleDrive(planId: PlanId | string | null | undefined): boolean {
    return tierFeatureFlags(planId).googleDriveSync;
}

/** Gmail invoice import: months of history, null = unlimited (admin), 0 = not included. */
export function userAllowsGmailInvoiceImport(user: { plan?: string | null; role?: string | null; trial_ends_at?: string | Date | null } | null | undefined): boolean {
    const months = featureFlagsForUser(user).gmailInvoiceHistoryMonths;
    return months === null || months > 0;
}

/** Google Calendar sync is a business-plan feature. */
export function planAllowsGoogleCalendar(planId: PlanId | string | null | undefined): boolean {
    return tierFeatureFlags(planId).googleCalendarSync;
}

/** Email-in (a personal address to forward documents to) is a business-plan feature. */
export function planAllowsEmailIn(planId: PlanId | string | null | undefined): boolean {
    const flags = tierFeatureFlags(planId);
    return flags.emailIn && flags.documentImport;
}

export function planAllowsAutomaticEmailReminders(planId: PlanId | string | null | undefined): boolean {
    return tierFeatureFlags(planId).automaticEmailReminders;
}

export function planAllowsAutomaticMonthlyReports(planId: PlanId | string | null | undefined): boolean {
    return tierFeatureFlags(planId).automaticMonthlyReports;
}

export function planAllowsExcelExport(planId: PlanId | string | null | undefined): boolean {
    return tierFeatureFlags(planId).excelExport;
}

/** Whether this plan may persist files (object storage or disk) at all. */
export function planAllowsFileStorage(planId: PlanId | string | null | undefined): boolean {
    return tierFeatureFlags(planId).fileStorage;
}

/** Whether this plan may import documents from files — upload, Gmail, OCR/AI. */
export function planAllowsDocumentImport(planId: PlanId | string | null | undefined): boolean {
    return tierFeatureFlags(planId).documentImport;
}

/** Used by nav, router, and dashboard cards so a page and its module never disagree. */
export const PLAN_RANK: Record<PlanId, number> = {
    expired: 0,
    trial: 1,
    digital: 1,
    basic: 1,
    business: 2,
};

/** Pages a trial (or lapsed trial) does not open — matches top nav and dashboard cards. */
export const PAID_PLAN_IDS: PlanId[] = ["digital", "basic", "business"];

export function planMeetsMinimum(
    userPlan: PlanId | string | null | undefined,
    minPlan: PlanId | PlanId[] | undefined,
): boolean {
    if (!minPlan) return true;
    const resolved = normalizePlanId(userPlan);
    if (Array.isArray(minPlan)) {
        return minPlan.map((plan) => normalizePlanId(plan)).includes(resolved);
    }
    return (PLAN_RANK[resolved] ?? 0) >= (PLAN_RANK[normalizePlanId(minPlan)] ?? 0);
}

export function normalizePlanId(planId: PlanId | string | null | undefined): PlanId {
    const plan = String(planId ?? "").trim().toLowerCase();
    if (plan === "business" || plan === "admin") return "business";
    if (plan === "basic" || plan === "pro") return "basic";
    if (plan === "digital") return "digital";
    // Without this a trial resolved to "free", so every client-side plan check
    // treated a paying-in-waiting account as a lapsed one — and a minPlan list
    // containing "trial" collapsed to "free", admitting exactly the users it was
    // meant to exclude. The server copy has always had it.
    if (plan === "trial") return "trial";
    return "expired";
}

/**
 * Whether a trial is still inside its window. Mirrors isTrialActive on the
 * server: a lapsed trial keeps plan "trial" and no job rewrites it, so the date
 * is the only thing that says whether the entitlements still apply.
 */
export function isTrialActive(
    user: { plan?: string | null; trial_ends_at?: string | Date | null } | null | undefined,
    now: Date = new Date(),
): boolean {
    if (normalizePlanId(user?.plan) !== "trial") return false;
    const endsAt = user?.trial_ends_at;
    if (!endsAt) return false;
    const parsed = endsAt instanceof Date ? endsAt : new Date(endsAt);
    return !Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime();
}

/**
 * Feature flags for a user, honouring trial expiry. Mirrors featureFlagsForUser
 * on the server: comparing plan strings misses a lapsed trial, because that
 * account still reports plan "trial".
 */
export function featureFlagsForUser(
    user: { plan?: string | null; role?: string | null; trial_ends_at?: string | Date | null } | null | undefined,
): TierFeatureFlags {
    if (String(user?.role ?? "").trim().toLowerCase() === "admin") {
        return {
            ...TIER_FEATURE_FLAGS.business,
            gmailInspectionHistoryMonths: null,
            gmailInvoiceHistoryMonths: null,
        };
    }
    if (normalizePlanId(user?.plan) === "trial") {
        return isTrialActive(user) ? TIER_FEATURE_FLAGS.trial : TIER_FEATURE_FLAGS.expired;
    }
    return tierFeatureFlags(user?.plan ?? user?.role);
}

/** A trial whose window has closed: plan still reads "trial", entitlements do not. */
export function isLapsedTrial(
    user: { plan?: string | null; trial_ends_at?: string | Date | null } | null | undefined,
): boolean {
    return normalizePlanId(user?.plan) === "trial" && !isTrialActive(user);
}

export function tierFeatureFlags(planId: PlanId | string | null | undefined): TierFeatureFlags {
    const value = String(planId ?? "").trim().toLowerCase();
    if (value === "admin") {
        return {
            ...TIER_FEATURE_FLAGS.business,
            gmailInspectionHistoryMonths: null,
            gmailInvoiceHistoryMonths: null,
        };
    }
    return TIER_FEATURE_FLAGS[normalizePlanId(planId)];
}

export function formatGmailInvoiceHistoryLimit(months: number | null): string {
    if (months === null) return "ללא הגבלת זמן";
    if (months <= 0) return "לא כלול";
    if (months % 12 === 0) {
        const years = months / 12;
        return years === 1 ? "12 חודשים" : `${years} שנים`;
    }
    return `${months} חודשים`;
}

export function getPricingPlan(planId: PlanId): PricingPlan {
    return getPricingPlanForLocale(planId, "he");
}

export function formatPlanPrice(plan: PricingPlan, locale: PricingLocale = "he"): string {
    if (plan.id === "expired") return PRICING_COPY[locale].expiredName;
    const symbol = moneySymbol(locale);
    if (plan.price === 0) return locale === "en" ? "Free" : locale === "ru" ? "Бесплатно" : "חינם";
    return `${symbol}${plan.price}${plan.period ? ` ${plan.period}` : ""}`;
}

export function formatPlanYearlyPrice(plan: PricingPlan, locale: PricingLocale = "he"): string | null {
    if (!plan.yearlyPrice) return null;
    const symbol = moneySymbol(locale);
    const year = plan.yearlyPrice.toLocaleString(locale === "en" ? "en-US" : locale === "ru" ? "ru-RU" : "he-IL");
    if (locale === "en") return `${symbol}${year} / year · billed yearly`;
    if (locale === "ru") return `${symbol}${year} в год · оплата за год`;
    return `${symbol}${year} לשנה · חיוב שנתי`;
}

export function formatQuotaScope(scope: QuotaScope): string {
    if (scope === "monthly") return "מכסה חודשית";
    if (scope === "lifetime") return "מכסה חד פעמית";
    return "ללא הגבלה";
}

export function formatQuotaUsage(used: number, limit: number | null): string {
    if (limit === null) return `${used} · ללא הגבלה`;
    return `${used} / ${limit}`;
}

export function quotaPercent(used: number, limit: number | null): number {
    if (limit === null || limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
}
