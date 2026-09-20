import webpush from "web-push";
import { col } from "../db/db";
import { logger } from "../logger";

let enabled = false;

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export function initPush(): void {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    logger.warn("push_disabled", { reason: "VAPID keys missing" });
    return;
  }
  webpush.setVapidDetails(
    VAPID_SUBJECT || "mailto:admin@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
  enabled = true;
  logger.info("push_enabled", {});
}

export function isPushEnabled(): boolean {
  return enabled;
}

interface StoredSubscription {
  _id?: unknown;
  user_id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Send to every subscription of a specific user. Dead subs (404/410) are pruned.
export async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!enabled) return;
  const subs = await col<StoredSubscription>("push_subscriptions").find({ user_id: userId }).toArray();
  if (!subs.length) return;
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body);
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await col("push_subscriptions").deleteOne({ _id: sub._id } as any);
        } else {
          logger.warn("push_send_error", { status: err?.statusCode, error: err?.body || err?.message });
        }
      }
    }),
  );
}

// Broadcast to every admin user that has at least one subscription.
export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  if (!enabled) return;
  try {
    const admins = await col("users").find({ role: "admin" }, { projection: { _id: 1 } } as any).toArray();
    await Promise.all(admins.map((u: any) => sendToUser(u._id.toString(), payload)));
  } catch (err) {
    logger.warn("push_broadcast_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}
