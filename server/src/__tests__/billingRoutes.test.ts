import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({updateUserTier: vi.fn(), requireAuth: vi.fn(), findOne: vi.fn()}));
vi.mock("../plans/updateUserTier", () => ({
    parsePlanId: (plan: string) => ["digital", "basic", "business"].includes(plan) ? plan : null,
    VALID_PLAN_IDS: ["digital", "basic", "business"], updateUserTier: mocks.updateUserTier,
}));
vi.mock("../auth/middleware", () => ({requireAuth: mocks.requireAuth}));
vi.mock("../db/db", () => ({col: () => ({findOne: mocks.findOne})}));
vi.mock("../logger", () => ({logger: {info: vi.fn()}}));
import {registerBillingRoutes} from "../routes/billing";

describe("billing endpoints", () => {
    let handlers: Record<string, any>;
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("PAYMENT_TIER_UPDATE_SECRET", "test-secret");
        handlers = {};
        registerBillingRoutes({
            get: (path: string, handler: any) => {
                handlers[`GET ${path}`] = handler;
            },
            post: (path: string, handler: any) => {
                handlers[`POST ${path}`] = handler;
            },
        } as any);
    });
    afterEach(() => vi.unstubAllEnvs());

    async function call(method: string, path: string, body = {}, secret = "") {
        const res = {status: vi.fn().mockReturnThis(), json: vi.fn()};
        await handlers[`${method} ${path}`]({
            body,
            headers: {},
            get: (key: string) => key === "x-payment-tier-secret" ? secret : ""
        }, res);
        return res;
    }

    it("rejects browser-supplied billing fields without the payment secret", async () => {
        const res = await call("POST", "/api/billing/tier", {plan: "basic", billing: "one_time"});
        expect(res.status).toHaveBeenCalledWith(401);
        expect(mocks.updateUserTier).not.toHaveBeenCalled();
    });
    it("rejects a purported payment without receipt details", async () => {
        const res = await call("POST", "/api/billing/tier", {plan: "basic", billing: "one_time"}, "test-secret");
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mocks.updateUserTier).not.toHaveBeenCalled();
    });
    it("passes verified payment details through and reports missing accounts for retry", async () => {
        mocks.updateUserTier.mockResolvedValue(null);
        const res = await call("POST", "/api/billing/tier", {
            email: "buyer@example.com",
            plan: "basic",
            billing: "one_time",
            paymentId: "receipt-1",
            paidAt: "2026-01-01T09:00:00Z",
        }, "test-secret");
        expect(mocks.updateUserTier.mock.calls[0][3]).toEqual({
            billing: "one_time", paymentId: "receipt-1", paidAt: new Date("2026-01-01T09:00:00Z"), months: 1,
        });
        expect(res.status).toHaveBeenCalledWith(404);
    });
    it("requires sign-in for billing status", async () => {
        mocks.requireAuth.mockRejectedValue({status: 401, message: "Unauthorized"});
        const res = await call("GET", "/api/billing/status");
        expect(res.status).toHaveBeenCalledWith(401);
        expect(mocks.findOne).not.toHaveBeenCalled();
    });

    it("accepts verified quantity and rejects quantities outside 1–12", async () => {
        const payment = {
            email: "buyer@example.com",
            plan: "basic",
            billing: "one_time",
            paymentId: "p12",
            paidAt: "2026-01-01T09:00:00Z",
            months: 12
        };
        mocks.updateUserTier.mockResolvedValue({user: {id: "u1"}});
        const res = await call("POST", "/api/billing/tier", payment, "test-secret");
        expect(res.json).toHaveBeenCalledWith({ok: true, user: {id: "u1"}});
        expect(mocks.updateUserTier.mock.calls[0][3].months).toBe(12);
        const invalid = await call("POST", "/api/billing/tier", {...payment, months: 13}, "test-secret");
        expect(invalid.status).toHaveBeenCalledWith(400);
        expect(mocks.updateUserTier).toHaveBeenCalledTimes(1);
    });
    it("scopes status to the effective account and returns no payment IDs", async () => {
        mocks.requireAuth.mockResolvedValue({userId: "507f1f77bcf86cd799439011"});
        mocks.findOne.mockResolvedValue({
            plan: "basic",
            billing_mode: "one_time",
            billing_next_payment_at: new Date("2026-01-01"),
            billing_payment_ids: ["secret-receipt"]
        });
        const res = await call("GET", "/api/billing/status");
        expect(String(mocks.findOne.mock.calls[0][0]._id)).toBe("507f1f77bcf86cd799439011");
        expect(res.json.mock.calls[0][0]).toMatchObject({mode: "one_time", paymentDue: true});
        expect(res.json.mock.calls[0][0]).not.toHaveProperty("billing_payment_ids");
    });
});
