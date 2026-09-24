/**
 * Merges the old electricity / water / gas / telecom / municipality expense
 * categories into "household" (חשבונות הבית) on saved invoices and documents.
 *
 * Gmail search providers are re-seeded with the new category on server start,
 * and invoices are already read as household at runtime, so this only makes
 * the stored values match (filters, exports, direct DB queries).
 *
 * Dry run by default. Targets the local DB (MONGODB_URI); pass --production
 * for MONGODB_PRODUCTION_URI.
 *
 *   npx tsx src/scripts/backfillHouseholdCategory.ts
 *   npx tsx src/scripts/backfillHouseholdCategory.ts --apply
 *   npx tsx src/scripts/backfillHouseholdCategory.ts --production --apply
 */
import "./loadEnv";
import {MongoClient} from "mongodb";
import {HOUSEHOLD_CATEGORY, LEGACY_HOUSEHOLD_CATEGORIES} from "../invoices/expenseFacets";

const apply = process.argv.includes("--apply");
const production = process.argv.includes("--production");
const uri = production ? process.env.MONGODB_PRODUCTION_URI : (process.env.MONGODB_LOCAL_URI || process.env.MONGODB_URI);
const dbName = production ? (process.env.MONGODB_PRODUCTION_DB || "reminder-app") : (process.env.MONGODB_DB || "reminder-app");
if (!uri) throw new Error(production ? "MONGODB_PRODUCTION_URI is required" : "MONGODB_URI is required");

const legacy = {$in: LEGACY_HOUSEHOLD_CATEGORIES};

async function main() {
  const client = new MongoClient(uri!, {serverSelectionTimeoutMS: 15000});
  await client.connect();
  try {
    const db = client.db(dbName);
    const targets: Array<{collection: string; field: string}> = [
      {collection: "invoices", field: "provider_category"},
      {collection: "invoices", field: "fields.provider_category"},
      {collection: "documents", field: "gmail_provider_category"},
      {collection: "gmail_search_providers", field: "category"},
    ];
    const summary: Record<string, number> = {};
    for (const {collection, field} of targets) {
      const filter = {[field]: legacy};
      const key = `${collection}.${field}`;
      if (!apply) {
        summary[key] = await db.collection(collection).countDocuments(filter);
        continue;
      }
      const result = await db.collection(collection).updateMany(filter, {$set: {[field]: HOUSEHOLD_CATEGORY, updated_at: new Date()}});
      summary[key] = result.modifiedCount;
    }
    console.log(JSON.stringify({db: dbName, mode: apply ? "apply" : "dry-run", [apply ? "updated" : "toUpdate"]: summary}, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
