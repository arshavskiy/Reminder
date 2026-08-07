import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { MongoClient, ObjectId } from "mongodb";
const c = new MongoClient(process.env.MONGODB_URI!);
await c.connect();
const doc = await c.db("reminder-app").collection("documents").findOne({ _id: new ObjectId(process.argv[2] || "6a7455b9637d40b675a9b4d1") });
console.log("license_number:", doc?.extracted_fields?.license_number);
console.log("checked_equipment:", doc?.extracted_fields?.checked_equipment);
console.log("equipment_description:", doc?.extracted_fields?.equipment_description);
console.log("\n--- RAW TEXT (first 3000 chars) ---");
console.log(doc?.raw_text?.substring(0, 3000));
await c.close();
process.exit(0);
