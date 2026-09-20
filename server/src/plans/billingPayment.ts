import {parsePrepaidMonths, type BillingPeriod} from "./signupIntent";

export interface ConfirmedPayment {
    billing: BillingPeriod;
    paymentId: string;
    paidAt: Date;
    months?: number;
}

/** Only call on trusted payment/admin routes; a return URL is not a receipt. */
export function parseConfirmedPayment(body: Record<string, unknown>, now = new Date()): ConfirmedPayment | null {
    if (body.billing === undefined) return null; // Legacy tier-only updates.
    if (!["one_time", "monthly", "yearly"].includes(String(body.billing))) {
        throw new Error("invalid_billing");
    }
    const paymentId = body.paymentId ?? body.payment_id;
    const paidAtRaw = body.paidAt ?? body.paid_at;
    if (typeof paymentId !== "string" || !paymentId.trim() || paymentId.length > 200) {
        throw new Error("payment_id_required");
    }
    if (typeof paidAtRaw !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(paidAtRaw)) {
        throw new Error("paid_at_required_iso_timestamp");
    }
    const paidAt = new Date(paidAtRaw);
    if (!Number.isFinite(paidAt.getTime()) || paidAt > now) throw new Error("invalid_paid_at");
    const months = body.billing === "one_time" ? parsePrepaidMonths(body.months) : undefined;
    if (months === null || (body.billing !== "one_time" && body.months !== undefined)) {
        throw new Error("invalid_prepaid_months");
    }
    return {
        billing: body.billing as BillingPeriod, paymentId: paymentId.trim(), paidAt,
        ...(months !== undefined ? {months} : {})
    };
}

/** Preserve UTC time and clamp month-end dates (Jan 31 -> Feb 28/29). */
export function nextPaymentDate(paidAt: Date, months = 1): Date {
    if (parsePrepaidMonths(months) === null) throw new Error("invalid_prepaid_months");
    const next = new Date(paidAt);
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
    return next;
}

const DEFAULT_ONE_TIME_PAYMENT_LINKS: Record<"digital" | "basic" | "business", string> = {
    digital: "https://mrng.to/SUPCi1tsrC",
    basic: "https://mrng.to/5vjboMGOmm",
    business: "https://mrng.to/qE6K86XDbW",
};

export function renewalPaymentUrl(plan: unknown): string | null {
    if (plan !== "digital" && plan !== "basic" && plan !== "business") return null;
    const raw = process.env[`PAYMENT_LINK_${plan.toUpperCase()}_ONE_TIME`]?.trim()
        || DEFAULT_ONE_TIME_PAYMENT_LINKS[plan];
    if (!raw) return null;
    try {
        const url = new URL(raw);
        return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
    } catch {
        return null;
    }
}

export function billingStatus(user: Record<string, any>, now = new Date()) {
    const dueAt = user.billing_next_payment_at ? new Date(user.billing_next_payment_at) : null;
    const isOneTime = user.billing_mode === "one_time";
    return {
        mode: user.billing_mode ?? null,
        paidAt: user.billing_paid_at ?? null,
        months: isOneTime ? (parsePrepaidMonths(user.billing_months) ?? 1) : null,
        nextPaymentAt: isOneTime && dueAt && Number.isFinite(dueAt.getTime()) ? dueAt.toISOString() : null,
        paymentDue: Boolean(isOneTime && dueAt && dueAt <= now),
        paymentUrl: renewalPaymentUrl(user.plan),
    };
}
