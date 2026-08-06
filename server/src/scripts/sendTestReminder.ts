import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { MongoClient, ObjectId } from "mongodb";
import { connectDb } from "../db/db.js";
import { sendReminderEmailTo } from "../reminders/emailSender.js";

await connectDb();

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("reminder-app");

const reminder = await db.collection("reminders").findOne({ _id: new ObjectId("6a7455be637d40b675a9b4fa") }) as any;
if (!reminder) {
  console.error("Reminder not found");
  process.exit(1);
}

const result = await sendReminderEmailTo("arshavsky.pasha@gmail.com", reminder);
console.log("Email sent:", result);

await client.close();
process.exit(0);
