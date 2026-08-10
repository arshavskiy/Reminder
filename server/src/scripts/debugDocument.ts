import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";
import {col, connectDb} from "../db/db.js";
import {ObjectId} from "mongodb";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const DOC_ID = process.argv[2] ?? "6a79b6b0a9dfdffcd80638d3";

await connectDb();

const doc = await col("documents").findOne({ _id: new ObjectId(DOC_ID) }) as any;
console.log("Document:");
console.log("  processing_status:", doc?.processing_status);
console.log("  user_id:", doc?.user_id);
console.log("  extracted_fields:", doc?.extracted_fields ? JSON.parse(doc.extracted_fields) : null);

const contract = await col("contracts").findOne({ document_id: DOC_ID }) as any
  ?? await col("contracts").findOne({ document_id: new ObjectId(DOC_ID) }) as any;
console.log("\nContract:");
console.log("  _id:", contract?._id);
console.log("  status:", contract?.status);
console.log("  expiry_date:", contract?.expiry_date);
console.log("  user_id:", contract?.user_id);

if (contract) {
  const contractId = contract._id.toString();
  const reminders = await col("reminders").find({
    $or: [{ source_id: contractId }, { document_id: DOC_ID }]
  }).toArray();
  console.log("\nReminders:", reminders.length);
  for (const r of reminders as any[]) {
    console.log("  ", r._id, "status:", r.status, "trigger:", r.trigger_date, "user_id:", r.user_id);
  }
}

process.exit(0);
