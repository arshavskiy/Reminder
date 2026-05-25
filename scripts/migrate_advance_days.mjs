import {MongoClient} from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB ?? "reminder-app");
const result = await db.collection("user_settings").updateMany(
  { reminder_advance_days: { $in: ["[90,60,30]", "[30,60,90]"] } },
  { $set: { reminder_advance_days: "[30]" } }
);
console.log(`Updated ${result.modifiedCount} user_settings document(s) → reminder_advance_days: "[30]"`);
await client.close();
