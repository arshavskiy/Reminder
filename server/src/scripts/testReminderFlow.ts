import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { MongoClient, ObjectId } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("reminder-app");

const PECHERSKY_USER_ID = "6a15e851abbd87e1e1071c6e";
const OTHER_USER_ID = "6a721bb4ae373f63a758d010"; // adjust if needed — we'll scan

// Check pechersky's personal default
const pecherskySettings = await db.collection("user_settings").findOne({ user_id: PECHERSKY_USER_ID });
console.log("=== Pechersky ===");
console.log("personal default_email_template_id:", (pecherskySettings as any)?.default_email_template_id ?? "(none)");

// Check global default
const globalDefault = await db.collection("email_templates").findOne({ is_default: 1 });
console.log("\n=== Global default template (is_default=1) ===");
console.log("id:", (globalDefault as any)?._id?.toString());
console.log("name:", (globalDefault as any)?.name);

// List all templates
const templates = await db.collection("email_templates").find({}).sort({ name: 1 }).toArray();
console.log("\n=== All email templates ===");
for (const t of templates) {
  console.log(`  ${(t as any)._id} | is_default=${(t as any).is_default} | ${(t as any).name}`);
}

// Simulate which template pechersky would get
const personalTemplateId = (pecherskySettings as any)?.default_email_template_id;
if (personalTemplateId) {
  const tpl = await db.collection("email_templates").findOne({ _id: new ObjectId(personalTemplateId) });
  console.log("\n=== Pechersky would receive: ===");
  console.log("template:", (tpl as any)?.name, "(personal default)");
} else if (globalDefault) {
  console.log("\n=== Pechersky would receive: ===");
  console.log("template:", (globalDefault as any)?.name, "(global default — no personal set)");
} else {
  console.log("\nNo template found for pechersky!");
}

// Check another user (first user that isn't pechersky)
const otherSettings = await db.collection("user_settings").findOne({
  user_id: { $ne: PECHERSKY_USER_ID },
  user_id2: { $exists: false }
});
const anyOtherSettings = await db.collection("user_settings").findOne({
  user_id: { $ne: PECHERSKY_USER_ID }
});
if (anyOtherSettings) {
  const otherId = (anyOtherSettings as any).user_id;
  const otherPersonal = (anyOtherSettings as any).default_email_template_id;
  console.log(`\n=== Other user (${otherId}) ===`);
  console.log("personal default:", otherPersonal ?? "(none)");
  if (otherPersonal) {
    const t = await db.collection("email_templates").findOne({ _id: new ObjectId(otherPersonal) });
    console.log("would receive:", (t as any)?.name, "(personal)");
  } else {
    console.log("would receive:", (globalDefault as any)?.name ?? "none", "(global default)");
  }
}

await client.close();
process.exit(0);
