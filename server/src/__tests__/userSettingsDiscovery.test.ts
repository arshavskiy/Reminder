import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { ObjectId } from "mongodb";
import type { Server } from "http";

const USER_ID = new ObjectId().toHexString();

vi.mock("../auth/middleware", () => ({
  requireAuth: async () => ({ userId: process.env.TEST_SETTINGS_USER, user: {} }),
  HTTPException: class extends Error {},
}));
vi.mock("../db/db", async () => await import("./helpers/memoryDb"));
vi.mock("../plans/planEntitlements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../plans/planEntitlements")>()),
  persistPlanEntitlements: async () => ({ automaticMonthlyReports: true, fileStorage: true }),
}));

import { memory, rows } from "./helpers/memoryDb";
import { registerUserSettingsRoutes } from "../routes/userSettings";

let server: Server;
let base: string;
const put = (body: unknown) => fetch(`${base}/api/user-settings`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const seedPlan = (plan: string, extra: Record<string, unknown> = {}) =>
  memory.set("users", [{ _id: new ObjectId(USER_ID), plan, ...extra }]);

beforeAll(async () => {
  process.env.TEST_SETTINGS_USER = USER_ID;
  const app = express();
  app.use(express.json());
  registerUserSettingsRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  memory.clear();
  seedPlan("business");
});

describe("PUT /api/user-settings — discovery fields", () => {
  it("saves the weekly scan switch and languages", async () => {
    const res = await put({ discovery_auto_scan: true, discovery_langs: ["he", "ru"] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.discovery_auto_scan).toBe(true);
    expect(body.discovery_langs).toEqual(["he", "ru"]);
    expect(rows("user_settings")[0]).toMatchObject({ discovery_auto_scan: true, discovery_langs: ["he", "ru"] });
  });

  it("rejects an unsupported language without writing anything", async () => {
    const res = await put({ discovery_langs: ["xx"] });
    expect(res.status).toBe(400);
    expect(rows("user_settings")).toHaveLength(0);
  });

  it("refuses to enable the weekly scan on a plan without document import", async () => {
    seedPlan("trial", { trial_ends_at: "2020-01-01T00:00:00Z" });
    const res = await put({ discovery_auto_scan: true });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("plan_no_document_import");
    expect(rows("user_settings")).toHaveLength(0);
  });

  it("still lets that account switch the weekly scan off", async () => {
    seedPlan("trial", { trial_ends_at: "2020-01-01T00:00:00Z" });
    const res = await put({ discovery_auto_scan: false });
    expect(res.status).toBe(200);
    expect(rows("user_settings")[0].discovery_auto_scan).toBe(false);
  });
});
