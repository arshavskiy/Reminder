import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { readFileSync } from "fs";
import { MongoClient } from "mongodb";

const name = "תזכורת בדיקה — פצ׳רסקי (תמונה)";

// The poster is served as a static asset from the Vercel client
// (client/src/public/) — a stable, permanently-public HTTPS URL that Gmail can
// fetch (unlike Railway storage, which redirects to expiring signed URLs, and
// unlike base64, which Gmail blocks).
const posterUrl = process.env.POSTER_URL || "https://app.handcoded.tech/pechersky-reminder-poster.png";
console.log("Poster URL:", posterUrl);

// Load template HTML and bake the poster URL in (poster_url is not a standard
// reminder var; document_url / advance_days stay dynamic).
let html = readFileSync(resolve(__dirname, "../email-templates/reminders/pechersky-inspection-image.html"), "utf-8");
html = html.replace(/\{\{poster_url\}\}/g, posterUrl);

// 3. Seed / update the template in Atlas.
const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("reminder-app");
const now = new Date();

const result = await db.collection("email_templates").findOneAndUpdate(
  { name },
  {
    $set: { html, subject: "תזכורת בדיקה תקופתית — מיכאל פצ׳רסקי", updated_at: now },
    $setOnInsert: { name, is_default: 0, doc_template_id: null, logo_path: null, created_at: now },
  },
  { upsert: true, returnDocument: "after" },
) as any;

console.log("Seeded template:", (result?._id ?? result?.value?._id)?.toString(), name);
await client.close();
process.exit(0);
