import {connectDb} from "../db/db";
import {DEFAULT_FEATURES, DEFAULT_FEATURES_NESTED, featuresToNested, normalizeFeatures} from "../features";

async function main() {
  const db = await connectDb();
  const col = db.collection("user_settings");
  const all = await col.find({}).toArray();

  let migrated = 0;
  let skipped = 0;

  for (const doc of all) {
    const features = doc.features;

    // Detect already-clean nested: all top-level values are objects, all leaf values are booleans
    const alreadyNested = features && typeof features === "object" && !Array.isArray(features) &&
      Object.values(features).every((v) => typeof v === "object" && v !== null && !Array.isArray(v)) &&
      Object.values(features).every((v) => Object.values(v as object).every((vv) => typeof vv === "boolean"));

    if (alreadyNested) {
      skipped++;
      continue;
    }

    // normalizeFeatures handles: flat dotted keys, nested objects, string booleans, mixed
    const flat = normalizeFeatures(features ?? doc.features_json) ?? DEFAULT_FEATURES;
    const nested = Object.keys(flat).length > 0 ? featuresToNested(flat) : DEFAULT_FEATURES_NESTED;

    await col.updateOne(
      {_id: doc._id},
      {$set: {features: nested}, $unset: {features_json: ""}}
    );
    migrated++;
    console.log(`Migrated: ${doc.user_id}`);
  }

  console.log(`\nDone. migrated=${migrated} skipped=${skipped} total=${all.length}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
