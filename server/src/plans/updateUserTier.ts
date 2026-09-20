import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {ensureUserSettingsWithEntitlements, type PlanEntitlements} from "./planEntitlements";
import type {PlanId} from "./tierFeatures";
import {nextPaymentDate, type ConfirmedPayment} from "./billingPayment";

/**
 * Plans an admin or a payment can actually assign. "expired" is absent on
 * purpose: it is the resolved state of a lapsed trial, not something to put an
 * account into — downgrading someone means moving them to a real plan or
 * letting their trial run out.
 */
export const VALID_PLAN_IDS: PlanId[] = ["digital", "basic", "business"];

export type TierUpdateResult = {
  user: {
    id: string;
    email: string | null;
    role: string | null;
    plan: PlanId;
  };
  entitlements: PlanEntitlements;
};

export function parsePlanId(value: unknown): PlanId | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "digital" || raw === "basic" || raw === "business") return raw;
  return null;
}

export async function updateUserTier(
  selector: {userId?: string | null; email?: string | null},
  plan: PlanId,
  metadata: Record<string, unknown> = {},
  payment: ConfirmedPayment | null = null,
): Promise<TierUpdateResult | null> {
  const filter = userFilter(selector);
  if (!filter) return null;

  const now = new Date();
    // Keep payment and entitlement changes in one atomic write. Replays and
    // out-of-order callbacks must not reset the renewal date or downgrade a plan.
    const paymentKey = payment ? JSON.stringify([metadata.provider ?? "morning", payment.paymentId]) : null;
    const paymentFilter = payment ? {
        billing_payment_ids: {$ne: paymentKey},
        $or: [{billing_paid_at: null}, {billing_paid_at: {$lt: payment.paidAt}}],
    } : {};
  await col("users").updateOne(
      {...filter, ...paymentFilter} as any,
    {
      $set: {
        plan,
        updated_at: now,
        subscription_updated_at: now,
          ...(payment ? {
              billing_mode: payment.billing,
              billing_paid_at: payment.paidAt,
              billing_months: payment.billing === "one_time" ? (payment.months ?? 1) : null,
              billing_next_payment_at: payment.billing === "one_time" ? nextPaymentDate(payment.paidAt, payment.months) : null,
              billing_reminder_sent_for: null,
              billing_reminder_lease_until: null,
          } : {}),
        ...(Object.keys(metadata).length ? {subscription_update_metadata: metadata} : {}),
      },
        ...(payment ? {$addToSet: {billing_payment_ids: paymentKey}} : {}),
    },
  );

  const user = await col("users").findOne(filter as any) as any;
  if (!user) return null;

  const entitlements = await ensureUserSettingsWithEntitlements(String(user._id), user);
  return {
    user: {
      id: String(user._id),
      email: user.email ?? null,
      role: user.role ?? null,
        plan: user.plan,
    },
    entitlements,
  };
}

function userFilter(selector: {userId?: string | null; email?: string | null}): Record<string, unknown> | null {
  const userId = String(selector.userId ?? "").trim();
  if (userId) {
    if (!ObjectId.isValid(userId)) return null;
    return {_id: new ObjectId(userId)};
  }

  const email = String(selector.email ?? "").trim().toLowerCase();
  if (email) return {email};
  return null;
}
