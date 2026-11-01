/**
 * One-off: remove equipment categories shorter than 2 characters.
 * Usage: npx tsx src/scripts/cleanupJunkCategories.ts [--dry-run]
 */
import "./loadEnv";
import { MongoClient } from "mongodb";

const dryRun = process.argv.includes("--dry-run");
const uri = process.env.CLEANUP_MONGODB_URI;
if (!uri) throw new Error("CLEANUP_MONGODB_URI is required for category cleanup");
const dbName = "reminder-app";

console.log(`Connecting to database ${dbName}`);
const mongo = new MongoClient(uri);
await mongo.connect();
const db = mongo.db(dbName);

const minLen = parseInt(process.argv.find(a => a.startsWith("--min="))?.split("=")[1] ?? "2");
const junk = await db.collection("equipment_categories")
  .find({ $expr: { $lt: [{ $strLenCP: "$value" }, minLen] } })
  .toArray();

console.log(`Found ${junk.length} junk categories (< ${minLen} chars)`);
for (const cat of junk) {
  console.log(`  - "${cat.value}" / "${cat.label}" (${cat._id})`);
}

if (!dryRun && junk.length) {
  const ids = junk.map((c) => c._id);
  const result = await db.collection("equipment_categories").deleteMany({ _id: { $in: ids } });
  console.log(`Deleted ${result.deletedCount} junk categories`);
} else if (dryRun) {
  console.log("Dry run — no changes made");
}

await mongo.close();
process.exit(0);
