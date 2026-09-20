/**
 * "expired" is not a plan anyone signs up to or is assigned: it is the
 * entitlement set a lapsed trial resolves to. Mirrors server/src/plans/tierFeatures.ts.
 */
export type PlanId = "expired" | "trial" | "digital" | "basic" | "business";

/** Morning one-time checkout links. Env on the server can override these. */
export const PLAN_PAYMENT_LINKS: Partial<Record<PlanId, string>> = {
    digital: "https://mrng.to/SUPCi1tsrC",
    basic: "https://mrng.to/5vjboMGOmm",
    business: "https://mrng.to/qE6K86XDbW",
};

export const PLAN_LABELS: Record<PlanId, string> = {
    expired: "הסתיים",
    trial: "ניסיון",
    digital: "דיגיטלי",
    basic: "בסיסי",
    business: "עסקי",
};

export type QuotaScope = "monthly" | "lifetime" | "unlimited";

export interface PricingPlan {
    id: PlanId;
    name: string;
    price: number;
    oldPrice?: number;
    /** Monthly sticker price period label, e.g. "/ חודש". */
    period: string;
    /** Annual billed total in ILS, when payment is yearly. */
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
        googleCalendarSync: false,
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
        googleCalendarSync: false,
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
        googleCalendarSync: false,
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
    calendar: "סנכרון Google Calendar זמין במסלול עסקי בלבד.",
    automaticEmailReminders: "תזכורות אימייל אוטומטיות זמינות במסלולים בסיסי ועסקי בלבד.",
    automaticMonthlyReports: "דוחות חודשיים אוטומטיים זמינים במסלולים בסיסי ועסקי בלבד.",
    excelExport: "ייצוא לאקסל זמין במסלולים בסיסי ועסקי בלבד.",
    extraUsers: "הוספת משתמשים זמינה במסלולים בסיסי ועסקי בלבד.",
    extraEmailAccounts: "חיבור חשבונות דוא״ל נוספים זמין במסלולים בסיסי ועסקי בלבד.",
    fileStorage: "שמירת קבצים אינה זמינה במסלול הדיגיטלי. שדרגו למסלול בסיסי או עסקי כדי להעלות ולשמור מסמכים.",
    documentImport: "יבוא מסמכים מקובץ או מ-Gmail אינו זמין במסלול זה. שדרגו כדי להעלות ולייבא מסמכים.",
} as const;

export const PRICING_PAGE_URL = "https://remindocr.com/pricing";

/** USD list prices for the English marketing site and `/en` app. Hebrew pages stay in ILS. */
export const USD_PLAN_AMOUNTS: Record<PlanId, {price: number; oldPrice?: number; yearlyPrice?: number}> = {
    expired: {price: 0},
    trial: {price: 0},
    digital: {price: 15},
    basic: {price: 25, oldPrice: 28, yearlyPrice: 300},
    business: {price: 39, oldPrice: 43, yearlyPrice: 468},
};

const PRICING_PLANS_EN_COPY: Record<Exclude<PlanId, "expired">, Pick<PricingPlan, "name" | "period" | "blurb" | "features">> = {
    trial: {
        name: "Trial · 30 days",
        period: "/ 30 days",
        blurb: "All Basic-plan capabilities, no credit card required.",
        features: [
            "Preview and AI data extraction",
            "Automatic email reminders to clients",
            "Import up to 20 documents — upload and Gmail",
            "Excel export and monthly reports",
            "Google Drive sync",
        ],
    },
    digital: {
        name: "Digital",
        period: "/ month",
        blurb: "Manage inspections and reminders with manual entry, without storing files in the cloud.",
        features: [
            "Manual data entry — no file uploads",
            "Client and equipment management",
            "Generate inspections for signing and sending",
            "Automatic email reminders to clients",
            "Excel export and monthly reports",
        ],
    },
    basic: {
        name: "Basic",
        period: "/ month",
        blurb: "For a small business that imports documents every month.",
        features: [
            "50 documents per month — inspections and receipts combined",
            "Import inspections from the last 16 months",
            "Client and equipment management",
            "Inspection management and client reminders",
            "Export receipts to Excel",
            "Automatic monthly reports",
            "Google Drive sync",
        ],
    },
    business: {
        name: "Business",
        period: "/ month",
        blurb: "For certified inspectors who import documents regularly, work with several mailboxes, and want a synced Google Calendar.",
        features: [
            "Unlimited inspection and invoice import",
            "Import inspections from Gmail up to 24 months back",
            "Import invoices and receipts from Gmail up to 36 months back",
            "Client and equipment management",
            "Google Calendar sync for upcoming inspections",
        ],
    },
};

export const PLAN_LABELS_EN: Record<PlanId, string> = {
    expired: "Ended",
    trial: "Trial",
    digital: "Digital",
    basic: "Basic",
    business: "Business",
};

export function moneySymbol(locale: "he" | "en"): string {
    return locale === "en" ? "$" : "₪";
}

