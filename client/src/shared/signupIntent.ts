export const INTENT_KEY = "signup_intent";
export type SignupIntent = {
    plan: "digital" | "basic" | "business";
    billing: "monthly" | "yearly" | "one_time";
    months?: number;
};

export function parseIntent(plan: unknown, billing: unknown, months?: unknown): SignupIntent | null {
    const p = String(plan ?? "").trim().toLowerCase();
    const b = String(billing ?? "").trim().toLowerCase();
    if (p !== "digital" && p !== "basic" && p !== "business") return null;
    if (b !== "monthly" && b !== "yearly" && b !== "one_time") return null;
    if (b === "one_time") {
        if (months !== undefined && typeof months !== "number" && typeof months !== "string") return null;
        if (typeof months === "string" && !/^\d+$/.test(months.trim())) return null;
        const count = months === undefined ? 1 : Number(months);
        if (!Number.isInteger(count) || count < 1 || count > 12) return null;
        return {plan: p, billing: b, months: count};
    }
    return {plan: p, billing: b};
}

export function readIntent(): Partial<SignupIntent> {
    try {
        const stored = JSON.parse(sessionStorage.getItem(INTENT_KEY) ?? "null");
        return parseIntent(stored?.plan, stored?.billing, stored?.months) ?? {};
    } catch {
        return {};
    }
}
