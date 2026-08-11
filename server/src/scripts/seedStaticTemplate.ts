import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";
import {readFileSync} from "fs";
import {MongoClient} from "mongodb";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("reminder-app");

const html = readFileSync(resolve(__dirname, "../email-templates/reminders/pechersky-inspection-static.html"), "utf-8");
const now = new Date();
const name = "תזכורת בדיקה — פצ׳רסקי (סטטי)";

const result = await db.collection("email_templates").findOneAndUpdate(
  { name },
  { $set: { html, subject: `תזכורת בדיקה תקופתית — M.A.D הנדסה וניהול בע"מ`, updated_at: now },
    $setOnInsert: { name, is_default: 0, doc_template_id: null, logo_path: null, created_at: now } },
  { upsert: true, returnDocument: "after" }
) as any;

console.log("Seeded:", (result?._id ?? result?.value?._id)?.toString(), name);
await client.close();
process.exit(0);
