import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { connectDb, col } from "../db/db.js";
import { MongoClient, ObjectId } from "mongodb";

await connectDb();

// Check via col()
const settings = await col("user_settings").findOne({ user_id: "6a15e851abbd87e1e1071c6e" }) as any;
console.log("via col() settings:", JSON.stringify(settings));

// Check via direct MongoClient
const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("reminder-app");
const s2 = await db.collection("user_settings").findOne({ user_id: "6a15e851abbd87e1e1071c6e" });
console.log("via direct client settings:", JSON.stringify(s2));
const allSettings = await db.collection("user_settings").find({}).toArray();
console.log("all user_settings:", JSON.stringify(allSettings.map((s: any) => ({ user_id: s.user_id, keys: Object.keys(s) }))));
await client.close();
process.exit(0);
