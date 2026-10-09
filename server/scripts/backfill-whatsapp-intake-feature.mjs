// One-time backfill: seeds the channels.whatsapp_intake feature definition
// and sets it to true on all user_settings docs that don't have it yet.
// Run: cd server && node scripts/backfill-whatsapp-intake-feature.mjs
import dotenv from "dotenv";
dotenv.config();
import {MongoClient} from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB);

const featureDef = {
  key: "channels.whatsapp_intake",
  scope: "channels",
  label_he: "קבלת מסמכים בוואטסאפ",
  label_en: "WhatsApp document intake",
  description_he: "קבלת מסמכים ותמונות דרך WhatsApp לעיבוד אוטומטי.",
  default_enabled: true,
  sort_order: 410,
  updated_at: new Date(),
};
await db.collection("features").updateOne(
  {key: "channels.whatsapp_intake"},
  {$set: featureDef, $setOnInsert: {key: "channels.whatsapp_intake", created_at: new Date()}},
  {upsert: true},
);
console.log("Upserted channels.whatsapp_intake feature definition.");

const result = await db.collection("user_settings").updateMany(
  {"features.channels\\.whatsapp_intake": {$exists: false}},
  {$set: {"features.channels\\.whatsapp_intake": true}},
);
console.log(`Backfilled channels.whatsapp_intake=true on ${result.modifiedCount} user_settings docs.`);

await client.close();
