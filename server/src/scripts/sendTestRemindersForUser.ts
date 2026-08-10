/**
 * Send all pending reminders for a user to a test email address.
 * Run: npx tsx src/scripts/sendTestRemindersForUser.ts
 */
import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";
import {col, connectDb} from "../db/db.js";
import {sendReminderEmailTo} from "../reminders/emailSender.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const USER_ID = process.argv[2] ?? "6a15e851abbd87e1e1071c6e";
const TEST_EMAIL = process.argv[3] ?? "arshavsky.pasha@gmail.com";

await connectDb();

let userOid: any;
try { const { ObjectId } = await import("mongodb"); userOid = new ObjectId(USER_ID); } catch {}

const reminders = await col("reminders")
  .find({ $or: [{ user_id: USER_ID }, ...(userOid ? [{ user_id: userOid }] : [])], status: "pending" })
  .sort({ trigger_date: 1 })
  .limit(5)
  .toArray();

console.log(`Found ${reminders.length} pending reminders`);

for (const reminder of reminders as any[]) {
  console.log(`\nSending reminder ${reminder._id} trigger=${reminder.trigger_date} title=${reminder.title}`);
  try {
    const result = await sendReminderEmailTo(TEST_EMAIL, reminder);
    console.log("  Result:", result);
  } catch (e: any) {
    console.error("  Error:", e.message);
  }
}

console.log("\nDone.");
process.exit(0);
