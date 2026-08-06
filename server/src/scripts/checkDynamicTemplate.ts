import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { MongoClient, ObjectId } from "mongodb";
const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("reminder-app");

// Check what template Pechersky user is set to use
const settings = await db.collection("user_settings").findOne({ user_id: "6a15e851abbd87e1e1071c6e" });
console.log("user_settings default_email_template_id:", settings?.default_email_template_id);

// Check dynamic template
const tpl = await db.collection("email_templates").findOne({ _id: new ObjectId("6a73a1d0c57da3e065b7b2d1") });
console.log("dynamic template updated_at:", tpl?.updated_at);
console.log("has client_company#:", tpl?.html?.includes("client_company#") ? "YES (OLD!)" : "NO");
console.log("has {{else}}:", tpl?.html?.includes("{{else}}") ? "YES (OLD!)" : "NO");
console.log("has direction:ltr:", tpl?.html?.includes("direction:ltr") ? "YES" : "NO");
console.log("html length:", tpl?.html?.length);

await client.close();
process.exit(0);
