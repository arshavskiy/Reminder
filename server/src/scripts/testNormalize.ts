import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";
import {MongoClient, ObjectId} from "mongodb";
import {extractCheckedEquipmentFromHeader, normalizeExtractionFieldsForTemplate} from "../pipeline/importer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const DOC_ID = process.argv[2] || "6a7455b8637d40b675a9b4ca";
const c = new MongoClient(process.env.MONGODB_URI!);
await c.connect();
const db = c.db("reminder-app");
const doc = await db.collection("documents").findOne({ _id: new ObjectId(DOC_ID) });
if (!doc) { console.error("Doc not found"); process.exit(1); }

let template = await db.collection("doc_templates").findOne({ id: doc.template_id });
if (!template && typeof doc.template_id === "string" && /^[a-f0-9]{24}$/.test(doc.template_id)) {
  template = await db.collection("doc_templates").findOne({ _id: new ObjectId(doc.template_id) });
}
if (!template) { console.error("Template not found, template_id:", doc.template_id); process.exit(1); }

// Simulate the raw LLM output that misidentifies equipment
const llmFields: any = JSON.parse(process.argv[3] || JSON.stringify({
  checked_equipment: "מלגזה",
  equipment_description: "מכונת הרמה",
  license_number: "1000",
  report_number: "484590/17917",
}));

console.log("=== INPUT (LLM) ===");
console.log("checked_equipment:", llmFields.checked_equipment);
console.log("license_number:", llmFields.license_number);

console.log("\nextractCheckedEquipmentFromHeader:", JSON.stringify(extractCheckedEquipmentFromHeader(doc.raw_text)));

const result = normalizeExtractionFieldsForTemplate(doc.raw_text, template as any, llmFields as any);

console.log("\n=== OUTPUT (normalized) ===");
console.log("checked_equipment:", result?.checked_equipment);
console.log("license_number:", result?.license_number);
console.log("equipment_description:", result?.equipment_description);

await c.close();
process.exit(0);
