import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";

const mocks = vi.hoisted(() => ({ processed: [] as unknown[] }));

vi.mock("../db/db", async () => await import("./helpers/memoryDb"));
vi.mock("../push/adminNotify", () => ({ notifyEmailSendFailed: () => undefined }));
vi.mock("../inbound/inboundDeps", () => ({ processInboundEvent: async (event: unknown) => { mocks.processed.push(event); } }));

import { memory } from "./helpers/memoryDb";
import { registerResendWebhook } from "../reminders/resendDelivery";

const RAW_KEY = Buffer.from("route-test-signing-key-0123456789");
const SECRET = `whsec_${RAW_KEY.toString("base64")}`;

let server: Server;
let base: string;

function signed(payload: object, overrides: { tamper?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const id = "msg_route";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v1,${createHmac("sha256", RAW_KEY).update(`${id}.${timestamp}.${overrides.tamper ? "tampered" : body}`).digest("base64")}`;
  return { body, headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature } };
}

const post = (payload: object, overrides?: { tamper?: boolean }) => {
  const { body, headers } = signed(payload, overrides);
  return fetch(`${base}/api/webhooks/resend`, { method: "POST", headers, body });
};

beforeAll(async () => {
  const app = express();
  registerResendWebhook(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  memory.clear();
  mocks.processed.length = 0;
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
  process.env.RESEND_API_KEY = "re_test";
});

describe("POST /api/webhooks/resend", () => {
  const received = { type: "email.received", created_at: "2026-10-01T00:00:00Z", data: { email_id: "em_1", to: ["in+abc@in.example.com"] } };

  it("answers 503 when the signing secret is not configured", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    expect((await post(received)).status).toBe(503);
  });

  it("treats a blank secret as not configured", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "   ";
    expect((await post(received)).status).toBe(503);
  });

  it("rejects a bad signature without processing anything", async () => {
    const res = await post(received, { tamper: true });
    expect(res.status).toBe(400);
    expect(mocks.processed).toHaveLength(0);
  });

  it("acknowledges email.received and hands it to the email-in handler", async () => {
    const res = await post(received);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    await vi.waitFor(() => expect(mocks.processed).toHaveLength(1));
    expect(mocks.processed[0]).toMatchObject({ type: "email.received", data: { email_id: "em_1" } });
  });

  it("routes bounce events to delivery handling instead of email-in", async () => {
    const res = await post({ type: "email.bounced", data: { email_id: "em_2", to: ["x@example.com"], bounce: { message: "mailbox full" } } });
    expect(res.status).toBe(200);
    expect(mocks.processed).toHaveLength(0);
  });
});
