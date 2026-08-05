// Test: send Pechersky reminder email for document 6a721bb4ae373f63a758d095
// Run: npx tsx src/scripts/testSendPechersky.ts
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const DOCUMENT_ID = "6a721bb4ae373f63a758d095";
const RECIPIENT = "arshavsky.pasha@gmail.com";

async function main() {
  const { connectDb, col } = await import("../db/db.js");
  await connectDb();

  const { ObjectId } = await import("mongodb");

  // Load document
  const doc = await col("documents").findOne({ _id: new ObjectId(DOCUMENT_ID) }) as any;
  if (!doc) throw new Error(`Document ${DOCUMENT_ID} not found`);
  console.log("Document:", doc.file_name);

  // Find an existing reminder for this document
  let reminder = await col("reminders").findOne({ document_id: DOCUMENT_ID }) as any;
  if (!reminder) {
    // Try with ObjectId
    reminder = await col("reminders").findOne({ document_id: new ObjectId(DOCUMENT_ID) as any }) as any;
  }
  console.log("Reminder:", reminder ? reminder._id : "not found — will synthesize");

  const userId = doc.user_id.toString();
  const { sendReminderEmail } = await import("../reminders/emailSender.js");

  let reminderCtx: any;

  if (reminder) {
    reminderCtx = {
      ...reminder,
      id: reminder._id.toString(),
      user_id: userId,
    };
  } else {
    // No reminder — synthesize a minimal context so buildEmailVars can pull doc data
    const client = doc.client_id
      ? await col("clients").findOne({ _id: new ObjectId(doc.client_id) }) as any
      : null;

    reminderCtx = {
      id: "test-preview",
      user_id: userId,
      document_id: DOCUMENT_ID,
      client_id: doc.client_id ?? null,
      title: doc.file_name ?? "בדיקה תקופתית",
      trigger_date: doc.expiry_date ?? new Date().toISOString().slice(0, 10),
      advance_days: "30",
      body: null,
      client_name: client?.display_name ?? client?.name ?? null,
      document_name: doc.file_name ?? null,
    };
  }

  console.log("Sending to:", RECIPIENT);
  const result = await sendReminderEmail(reminderCtx, [RECIPIENT]);
  console.log("Result:", result);
  process.exit(result.success ? 0 : 1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
