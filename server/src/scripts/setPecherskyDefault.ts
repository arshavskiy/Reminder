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
const DYNAMIC_TEMPLATE_ID = "6a73a1d0c57da3e065b7b2d1";
const PECHERSKY_USER_ID = "6a15e851abbd87e1e1071c6e";

// pechersky → static template
await db.collection("user_settings").updateOne(
  { user_id: PECHERSKY_USER_ID },
  { $set: { default_email_template_id: STATIC_TEMPLATE_ID, updated_at: new Date() } },
  { upsert: true }
);
console.log("pechersky.m → static", STATIC_TEMPLATE_ID);

// dynamic → global default (is_default: 1), clear others
await db.collection("email_templates").updateMany({}, { $set: { is_default: 0 } });
await db.collection("email_templates").updateOne(
  { _id: new ObjectId(DYNAMIC_TEMPLATE_ID) },
  { $set: { is_default: 1 } }
);
console.log("dynamic template → global default");

await client.close();
process.exit(0);
