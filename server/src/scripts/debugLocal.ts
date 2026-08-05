import { connectDb, col } from "../db/db.js";
import { MongoClient } from "mongodb";

async function main() {
  const client = new MongoClient("mongodb://127.0.0.1:27017");
  await client.connect();
  const db = client.db("reminder-app");
  const colls = await db.listCollections().toArray();
  console.log("collections:", colls.map(c => c.name).join(", "));
  const count = await db.collection("users").countDocuments();
  console.log("users:", count);
  if (count > 0) {
    const u = await db.collection("users").findOne({ email: /pechersky/i });
    console.log("pechersky user:", u ? JSON.stringify({ _id: u._id, email: u.email }) : "not found");
    const u2 = await db.collection("users").findOne({});
    console.log("sample user keys:", u2 ? Object.keys(u2).join(", ") : "none");
  }
  // Also check the document
  const { ObjectId } = await import("mongodb");
  const doc = await db.collection("documents").findOne({ _id: new ObjectId("6a721bb4ae373f63a758d095") });
  console.log("document 6a721bb4:", doc ? JSON.stringify({ _id: doc._id, user_id: doc.user_id, spaces_key: doc.spaces_key, file_name: doc.file_name }) : "not found");
  await client.close();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
