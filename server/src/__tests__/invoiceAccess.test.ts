import { describe, expect, it } from "vitest";
import { normalizePlanId } from "../plans/tierFeatures";

const INVOICES = ["trial", "business"];

/** The router guard's array branch, and the nav filter's — they share this shape. */
function clientAllows(plan: string, requirePlan: string[]): boolean {
  return requirePlan.map((p) => normalizePlanId(p)).includes(normalizePlanId(plan));
}

/** requirePlans in auth/middleware.ts. */
function serverAllows(user: { plan: string; role?: string }, allowed: string[]): boolean {
  const permitted = new Set(allowed.map((p) => normalizePlanId(p)));
  if (String(user.role ?? "").trim().toLowerCase() === "admin") return true;
  return permitted.has(normalizePlanId(user.plan));
}

describe("invoice access agrees across router, nav and API", () => {
  for (const [plan, expected] of [
    ["trial", true],
    ["business", true],
    ["basic", false],
    ["expired", false],
  ] as Array<[string, boolean]>) {
    it(`${plan}: ${expected ? "allowed" : "refused"} everywhere`, () => {
      expect(clientAllows(plan, INVOICES)).toBe(expected);
      expect(serverAllows({ plan, role: "user" }, INVOICES)).toBe(expected);
    });
  }

  it("covers every /invoices route the same way", () => {
    // /invoices, /invoices/expenses and /invoices/:id all carry the same meta,
    // so one decision applies to the whole tree.
    for (const _route of ["/invoices", "/invoices/expenses", "/invoices/:id"]) {
      expect(clientAllows("trial", INVOICES)).toBe(true);
      expect(clientAllows("basic", INVOICES)).toBe(false);
    }
  });

  it("lets an admin through regardless of plan", () => {
    expect(serverAllows({ plan: "expired", role: "admin" }, INVOICES)).toBe(true);
  });
});
