import {ObjectId} from "mongodb";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => {
  const users = new Map<string, any>();
  const settings = new Map<string, any>();

  function matches(doc: any, filter: Record<string, any>) {
      if (filter.billing_payment_ids && doc.billing_payment_ids?.includes(filter.billing_payment_ids.$ne)) return false;
      if (filter.$or && doc.billing_paid_at && !(doc.billing_paid_at < filter.$or[1].billing_paid_at.$lt)) return false;
    if (filter._id) return String(doc._id) === String(filter._id);
    if (filter.email) return String(doc.email).toLowerCase() === String(filter.email).toLowerCase();
    if (filter.user_id) return String(doc.user_id) === String(filter.user_id);
    return false;
  }

  const usersCollection = {
    findOne: vi.fn(async (filter: Record<string, any>) => {
      for (const user of users.values()) {
        if (matches(user, filter)) return user;
      }
      return null;
    }),
    updateOne: vi.fn(async (filter: Record<string, any>, update: any) => {
      for (const [key, user] of users.entries()) {
        if (matches(user, filter)) {
            users.set(key, {
                ...user, ...(update.$set ?? {}), ...(update.$addToSet ? {
                    billing_payment_ids: [...(user.billing_payment_ids ?? []), update.$addToSet.billing_payment_ids],
                } : {})
            });
          return {matchedCount: 1, modifiedCount: 1};
        }
      }
      return {matchedCount: 0, modifiedCount: 0};
    }),
  };

  const settingsCollection = {
    updateOne: vi.fn(async (filter: Record<string, any>, update: any) => {
      const key = String(filter.user_id);
      const existing = settings.get(key) ?? {};
      settings.set(key, {
        ...(update.$setOnInsert ?? {}),
        ...existing,
        ...(update.$set ?? {}),
      });
      return {matchedCount: existing.user_id ? 1 : 0, modifiedCount: 1, upsertedCount: existing.user_id ? 0 : 1};
    }),
  };

  return {
    users,
    settings,
    usersCollection,
    settingsCollection,
    col: vi.fn((name: string) => {
      if (name === "users") return usersCollection;
      if (name === "user_settings") return settingsCollection;
      throw new Error(`unexpected collection ${name}`);
    }),
  };
});

vi.mock("../db/db", () => ({
  col: mocks.col,
}));

describe("updateUserTier", () => {
  beforeEach(() => {
    mocks.users.clear();
    mocks.settings.clear();
    vi.clearAllMocks();
  });

  it("validates supported plan ids exactly", async () => {
    const {parsePlanId} = await import("../plans/updateUserTier");
    // "free"/"expired" are not assignable: expired is what a lapsed trial
    // resolves to, never something an admin or a payment sets.
    expect(parsePlanId("free")).toBeNull();
    expect(parsePlanId("expired")).toBeNull();
    expect(parsePlanId("digital")).toBe("digital");
    expect(parsePlanId(" BASIC ")).toBe("basic");
    expect(parsePlanId("business")).toBe("business");
    expect(parsePlanId("pro")).toBeNull();
    expect(parsePlanId("")).toBeNull();
  });

  it("updates a user tier and refreshes plan entitlements", async () => {
    const userId = new ObjectId();
    mocks.users.set(String(userId), {
      _id: userId,
      email: "buyer@example.com",
      role: "user",
      plan: "trial",
    });

    const {updateUserTier} = await import("../plans/updateUserTier");
    const result = await updateUserTier(
      {email: "BUYER@example.com"},
      "business",
      {source: "payment", payment_id: "pay_123"},
    );

    expect(result?.user).toMatchObject({
      id: String(userId),
      email: "buyer@example.com",
      role: "user",
      plan: "business",
    });
    expect(mocks.users.get(String(userId)).plan).toBe("business");
    expect(mocks.users.get(String(userId)).subscription_update_metadata).toEqual({
      source: "payment",
      payment_id: "pay_123",
    });
    expect(mocks.settings.get(String(userId)).plan_entitlements).toMatchObject({
      plan: "business",
      documents: {
        scope: "unlimited",
        invoices: null,
        contracts: null,
        manualDocuments: null,
        emailDocuments: null,
      },
      gmailInspectionHistoryMonths: 24,
      gmailInvoiceHistoryMonths: 36,
      googleCalendarSync: true,
    });
  });

  it("returns null for invalid selectors and missing users", async () => {
    const {updateUserTier} = await import("../plans/updateUserTier");
    await expect(updateUserTier({userId: "not-an-object-id"}, "basic")).resolves.toBeNull();
    await expect(updateUserTier({email: "missing@example.com"}, "basic")).resolves.toBeNull();
    expect(mocks.settingsCollection.updateOne).not.toHaveBeenCalled();
  });

    it("uses only verified quantity for prepaid periods and ignores changed-quantity replays", async () => {
        const userId = new ObjectId();
        mocks.users.set(String(userId), {
            _id: userId,
            email: "buyer@example.com",
            plan: "trial",
            signup_intent_months: 1
        });
        const {updateUserTier} = await import("../plans/updateUserTier");
        const payment = {
            billing: "one_time" as const,
            paymentId: "twelve-months",
            paidAt: new Date("2026-09-20T09:00:00Z"),
            months: 12
        };
        await updateUserTier({userId: String(userId)}, "basic", {}, payment);
        await updateUserTier({userId: String(userId)}, "basic", {}, {...payment, months: 1});
        expect(mocks.users.get(String(userId)).billing_months).toBe(12);
        expect(mocks.users.get(String(userId)).billing_next_payment_at).toEqual(new Date("2027-09-20T09:00:00Z"));
        await updateUserTier({userId: String(userId)}, "basic", {}, {
            ...payment,
            paymentId: "three-months",
            paidAt: new Date("2027-09-20T09:00:00Z"),
            months: 3
        });
        expect(mocks.users.get(String(userId)).billing_months).toBe(3);
        expect(mocks.users.get(String(userId)).billing_next_payment_at).toEqual(new Date("2027-12-20T09:00:00Z"));
    });

    it("renews only for a new verified payment, ignoring duplicate and older callbacks", async () => {
        const userId = new ObjectId();
        mocks.users.set(String(userId), {_id: userId, email: "buyer@example.com", plan: "trial"});
        const {updateUserTier} = await import("../plans/updateUserTier");
        const payment = {billing: "one_time" as const, paymentId: "p1", paidAt: new Date("2026-01-31T09:00:00Z")};
        await updateUserTier({userId: String(userId)}, "basic", {}, payment);
        expect(mocks.users.get(String(userId)).billing_next_payment_at).toEqual(new Date("2026-02-28T09:00:00Z"));
        await updateUserTier({userId: String(userId)}, "business", {}, {
            ...payment,
            paymentId: "p2",
            paidAt: new Date("2026-02-28T09:00:00Z")
        });
        await updateUserTier({userId: String(userId)}, "basic", {}, payment);
        await updateUserTier({userId: String(userId)}, "basic", {}, {...payment, paymentId: "older"});
        const user = mocks.users.get(String(userId));
        expect(user.plan).toBe("business");
        expect(user.billing_next_payment_at).toEqual(new Date("2026-03-28T09:00:00Z"));
        expect(user.billing_payment_ids).toHaveLength(2);
        await updateUserTier({userId: String(userId)}, "business", {}, {
            billing: "yearly", paymentId: "p3", paidAt: new Date("2026-03-28T09:00:00Z"),
        });
        expect(mocks.users.get(String(userId)).billing_next_payment_at).toBeNull();
    });
});
