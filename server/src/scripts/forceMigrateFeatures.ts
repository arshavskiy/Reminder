import {connectDb} from "../db/db";
import {DEFAULT_FEATURES_NESTED, featuresToNested, normalizeFeatures} from "../features";

async function main() {
  const db = await connectDb();
  const col = db.collection("user_settings");
  const all = await col.find({}).toArray();

  for (const doc of all) {
    const flat = normalizeFeatures(doc.features ?? doc.features_json) ?? {};
    const nested = Object.keys(flat).length > 0 ? featuresToNested(flat) : DEFAULT_FEATURES_NESTED;
    await col.updateOne(
      {_id: doc._id},
      {$set: {features: nested}, $unset: {features_json: ""}}
    );
    console.log("Migrated:", doc.user_id);
    console.log(JSON.stringify(nested, null, 2));
  }

  console.log(`Done. total=${all.length}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
