/**
 * Seeds pechersky-inspection-plain email template then sends it
 * to a test address using the first pending reminder in DB.
 *
 * Usage (from server/):
 *   node scripts/test-send-plain-template.mjs [--to email@example.com]
 */

import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const TO = (() => {
  const idx = process.argv.indexOf("--to");
  return idx !== -1 ? process.argv[idx + 1] : "arshavsky.pasha@gmail.com";
})();

const MONGODB_URI = process.env.MONGODB_LOCAL_URI ?? process.env.MONGODB_URI;
const MONGODB_DB  = process.env.MONGODB_DB ?? "reminder-app";

if (!MONGODB_URI) { console.error("No MONGODB_URI"); process.exit(1); }

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db(MONGODB_DB);

// ── 1. Seed / upsert the plain template ──────────────────────────────────────
const htmlPath = resolve(__dirname, "../src/email-templates/reminders/pechersky-inspection-plain.html");
const html = readFileSync(htmlPath, "utf8");
const TEMPLATE_NAME = "בדיקה תקופתית — טקסט בלבד";

const now = new Date();
const { upsertedId } = await db.collection("email_templates").updateOne(
  { name: TEMPLATE_NAME },
  {
    $set:         { html, subject: "תזכורת בדיקה תקופתית — {{engineer_company|M.A.D הנדסה וניהול בע\"מ}}", updated_at: now },
    $setOnInsert: { name: TEMPLATE_NAME, is_default: 0, doc_template_id: null, logo_path: null, created_at: now },
  },
  { upsert: true }
);

const tplDoc = await db.collection("email_templates").findOne({ name: TEMPLATE_NAME });
console.log(`Template saved: ${tplDoc._id} (${upsertedId ? "inserted" : "updated"})`);

// ── 2. Pick a real reminder ───────────────────────────────────────────────────
const reminder = await db.collection("reminders").findOne(
  {},
  { sort: { created_at: -1 } }
);

if (!reminder) { console.error("No reminders in DB"); await client.close(); process.exit(1); }
console.log(`Using reminder: ${reminder._id} — ${reminder.title ?? "(no title)"}`);

// ── 3. Dynamically import emailSender (ESM, needs tsx) ───────────────────────
// Run via: node --import tsx/esm scripts/test-send-plain-template.mjs
const { connectDb } = await import(
  pathToFileURL(resolve(__dirname, "../src/db/db.ts")).href
);
await connectDb();

const { sendReminderEmail } = await import(
  pathToFileURL(resolve(__dirname, "../src/reminders/emailSender.ts")).href
);

// Temporarily promote our template to is_default=1, demote current default
const currentDefault = await db.collection("email_templates").findOne({ is_default: 1 });
if (currentDefault && currentDefault.name !== TEMPLATE_NAME) {
  await db.collection("email_templates").updateOne({ _id: currentDefault._id }, { $set: { is_default: 0 } });
}
await db.collection("email_templates").updateOne({ name: TEMPLATE_NAME }, { $set: { is_default: 1 } });

const reminderWithTpl = { ...reminder, email_to: TO, client_email: TO };
const result = await sendReminderEmail(reminderWithTpl, [TO]);

// Restore
await db.collection("email_templates").updateOne({ name: TEMPLATE_NAME }, { $set: { is_default: 0 } });
if (currentDefault && currentDefault.name !== TEMPLATE_NAME) {
  await db.collection("email_templates").updateOne({ _id: currentDefault._id }, { $set: { is_default: 1 } });
}
console.log("Send result:", JSON.stringify(result, null, 2));

await client.close();
