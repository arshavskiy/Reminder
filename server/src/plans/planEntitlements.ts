import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {DEFAULT_FEATURES_NESTED} from "../features";
import {documentImportLimit} from "../quotas/documentImportQuota";
import {reminderLimit} from "../quotas/reminderQuota";
import {
  featureFlagsForUser,
  normalizePlanId,
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
 * New signups start on a 14-day trial with basic entitlements.
 *
 * There is no free tier to sign up to any more: once the trial lapses the plan
 * still reads "trial", but featureFlagsForUser resolves it to free entitlements,
 * which leaves the account readable while stopping imports and automation.
 */
export const DEFAULT_NEW_USER_PLAN: PlanId = "trial";

/** trial_ends_at for an account created now. */
export function newTrialEndsAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

export function buildPlanEntitlements(
  user: {plan?: string | null; role?: string | null} | null | undefined,
): PlanEntitlements {
  const planKey = user?.plan ?? user?.role;
  const flags = featureFlagsForUser(user);
  const invoices = documentImportLimit(planKey, "invoices");
  const contracts = documentImportLimit(planKey, "contracts");
  const manualDocuments = documentImportLimit(planKey, "manualDocuments");
  const emailDocuments = documentImportLimit(planKey, "emailDocuments");
  const reminders = reminderLimit(planKey);
  return {
    plan: String(user?.role ?? "").trim().toLowerCase() === "admin"
      ? "business"
      : normalizePlanId(planKey),
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

/** Defaults used when creating user_settings for a brand-new account (no entitlements — those go in $set). */
export function newUserSettingsBase(
  userId: string,
  user?: {plan?: string | null; role?: string | null} | null,
): Record<string, unknown> {
  // Cloud storage is a paid feature — free accounts start with it off.
  const cloudStorage = normalizePlanId(user?.plan ?? user?.role) !== "free";
  return {
    user_id: userId,
    theme: "light",
    email_from_name: null,
    reminder_advance_days: "[90,60,30]",
    ocr_language: "heb+eng",
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
 * New accounts get free-tier entitlements until paid.
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
