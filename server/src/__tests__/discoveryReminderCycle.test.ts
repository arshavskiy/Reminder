import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mocks = vi.hoisted(() => ({
  sendToUser: vi.fn(async () => undefined),
  sendReminderEmail: vi.fn(async () => ({ success: true })),
  pushReminderToCalendar: vi.fn(async () => undefined),
}));

vi.mock("../db/db", async () => await import("./helpers/memoryDb"));
vi.mock("../push/pushService", () => ({ sendToUser: mocks.sendToUser, sendPushToAdmins: vi.fn(async () => undefined) }));
vi.mock("../reminders/emailSender", () => ({
  sendReminderEmail: mocks.sendReminderEmail,
  sendGroupedReminderEmail: vi.fn(),
}));
vi.mock("../calendar/sync", async () => ({
  ...(await vi.importActual<typeof import("../calendar/sync")>("../calendar/sync")),
  pushReminderToCalendar: mocks.pushReminderToCalendar,
  syncAllCalendars: vi.fn(),
}));

import { memory, rows } from "./helpers/memoryDb";
import { createPersonalReminder, flushDuePersonalReminders, personalStageDays, shiftDate } from "../reminders/scheduler";
import { calendarSyncAllowed } from "../calendar/sync";

const USER_ID = new ObjectId().toHexString();
const OWNER_EMAIL = "owner@example.com";
const TODAY = "2030-06-01";

