import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";
import {col, connectDb} from "../db/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const USER_ID = "6a15e851abbd87e1e1071c6e";

await connectDb();

const counts = await col("reminders").aggregate([
  { $match: { user_id: USER_ID } },
  { $group: { _id: "$status", count: { $sum: 1 } } },
]).toArray();

console.log("Reminders by status:", counts);

const contracts = await col("contracts").aggregate([
  { $match: { user_id: USER_ID } },
  { $group: { _id: "$status", count: { $sum: 1 } } },
]).toArray();

console.log("Contracts by status:", contracts);

// Show a few active contracts
const active = await col("contracts")
  .find({ user_id: USER_ID, status: "active" })
  .sort({ expiry_date: 1 })
  .limit(3)
  .toArray();

console.log("\nSample active contracts:");
for (const c of active as any[]) {
  console.log(" ", c._id, "expiry:", c.expiry_date, "type:", c.contract_type);
}

process.exit(0);
