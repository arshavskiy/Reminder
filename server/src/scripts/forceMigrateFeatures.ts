import {connectDb} from "../db/db";
import {DEFAULT_FEATURES_NESTED, featuresToNested, normalizeFeatures} from "../features";

async function main() {
  const db = await connectDb();
  const col = db.collection("user_settings");
  const all = await col.find({}).toArray();

  for (const doc of all) {
    const flat = normalizeFeatures(doc.features ?? doc.features_json) ?? {};
    // Merge: start from full defaults, overlay user's explicit overrides
    const merged: Record<string, Record<string, boolean>> = JSON.parse(JSON.stringify(DEFAULT_FEATURES_NESTED));
    for (const [scope, flags] of Object.entries(featuresToNested(flat))) {
      if (!merged[scope]) merged[scope] = {};
      Object.assign(merged[scope], flags);
    }
    await col.updateOne(
      {_id: doc._id},
      {$set: {features: merged}, $unset: {features_json: ""}}
    );
    console.log("Migrated:", doc.user_id);
    console.log(JSON.stringify(merged, null, 2));
  }

  console.log(`Done. total=${all.length}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
