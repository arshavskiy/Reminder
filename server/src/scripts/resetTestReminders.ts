import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const { connectDb, col } = await import("../db/db.js");
await connectDb();

const USER_ID = process.argv[2] || "6a10a0e0453ac80348bb04b3";

const today = new Date();
const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

const result = await col("reminders").updateMany(
  { user_id: USER_ID, source_type: "test_batch" },
  { $set: { trigger_date: dateStr, status: "pending", updated_at: new Date() } }
);

console.log(`\nMatched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
console.log(`All test_batch reminders → trigger_date=${dateStr}, status=pending\n`);

const counts = await col("reminders").aggregate([
  { $match: { user_id: USER_ID } },
  { $group: { _id: "$status", count: { $sum: 1 } } },
]).toArray();
console.log("user reminder status counts:", counts);

process.exit(0);
