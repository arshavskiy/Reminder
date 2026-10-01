import express from "express";
import { randomBytes } from "crypto";
import { col } from "../db/db";
import { HTTPException, requireAuth } from "../auth/middleware";
import { effectivePlanId, planAllowsEmailIn, PLAN_GATE_MESSAGES } from "../plans/tierFeatures";
import { inboundAddress } from "../inbound/inboundEmail";
import { inboundEmailDomain } from "../inbound/inboundDeps";

async function authedUser(req: express.Request, res: express.Response): Promise<{ userId: string; plan: string } | null> {
  try {
    const ctx = await requireAuth(req.headers.cookie);
    return { userId: ctx.userId, plan: effectivePlanId(ctx.user) };
  } catch (e) {
    const err = e as HTTPException;
    res.status(err.status ?? 401).json({ error: err.message });
    return null;
  }
}

function address(token: string | null): string | null {
  const domain = inboundEmailDomain();
  return token && domain ? inboundAddress(token, domain) : null;
}

/** Per-user forwarding address for email-in. The token in the address is the credential. */
export function registerInboundEmailRoutes(app: express.Application) {
  app.get("/api/inbound-email/status", async (req, res) => {
    const auth = await authedUser(req, res);
    if (!auth) return;
    const row = await col<any>("user_settings").findOne({ user_id: auth.userId });
    const token = typeof row?.inbound_email_token === "string" ? row.inbound_email_token : null;
    res.json({
      configured: Boolean(inboundEmailDomain()),
      allowed: planAllowsEmailIn(auth.plan),
      enabled: Boolean(token),
      address: address(token),
    });
  });

  // POST /api/inbound-email/token — create the address, or rotate it (the old one stops working).
  app.post("/api/inbound-email/token", async (req, res) => {
    const auth = await authedUser(req, res);
    if (!auth) return;
    if (!inboundEmailDomain()) {
      res.status(503).json({ error: "inbound_email_not_configured" });
      return;
    }
    if (!planAllowsEmailIn(auth.plan)) {
      res.status(403).json({ error: "plan_no_email_in", message: PLAN_GATE_MESSAGES.emailIn });
      return;
    }
    const token = randomBytes(12).toString("hex");
    await col<any>("user_settings").updateOne({ user_id: auth.userId }, { $set: { inbound_email_token: token } }, { upsert: true });
    res.json({ configured: true, allowed: true, enabled: true, address: address(token) });
  });

  app.delete("/api/inbound-email", async (req, res) => {
    const auth = await authedUser(req, res);
    if (!auth) return;
    await col<any>("user_settings").updateOne({ user_id: auth.userId }, { $unset: { inbound_email_token: "" } });
    res.json({ configured: Boolean(inboundEmailDomain()), allowed: planAllowsEmailIn(auth.plan), enabled: false, address: null });
  });
}
