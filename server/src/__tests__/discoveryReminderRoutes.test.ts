import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { ObjectId } from "mongodb";
import type { Server } from "http";

const USER_ID = new ObjectId().toHexString();
const mocks = vi.hoisted(() => ({
  sendToUser: vi.fn(async () => undefined),
  sendReminderEmail: vi.fn(async () => ({ success: true })),
  insertTask: vi.fn(async () => ({ id: "gtask-1" })),
  patchTask: vi.fn(async () => null),
  token: "google-token" as string | null,
}));

vi.mock("../auth/middleware", () => ({
  requireAuth: async () => ({ userId: process.env.TEST_REMINDER_USER, user: {} }),
  HTTPException: class extends Error {},
}));
vi.mock("../db/db", async () => await import("./helpers/memoryDb"));
vi.mock("../push/pushService", () => ({ sendToUser: mocks.sendToUser, sendPushToAdmins: vi.fn(async () => undefined) }));
vi.mock("../reminders/emailSender", () => ({ sendReminderEmail: mocks.sendReminderEmail, sendGroupedReminderEmail: vi.fn() }));
vi.mock("../calendar/googleCalendar", async () => ({
  ...(await vi.importActual<typeof import("../calendar/googleCalendar")>("../calendar/googleCalendar")),
  resolveCalendarToken: async () => mocks.token,
}));
vi.mock("../calendar/googleTasks", async () => ({
  ...(await vi.importActual<typeof import("../calendar/googleTasks")>("../calendar/googleTasks")),
  insertTask: mocks.insertTask,
  patchTask: mocks.patchTask,
  deleteTask: vi.fn(async () => undefined),
}));

import { memory, rows } from "./helpers/memoryDb";
import { registerReminderRoutes } from "../routes/reminders";

let server: Server;
let base: string;
const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function seedUser(plan: string) {
  memory.set("users", [{ _id: new ObjectId(USER_ID), plan, email: "owner@example.com", trial_ends_at: "2031-01-01" }]);
}
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  process.env.TEST_REMINDER_USER = USER_ID;
  const app = express();
  app.use(express.json());
  registerReminderRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  memory.clear();
  mocks.sendToUser.mockClear();
  mocks.sendReminderEmail.mockClear();
  mocks.insertTask.mockClear();
  mocks.token = "google-token";
});
afterEach(() => {
  delete process.env.CALENDAR_SYNC_ALL_PLANS;
});

const discoveryBody = (target: string) => ({
  title: "Renew licence", target_date: target,
  advance_days: [7, 1], email_self: true, sync_calendar: true, origin: "discovery",
});

describe("POST /api/reminders/personal with discovery options", () => {
  it("stores the stages, the self-email and the origin sent by the discovery page", async () => {
    seedUser("basic");
    const res = await post("/api/reminders/personal", discoveryBody(day(20)));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ created: 3 });
    const list = rows("reminders").filter((row) => row.user_id === USER_ID);
    expect(list.map((row) => row.advance_days).sort((a, b) => b - a)).toEqual([7, 1, 0]);
    expect(list.every((row) => row.origin === "discovery" && row.email_to === JSON.stringify(["owner@example.com"]))).toBe(true);
  });

  it("ignores an unknown origin and a non-array advance_days", async () => {
    seedUser("basic");
    await post("/api/reminders/personal", { title: "Plain", target_date: day(20), origin: "admin", advance_days: "7,1" });
    const list = rows("reminders").filter((row) => row.user_id === USER_ID);
    expect(list).toHaveLength(1);
    expect(list[0].origin).toBeUndefined();
  });

  it("shows every stage in the reminders list that feeds the in-app calendar", async () => {
    seedUser("basic");
    await post("/api/reminders/personal", discoveryBody(day(20)));
    const { rows: items, total } = await (await fetch(`${base}/api/reminders?days=30`)).json();
    expect(total).toBe(3);
    expect(items.map((item: any) => item.trigger_date).sort()).toEqual([day(13), day(19), day(20)]);
    // The row on the deadline is the one that carries the Google link.
    expect(items.filter((item: any) => item.calendar_synced).map((item: any) => item.trigger_date)).toEqual([day(20)]);
  });
});

describe("Google Calendar push for these reminders", () => {
  it("creates one Google task for the deadline on a plan without calendar sync", async () => {
    seedUser("basic");
    await post("/api/reminders/personal", discoveryBody(day(20)));
    expect(mocks.insertTask).toHaveBeenCalledTimes(1);
    const link = rows("calendar_links").find((row) => row.gtask_id === "gtask-1");
    const due = rows("reminders").find((row) => row.advance_days === 0)!;
    expect(String(link?.source_id)).toBe(String(due._id));
  });

  it("does nothing when no Google account is connected", async () => {
    seedUser("basic");
    mocks.token = null;
    await post("/api/reminders/personal", discoveryBody(day(20)));
    expect(mocks.insertTask).not.toHaveBeenCalled();
  });

  it("does nothing when the user unticks the calendar option", async () => {
    seedUser("business");
    await post("/api/reminders/personal", { ...discoveryBody(day(20)), sync_calendar: false });
    expect(mocks.insertTask).not.toHaveBeenCalled();
  });

  it("keeps a plain personal reminder off the calendar for a plan without calendar sync", async () => {
    seedUser("basic");
    await post("/api/reminders/personal", { title: "Plain", target_date: day(20) });
    expect(mocks.insertTask).not.toHaveBeenCalled();
  });

  it("syncs a plain personal reminder for every plan behind CALENDAR_SYNC_ALL_PLANS", async () => {
    process.env.CALENDAR_SYNC_ALL_PLANS = "true";
    seedUser("digital");
    await post("/api/reminders/personal", { title: "Plain", target_date: day(20) });
    expect(mocks.insertTask).toHaveBeenCalledTimes(1);
  });
});