function seedUser(plan: string) {
  memory.set("users", [{ _id: new ObjectId(USER_ID), plan, email: OWNER_EMAIL, trial_ends_at: "2031-01-01" }]);
}
const reminders = () => rows("reminders").filter((row) => row.user_id === USER_ID);
const options = { advanceDays: [7, 1], emailSelf: true, origin: "discovery" as const, syncCalendar: true };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`));
  memory.clear();
  mocks.sendToUser.mockClear();
  mocks.sendReminderEmail.mockClear();
  mocks.pushReminderToCalendar.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.CALENDAR_SYNC_ALL_PLANS;
});

describe("stage helpers", () => {
  it("keeps whole positive days, largest first, plus the due day", () => {
    expect(personalStageDays([1, 7, 7, 0, -3, 2.5, 400])).toEqual([7, 1, 0]);
    expect(personalStageDays([])).toBeNull();
    expect(personalStageDays(null)).toBeNull();
  });
  it("shifts calendar days without drifting across month ends", () => {
    expect(shiftDate("2030-03-01", -1)).toBe("2030-02-28");
    expect(shiftDate("2030-06-30", -7)).toBe("2030-06-23");
  });
});

describe("a reminder made from a discovered deadline", () => {
  it.each(["trial", "basic", "business", "digital"])("creates 7-day, 1-day and due-day rows on the %s plan", async (plan) => {
    seedUser(plan);
    const result = await createPersonalReminder(USER_ID, "Renew licence", "2030-06-20", options);
    expect(result.created).toBe(3);
    const list = reminders().sort((a, b) => a.trigger_date.localeCompare(b.trigger_date));
    expect(list.map((row) => row.trigger_date)).toEqual(["2030-06-13", "2030-06-19", "2030-06-20"]);
    expect(list.every((row) => row.expiry_date === "2030-06-20")).toBe(true);
    expect(list.map((row) => row.advance_days)).toEqual([7, 1, 0]);
    expect(list.every((row) => row.origin === "discovery")).toBe(true);
    expect(list.every((row) => row.email_to === JSON.stringify([OWNER_EMAIL]))).toBe(true);
    expect(list.map((row) => row.calendar_sync)).toEqual([false, false, true]);
  });

  it("skips warning stages that are already in the past", async () => {
    seedUser("basic");
    await createPersonalReminder(USER_ID, "Soon", "2030-06-04", options);
    expect(reminders().map((row) => row.trigger_date).sort()).toEqual(["2030-06-03", "2030-06-04"]);
  });

  it("creates only the due day for a deadline that is today, and fires it at once", async () => {
    seedUser("basic");
    await createPersonalReminder(USER_ID, "Today", TODAY, options);
    expect(reminders()).toHaveLength(1);
    expect(reminders()[0].status).toBe("sent");
  });

  it("pushes only the due-day row to the calendar", async () => {
    seedUser("business");
    await createPersonalReminder(USER_ID, "Renew licence", "2030-06-20", options);
    expect(mocks.pushReminderToCalendar).toHaveBeenCalledTimes(1);
    const dueRow = reminders().find((row) => row.advance_days === 0)!;
    expect(mocks.pushReminderToCalendar).toHaveBeenCalledWith(USER_ID, String(dueRow._id));
  });

  it("does not email or touch the calendar when the user opts out", async () => {
    seedUser("basic");
    await createPersonalReminder(USER_ID, "Quiet", "2030-06-20", { ...options, emailSelf: false, syncCalendar: false });
    expect(reminders().every((row) => row.email_to === null)).toBe(true);
    expect(reminders().every((row) => row.calendar_sync === false)).toBe(true);
    expect(mocks.pushReminderToCalendar).not.toHaveBeenCalled();
  });

  it("keeps the old single-row behaviour when no stages are given", async () => {
    seedUser("basic");
    const result = await createPersonalReminder(USER_ID, "Legacy", "2030-06-20", { remindBeforeDays: [3] });
    expect(result.created).toBe(1);
    expect(reminders()[0]).toMatchObject({ trigger_date: "2030-06-20", advance_days: 3, calendar_sync: true });
  });
});

describe("delivery over the reminder timeline", () => {
  it("rings the bell, pushes and emails the owner once per stage, and never twice", async () => {
    seedUser("basic");
    await createPersonalReminder(USER_ID, "Renew licence", "2030-06-20", options);
    expect(mocks.sendToUser).not.toHaveBeenCalled();
    expect(mocks.sendReminderEmail).not.toHaveBeenCalled();

    // 7 days before.
    vi.setSystemTime(new Date("2030-06-13T07:00:00Z"));
    expect(await flushDuePersonalReminders(USER_ID)).toHaveLength(1);
    expect(mocks.sendToUser).toHaveBeenCalledTimes(1);
    expect(mocks.sendReminderEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendReminderEmail.mock.calls[0][1]).toEqual([OWNER_EMAIL]);
    const bell = rows("notifications").filter((row) => row.user_id === USER_ID);
    expect(bell).toHaveLength(1);
    expect(bell[0].body).toBe("בעוד 7 ימים · יעד: 2030-06-20");

    // A second sweep the same day does nothing more.
    await flushDuePersonalReminders(USER_ID);
    expect(mocks.sendToUser).toHaveBeenCalledTimes(1);
    expect(mocks.sendReminderEmail).toHaveBeenCalledTimes(1);

    // 1 day before, then the deadline itself.
    vi.setSystemTime(new Date("2030-06-19T07:00:00Z"));
    await flushDuePersonalReminders(USER_ID);
    vi.setSystemTime(new Date("2030-06-20T07:00:00Z"));
    await flushDuePersonalReminders(USER_ID);
    expect(mocks.sendToUser).toHaveBeenCalledTimes(3);
    expect(mocks.sendReminderEmail).toHaveBeenCalledTimes(3);
    expect(rows("notifications").map((row) => row.body)).toEqual([
      "בעוד 7 ימים · יעד: 2030-06-20",
      "בעוד 1 ימים · יעד: 2030-06-20",
      "יעד: 2030-06-20",
    ]);
    expect(reminders().every((row) => row.status === "sent")).toBe(true);
  });

  it("still tells the owner through the bell and push when the email fails", async () => {
    seedUser("basic");
    mocks.sendReminderEmail.mockResolvedValueOnce({ success: false, error: "smtp down" } as any);
    await createPersonalReminder(USER_ID, "Today", TODAY, options);
    expect(mocks.sendToUser).toHaveBeenCalledTimes(1);
    expect(rows("notifications")).toHaveLength(1);
    expect(reminders()[0].status).toBe("triggered");
  });
});

describe("Google Calendar entitlement for these reminders", () => {
  const basicUser = { plan: "basic" };
  const lapsedTrial = { plan: "trial", trial_ends_at: "2020-01-01" };
  const discovered = { source_type: "personal", origin: "discovery" };

  it("lets a discovered reminder reach a connected calendar on any paid plan", () => {
    expect(calendarSyncAllowed(basicUser, discovered)).toBe(true);
    expect(calendarSyncAllowed({ plan: "trial", trial_ends_at: "2031-01-01" }, discovered)).toBe(true);
  });
  it("allows every active plan, for every kind of reminder", () => {
    for (const plan of ["trial", "digital", "basic", "business"]) {
      expect(calendarSyncAllowed({ plan, trial_ends_at: "2031-01-01" }, { source_type: "task" })).toBe(true);
      expect(calendarSyncAllowed({ plan, trial_ends_at: "2031-01-01" }, { source_type: "personal" })).toBe(true);
    }
  });
  it("is closed for a lapsed trial, except for reminders made from a discovered deadline", () => {
    expect(calendarSyncAllowed(lapsedTrial, { source_type: "personal" })).toBe(false);
    expect(calendarSyncAllowed(lapsedTrial, { source_type: "task", origin: "discovery" })).toBe(false);
  });
});
