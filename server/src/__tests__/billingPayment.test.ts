import {afterEach, describe, expect, it, vi} from "vitest";
import {billingStatus, nextPaymentDate, parseConfirmedPayment, renewalPaymentUrl} from "../plans/billingPayment";
import {parseSignupIntent, signupIntentFields} from "../plans/signupIntent";
import {parseIntent} from "../../../client/src/shared/signupIntent";

afterEach(() => vi.unstubAllEnvs());

describe("one-time monthly billing", () => {
    it("accepts the return link in both clients without granting a plan or recording payment", () => {
        const intent = parseSignupIntent("basic", "one_time");
        expect(intent).toEqual({plan: "basic", billing: "one_time", months: 1});
        expect(parseIntent("basic", "one_time")).toEqual(intent);
        expect(signupIntentFields(intent, new Date("2026-09-20"))).toEqual({
            signup_intent_plan: "basic",
            signup_intent_billing: "one_time",
            signup_intent_months: 1,
            signup_intent_at: new Date("2026-09-20"),
        });
        expect(billingStatus(signupIntentFields(intent)).paymentDue).toBe(false);
        for (const billing of ["monthly", "yearly"]) {
            expect(parseSignupIntent("business", billing)).toEqual(parseIntent("business", billing));
        }
        expect(parseSignupIntent("admin", "one_time")).toBeNull();
        expect(parseSignupIntent("basic", "unknown")).toBeNull();
    });

    it.each([
        ["2026-01-31T09:15:00Z", "2026-02-28T09:15:00.000Z"],
        ["2028-01-31T09:15:00Z", "2028-02-29T09:15:00.000Z"],
        ["2026-12-20T09:15:00Z", "2027-01-20T09:15:00.000Z"],
        ["2026-08-31T09:15:00Z", "2026-09-30T09:15:00.000Z"],
    ])("calculates a calendar month from %s", (input, expected) => {
        expect(nextPaymentDate(new Date(input)).toISOString()).toBe(expected);
    });

    it("requires a receipt ID and real payment timestamp, not a browser callback", () => {
        const now = new Date("2026-09-20T12:00:00Z");
        const valid = {billing: "one_time", paymentId: "receipt-1", paidAt: "2026-09-20T09:00:00Z"};
        expect(parseConfirmedPayment(valid, now)?.paidAt).toEqual(new Date(valid.paidAt));
        expect(parseConfirmedPayment({plan: "basic"})).toBeNull();
        for (const invalid of [
            {...valid, paymentId: ""}, {...valid, paidAt: undefined}, {...valid, paidAt: "invalid"},
            {...valid, paidAt: "2026-09-21T09:00:00Z"}, {...valid, billing: "other"},
        ]) expect(() => parseConfirmedPayment(invalid, now)).toThrow();
    });

    it("shows a due reminder only for a verified one-time payment", () => {
        const user = {billing_mode: "one_time", billing_next_payment_at: new Date("2026-10-20T09:00:00Z")};
        expect(billingStatus(user, new Date("2026-10-20T08:59:59Z")).paymentDue).toBe(false);
        expect(billingStatus(user, new Date("2026-10-20T09:00:00Z")).paymentDue).toBe(true);
        expect(billingStatus({...user, billing_mode: "yearly"}).nextPaymentAt).toBeNull();
        expect(billingStatus({...user, billing_next_payment_at: "bad"}).paymentDue).toBe(false);
    });

    it("only exposes configured HTTPS payment links", () => {
        vi.stubEnv("PAYMENT_LINK_BASIC_ONE_TIME", "https://example.com/pay/basic");
        expect(renewalPaymentUrl("basic")).toBe("https://example.com/pay/basic");
        expect(renewalPaymentUrl("admin")).toBeNull();
        vi.stubEnv("PAYMENT_LINK_BASIC_ONE_TIME", "javascript:alert(1)");
        expect(renewalPaymentUrl("basic")).toBeNull();
        vi.stubEnv("PAYMENT_LINK_BASIC_ONE_TIME", "");
        expect(renewalPaymentUrl("basic")).toBe("https://mrng.to/5vjboMGOmm");
        vi.stubEnv("PAYMENT_LINK_BUSINESS_ONE_TIME", "");
        expect(renewalPaymentUrl("business")).toBe("https://mrng.to/qE6K86XDbW");
        vi.stubEnv("PAYMENT_LINK_DIGITAL_ONE_TIME", "");
        expect(renewalPaymentUrl("digital")).toBe("https://mrng.to/SUPCi1tsrC");
    });

    it.each([1, 3, 6, 12])("carries %i prepaid months without trusting them as payment", (months) => {
        const intent = parseSignupIntent("basic", "one_time", String(months));
        expect(intent).toEqual({plan: "basic", billing: "one_time", months});
        expect(parseIntent("basic", "one_time", String(months))).toEqual(intent);
        const fields = signupIntentFields(intent);
        expect(fields.signup_intent_months).toBe(months);
        expect(billingStatus(fields).nextPaymentAt).toBeNull();
        expect(fields).not.toHaveProperty("billing_months");
        const payment = parseConfirmedPayment({
            billing: "one_time",
            paymentId: "p1",
            paidAt: "2026-01-01T09:00:00Z",
            months
        });
        expect(payment?.months).toBe(months);
    });

    it.each([null, "", 0, 13, -1, 1.5, "1.5", "1e1", true, [12], {}])("rejects invalid month quantity %j", (months) => {
        expect(parseSignupIntent("basic", "one_time", months)).toBeNull();
        expect(parseIntent("basic", "one_time", months)).toBeNull();
        expect(() => parseConfirmedPayment({
            billing: "one_time",
            paymentId: "p1",
            paidAt: "2026-01-01T09:00:00Z",
            months
        })).toThrow("invalid_prepaid_months");
    });

    it("calculates prepaid periods directly from the purchase date without monthly clamping drift", () => {
        expect(nextPaymentDate(new Date("2026-01-31T09:00:00Z"), 3).toISOString()).toBe("2026-04-30T09:00:00.000Z");
        expect(nextPaymentDate(new Date("2026-01-31T09:00:00Z"), 2).toISOString()).toBe("2026-03-31T09:00:00.000Z");
        expect(nextPaymentDate(new Date("2028-02-29T09:00:00Z"), 12).toISOString()).toBe("2029-02-28T09:00:00.000Z");
        expect(nextPaymentDate(new Date("2026-09-20T09:00:00Z"), 12).toISOString()).toBe("2027-09-20T09:00:00.000Z");
        expect(() => nextPaymentDate(new Date(), 13)).toThrow();
    });
});
