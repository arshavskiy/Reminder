import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const reminderId = process.argv[2];
const recipientOverride = process.argv[3]; // optional: send to this email instead of client's

if (!reminderId) {
  console.error("Usage: npx tsx src/scripts/sendReminderById.ts <reminder_id> [email_override]");
  process.exit(1);
}

import { MongoClient, ObjectId } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("reminder-app");

const reminder = await db.collection("reminders").findOne({ _id: new ObjectId(reminderId) }) as any;
if (!reminder) {
  console.error("Reminder not found:", reminderId);
  await client.close();
  process.exit(1);
}

const clientDoc = reminder.client_id
  ? await db.collection("clients").findOne({ _id: new ObjectId(String(reminder.client_id)) }) as any
  : null;
const documentDoc = reminder.document_id
  ? await db.collection("documents").findOne({ _id: new ObjectId(String(reminder.document_id)) }) as any
  : null;

console.log("=== Reminder ===");
console.log("title:", reminder.title);
console.log("trigger_date:", reminder.trigger_date);
console.log("advance_days:", reminder.advance_days);
console.log("client:", clientDoc?.display_name ?? "(none)");
console.log("document:", documentDoc?.file_name ?? "(none)");
console.log("equipment_type:", reminder.equipment_type ?? "(none)");
console.log("user_id:", reminder.user_id);

const recipient = recipientOverride ?? clientDoc?.email ?? null;
if (!recipient) {
  console.error("No recipient — pass an email override as second argument");
  await client.close();
  process.exit(1);
}

console.log("\nSending to:", recipient);
await client.close();

// Use the real email sender
const { sendReminderEmail } = await import("../reminders/emailSender.js");

const reminderWithContext = {
  ...reminder,
  id: reminder._id.toString(),
  client_name: clientDoc?.display_name ?? null,
  document_name: documentDoc?.file_name ?? null,
  // override recipient
  _recipientOverride: recipient,
} as any;

// Patch: sendReminderEmail reads client email from DB — easier to just call previewReminderEmail
// and send via Resend directly
const { previewReminderEmail } = await import("../reminders/emailSender.js");
const { subject, html } = await previewReminderEmail(reminderWithContext);

console.log("\nSubject:", subject);
console.log("Template rendered, sending...");

const { Resend } = await import("resend");
const resend = new Resend(process.env.RESEND_API_KEY!);
const settings = (await import("../settings.js")).getSettings();
const from = settings.emailFromName
  ? `${settings.emailFromName} <${settings.emailFrom || "noreply@handcoded.tech"}>`
  : (settings.emailFrom || "noreply@handcoded.tech");

const result = await resend.emails.send({ from, to: recipient, subject, html });
if (result.error) {
  console.error("Send failed:", result.error);
  process.exit(1);
}
console.log("Sent! id:", result.data?.id);
process.exit(0);
