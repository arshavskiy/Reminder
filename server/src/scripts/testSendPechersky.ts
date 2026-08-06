// Test: send Pechersky reminder email using the new inspection template
// All imports are dynamic to ensure dotenv runs first.
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const DOCUMENT_ID = "6a721bb4ae373f63a758d095";
const RECIPIENT = "arshavsky.pasha@gmail.com";
const TEMPLATE_ID = "6a73a1d0c57da3e065b7b2d1"; // תזכורת בדיקה — פצ׳רסקי

const { connectDb, col } = await import("../db/db.js");
await connectDb();

const { ObjectId } = await import("mongodb");

const doc = await col("documents").findOne({ _id: new ObjectId(DOCUMENT_ID) }) as any;
if (!doc) throw new Error("Document not found — check MONGODB_URI env");
console.log("Document:", doc.file_name);

let reminder = await col("reminders").findOne({ document_id: DOCUMENT_ID }) as any;
if (!reminder) {
  reminder = await col("reminders").findOne({ document_id: new ObjectId(DOCUMENT_ID) as any }) as any;
}
if (!reminder) throw new Error("No reminder for this document");
console.log("Reminder:", reminder._id);

const { sendReminderEmail } = await import("../reminders/emailSender.js");

const reminderCtx: any = {
  ...reminder,
  id: reminder._id.toString(),
  user_id: (doc.user_id ?? reminder.user_id)?.toString(),
  email_template_id: TEMPLATE_ID,
};

console.log("Sending to:", RECIPIENT, "with template:", TEMPLATE_ID);
const result = await sendReminderEmail(reminderCtx, [RECIPIENT]);
console.log("Result:", result);
process.exit(result.success ? 0 : 1);
