export type PlanId = "free" | "basic" | "business";

export const PLAN_LABELS: Record<PlanId, string> = {
    free: "חינמי",
    basic: "בסיסי",
    business: "עסקי",
};

export interface PricingPlan {
    id: PlanId;
    name: string;
    price: number;
    oldPrice?: number;
    period: string;
    blurb: string;
    highlighted?: boolean;
    features: string[];
}

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
            "דוח חודשי ידני",
        ],
    },
    {
        id: "basic",
        name: "בסיסי",
        price: 69,
        oldPrice: 86,
        period: "/ חודש",
        blurb: "מתאים לעסק קטן שמייבא מסמכים בכל חודש.",
        features: [
            "2 משתמשים",
            'חיבור 2 חשבונות דוא"ל',
            "50 מסמכי חשבוניות/קבלות בחודש",
            "40 מסמכי תסקירים/חוזים בחודש",
            "OCR מתקדם",
            "המרת קבלות לקובץ אקסל",
            "תזכורות אימייל אוטומטיות",
            "דוחות חודשיים אוטומטיים",
            "סנכרון Google Drive אוטומטי",
        ],
    },
    {
        id: "business",
        name: "עסקי",
        price: 179,
        oldPrice: 224,
        period: "/ חודש",
        blurb: "למי שמייבא מסמכים באופן שוטף ורוצה יותר נפח עבודה.",
        highlighted: true,
        features: [
            "משתמשים ללא הגבלה",
            "חשבונות אימייל ללא הגבלה",
            "חשבוניות וקבלות ללא הגבלה",
            "תסקירים וחוזים ללא הגבלה",
            "סנכרון היסטורי של 4 שנים",
            "מסמכים ללא הגבלה לניהול ידני",
            "תזכורות אימייל ללא הגבלה",
            "דוחות חודשיים אוטומטיים לכל הלקוחות",
            "סנכרון Google Drive אוטומטי + ייצוא מלא",
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
    const plan = String(planId ?? "").trim().toLowerCase();
    return plan === "basic" || plan === "business" || plan === "pro" || plan === "admin";
}

export function getPricingPlan(planId: PlanId): PricingPlan {
    return PRICING_PLANS.find((plan) => plan.id === planId) ?? PRICING_PLANS[0];
}

export function formatPlanPrice(plan: PricingPlan): string {
    if (plan.price === 0) return "חינם";
    return `₪${plan.price}${plan.period ? ` ${plan.period}` : ""}`;
}

export type QuotaScope = "monthly" | "lifetime" | "unlimited";

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
