import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("reminder-app");

const PECHERSKY_USER_ID = "6a15e851abbd87e1e1071c6e";

await db.collection("user_settings").updateOne(
  { user_id: PECHERSKY_USER_ID },
  { $set: { "features.pages.email_templates": true, updated_at: new Date() } }
);
console.log("pages.email_templates enabled for pechersky.m");

await client.close();
process.exit(0);
