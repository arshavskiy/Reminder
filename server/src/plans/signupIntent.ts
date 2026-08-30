/**
 * What plan a signup said it wanted, recorded but never granted.
 *
 * This is a marketing attribution field, not an entitlement. It arrives from a
 * query string the user can edit, so nothing here may influence what the account
 * is allowed to do — the plan itself only ever changes through updateUserTier,
 * behind the payment secret. Keeping the two apart is the whole point: without
 * it, "?plan=business" in a URL would be a free upgrade.
 *
 * It exists so that when a trial ends, or a payment lands with an email that
 * does not match the account, there is a record of which plan the person was
 * actually trying to buy.
 */
import type {PlanId} from "./tierFeatures";

/** Plans a signup can express interest in. Trial is the default, not a choice. */
const PURCHASABLE_PLANS = new Set<PlanId>(["basic", "business"]);

export type BillingPeriod = "monthly" | "yearly";

export interface SignupIntent {
  plan: PlanId;
  billing: BillingPeriod;
}

/**
 * Reads an intent off untrusted input, returning null unless both halves are
 * recognised. A half-valid intent is treated as no intent rather than being
 * completed with defaults, so a mangled link cannot silently record the wrong
 * plan against a user.
 */
export function parseSignupIntent(
  plan: unknown,
  billing: unknown,
): SignupIntent | null {
  const planValue = String(plan ?? "").trim().toLowerCase() as PlanId;
  const billingValue = String(billing ?? "").trim().toLowerCase();
  if (!PURCHASABLE_PLANS.has(planValue)) return null;
  if (billingValue !== "monthly" && billingValue !== "yearly") return null;
  return {plan: planValue, billing: billingValue};
}

/** The fields to persist on a user document, or nothing when there is no intent. */
export function signupIntentFields(
  intent: SignupIntent | null,
  now: Date = new Date(),
): Record<string, unknown> {
  if (!intent) return {};
  return {
    signup_intent_plan: intent.plan,
    signup_intent_billing: intent.billing,
    signup_intent_at: now,
  };
}
