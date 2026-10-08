import {effectivePlanId} from "./tierFeatures";

/**
 * Digital is the family tier: it shows only the dashboard, reminders, invoices and reminder
 * discovery (plus the profile page for account settings). Every other page and dashboard widget
 * is switched off for it, whatever the per-user toggles say. Inside the allowed set the user's own
 * toggles still apply, and discovery, which is off by default elsewhere, defaults to on.
 */
export const FAMILY_ALLOWED_FEATURES: ReadonlySet<string> = new Set([
  "pages.dashboard",
  "pages.reminders",
  "pages.invoices",
  "pages.discovery",
  "pages.profile",
  "pages.documents",
  "pages.gmail",
  "dashboard.stat_pending_reminders",
  "dashboard.calendar",
  "dashboard.upcoming_reminders",
]);

/** Core to the tier, so on regardless of the seeded per-user default (discovery is off by default elsewhere). */
const FAMILY_ALWAYS_ON: ReadonlySet<string> = new Set(["pages.discovery", "pages.dashboard", "pages.reminders", "pages.invoices", "pages.profile"]);

export function isFamilyPlan(user: Parameters<typeof effectivePlanId>[0]): boolean {
  return effectivePlanId(user) === "digital";
}

/** The flat feature map a family account actually gets, given the toggles it has stored. */
export function applyFamilyFeatureOverlay(
  stored: Record<string, boolean> | null | undefined,
  allKeys: readonly string[],
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const key of allKeys) {
    if (!FAMILY_ALLOWED_FEATURES.has(key)) {
      result[key] = false;
      continue;
    }
    result[key] = FAMILY_ALWAYS_ON.has(key) ? true : stored?.[key] ?? true;
  }
  return result;
}

/** Overlay for any plan: a no-op except on the family tier. */
export function applyPlanFeatureOverlay(
  user: Parameters<typeof effectivePlanId>[0],
  stored: Record<string, boolean> | null | undefined,
  allKeys: readonly string[],
): Record<string, boolean> | null {
  return isFamilyPlan(user) ? applyFamilyFeatureOverlay(stored, allKeys) : stored ?? null;
}
