import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {ensureUserSettingsWithEntitlements, type PlanEntitlements} from "./planEntitlements";
import type {PlanId} from "./tierFeatures";

export const VALID_PLAN_IDS: PlanId[] = ["free", "digital", "basic", "business"];

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
  if (raw === "free" || raw === "digital" || raw === "basic" || raw === "business") return raw;
  return null;
}

export async function updateUserTier(
  selector: {userId?: string | null; email?: string | null},
  plan: PlanId,
  metadata: Record<string, unknown> = {},
): Promise<TierUpdateResult | null> {
  const filter = userFilter(selector);
  if (!filter) return null;

  const now = new Date();
  await col("users").updateOne(
    filter as any,
    {
      $set: {
        plan,
        updated_at: now,
        subscription_updated_at: now,
        ...(Object.keys(metadata).length ? {subscription_update_metadata: metadata} : {}),
      },
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
      plan,
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