export function plansForLocale(locale: "he" | "en"): PricingPlan[] {
    if (locale !== "en") return PRICING_PLANS;
    return PRICING_PLANS.map((plan) => {
        const usd = USD_PLAN_AMOUNTS[plan.id];
        const copy = plan.id === "expired" ? null : PRICING_PLANS_EN_COPY[plan.id];
        return {
            ...plan,
            ...(copy ?? {}),
            price: usd.price,
            oldPrice: usd.oldPrice,
            yearlyPrice: usd.yearlyPrice,
        };
    });
}

export function getPricingPlanForLocale(planId: PlanId, locale: "he" | "en"): PricingPlan {
    return plansForLocale(locale).find((plan) => plan.id === planId) ?? plansForLocale(locale)[0];
}

export const PRICING_PLANS: PricingPlan[] = [
    {
        id: "trial",
        name: "ניסיון · 30 יום",
        price: 0,
        period: "/ 30 יום",
        blurb: "כל היכולות של המסלול הבסיסי, ללא כרטיס אשראי.",
        features: [
            "תצוגה מקדימה וחילוץ נתונים AI",
            "תזכורות אימייל אוטומטיות ללקוחות",
            "יבוא עד 20 מסמכים — העלאה ומ-Gmail",
            "יצוא לאקסל ודוחות חודשיים",
            "סנכרון Google Drive",
        ],
    },
    {
        id: "digital",
        name: "דיגיטלי",
        price: 47,
        period: "/ חודש",
        blurb: "לניהול תסקירים ותזכורות בהזנה ידנית, ללא שמירת קבצים בענן.",
        features: [
            "הזנת נתונים ידנית — ללא העלאת קבצים",
            "ניהול לקוחות וציוד",
            "הפקת תסקירים לחתימה ושליחה",
            "תזכורות אימייל אוטומטיות ללקוחות",
            "יצוא לאקסל ודוחות חודשיים",
        ],
    },
    {
        id: "basic",
        name: "בסיסי",
        price: 79,
        oldPrice: 88,
        period: "/ חודש",
        yearlyPrice: 948,
        blurb: "מתאים לעסק קטן שמייבא מסמכים בכל חודש.",
        features: [
            "50 מסמכים בחודש — תסקירים וקבלות יחד",
            "יבוא תסקירים של 16 חודשים האחרונים",
            "ניהול לקוחות וציוד",
            "ניהול תסקירים ושליחת תזכורות ללקוחות",
            "יצוא קבלות לקובץ אקסל",
            "הפקת דוחות חודשיים אוטומטיים",
            "סנכרון Google Drive",
        ],
    },
    {
        id: "business",
        name: "עסקי",
        price: 128,
        oldPrice: 143,
        period: "/ חודש",
        yearlyPrice: 1536,
        blurb: "לבודקים מוסמכים שמייבאים מסמכים באופן שוטף, עובדים עם כמה מאיילים ורוצים יומן Google מסונכרן.",
        highlighted: true,
        features: [
            "יבוא תסקירים וחשבוניות ללא הגבלה",
            "יבוא תסקירים מ-Gmail עד 24 חודשים אחורה",
            "יבוא חשבוניות וקבלות מ-Gmail עד 36 חודשים אחורה",
            "ניהול לקוחות וציוד",
            "סנכרון Google Calendar לתסקירים עתידיים",
        ],
    },
];

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

/** Google Calendar sync is a business-plan feature. */
export function planAllowsGoogleCalendar(planId: PlanId | string | null | undefined): boolean {
    return tierFeatureFlags(planId).googleCalendarSync;
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
    return PRICING_PLANS.find((plan) => plan.id === planId) ?? PRICING_PLANS[0];
}

export function formatPlanPrice(plan: PricingPlan, locale: "he" | "en" = "he"): string {
    const symbol = moneySymbol(locale);
    if (plan.price === 0) return locale === "en" ? "Free" : "חינם";
    const monthly = `${symbol}${plan.price}${plan.period ? ` ${plan.period}` : ""}`;
    if (plan.yearlyPrice) {
        const year = plan.yearlyPrice.toLocaleString(locale === "en" ? "en-US" : "he-IL");
        return locale === "en"
            ? `${monthly} · ${symbol}${year} / year`
            : `${monthly} · ${symbol}${year} לשנה`;
    }
    return monthly;
}

/** The pre-discount monthly sticker price, when the plan is currently discounted. */
export function formatPlanOldPrice(plan: PricingPlan, locale: "he" | "en" = "he"): string | null {
    if (!plan.oldPrice) return null;
    return `${moneySymbol(locale)}${plan.oldPrice}`;
}

export function formatPlanYearlyPrice(plan: PricingPlan, locale: "he" | "en" = "he"): string | null {
    if (!plan.yearlyPrice) return null;
    const symbol = moneySymbol(locale);
    const year = plan.yearlyPrice.toLocaleString(locale === "en" ? "en-US" : "he-IL");
    return locale === "en"
        ? `${symbol}${year} / year · billed yearly`
        : `${symbol}${year} לשנה · חיוב שנתי`;
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
