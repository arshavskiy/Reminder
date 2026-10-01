import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";

const mocks = vi.hoisted(() => ({ user: { plan: "business" } as Record<string, unknown>, signedIn: true }));

vi.mock("../auth/middleware", () => ({
  requireAuth: async () => {
    if (!mocks.signedIn) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    return { userId: "user-1", user: mocks.user };
  },
  HTTPException: class extends Error {},
}));
vi.mock("../db/db", async () => await import("./helpers/memoryDb"));
// The real module pulls in the whole import pipeline; only the domain lookup is used here.
vi.mock("../inbound/inboundDeps", () => ({ inboundEmailDomain: () => process.env.INBOUND_EMAIL_DOMAIN?.trim() || null }));

import { memory, rows } from "./helpers/memoryDb";
import { registerInboundEmailRoutes } from "../routes/inboundEmail";

let server: Server;
let base: string;
const call = (method: string, path: string) => fetch(`${base}${path}`, { method });

beforeAll(async () => {
  const app = express();
  registerInboundEmailRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  memory.clear();
  mocks.user = { plan: "business" };
  mocks.signedIn = true;
  process.env.INBOUND_EMAIL_DOMAIN = "in.example.com";
});

describe("email-in routes", () => {
  it("requires a session", async () => {
    mocks.signedIn = false;
    expect((await call("GET", "/api/inbound-email/status")).status).toBe(401);
    expect((await call("POST", "/api/inbound-email/token")).status).toBe(401);
    expect((await call("DELETE", "/api/inbound-email")).status).toBe(401);
  });

  it("reports an unconfigured feature so the client can hide the card", async () => {
    delete process.env.INBOUND_EMAIL_DOMAIN;
    const body = await (await call("GET", "/api/inbound-email/status")).json();
    expect(body).toMatchObject({ configured: false, enabled: false, address: null });
  });

  it("refuses to create an address when the domain is not configured", async () => {
    delete process.env.INBOUND_EMAIL_DOMAIN;
    const res = await call("POST", "/api/inbound-email/token");
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("inbound_email_not_configured");
  });

  it("refuses plans without document import", async () => {
    mocks.user = { plan: "trial", trial_ends_at: "2020-01-01T00:00:00Z" };
    const res = await call("POST", "/api/inbound-email/token");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("plan_no_document_import");
    expect(rows("user_settings")).toHaveLength(0);
  });

  it("creates an address, shows it in status and rotates it", async () => {
    const created = await (await call("POST", "/api/inbound-email/token")).json();
    expect(created.address).toMatch(/^in\+[0-9a-f]{24}@in\.example\.com$/);
    expect(rows("user_settings")[0].inbound_email_token).toHaveLength(24);

    const status = await (await call("GET", "/api/inbound-email/status")).json();
    expect(status).toMatchObject({ configured: true, allowed: true, enabled: true, address: created.address });

    const rotated = await (await call("POST", "/api/inbound-email/token")).json();
    expect(rotated.address).not.toBe(created.address);
    expect(rows("user_settings")).toHaveLength(1);
  });

  it("disables the address and drops the token", async () => {
    await call("POST", "/api/inbound-email/token");
    const body = await (await call("DELETE", "/api/inbound-email")).json();
    expect(body).toMatchObject({ enabled: false, address: null });
    expect(rows("user_settings")[0].inbound_email_token).toBeUndefined();
  });
});
