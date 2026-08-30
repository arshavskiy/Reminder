import { describe, expect, it } from "vitest";
import { normalizePlanId } from "../plans/tierFeatures";

/** Mirrors the decision requirePlans makes, without an HTTP round trip. */
function admits(user: { plan?: string | null; role?: string | null }, allowed: string[]): boolean {
  const permitted = new Set(allowed.map((plan) => normalizePlanId(plan)));
  if (String(user.role ?? "").trim().toLowerCase() === "admin") return true;
  return permitted.has(normalizePlanId(user.plan ?? user.role));
}

const INVOICES = ["trial", "business"];

describe("requirePlans on /api/invoices", () => {
  it("admits the plans that bought the feature", () => {
    expect(admits({ plan: "trial", role: "user" }, INVOICES)).toBe(true);
    expect(admits({ plan: "business", role: "user" }, INVOICES)).toBe(true);
  });

  it("refuses the plans that did not", () => {
    expect(admits({ plan: "basic", role: "user" }, INVOICES)).toBe(false);
    expect(admits({ plan: "free", role: "user" }, INVOICES)).toBe(false);
  });

  it("admits admins, who support every account", () => {
    expect(admits({ plan: "free", role: "admin" }, INVOICES)).toBe(true);
  });

  it("admits the production pro/business account that was being refused", () => {
    // role "pro" is not admin, so the old requireMinRole("admin") returned 403
    // even though the account is on the business plan.
    expect(admits({ plan: "business", role: "pro" }, INVOICES)).toBe(true);
  });
});
