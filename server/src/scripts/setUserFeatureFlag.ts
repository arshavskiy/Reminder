import {connectDb} from "../db/db";

async function main() {
  const db = await connectDb();
  const userId = "6a15e851abbd87e1e1071c6e";

  const existing = await db.collection("user_settings").findOne({user_id: userId});
  const currentFeatures = (existing?.features && typeof existing.features === "object" && !Array.isArray(existing.features))
    ? existing.features as Record<string, unknown>
    : {};

  // Normalize: flatten any nested objects to dotted keys
  const flatFeatures: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(currentFeatures)) {
    if (typeof v === "boolean") flatFeatures[k] = v;
  }

  // Set the flag
  flatFeatures["dashboard.calendar_filters"] = false;

  const result = await db.collection("user_settings").updateOne(
    {user_id: userId},
    {$set: {features: flatFeatures, updated_at: new Date()}},
    {upsert: true}
  );

  console.log(`Updated user ${userId}: matched ${result.matchedCount}, modified ${result.modifiedCount}`);
  console.log("features now:", JSON.stringify(flatFeatures));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
