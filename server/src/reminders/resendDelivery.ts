import express from "express";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {logger} from "../logger";
import {notifyEmailSendFailed} from "../push/adminNotify";

function tryObjectId(id: string): any {
  try {
    return new ObjectId(id);
  } catch {
    return id;
  }
}

export type ResendDeliveryEvent = {
  type: string;
  data?: {
    email_id?: string;
    to?: string | string[];
    bounce?: { message?: string };
    failed?: { reason?: string };
  };
};

export async function handleResendDeliveryEvent(event: ResendDeliveryEvent): Promise<void> {
  const type = event.type ?? "";
  if (!["email.bounced", "email.complained", "email.delivery_delayed"].includes(type)) return;
  if (type === "email.delivery_delayed") return;

  const emailId = event.data?.email_id?.trim();
  const recipients = Array.isArray(event.data?.to)
    ? event.data.to
    : event.data?.to
      ? [event.data.to]
      : [];
  const reason = event.data?.bounce?.message
    ?? event.data?.failed?.reason
    ?? type;

  const sendLogs = emailId
    ? await col("email_log").find({ provider_message_id: emailId, log_type: "send" }).toArray()
    : [];
  let logs = sendLogs;
  if (!logs.length && recipients.length) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    logs = await col("email_log").find({
      log_type: "send",
      success: 1,
      to_address: {$in: recipients},
      sent_at: {$gte: since},
    }).sort({ sent_at: -1 }).limit(20).toArray();
  }
  if (!logs.length) {
    logger.warn("resend_delivery_event_unmatched", { type, email_id: emailId ?? null, recipients });
    return;
  }

  const reminderIds = [...new Set(logs.map((row: any) => String(row.reminder_id ?? "")).filter(Boolean))];
  for (const log of logs as any[]) {
    await col("email_log").updateOne(
      {_id: log._id},
      {$set: {
        delivery_status: type,
        delivery_error: reason,
        delivery_at: new Date(),
      }},
    );
    await col("email_log").insertOne({
      reminder_id: log.reminder_id ?? null,
      user_id: log.user_id ?? null,
      log_type: type === "email.complained" ? "complaint" : "bounce",
      to_address: log.to_address ?? recipients.join(", "),
      recipient: log.recipient ?? recipients.join(", "),
      subject: log.subject ?? null,
      sent_at: new Date(),
      success: 0,
      error: reason,
      provider_message_id: emailId ?? log.provider_message_id ?? null,
      via: "resend",
    } as any);
  }

  for (const reminderId of reminderIds) {
    await col("reminders").updateOne(
      {_id: tryObjectId(reminderId)} as any,
      {$set: {status: "error", updated_at: new Date()}},
    );
    const reminder = await col("reminders").findOne({_id: tryObjectId(reminderId)} as any) as any;
    notifyEmailSendFailed({
      recipient: recipients.join(", ") || String((logs[0] as any)?.to_address ?? ""),
      error: reason,
      title: reminder?.title ?? reminderId,
    });
    logger.warn("reminder_delivery_failed", {
      reminder_id: reminderId,
      delivery_event: type,
      provider_message_id: emailId ?? null,
      recipients,
      reason,
    });
  }
}

export function registerResendWebhook(app: express.Application): void {
  app.post(
    "/api/webhooks/resend",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      // Trimmed, because a variable set to an empty or whitespace-only string
      // passed this guard and then failed inside the SDK as "Secret can't be
      // empty" — a misconfiguration reported as a per-delivery webhook error,
      // once for every bounce Resend sent, rather than as "not configured".
      const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
      if (!secret) {
        logger.warn("resend_webhook_secret_missing", {
          configured: process.env.RESEND_WEBHOOK_SECRET !== undefined,
        });
        res.status(503).json({ error: "RESEND_WEBHOOK_SECRET not configured" });
        return;
      }
      try {
        const payload = typeof req.body === "string"
          ? req.body
          : Buffer.isBuffer(req.body)
            ? req.body.toString("utf8")
            : JSON.stringify(req.body ?? {});
        const {Resend} = await import("resend");
        const client = new Resend(process.env.RESEND_API_KEY);
        const event = client.webhooks.verify({
          payload,
          headers: {
            id: String(req.headers["svix-id"] ?? ""),
            timestamp: String(req.headers["svix-timestamp"] ?? ""),
            signature: String(req.headers["svix-signature"] ?? ""),
          },
          secret,
        } as any) as ResendDeliveryEvent;
        await handleResendDeliveryEvent(event);
        res.json({ ok: true });
      } catch (err) {
        logger.warn("resend_webhook_failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        res.status(400).json({ error: "invalid webhook" });
      }
    },
  );
}
