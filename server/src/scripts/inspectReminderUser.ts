import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { MongoClient, ObjectId } from "mongodb";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const USER_ID = process.argv[2] || "6a10a0e0453ac80348bb04b3";
const c = new MongoClient(process.env.MONGODB_URI!);
await c.connect();
const db = c.db("reminder-app");

const user = await db.collection("users").findOne({ _id: new ObjectId(USER_ID) });
console.log("USER:", user ? { id: user._id.toString(), email: user.email, name: user.name } : "NOT FOUND");

const remCount = await db.collection("reminders").countDocuments({ user_id: USER_ID });
console.log("existing reminders for user:", remCount);

const sample = await db.collection("reminders").findOne({ user_id: USER_ID });
console.log("\nSAMPLE REMINDER (this user):");
console.log(JSON.stringify(sample, null, 2));

if (!sample) {
  const anySample = await db.collection("reminders").findOne({ status: "pending" });
  console.log("\nSAMPLE REMINDER (any user, for schema):");
  console.log(JSON.stringify(anySample, null, 2));
}

// email templates available
const templates = await db.collection("email_templates").find({}, { projection: { _id: 1, name: 1 } }).toArray();
console.log("\nEMAIL TEMPLATES:", templates.map((t: any) => ({ id: t._id.toString(), name: t.name })));

await c.close();
process.exit(0);
