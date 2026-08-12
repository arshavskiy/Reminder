import dotenv from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";
import {MongoClient, ObjectId} from "mongodb";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const USER_ID = "6a15e851abbd87e1e1071c6e";
const FEATURE_KEY = "pages.gmail";
const FEATURE_VALUE = false;

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB ?? "reminder-app");

const result = await db.collection("users").updateOne(
  { _id: new ObjectId(USER_ID) },
  { $set: { [`features.${FEATURE_KEY}`]: FEATURE_VALUE } }
);

console.log(`matched: ${result.matchedCount}  modified: ${result.modifiedCount}`);
await client.close();
