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

describe("PUT /api/user-settings — whats_new_seen", () => {
  it("stores the dismissed release id", async () => {
    const res = await put({ whats_new_seen: "2026-10" });
    expect(res.status).toBe(200);
    expect((await res.json()).whats_new_seen).toBe("2026-10");
    expect(rows("user_settings")[0].whats_new_seen).toBe("2026-10");
  });

  it("rejects ids that are not short release tokens", async () => {
    for (const bad of ["<script>alert(1)</script>", "x".repeat(40), "two words"]) {
      expect((await put({ whats_new_seen: bad })).status).toBe(400);
    }
    expect(rows("user_settings")).toHaveLength(0);
  });
});

describe("PUT /api/user-settings — scheduled scan options", () => {
  it("saves the discovery scan frequency and rejects anything but daily or weekly", async () => {
    for (const value of ["daily", "weekly"]) {
      const res = await put({ discovery_scan_frequency: value });
      expect(res.status).toBe(200);
      expect((await res.json()).discovery_scan_frequency).toBe(value);
    }
    expect((await put({ discovery_scan_frequency: "hourly" })).status).toBe(400);
    expect(rows("user_settings")[0].discovery_scan_frequency).toBe("weekly");
  });

  it("lets a business account switch the daily invoice scan on and off", async () => {
    const on = await put({ invoices_auto_scan: true });
    expect(on.status).toBe(200);
    expect((await on.json()).invoices_auto_scan).toBe(true);
    const off = await put({ invoices_auto_scan: false });
    expect((await off.json()).invoices_auto_scan).toBe(false);
  });

  it("lets an admin switch the daily invoice scan on whatever the stored plan (unlimited history)", async () => {
    seedPlan("basic", { role: "admin" });
    const res = await put({ invoices_auto_scan: true });
    expect(res.status).toBe(200);
    expect((await res.json()).invoices_auto_scan).toBe(true);
  });

  it("refuses the daily invoice scan on plans without Gmail invoice import, but still allows switching it off", async () => {
    for (const plan of ["basic", "digital"]) {
      seedPlan(plan);
      const res = await put({ invoices_auto_scan: true });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("gmail_invoice_plan_required");
    }
    expect(rows("user_settings")).toHaveLength(0);
    seedPlan("basic");
    expect((await put({ invoices_auto_scan: false })).status).toBe(200);
  });
});

describe("PUT /api/user-settings — OCR language", () => {
  it("accepts Hebrew, English and Russian packs and stores them normalised", async () => {
    const res = await put({ ocr_language: "rus+eng+heb" });
    expect(res.status).toBe(200);
    expect((await res.json()).ocr_language).toBe("heb+eng+rus");
  });

  it("rejects unsupported languages without writing anything", async () => {
    expect((await put({ ocr_language: "fra" })).status).toBe(400);
    expect((await put({ ocr_language: "" })).status).toBe(400);
    expect(rows("user_settings")).toHaveLength(0);
  });
});
