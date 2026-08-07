import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const { connectDb, col } = await import("../db/db.js");
await connectDb();
const { sendTestEmail } = await import("../reminders/emailSender.js");

const TO = process.argv[2] || "arshavsky.pasha@gmail.com";
const TEMPLATE_NAME = "תזכורת בדיקה — פצ׳רסקי (תמונה)";

const tpl = await col("email_templates").findOne({ name: TEMPLATE_NAME }) as any;
if (!tpl) { console.error("Template not found:", TEMPLATE_NAME); process.exit(1); }
const templateId = tpl._id.toString();
console.log("Template:", templateId, TEMPLATE_NAME);
console.log("Sending to:", TO, "via", process.env.RESEND_API_KEY ? "resend" : "smtp");

const result = await sendTestEmail(TO, templateId);
console.log("Result:", JSON.stringify(result));
process.exit(result.success ? 0 : 1);
