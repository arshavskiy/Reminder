import express from "express";
import {parsePlanId, updateUserTier, VALID_PLAN_IDS} from "../plans/updateUserTier";
import {logger} from "../logger";

export function registerBillingRoutes(app: express.Application) {
  app.post("/api/billing/tier", async (req, res) => {
    const configuredSecret = String(process.env.PAYMENT_TIER_UPDATE_SECRET ?? "").trim();
    const providedSecret = paymentSecret(req);
    if (!configuredSecret || providedSecret !== configuredSecret) {
      res.status(401).json({error: "invalid_payment_tier_secret"});
      return;
    }

    const body = req.body as {
      userId?: string | null;
      user_id?: string | null;
      email?: string | null;
      plan?: string | null;
      tier?: string | null;
      paymentId?: string | null;
      payment_id?: string | null;
      provider?: string | null;
    };
    const plan = parsePlanId(body.plan ?? body.tier);
    if (!plan) {
      res.status(400).json({error: "invalid_plan", validPlans: VALID_PLAN_IDS});
      return;
    }

    const result = await updateUserTier(
      {userId: body.userId ?? body.user_id, email: body.email},
      plan,
      {
        source: "payment",
        payment_id: body.paymentId ?? body.payment_id ?? null,
        provider: body.provider ?? null,
      },
    );
    if (!result) {
      res.status(404).json({error: "user_not_found"});
      return;
    }

    logger.info("payment_tier_updated", {
      user_id: result.user.id,
      plan,
      provider: body.provider ?? null,
      payment_id: body.paymentId ?? body.payment_id ?? null,
    });
    res.json({ok: true, ...result});
  });
}

function paymentSecret(req: express.Request): string {
  const headerSecret = req.get("x-payment-tier-secret") ?? "";
  if (headerSecret) return headerSecret;
  const auth = req.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}
