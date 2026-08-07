/**
 * Verifies the server push pipeline end-to-end against a REAL browser-generated
 * subscription. Paste a subscription JSON (from DevTools:
 *   navigator.serviceWorker.ready
 *     .then(r => r.pushManager.getSubscription())
 *     .then(s => JSON.stringify(s))
 * ) as argv[2], or set TEST_PUSH_SUB env var. Then this signs + sends a test
 * notification through web-push exactly as sendPushToAdmins would.
 */
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import webpush from "web-push";

const raw = process.argv[2] || process.env.TEST_PUSH_SUB;
if (!raw) {
  console.error("Usage: tsx testPushPipeline.ts '<subscription-json>'");
  process.exit(1);
}
const sub = JSON.parse(raw);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

const payload = JSON.stringify({
  title: "בדיקת התראה",
  body: "צינור ה-push עובד מקצה לקצה ✓",
  data: { url: "/#/admin" },
});

try {
  const res = await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: sub.keys },
    payload,
  );
  console.log("SENT ok — statusCode:", res.statusCode);
} catch (err: any) {
  console.error("SEND FAILED — statusCode:", err?.statusCode, "body:", err?.body || err?.message);
  process.exit(1);
}
process.exit(0);
