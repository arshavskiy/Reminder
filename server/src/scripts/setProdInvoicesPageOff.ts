import "./loadEnv";
import {closeDb, col, connectDb, runWithDbTarget} from "../db/db";
import {DEFAULT_FEATURES, featuresToNested, normalizeFeatures} from "../features";

const apply = process.argv.includes("--apply");
const production = process.argv.includes("--production");
if (production && !process.env.MONGODB_PRODUCTION_URI) {
  throw new Error("--production needs MONGODB_PRODUCTION_URI");
}

await connectDb();
await runWithDbTarget(production ? "production" : "local", async () => {
  const settings = await col("user_settings").find({}).project({user_id: 1, features: 1, features_json: 1}).toArray() as any[];
  const users = await col("users").find({}).project({_id: 1, email: 1}).toArray() as any[];
  const settingsByUser = new Map(settings.map((row) => [String(row.user_id), row]));

  let alreadyOff = 0;
  let toUpdate = 0;
  let toCreate = 0;
  let updated = 0;
  let created = 0;

  for (const row of settings) {
    const flat = {...DEFAULT_FEATURES, ...(normalizeFeatures(row.features ?? row.features_json) ?? {})};
    if (flat["pages.invoices"] === false) {
      alreadyOff += 1;
      continue;
    }
    toUpdate += 1;
    if (!apply) continue;
    flat["pages.invoices"] = false;
    await col("user_settings").updateOne(
      {_id: row._id},
      {$set: {features: featuresToNested(flat), updated_at: new Date()}, $unset: {features_json: ""}},
    );
    updated += 1;
  }

  for (const user of users) {
    const userId = String(user._id);
    if (settingsByUser.has(userId)) continue;
    toCreate += 1;
    if (!apply) continue;
    const features = featuresToNested({...DEFAULT_FEATURES, "pages.invoices": false});
    await col("user_settings").updateOne(
      {user_id: userId},
      {$setOnInsert: {user_id: userId, features, created_at: new Date()}, $set: {features, updated_at: new Date()}},
      {upsert: true},
    );
    created += 1;
  }

  if (apply) {
    await col("features").updateOne(
      {key: "pages.invoices"},
      {$set: {default_enabled: false, updated_at: new Date()}},
    );
  }

  console.log({
    target: production ? "production" : "local",
    apply,
    settings_rows: settings.length,
    users: users.length,
    alreadyOff,
    toUpdate,
    toCreate,
    updated,
    created,
  });
});
await closeDb();
