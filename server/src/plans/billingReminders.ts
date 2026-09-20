import {createHash} from "node:crypto";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {sendEmailWithAttachments} from "../reminders/emailSender";
import {logger} from "../logger";
import {renderTemplate} from "../templates/renderEmail";
import {nextPaymentDate} from "./billingPayment";
import {parsePrepaidMonths, signupIntentFields, type SignupIntent} from "./signupIntent";

const RETRY_MS = 60 * 60 * 1000;

interface BillingReminderUser {
    _id: ObjectId;
    email?: string | null;
    is_active?: number | boolean;
    billing_mode?: string;
    billing_next_payment_at?: Date;
    billing_months?: number | string | null;
    signup_intent_billing?: string;
    signup_intent_at?: Date;
    signup_intent_months?: number | string | null;
    created_at?: Date;
}

export function isOneTimeBillingUser(user: Record<string, any> | null | undefined): boolean {
    return user?.billing_mode === "one_time" || user?.signup_intent_billing === "one_time";
}

export function oneTimeDueAt(user: Record<string, any>, now = new Date()): Date | null {
    if (user.billing_next_payment_at) {
        const due = new Date(user.billing_next_payment_at);
        if (Number.isFinite(due.getTime())) return due;
    }
    if (user.signup_intent_billing !== "one_time") return null;
    const startRaw = user.signup_intent_at ?? user.created_at ?? now;
    const start = new Date(startRaw);
    if (!Number.isFinite(start.getTime())) return null;
    const months = parsePrepaidMonths(user.signup_intent_months ?? user.billing_months ?? 1) ?? 1;
    return nextPaymentDate(start, months);
}

export function billingReminderMessage(dueAt: Date, overdue: boolean) {
    const date = dueAt.toISOString().slice(0, 10);
    const base = (process.env.FRONTEND_URL || "https://app.remindocr.com").replace(/\/$/, "");
    const url = `${base}/profile?section=subscription`;
    if (overdue) {
        return {
            title: "תזכורת לחידוש מנוי RemindOCR / Renew your subscription",
            body: `מועד חידוש המנוי: ${date}. התקופה ששולמה מראש הסתיימה. לחידוש יש לשלם שוב; לא יתבצע חיוב אוטומטי.\nYour prepaid period ended on ${date}. Pay again to renew; you will not be charged automatically.`,
            url,
        };
    }
    return {
        title: "תזכורת לחידוש מנוי RemindOCR / Renew your subscription",
        body: `מועד חידוש המנוי: ${date}. זהו תשלום חד־פעמי — לא יתבצע חיוב אוטומטי. נזכיר שוב במועד החידוש.\nYour prepaid renewal date is ${date}. This is a one-time payment; you will not be charged automatically. We will remind you again when it is due.`,
        url,
    };
}

function notificationId(userId: string, dueAt: Date, overdue: boolean): ObjectId {
    const key = `${overdue ? "billing" : "billing-upcoming"}:${userId}:${dueAt.toISOString()}`;
    return new ObjectId(createHash("sha256").update(key).digest("hex").slice(0, 24));
}

function isInactive(user: Record<string, any>): boolean {
    return user.is_active === 0 || user.is_active === false;
}

/** Idempotent in-app delivery for every one-time user (login intent or verified billing). */
export async function ensureBillingNotification(user: Record<string, any>, now = new Date()) {
    if (isInactive(user) || !isOneTimeBillingUser(user)) return;
    const dueAt = oneTimeDueAt(user, now);
    if (!dueAt) return;
    const overdue = dueAt <= now;
    const userId = String(user._id);
    const id = notificationId(userId, dueAt, overdue);
    const message = billingReminderMessage(dueAt, overdue);
    try {
        await col("notifications").updateOne({_id: id}, {
            $setOnInsert: {
                user_id: userId,
                kind: "billing_renewal_due",
                reminder_id: null,
                title: message.title,
                body: message.body,
                created_at: now,
                read_at: null,
            }
        }, {upsert: true});
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
    }
}

async function sendBillingEmail(user: BillingReminderUser, dueAt: Date, overdue: boolean, now: Date) {
    if (!user.email) return;
    const sentField = overdue ? "billing_reminder_sent_for" : "billing_upcoming_email_sent_for";
    const claim = await col("users").updateOne({
        _id: user._id,
        [sentField]: {$ne: dueAt},
        is_active: {$nin: [0, false]},
        $or: [{billing_reminder_lease_until: null}, {billing_reminder_lease_until: {$lte: now}}],
    }, {$set: {billing_reminder_lease_until: new Date(now.getTime() + RETRY_MS)}});
    if (!claim.modifiedCount) return;
    const message = billingReminderMessage(dueAt, overdue);
    const [hebrew, english] = message.body.split("\n");
    const html = renderTemplate(
        '<div dir="rtl" style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6"><h2>חידוש מנוי RemindOCR</h2><p>{{hebrew}}</p><p dir="ltr">{{english}}</p><p><a href="{{url}}">לחידוש המנוי / Renew subscription</a></p></div>',
        {hebrew, english, url: message.url},
    );
    const result = await sendEmailWithAttachments(
        [String(user.email)], message.title, `${message.body}\n\n${message.url}`, [], html,
    );
    if (!result.success) throw new Error(result.error ?? "Billing email failed");
    await col("users").updateOne({_id: user._id}, {
        $set: {[sentField]: dueAt, billing_reminder_lease_until: null},
    });
}

/** In-app + email: upcoming once, then a due reminder when the prepaid period ends. */
export async function deliverOneTimeBillingReminders(user: Record<string, any>, now = new Date()) {
    if (isInactive(user) || !isOneTimeBillingUser(user)) return;
    const dueAt = oneTimeDueAt(user, now);
    if (!dueAt) return;
    await ensureBillingNotification(user, now);
    try {
        await sendBillingEmail(user as BillingReminderUser, dueAt, dueAt <= now, now);
    } catch (error) {
        logger.warn("billing_reminder_failed", {user_id: String(user._id), error: String(error)});
    }
}

/** Persist `?billing=one_time` on the user, then send the in-app + email reminder. */
export async function rememberOneTimeIntentAndRemind(
    user: Record<string, any>,
    intent: SignupIntent | null,
    now = new Date(),
) {
    const fields = intent?.billing === "one_time" ? signupIntentFields(intent, now) : {};
    if (Object.keys(fields).length) {
        await col("users").updateOne({_id: user._id}, {$set: fields});
        Object.assign(user, fields);
    }
    await deliverOneTimeBillingReminders(user, now);
}

/** One email per unpaid period. Atomic leases prevent concurrent ticks sending twice. */
export async function checkBillingReminders(now = new Date()) {
    const users = await col<BillingReminderUser>("users").find({
        is_active: {$nin: [0, false]},
        $or: [{billing_mode: "one_time"}, {signup_intent_billing: "one_time"}],
    }).toArray();
    for (const user of users) {
        try {
            await deliverOneTimeBillingReminders(user, now);
        } catch (error) {
            logger.warn("billing_reminder_failed", {user_id: String(user._id), error: String(error)});
        }
    }
}
