export type PlanId = "free" | "basic" | "business";

export const PLAN_LABELS: Record<PlanId, string> = {
    free: "חינמי",
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

export interface PlanEntitlements extends TierFeatureFlags {
    plan: PlanId;
    ocr: true;
    previewAndExtraction: true;
    documents: {
        scope: QuotaScope;
        invoices: number | null;
        contracts: number | null;
    };
    reminders: {
        scope: QuotaScope;
        limit: number | null;
    };
}

export const TIER_FEATURE_FLAGS: Record<PlanId, TierFeatureFlags> = {
    free: {
        gmailInvoiceHistoryMonths: 0,
        googleDriveSync: false,
        googleCalendarSync: false,
        automaticEmailReminders: false,
        automaticMonthlyReports: false,
        excelExport: false,
        maxUsers: 1,
        maxEmailAccounts: 1,
    },
    basic: {
        gmailInvoiceHistoryMonths: 12,
        googleDriveSync: true,
        googleCalendarSync: false,
        automaticEmailReminders: true,
        automaticMonthlyReports: true,
        excelExport: true,
        maxUsers: 2,
        maxEmailAccounts: 2,
    },
    business: {
        gmailInvoiceHistoryMonths: 48,
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

export const PRICING_PAGE_URL = "https://remindocr.com/pricing";

export const PRICING_PLANS: PricingPlan[] = [
    {
        id: "free",
        name: "חינמי",
        price: 0,
        period: "חד פעמי",
        blurb: "להתחלה מהירה ובדיקת התהליך עם כמות מסמכים מוגבלת.",
        features: [
            "משתמש אחד",
            "30 מסמכים חד פעמי",
            "25 תזכורות אימייל",
            "OCR מתקדם",
            "תצוגה מקדימה וחילוץ נתונים",
        ],
    },
    {
        id: "basic",
        name: "בסיסי",
        price: 125,
        oldPrice: 150,
        period: "/ חודש",
        yearlyPrice: 125 * 12,
        blurb: "מתאים לעסק קטן שמייבא מסמכים בכל חודש.",
        features: [
            'חיבור 2 חשבונות דוא"ל',
            "100 מסמכי תסקירים/חוזים בחודש",
            "ייבוא חשבוניות מ-Gmail עד 12 חודשים אחורה",
            "ניהול תסקירים ושליחת תזכורות ללקוחות",
            "דוחות חודשיים אוטומטיים",
            "סנכרון Google Drive ",
        ],
    },
    {
        id: "business",
        name: "עסקי",
        price: 179,
        oldPrice: 224,
        period: "/ חודש",
        yearlyPrice: 2148,
        blurb: "לצוותים ועסקים שמייבאים מסמכים באופן שוטף, עובדים עם כמה משתמשים ורוצים יומן Google מסונכרן.",
        highlighted: true,
        features: [
            'חיבור 4 חשבונות דוא"ל',
            "תסקירים וחוזים ללא הגבלה",
            "סנכרון היסטורי של שנתיים",
            "סנכרון Google Calendar לתסקירים עתידיים",
        ],
    },
];

export function planFromRole(role: string | null | undefined): PlanId {
    if (role === "admin") return "business";
    if (role === "pro") return "basic";
    return "free";
}

export function resolveUserPlan(user: { plan?: string | null; role?: string | null } | null | undefined): PlanId {
    const raw = String(user?.plan ?? "").trim().toLowerCase();
    if (raw === "free" || raw === "basic" || raw === "business") return raw;
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

export function normalizePlanId(planId: PlanId | string | null | undefined): PlanId {
    const plan = String(planId ?? "").trim().toLowerCase();
    if (plan === "business" || plan === "admin") return "business";
    if (plan === "basic" || plan === "pro") return "basic";
    return "free";
}

export function tierFeatureFlags(planId: PlanId | string | null | undefined): TierFeatureFlags {
    const value = String(planId ?? "").trim().toLowerCase();
    if (value === "admin") {
        return { ...TIER_FEATURE_FLAGS.business, gmailInvoiceHistoryMonths: null };
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

export function formatPlanPrice(plan: PricingPlan): string {
    if (plan.price === 0) return "חינם";
    const monthly = `₪${plan.price}${plan.period ? ` ${plan.period}` : ""}`;
    if (plan.yearlyPrice) {
        return `${monthly} · ₪${plan.yearlyPrice.toLocaleString("he-IL")} לשנה`;
    }
    return monthly;
}

export function formatPlanYearlyPrice(plan: PricingPlan): string | null {
    if (!plan.yearlyPrice) return null;
    return `₪${plan.yearlyPrice.toLocaleString("he-IL")} לשנה · חיוב שנתי`;
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
