import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";

const mocks = vi.hoisted(() => ({ signedIn: true }));

vi.mock("../auth/middleware", () => ({
  requireAuth: async () => {
    if (!mocks.signedIn) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    return { userId: "user-1", user: {} };
  },
  HTTPException: class extends Error {},
}));
vi.mock("../db/db", async () => await import("./helpers/memoryDb"));
vi.mock("../reminders/scheduler", () => ({ flushDuePersonalReminders: async () => undefined }));
vi.mock("../plans/billingReminders", () => ({ ensureBillingNotification: async () => undefined }));

import { memory, rows } from "./helpers/memoryDb";
import { registerNotificationRoutes } from "../routes/notifications";

let server: Server;
let base: string;
const send = (method: string, path: string, body?: unknown) => fetch(`${base}${path}`, {
  method,
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const subscription = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } };

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerNotificationRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  memory.clear();
  mocks.signedIn = true;
  delete process.env.VAPID_PUBLIC_KEY;
});

describe("user web push routes", () => {
  it("require a session", async () => {
    mocks.signedIn = false;
    expect((await send("GET", "/api/push/vapid-key")).status).toBe(401);
    expect((await send("POST", "/api/push/subscribe", subscription)).status).toBe(401);
    expect((await send("POST", "/api/push/unsubscribe", { endpoint: subscription.endpoint })).status).toBe(401);
  });

  it("returns a null key while push is not configured", async () => {
    expect(await (await send("GET", "/api/push/vapid-key")).json()).toEqual({ key: null });
  });

  it("returns the public VAPID key when configured", async () => {
    process.env.VAPID_PUBLIC_KEY = "BPublicKey";
    expect(await (await send("GET", "/api/push/vapid-key")).json()).toEqual({ key: "BPublicKey" });
  });

  it("rejects an incomplete subscription", async () => {
    expect((await send("POST", "/api/push/subscribe", { endpoint: "https://x" })).status).toBe(400);
    expect((await send("POST", "/api/push/subscribe", { keys: subscription.keys })).status).toBe(400);
    expect(rows("push_subscriptions")).toHaveLength(0);
  });

  it("stores a subscription once per endpoint", async () => {
    expect((await send("POST", "/api/push/subscribe", subscription)).status).toBe(201);
    expect((await send("POST", "/api/push/subscribe", subscription)).status).toBe(201);
    expect(rows("push_subscriptions")).toHaveLength(1);
    expect(rows("push_subscriptions")[0]).toMatchObject({ user_id: "user-1", endpoint: subscription.endpoint });
  });

  it("removes only the caller's subscription for that endpoint", async () => {
    memory.set("push_subscriptions", [
      { user_id: "user-1", endpoint: subscription.endpoint },
      { user_id: "user-2", endpoint: subscription.endpoint },
    ]);
    expect(await (await send("POST", "/api/push/unsubscribe", { endpoint: subscription.endpoint })).json()).toEqual({ ok: true });
    expect(rows("push_subscriptions")).toEqual([{ user_id: "user-2", endpoint: subscription.endpoint }]);
  });
});
