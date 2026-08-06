import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { MongoClient, ObjectId } from "mongodb";

const userId = "6a15e851abbd87e1e1071c6e";
const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("reminder-app");

const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
if (!user) { console.error("User not found"); process.exit(1); }

const membershipStart = user.created_at
  ? new Date(user.created_at).toISOString().slice(0, 10)
  : new Date().toISOString().slice(0, 10);

const reminderCount = await db.collection("reminders").countDocuments({ user_id: userId });

console.log("user created_at:", user.created_at);
console.log("membership_start_date:", membershipStart);
console.log("reminder count:", reminderCount);

await db.collection("engineer_profiles").updateOne(
  { user_id: userId },
  { $set: { membership_start_date: membershipStart, inspector_id_start: String(reminderCount), updated_at: new Date().toISOString() } },
  { upsert: true },
);

console.log("Done.");
await client.close();
process.exit(0);
