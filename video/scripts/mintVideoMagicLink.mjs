import {randomBytes} from "node:crypto";
import {MongoClient} from "../../server/node_modules/mongodb/lib/index.js";

const email = process.argv[2] ?? "video-full-demo-2026-09-11@example.com";
const client = new MongoClient("mongodb://127.0.0.1:27017");
await client.connect();
const db = client.db("reminder-app");
const user = await db.collection("users").findOne({email});
if (!user) throw new Error(`user not found: ${email}`);
const token = randomBytes(32).toString("hex");
await db.collection("magic_link_tokens").insertOne({
  token,
  user_id: user._id.toString(),
  created_at: new Date(),
  expires_at: new Date(Date.now() + 30 * 86400000),
});
console.log(`http://localhost:3737/auth/magic?token=${token}`);
await client.close();
