import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {DEFAULT_FEATURES_NESTED} from "../features";
import {documentImportLimit} from "../quotas/documentImportQuota";
import {reminderLimit} from "../quotas/reminderQuota";
import {
    effectivePlanId,
  featureFlagsForUser,
  normalizePlanId,
  tierFeatureFlags,
  TRIAL_DAYS,
  type PlanId,
  type TierFeatureFlags,
} from "./tierFeatures";

export interface PlanEntitlements extends TierFeatureFlags {
  plan: PlanId;
  ocr: true;
  previewAndExtraction: true;
  documents: {
    scope: "monthly" | "lifetime" | "unlimited";
    invoices: number | null;
    contracts: number | null;
    manualDocuments: number | null;
    emailDocuments: number | null;
  };
  reminders: {
    scope: "monthly" | "lifetime" | "unlimited";
    limit: number | null;
  };
}

/**
 * New signups start on a 30-day trial with basic entitlements.
 *
 * There is no free tier: once the trial lapses the plan still reads "trial",
 * but featureFlagsForUser resolves it to the "expired" entitlements, which
 * leave the account readable while stopping imports and automation.
 */
export const DEFAULT_NEW_USER_PLAN: PlanId = "trial";

/** trial_ends_at for an account created now. */
export function newTrialEndsAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Starts the trial window on first login rather than at registration, so time
 * spent before a user verifies their email or clicks their magic link isn't
 * burned off the 30 days. Call on every successful login; a no-op once
 * trial_ends_at is already set.
 */
export async function ensureTrialStartedOnLogin(user: {
  _id: ObjectId;
  plan?: string | null;
  trial_ends_at?: Date | string | null;
}): Promise<void> {
  if (user.plan !== DEFAULT_NEW_USER_PLAN || user.trial_ends_at) return;
  await col("users").updateOne(
    { _id: user._id, trial_ends_at: null },
    { $set: { trial_ends_at: newTrialEndsAt() } },
  );
}

export function buildPlanEntitlements(
    user: { plan?: string | null; role?: string | null; trial_ends_at?: Date | string | null } | null | undefined,
): PlanEntitlements {
    const planKey = effectivePlanId(user);
  const flags = featureFlagsForUser(user);
  const invoices = documentImportLimit(planKey, "invoices");
  const contracts = documentImportLimit(planKey, "contracts");
  const manualDocuments = documentImportLimit(planKey, "manualDocuments");
  const emailDocuments = documentImportLimit(planKey, "emailDocuments");
  const reminders = reminderLimit(planKey);
  return {
      plan: planKey,
    ocr: true,
    previewAndExtraction: true,
    ...flags,
    documents: {
      scope: invoices.scope,
      invoices: invoices.limit,
      contracts: contracts.limit,
      manualDocuments: manualDocuments.limit,
      emailDocuments: emailDocuments.limit,
    },
    reminders: {
      scope: reminders.scope,
      limit: reminders.limit,
    },
  };
}

export function freePlanEntitlements(): PlanEntitlements {
  return buildPlanEntitlements({plan: DEFAULT_NEW_USER_PLAN, role: "user"});
}

/**
 * Reminder email template new accounts start on ("ברירת מחדל", seeded from
 * email-templates/reminders/default.html). Pinned explicitly so a new account's
 * default does not depend on which row happens to carry the is_default flag.
 */
export const DEFAULT_EMAIL_TEMPLATE_ID = "6a11a1ec0c05f49738b08bfc";

/** Defaults used when creating user_settings for a brand-new account (no entitlements — those go in $set). */
export function newUserSettingsBase(
  userId: string,
  user?: {plan?: string | null; role?: string | null} | null,
): Record<string, unknown> {
  // Cloud storage is a paid feature — a lapsed trial starts with it off, and the
  // digital plan has no file storage at all (tierFeatureFlags.fileStorage).
  const planKey = user?.plan ?? user?.role;
  const cloudStorage = normalizePlanId(planKey) !== "expired" && tierFeatureFlags(planKey).fileStorage;
  return {
    user_id: userId,
    theme: "light",
    email_from_name: null,
    reminder_advance_days: "[30]",
    ocr_language: "heb+eng",
    default_email_template_id: DEFAULT_EMAIL_TEMPLATE_ID,
    features: DEFAULT_FEATURES_NESTED,
    calendar_next_tests_only: false,
    monthly_report_enabled: false,
    monthly_report_recipients: "",
    monthly_report_day: 1,
    monthly_report_hour: 8,
    monthly_report_formats: JSON.stringify(["docx", "xlsx"]),
    monthly_report_last_sent: null,
    s3_store_invoices: cloudStorage,
    s3_store_inspection_reports: cloudStorage,
  };
}

export function newUserSettingsDefaults(
  userId: string,
  user: {plan?: string | null; role?: string | null} | null | undefined = {plan: DEFAULT_NEW_USER_PLAN, role: "user"},
): Record<string, unknown> {
  return {
    ...newUserSettingsBase(userId, user),
    plan_entitlements: buildPlanEntitlements(user ?? {plan: DEFAULT_NEW_USER_PLAN, role: "user"}),
    plan_entitlements_updated_at: new Date(),
  };
}

/**
 * Ensure user_settings exists and plan_entitlements matches the user's plan.
 * New accounts get trial entitlements until paid.
 */
export async function ensureUserSettingsWithEntitlements(
  userId: string,
  user?: {plan?: string | null; role?: string | null} | null,
): Promise<PlanEntitlements> {
  let resolved = user ?? null;
  if (!resolved) {
    try {
      resolved = await col("users").findOne({_id: new ObjectId(userId)}) as any;
    } catch {
      resolved = null;
    }
  }
  const plan_entitlements = buildPlanEntitlements(
    resolved ?? {plan: DEFAULT_NEW_USER_PLAN, role: "user"},
  );
  const now = new Date();
  await col("user_settings").updateOne(
    {user_id: userId},
    {
      $set: {
        plan_entitlements,
        plan_entitlements_updated_at: now,
      },
      $setOnInsert: newUserSettingsBase(userId, resolved),
    },
    {upsert: true},
  );
  return plan_entitlements;
}

export async function persistPlanEntitlements(userId: string): Promise<PlanEntitlements> {
  return ensureUserSettingsWithEntitlements(userId);
}
