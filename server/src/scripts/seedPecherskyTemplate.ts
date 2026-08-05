// One-time script: insert Pechersky inspection template and set as user default.
// Run: npx tsx src/scripts/seedPecherskyTemplate.ts
import { config } from "dotenv";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { MongoClient, ObjectId } from "mongodb";

async function main() {
  const uri = process.env.MONGODB_URI!;
  if (!uri) throw new Error("MONGODB_URI not set");
  console.log("Connecting to Atlas...");
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("reminder-app");

  const html = readFileSync(
    resolve(__dirname, "../email-templates/reminders/pechersky-inspection.html"),
    "utf-8"
  );

  const now = new Date();
  const templateName = "תזכורת בדיקה — פצ׳רסקי";

  // Upsert the template
  const result = await db.collection("email_templates").findOneAndUpdate(
    { name: templateName },
    {
      $set: {
        html,
        subject: "[תזכורת בדיקה] {{client_company}} — {{advance_days}} ימים לבדיקה",
        updated_at: now,
      },
      $setOnInsert: {
        name: templateName,
        is_default: 0,
        doc_template_id: null,
        logo_path: null,
        created_at: now,
      },
    },
    { upsert: true, returnDocument: "after" }
  ) as any;

  const templateId = (result?._id ?? result?.value?._id)?.toString();
  if (!templateId) throw new Error("Failed to upsert template");
  console.log("Template upserted, id:", templateId);

  // Find the user
  const user = await db.collection("users").findOne({ email: "pechersky.m@gmail.com" }) as any;
  if (!user) throw new Error("User pechersky.m@gmail.com not found in Atlas");
  const userId = user._id.toString();
  console.log("User found, id:", userId);

  // Set default_email_template_id in user_settings
  await db.collection("user_settings").updateOne(
    { user_id: userId },
    { $set: { default_email_template_id: templateId, updated_at: now } },
    { upsert: true }
  );
  console.log("Done — default template set for", user.email);

  await client.close();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
