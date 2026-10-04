import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(async () => ({ messageId: "m1" })),
  sendToUser: vi.fn(async () => undefined),
}));

vi.mock("../db/db", async () => await import("./helpers/memoryDb"));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: mocks.sendMail }) },
}));
vi.mock("../settings", async () => ({
  ...(await vi.importActual<typeof import("../settings")>("../settings")),
  getSettings: () => ({
    smtpHost: "smtp.test", smtpPort: 587, smtpSecure: false, smtpUser: "u", smtpPass: "p",
    smtpRejectUnauthorized: true, emailFrom: "reminders@remindocr.test", emailFromName: "RemindOCR",
    reminderEnabled: true,
  }),
}));
vi.mock("../push/pushService", () => ({ sendToUser: mocks.sendToUser, sendPushToAdmins: vi.fn(async () => undefined) }));
vi.mock("../calendar/sync", async () => ({
  ...(await vi.importActual<typeof import("../calendar/sync")>("../calendar/sync")),
  pushReminderToCalendar: vi.fn(async () => undefined),
  syncAllCalendars: vi.fn(),
}));

import { memory, rows } from "./helpers/memoryDb";
import { createPersonalReminder } from "../reminders/scheduler";

const USER_ID = new ObjectId().toHexString();

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  memory.clear();
  mocks.sendMail.mockClear();
  mocks.sendToUser.mockClear();
  memory.set("users", [{ _id: new ObjectId(USER_ID), plan: "basic", email: "owner@example.com", name: "Owner" }]);
});

describe("the reminder email a user gets for a discovered deadline", () => {
  it("renders and sends a real message to the account address when the deadline is today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await createPersonalReminder(USER_ID, "Renew business licence", today, {
      advanceDays: [7, 1], emailSelf: true, origin: "discovery", syncCalendar: false,
    });

    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    const mail = mocks.sendMail.mock.calls[0][0] as Record<string, string>;
    expect(mail.to).toBe("owner@example.com");
    // The owner is the recipient, so no CC copy to themselves.
    expect(mail.cc || "").toBe("");
    expect(mail.from).toContain("reminders@remindocr.test");
    expect(mail.subject).toContain("Renew business licence");
    expect(mail.html).toContain("Renew business licence");
    expect(mail.text).toContain("Renew business licence");

    const reminder = rows("reminders").find((row) => row.user_id === USER_ID)!;
    expect(reminder.status).toBe("sent");
    expect(mocks.sendToUser).toHaveBeenCalledTimes(1);
    expect(rows("notifications")).toHaveLength(1);
  });

  it("falls back to the bell and push, keeping the row open, when mail cannot be sent", async () => {
    mocks.sendMail.mockRejectedValueOnce(new Error("connection refused"));
    const today = new Date().toISOString().slice(0, 10);
    await createPersonalReminder(USER_ID, "Renew business licence", today, { emailSelf: true, advanceDays: [1], origin: "discovery" });
    const reminder = rows("reminders").find((row) => row.user_id === USER_ID)!;
    expect(reminder.status).toBe("triggered");
    expect(mocks.sendToUser).toHaveBeenCalledTimes(1);
    expect(rows("notifications")).toHaveLength(1);
  });
});
