import {MongoClient} from "../../server/node_modules/mongodb/lib/index.js";

const email = process.argv[2] ?? `video-full-demo-${new Date().toISOString().slice(0, 10)}@example.com`;
const client = new MongoClient("mongodb://127.0.0.1:27017");
await client.connect();
const db = client.db("reminder-app");
const user = await db.collection("users").findOne({email})
  ?? await db.collection("users").findOne({email: "video-full-demo-2026-09-11@example.com"})
  ?? await db.collection("users").findOne({email: "video-onboarding-v1-20260910@example.com"});
if (!user) throw new Error(`user not found: ${email}`);
const userId = user._id.toString();
const settings = await db.collection("user_settings").findOne({user_id: userId});
console.log("before", JSON.stringify(settings?.features ?? null));
const features = {
  pages: {
    dashboard: true,
    documents: true,
    invoices: false,
    contracts: true,
    reminders: true,
    reports: true,
    clients: true,
    equipment: true,
    field: true,
    profile: true,
    doc_templates: true,
    email_templates: true,
    settings: true,
    search: true,
    gmail: true,
    print_templates: true,
  },
  dashboard: {
    stat_documents: true,
    stat_clients: true,
    stat_inspections: true,
    stat_pending_reminders: true,
    stat_expiring_soon: true,
    drop_strip: true,
    calendar: true,
    modules: true,
    recent_documents: true,
    upcoming_reminders: true,
    calendar_filters: true,
  },
};
await db.collection("user_settings").updateOne(
  {user_id: userId},
  {$set: {features, updated_at: new Date()}},
  {upsert: true},
);
console.log(`reset features for ${user.email} ${userId}`);
await client.close();
