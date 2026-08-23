import {col} from "../db/db";

export const REMINDER_QUOTA_ERROR = "reminder_limit_reached";

export type ReminderQuota = {
    scope: "monthly" | "lifetime" | "unlimited";
    limit: number | null;
    used: number;
    remaining: number | null;
};

export class ReminderQuotaError extends Error {
    quota: ReminderQuota;

    constructor(quota: ReminderQuota) {
        super(REMINDER_QUOTA_ERROR);
        this.name = "ReminderQuotaError";
        this.quota = quota;
    }
}

export function reminderLimit(role: string | null | undefined): {
    limit: number | null;
    scope: ReminderQuota["scope"]
} {
    const plan = normalizePlan(role);
    if (plan === "business" || plan === "basic") return {limit: null, scope: "unlimited"};
    return {
        limit: readPositiveIntEnv("FREE_LIFETIME_REMINDER_LIMIT", readPositiveIntEnv("USER_REMINDER_LIMIT", 25)),
        scope: "lifetime",
    };
}

export async function getReminderQuota(userId: string, role: string | null | undefined): Promise<ReminderQuota> {
    const {limit, scope} = reminderLimit(role);
    const used = limit === null
        ? 0
        : await col("reminders").countDocuments({user_id: userId} as any);

    return {
        scope: limit === null ? "unlimited" : scope,
        limit,
        used,
        remaining: limit === null ? null : Math.max(limit - used, 0),
    };
}

export async function assertReminderQuota(
    userId: string,
    role: string | null | undefined,
    requested = 1,
): Promise<ReminderQuota> {
    const quota = await getReminderQuota(userId, role);
    if (quota.limit !== null && quota.used + requested > quota.limit) {
        throw new ReminderQuotaError(quota);
    }
    return quota;
}

export async function insertReminderIfAllowed(
    userId: string | undefined,
    doc: Record<string, unknown>,
): Promise<boolean> {
    if (!userId) {
        await col("reminders").insertOne(doc as any);
        return true;
    }

    const role = await resolveUserPlan(userId);
    try {
        await assertReminderQuota(userId, role, 1);
    } catch (err) {
        if (err instanceof ReminderQuotaError) return false;
        throw err;
    }

    await col("reminders").insertOne(doc as any);
    return true;
}

async function resolveUserPlan(userId: string): Promise<string> {
    const {ObjectId} = await import("mongodb");
    let filter: Record<string, unknown> = {_id: userId};
    if (ObjectId.isValid(userId)) filter = {_id: new ObjectId(userId)};
    const user = await col("users").findOne(filter as any) as { plan?: string; role?: string } | null;
    return user?.plan ?? user?.role ?? "user";
}

export function reminderQuotaErrorPayload(error: ReminderQuotaError) {
    return {
        error: REMINDER_QUOTA_ERROR,
        scope: error.quota.scope,
        limit: error.quota.limit,
        used: error.quota.used,
        remaining: error.quota.remaining,
    };
}

function normalizePlan(role: string | null | undefined): "free" | "basic" | "business" {
    const value = String(role ?? "").trim().toLowerCase();
    if (value === "admin" || value === "business") return "business";
    if (value === "pro" || value === "basic") return "basic";
    return "free";
}

function readPositiveIntEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
}
