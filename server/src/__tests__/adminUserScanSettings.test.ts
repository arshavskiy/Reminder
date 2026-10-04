import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";

const mocks = vi.hoisted(() => ({ role: "admin" }));

vi.mock("../auth/middleware", async () => ({
  ...(await vi.importActual<typeof import("../auth/middleware")>("../auth/middleware")),
  requireAuth: async () => ({ userId: "admin-1", user: { role: mocks.role } }),
}));
vi.mock("../db/db", async () => {
  const memory = await import("./helpers/memoryDb");
  return {
    ...memory,
    runWithPrimaryDb: async (fn: () => unknown) => fn(),
    parseAdminDbTarget: () => "local",
    enterAdminDbTarget: () => undefined,
    ensureProductionDb: async () => undefined,
  };
});

import { memory, rows } from "./helpers/memoryDb";
import { registerAdminRoutes } from "../routes/admin";

let server: Server;
let base: string;
const put = (id: string, body: unknown) =>
  fetch(`${base}/api/admin/users/${id}/settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerAdminRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  memory.clear();
  mocks.role = "admin";
});

describe("PUT /api/admin/users/:id/settings — scheduled scans", () => {
  it("lets an admin switch the invoice and discovery scans on for a user", async () => {
    const res = await put("user-9", { invoices_auto_scan: true, discovery_auto_scan: true, discovery_scan_frequency: "daily" });
    expect(res.status).toBe(200);
    const row = rows("user_settings").find((r) => r.user_id === "user-9")!;
    expect(row).toMatchObject({ invoices_auto_scan: true, discovery_auto_scan: true, discovery_scan_frequency: "daily" });
  });

  it("switches them off again and leaves other settings alone", async () => {
    memory.set("user_settings", [{ user_id: "user-9", theme: "dark", invoices_auto_scan: true, discovery_auto_scan: true }]);
    await put("user-9", { invoices_auto_scan: false, discovery_auto_scan: false });
    const row = rows("user_settings").find((r) => r.user_id === "user-9")!;
    expect(row).toMatchObject({ theme: "dark", invoices_auto_scan: false, discovery_auto_scan: false });
  });

  it("rejects an unknown discovery frequency", async () => {
    const res = await put("user-9", { discovery_scan_frequency: "hourly" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_scan_frequency");
    expect(rows("user_settings")).toHaveLength(0);
  });

  it("refuses a non-admin", async () => {
    mocks.role = "user";
    const res = await put("user-9", { invoices_auto_scan: true });
    expect(res.status).toBe(403);
    expect(rows("user_settings")).toHaveLength(0);
  });
});
