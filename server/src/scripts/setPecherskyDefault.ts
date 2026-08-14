import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { MongoClient, ObjectId } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("reminder-app");

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (key?.startsWith("--") && value && !value.startsWith("--")) {
    args.set(key.slice(2), value);
    i += 1;
  }
}

const templateId = args.get("template-id") ?? process.env.DEFAULT_EMAIL_TEMPLATE_ID;
const userIdArg = args.get("user-id") ?? process.env.DEFAULT_EMAIL_TEMPLATE_USER_ID;
const email = args.get("email") ?? process.env.DEFAULT_EMAIL_TEMPLATE_USER_EMAIL;

if (!templateId) throw new Error("Missing --template-id or DEFAULT_EMAIL_TEMPLATE_ID");
if (!userIdArg && !email) throw new Error("Missing --user-id/--email or DEFAULT_EMAIL_TEMPLATE_USER_ID/DEFAULT_EMAIL_TEMPLATE_USER_EMAIL");

const template = await db.collection("email_templates").findOne({ _id: new ObjectId(templateId) });
if (!template) throw new Error(`Email template ${templateId} was not found`);

let userId = userIdArg;
if (!userId && email) {
  const user = await db.collection("users").findOne({ email }) as any;
  if (!user) throw new Error(`User ${email} was not found`);
  userId = user._id.toString();
}

await db.collection("user_settings").updateOne(
  { user_id: userId },
  { $set: { default_email_template_id: templateId, updated_at: new Date() } },
  { upsert: true }
);
console.log("user_settings default_email_template_id ->", { user_id: userId, email: email ?? null, template_id: templateId });

// is_default flag: clear all, set selected template as the one with is_default=1
// (this controls the badge in the UI)
await db.collection("email_templates").updateMany({}, { $set: { is_default: 0 } });
await db.collection("email_templates").updateOne(
  { _id: new ObjectId(templateId) },
  { $set: { is_default: 1 } }
);
console.log("selected template is_default=1 (badge visible)");

await client.close();
process.exit(0);
