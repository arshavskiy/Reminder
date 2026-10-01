import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";

// Regression: the webhook route passed the signing secret as `secret` behind an
// `as any` cast, but the SDK option is `webhookSecret`, so every verification
// failed with "Secret can't be empty". This signs a payload the way Resend does
// and checks the SDK accepts it with the option name the route uses.
const RAW_KEY = Buffer.from("test-signing-key-0123456789abcdef");
const SECRET = `whsec_${RAW_KEY.toString("base64")}`;

function sign(id: string, timestamp: string, payload: string): string {
  return `v1,${createHmac("sha256", RAW_KEY).update(`${id}.${timestamp}.${payload}`).digest("base64")}`;
}

describe("Resend webhook verification", () => {
  it("accepts a correctly signed email.received event", async () => {
    const { Resend } = await import("resend");
    const payload = JSON.stringify({ type: "email.received", created_at: "2026-10-01T00:00:00Z", data: { email_id: "em_1", to: ["in+abc@in.example.com"] } });
    const id = "msg_test";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const event = new Resend("re_test").webhooks.verify({
      payload,
      headers: { id, timestamp, signature: sign(id, timestamp, payload) },
      webhookSecret: SECRET,
    }) as unknown as { type: string; data: { email_id: string } };
    expect(event.type).toBe("email.received");
    expect(event.data.email_id).toBe("em_1");
  });

  it("rejects a payload whose signature does not match", async () => {
    const { Resend } = await import("resend");
    const payload = JSON.stringify({ type: "email.received", data: {} });
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(() => new Resend("re_test").webhooks.verify({
      payload,
      headers: { id: "msg_test", timestamp, signature: sign("msg_test", timestamp, "tampered") },
      webhookSecret: SECRET,
    })).toThrow();
  });
});
