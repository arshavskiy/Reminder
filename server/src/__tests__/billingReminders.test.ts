import {ObjectId} from "mongodb";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => {
    const users: any[] = [];
    const notifications = new Map<string, any>();
    const compare = (a: any, b: any) => a instanceof Date || b instanceof Date ? Number(a) === Number(b) : String(a) === String(b);

    function matches(doc: any, filter: any): boolean {
        return Object.entries(filter).every(([key, value]: [string, any]) => {
            if (key === "$or") return value.some((part: any) => matches(doc, part));
            if (value === null) return doc[key] == null;
            if (value && typeof value === "object" && !(value instanceof Date) && !value.toHexString) {
                if ("$ne" in value) return !compare(doc[key], value.$ne);
                if ("$lte" in value) return doc[key] != null && doc[key] <= value.$lte;
                if ("$nin" in value) return !value.$nin.includes(doc[key]);
            }
            return compare(doc[key], value);
        });
    }

    return {
        users, notifications,
        send: vi.fn(),
        col: vi.fn((name: string) => {
            if (name === "notifications") return {
                updateOne: vi.fn(async (filter: any, update: any) => {
                    const id = String(filter._id);
                    if (!notifications.has(id)) notifications.set(id, update.$setOnInsert);
                }),
            };
            if (name === "users") return {
                find: (filter: any) => ({toArray: async () => users.filter(user => matches(user, filter)).map(user => ({...user}))}),
                updateOne: vi.fn(async (filter: any, update: any) => {
                    const user = users.find(user => matches(user, filter));
                    if (!user) return {modifiedCount: 0};
                    Object.assign(user, update.$set);
                    return {modifiedCount: 1};
                }),
            };
            throw new Error(`Unexpected collection ${name}`);
        }),
    };
});
vi.mock("../db/db", () => ({col: mocks.col}));
vi.mock("../reminders/emailSender", () => ({sendEmailWithAttachments: mocks.send}));
vi.mock("../logger", () => ({logger: {warn: vi.fn()}}));
import {checkBillingReminders, ensureBillingNotification} from "../plans/billingReminders";

describe("billing reminder delivery", () => {
    const due = new Date("2026-10-20T09:00:00Z");

    function user(overrides = {}) {
        return {
            _id: new ObjectId(), email: "owner@example.com", is_active: 1,
            billing_mode: "one_time", billing_next_payment_at: due, ...overrides
        };
    }

    beforeEach(() => {
        mocks.users.length = 0;
        mocks.notifications.clear();
        vi.clearAllMocks();
        mocks.send.mockResolvedValue({success: true});
    });

    it("does not remind inactive users or automatic/yearly subscribers", async () => {
        mocks.users.push(user(), user({is_active: 0}), user({billing_mode: "monthly"}), user({billing_mode: "yearly"}));
        await checkBillingReminders(new Date("2026-10-19T09:00:00Z"));
        expect(mocks.send).toHaveBeenCalledTimes(1);
        expect(mocks.send.mock.calls[0][2]).toContain("Your prepaid renewal date is 2026-10-20");
        expect(mocks.notifications.size).toBe(1);
        await checkBillingReminders(due);
        expect(mocks.send).toHaveBeenCalledTimes(2);
        expect(mocks.send.mock.calls[1][2]).toContain("Your prepaid period ended on 2026-10-20");
        expect(mocks.notifications.size).toBe(2);
    });

    it("sends one email and one in-app reminder per period across concurrent ticks and polling", async () => {
        const account = user();
        mocks.users.push(account);
        await Promise.all([checkBillingReminders(due), checkBillingReminders(due), ensureBillingNotification(account, due)]);
        await checkBillingReminders(new Date("2026-10-21T09:00:00Z"));
        expect(mocks.send).toHaveBeenCalledTimes(1);
        expect(mocks.send.mock.calls[0][0]).toEqual(["owner@example.com"]);
        expect(mocks.send.mock.calls[0][2]).toContain("/profile?section=subscription");
        expect(mocks.send.mock.calls[0][4]).toContain('<a href="');
        expect(mocks.send.mock.calls[0][4]).toContain("/profile?section=subscription");
        expect(mocks.notifications.size).toBe(1);
        const notification = [...mocks.notifications.values()][0];
        notification.read_at = due;
        await ensureBillingNotification(account, due);
        expect(notification.read_at).toEqual(due);
    });

    it("retries failed mail after one hour without duplicating the notification", async () => {
        mocks.users.push(user());
        mocks.send.mockResolvedValueOnce({success: false, error: "SMTP offline"});
        await checkBillingReminders(due);
        await checkBillingReminders(new Date("2026-10-20T09:30:00Z"));
        expect(mocks.send).toHaveBeenCalledTimes(1);
        await checkBillingReminders(new Date("2026-10-20T10:00:00Z"));
        expect(mocks.send).toHaveBeenCalledTimes(2);
        expect(mocks.notifications.size).toBe(1);
        expect(mocks.users[0].billing_reminder_sent_for).toEqual(due);
    });

    it("starts a new reminder period after the next verified payment", async () => {
        const account = user();
        mocks.users.push(account);
        await checkBillingReminders(due);
        account.billing_next_payment_at = new Date("2026-11-20T09:00:00Z");
        await checkBillingReminders(new Date("2026-11-20T09:00:00Z"));
        expect(mocks.send).toHaveBeenCalledTimes(2);
        expect(mocks.notifications.size).toBe(2);
    });

    it("still creates the in-app reminder for an account without email", async () => {
        mocks.users.push(user({email: null}));
        await checkBillingReminders(due);
        expect(mocks.send).not.toHaveBeenCalled();
        expect(mocks.notifications.size).toBe(1);
    });

    it("sends an upcoming reminder now and the due reminder after a twelve-month purchase", async () => {
        const nextYear = new Date("2027-09-20T09:00:00Z");
        mocks.users.push(user({billing_months: 12, billing_next_payment_at: nextYear}));
        await checkBillingReminders(new Date("2026-10-20T09:00:00Z"));
        expect(mocks.send).toHaveBeenCalledTimes(1);
        expect(mocks.send.mock.calls[0][2]).toContain("Your prepaid renewal date is 2027-09-20");
        expect(mocks.notifications.size).toBe(1);
        await checkBillingReminders(nextYear);
        expect(mocks.send).toHaveBeenCalledTimes(2);
        expect(mocks.send.mock.calls[1][2]).toContain("Your prepaid period ended on 2027-09-20");
        expect(mocks.notifications.size).toBe(2);
    });

    it("reminds users who arrived with billing=one_time even before a verified receipt", async () => {
        const start = new Date("2026-09-20T09:00:00Z");
        mocks.users.push(user({
            billing_mode: null,
            billing_next_payment_at: undefined,
            signup_intent_billing: "one_time",
            signup_intent_months: 1,
            signup_intent_at: start,
        }));
        await checkBillingReminders(new Date("2026-09-20T10:00:00Z"));
        expect(mocks.send).toHaveBeenCalledTimes(1);
        expect(mocks.send.mock.calls[0][2]).toContain("Your prepaid renewal date is 2026-10-20");
        expect(mocks.notifications.size).toBe(1);
    });
});
