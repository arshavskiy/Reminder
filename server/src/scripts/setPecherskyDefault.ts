import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { MongoClient, ObjectId } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("reminder-app");

const STATIC_TEMPLATE_ID = "6a746437c57da3e065b88b7a";
const PECHERSKY_USER_ID = "6a15e851abbd87e1e1071c6e";

// pechersky user_settings → static template
await db.collection("user_settings").updateOne(
  { user_id: PECHERSKY_USER_ID },
  { $set: { default_email_template_id: STATIC_TEMPLATE_ID, updated_at: new Date() } },
  { upsert: true }
);
console.log("pechersky.m user_settings → static", STATIC_TEMPLATE_ID);

// is_default flag: clear all, set static as the one with is_default=1
// (this controls the badge in the UI)
await db.collection("email_templates").updateMany({}, { $set: { is_default: 0 } });
await db.collection("email_templates").updateOne(
  { _id: new ObjectId(STATIC_TEMPLATE_ID) },
  { $set: { is_default: 1 } }
);
console.log("static template is_default=1 (badge visible)");

await client.close();
process.exit(0);
