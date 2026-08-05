// Debug: check Atlas for pechersky user and specific document
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { MongoClient, ObjectId } from "mongodb";

async function main() {
  const uri = process.env.MONGODB_URI!;
  console.log("Connecting to:", uri.substring(0, 30) + "...");
  const client = new MongoClient(uri);
  await client.connect();

  // Try to find the database
  const admin = client.db("admin");
  const dbs = await admin.command({ listDatabases: 1 });
  console.log("Databases:", dbs.databases?.map((d: any) => d.name).join(", "));

  // Try multiple DB names
  for (const dbName of ["reminder-app", "reminder", "reminderapp", "ReminderApp"]) {
    const db = client.db(dbName);
    const userCount = await db.collection("users").countDocuments();
    if (userCount > 0) {
      console.log(`DB "${dbName}" users: ${userCount}`);
      const u = await db.collection("users").findOne({ email: /pechersky/i });
      console.log("pechersky:", u ? JSON.stringify({ _id: u._id, email: u.email }) : "not found");
      const doc = await db.collection("documents").findOne({ _id: new ObjectId("6a721bb4ae373f63a758d095") });
      console.log("document:", doc ? JSON.stringify({ user_id: doc.user_id, spaces_key: doc.spaces_key, file_name: doc.file_name }) : "not found");
      break;
    }
  }

  await client.close();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
