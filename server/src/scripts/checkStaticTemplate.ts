import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { MongoClient, ObjectId } from "mongodb";
const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("reminder-app");
const tpl = await db.collection("email_templates").findOne({ _id: new ObjectId("6a746437c57da3e065b88b7a") });
console.log("updated_at:", tpl?.updated_at);
console.log("has comp_logo:", tpl?.html?.includes("comp_logo") ? "YES" : "NO");
console.log("has BRAND BAR:", tpl?.html?.includes("COMPANY BRAND BAR") ? "YES" : "NO");
console.log("html length:", tpl?.html?.length);
await client.close();
process.exit(0);
