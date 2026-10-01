import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { ObjectId } from "mongodb";
import type { Server } from "http";

const USER_ID = new ObjectId().toHexString();
const mocks = vi.hoisted(() => ({ signedIn: true }));

vi.mock("../auth/middleware", () => ({
  requireAuth: async () => {
    if (!mocks.signedIn) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    return { userId: process.env.TEST_FEED_USER, user: {} };
  },
  HTTPException: class extends Error {},
}));
vi.mock("../db/db", async () => await import("./helpers/memoryDb"));

import { memory, rows } from "./helpers/memoryDb";
import { registerCalendarRoutes } from "../routes/calendar";

let server: Server;
let base: string;
const call = (method: string, path: string) => fetch(`${base}${path}`, { method });

function seedUser(plan: string) {
  memory.set("users", [{ _id: new ObjectId(USER_ID), plan, email: "owner@example.com" }]);
}

beforeAll(async () => {
  process.env.TEST_FEED_USER = USER_ID;
  const app = express();
  registerCalendarRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  memory.clear();
  mocks.signedIn = true;
  seedUser("business");
});

describe("ICS feed management routes", () => {
  it("requires a session", async () => {
    mocks.signedIn = false;
    expect((await call("GET", "/api/calendar/feed/status")).status).toBe(401);
    expect((await call("POST", "/api/calendar/feed/token")).status).toBe(401);
    expect((await call("DELETE", "/api/calendar/feed")).status).toBe(401);
  });

  it("reports no feed before one is created", async () => {
    const body = await (await call("GET", "/api/calendar/feed/status")).json();
    expect(body).toEqual({ allowed: true, enabled: false, path: null });
  });

  it("is gated by the Google Calendar entitlement", async () => {
    seedUser("basic");
    const status = await (await call("GET", "/api/calendar/feed/status")).json();
    expect(status.allowed).toBe(false);
    const res = await call("POST", "/api/calendar/feed/token");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("calendar_plan_required");
    expect(rows("user_settings")).toHaveLength(0);
  });

  it("creates a 64-hex token, then rotates it so the old URL stops working", async () => {
    const first = await (await call("POST", "/api/calendar/feed/token")).json();
    expect(first.path).toMatch(/^\/api\/calendar\/feed\/[0-9a-f]{64}\.ics$/);
    expect((await call("GET", first.path)).status).toBe(200);

    const second = await (await call("POST", "/api/calendar/feed/token")).json();
    expect(second.path).not.toBe(first.path);
    expect((await call("GET", first.path)).status).toBe(404);
    expect((await call("GET", second.path)).status).toBe(200);
  });

  it("switches the feed off", async () => {
    const { path } = await (await call("POST", "/api/calendar/feed/token")).json();
    const off = await (await call("DELETE", "/api/calendar/feed")).json();
    expect(off).toEqual({ enabled: false, path: null });
    expect((await call("GET", path)).status).toBe(404);
  });
});

describe("ICS feed (public)", () => {
  async function feedPath() {
    return (await (await call("POST", "/api/calendar/feed/token")).json()).path as string;
  }

  it("rejects malformed file names and unknown tokens with 404", async () => {
    expect((await call("GET", "/api/calendar/feed/not-a-token.ics")).status).toBe(404);
    expect((await call("GET", `/api/calendar/feed/${"a".repeat(64)}.ics`)).status).toBe(404);
  });

  it("serves a private text/calendar document without a session", async () => {
    const path = await feedPath();
    mocks.signedIn = false;
    const res = await call("GET", path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(res.headers.get("cache-control")).toContain("private");
    const text = await res.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("END:VCALENDAR");
  });

  it("lists open reminders but never leaks client contact details", async () => {
    const path = await feedPath();
    memory.set("reminders", [
      {
        _id: new ObjectId(), user_id: USER_ID, status: "pending", trigger_date: "2030-05-20",
        title: "בדיקת מעלית", contract_number: "C-77", client_email: "client@secret.example", client_phone: "050-1112222",
      },
      { _id: new ObjectId(), user_id: USER_ID, status: "dismissed", trigger_date: "2030-05-21", title: "Dismissed one" },
      { _id: new ObjectId(), user_id: "someone-else", status: "pending", trigger_date: "2030-05-22", title: "Other tenant" },
    ]);
    const text = await (await call("GET", path)).text();
    expect(text).toContain("20300520");
    expect(text).not.toContain("Dismissed one");
    expect(text).not.toContain("Other tenant");
    expect(text).not.toContain("client@secret.example");
    expect(text).not.toContain("050-1112222");
  });

  it("stops serving when the plan loses calendar access", async () => {
    const path = await feedPath();
    seedUser("basic");
    expect((await call("GET", path)).status).toBe(404);
  });
});
