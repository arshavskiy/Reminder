import {randomBytes} from "node:crypto";
import {MongoClient, ObjectId} from "../../server/node_modules/mongodb/lib/index.js";

const sourceEmail = process.argv[2] ?? "video-onboarding-v1-20260910@example.com";
const email = process.argv[3] ?? `video-full-demo-${new Date().toISOString().slice(0, 10)}@example.com`;
const client = new MongoClient("mongodb://127.0.0.1:27017");
await client.connect();
const db = client.db("reminder-app");
const source = await db.collection("users").findOne({email: sourceEmail});
if (!source) throw new Error(`Source demo user not found: ${sourceEmail}`);
const previous = await db.collection("users").findOne({email});
if (previous) {
    const userId = previous._id.toString();
    for (const name of ["documents", "clients", "reminders", "equipment", "payment_requests", "sessions", "magic_link_tokens", "user_settings"]) {
        await db.collection(name).deleteMany({user_id: userId});
    }
    await db.collection("users").deleteOne({_id: previous._id});
}
const userId = new ObjectId();
const {_id: _sourceId, ...user} = source;
await db.collection("users").insertOne({
    ...user,
    _id: userId,
    email,
    plan: "business",
    trial_ends_at: null,
    created_at: new Date(),
    updated_at: new Date()
});
const settings = await db.collection("user_settings").findOne({user_id: source._id.toString()});
if (settings) {
    const {_id: _settingsId, ...copy} = settings;
    await db.collection("user_settings").insertOne({
        ...copy,
        user_id: userId.toString(),
        plan: "business",
        updated_at: new Date()
    });
}
const token = randomBytes(32).toString("hex");
await db.collection("magic_link_tokens").insertOne({
    token,
    user_id: userId.toString(),
    created_at: new Date(),
    expires_at: new Date(Date.now() + 30 * 86400000)
});
console.log(`http://localhost:3737/auth/magic?token=${token}`);
await client.close();
