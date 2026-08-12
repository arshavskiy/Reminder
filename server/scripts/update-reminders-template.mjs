import dotenv from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";
import {MongoClient, ObjectId} from "mongodb";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const USER_ID = "6a15e851abbd87e1e1071c6e";
const TEMPLATE_ID = "6a7bdf9868af4aa2371ac598";

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB ?? "reminder-app");

// Try ObjectId first, fall back to string
let result = await db.collection("reminders").updateMany(
  { user_id: new ObjectId(USER_ID) },
  { $set: { email_template_id: TEMPLATE_ID } }
);

if (result.matchedCount === 0) {
  result = await db.collection("reminders").updateMany(
    { user_id: USER_ID },
    { $set: { email_template_id: TEMPLATE_ID } }
  );
}

console.log(`matched: ${result.matchedCount}  modified: ${result.modifiedCount}`);
await client.close();
