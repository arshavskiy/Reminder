import {connectDb} from "../db/db";
import {featuresToNested, normalizeFeatures} from "../features";

async function main() {
  const db = await connectDb();
  const userId = "6a15e851abbd87e1e1071c6e";

  const doc = await db.collection("user_settings").findOne({user_id: userId});
  if (!doc) { console.log("User not found"); process.exit(1); }

  const flat = normalizeFeatures(doc.features) ?? {};
  flat["dashboard.calendar_filters"] = false;
  const nested = featuresToNested(flat);

  await db.collection("user_settings").updateOne(
    {user_id: userId},
    {$set: {features: nested, updated_at: new Date()}}
  );

  console.log("features now:", JSON.stringify(nested, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
