export type PlanId = "free" | "trial" | "basic" | "business";

export const PLAN_LABELS: Record<PlanId, string> = {
    free: "הסתיים",
    trial: "ניסיון",
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
        gmailInvoiceHistoryMonths: 36,
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
        id: "trial",
        name: "ניסיון · 30 יום",
        price: 0,
        period: "/ 30 יום",
        blurb: "התנסות מלאה במסמכים ותסקירים, ללא כרטיס אשראי.",
        features: [
            "עד 50 מסמכים — תסקירים ומסמכים כלליים",
            "תצוגה מקדימה וחילוץ נתונים AI",
            "תזכורות אימייל אוטומטיות ללקוחות",
            "יבוא תסקירים של 16 חודשים האחרונים",
            "יבוא עד 20 חשבוניות וקבלות",
            "יצוא לאקסל ודוחות חודשיים",
            "סנכרון Google Drive",
        ],
    },
    {
        id: "basic",
        name: "בסיסי",
        price: 88,
        period: "/ חודש",
        yearlyPrice: 948,
        blurb: "מתאים לעסק קטן שמנהל תסקירים ומסמכים שוטפים.",
        features: [
            "50 מסמכים בחודש — תסקירים ומסמכים כלליים",
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
        price: 143,
        period: "/ חודש",
        yearlyPrice: 1536,
        blurb: "לבודקים מוסמכים שמנהלים תסקירים, חשבוניות וקבלות בנפח גבוה.",
        highlighted: true,
        features: [
            "כל מה שיש בבסיסי",
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
    return "free";
}

export function resolveUserPlan(user: { plan?: string | null; role?: string | null } | null | undefined): PlanId {
    const raw = String(user?.plan ?? "").trim().toLowerCase();
    if (raw === "free" || raw === "trial" || raw === "basic" || raw === "business") return raw;
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
    // Without this a trial resolved to "free", so every client-side plan check
    // treated a paying-in-waiting account as a lapsed one — and a minPlan list
    // containing "trial" collapsed to "free", admitting exactly the users it was
    // meant to exclude. The server copy has always had it.
    if (plan === "trial") return "trial";
    return "free";
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
