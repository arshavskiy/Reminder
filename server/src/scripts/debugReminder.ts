import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";
import {col, connectDb} from "../db/db.js";
import {ObjectId} from "mongodb";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const REMINDER_ID = "6a61256d5c7d9e84b9f40d20";

await connectDb();

const reminder = await col("reminders").findOne({ _id: new ObjectId(REMINDER_ID) });
console.log("Reminder:", JSON.stringify(reminder, null, 2));

// Also check user_id type
const all = await col("reminders").find({}).limit(3).toArray();
console.log("\nSample user_id values:");
for (const r of all as any[]) {
  console.log(" ", typeof r.user_id, JSON.stringify(r.user_id));
}

process.exit(0);
