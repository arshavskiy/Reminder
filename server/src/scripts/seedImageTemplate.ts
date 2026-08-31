import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";
import {readFileSync} from "fs";
import {MongoClient} from "mongodb";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const name = "תזכורת בדיקה — פצ׳רסקי (תמונה)";

// poster_url is stored as a template FIELD (not baked into the HTML). The
// render layer substitutes {{poster_url}} from this field, so the raw template
// HTML keeps the placeholder and stays editable in the app UI.
const posterUrl = process.env.POSTER_URL || "https://remindocr.com/pechersky-reminder-poster.png";
console.log("Poster URL:", posterUrl);

// Load template HTML as-is ({{poster_url}} placeholder preserved).
const html = readFileSync(resolve(__dirname, "../email-templates/reminders/pechersky-inspection-image.html"), "utf-8");

// Seed / update the template in Atlas.
const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("reminder-app");
const now = new Date();

const result = await db.collection("email_templates").findOneAndUpdate(
  { name },
  {
    $set: { html, poster_url: posterUrl, subject:`תזכורת בדיקה תקופתית — {{engineer_company|חברה בע"מ}}`, updated_at: now },
    $setOnInsert: { name, is_default: 0, doc_template_id: null, logo_path: null, example_document_url: null, created_at: now },
  },
  { upsert: true, returnDocument: "after" },
) as any;

console.log("Seeded template:", (result?._id ?? result?.value?._id)?.toString(), name);
await client.close();
process.exit(0);
