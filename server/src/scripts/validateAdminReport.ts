import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const { connectDb, col } = await import("../db/db.js");
await connectDb();

const USER_ID = process.argv[2] || "6a10a0e0453ac80348bb04b3";

// Replicate admin monitor/reminders failedSends query
const sends = await col("email_log").find(
  { log_type: { $in: ["send", "reminder"] } },
  { projection: { _id: 1, user_id: 1, recipient: 1, to_address: 1, success: 1, error: 1, sent_at: 1, reminder_id: 1 } } as any,
).sort({ sent_at: -1 }).limit(25).toArray();

console.log(`\n=== email_log log_type=send (latest 25) ===`);
console.log(`total send rows: ${sends.length}`);
const withUser = sends.filter((s: any) => s.user_id).length;
const withRecipient = sends.filter((s: any) => (s.recipient ?? s.to_address)).length;
console.log(`with user_id: ${withUser}/${sends.length}`);
console.log(`with recipient: ${withRecipient}/${sends.length}`);

console.log(`\nsample rows (as admin report renders them):`);
for (const s of sends.slice(0, 5)) {
  console.log({
    user_id: (s as any).user_id,
    recipient: (s as any).recipient ?? (s as any).to_address ?? null,
    success: (s as any).success,
    sent_at: (s as any).sent_at,
  });
}

// User-detail emailLogs query
const userLogs = await col("email_log").find(
  { user_id: USER_ID },
  { projection: { log_type: 1, success: 1, recipient: 1, to_address: 1, subject: 1, sent_at: 1 } } as any,
).sort({ sent_at: -1 }).limit(25).toArray();

console.log(`\n=== user-detail emailLogs for ${USER_ID} ===`);
console.log(`rows: ${userLogs.length}`);
const byType: Record<string, number> = {};
for (const l of userLogs) byType[(l as any).log_type] = (byType[(l as any).log_type] ?? 0) + 1;
console.log(`by log_type:`, byType);
const recipientsOk = userLogs.filter((l: any) => (l.recipient ?? l.to_address)).length;
console.log(`with recipient: ${recipientsOk}/${userLogs.length}`);

process.exit(0);
