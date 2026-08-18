/**
 * One-off migration: move Israeli mobile numbers (05x) from `phone` to `mobile`
 * field on client records that don't already have a `mobile` value.
 *
 * Usage: npx tsx src/scripts/migrateClientMobile.ts [--dry-run]
 */
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname.slice(1) });

import { MongoClient } from "mongodb";

const dryRun = process.argv.includes("--dry-run");
const uri = process.env.MONGODB_URI!;
const dbName = process.env.MONGODB_DB || "reminder-app";

const mongo = new MongoClient(uri);
await mongo.connect();
const db = mongo.db(dbName);

const MOBILE_RE = /^0[5]\d[\s\-]?\d{3}[\s\-]?\d{4}$/;

function isMobileNumber(phone: string): boolean {
  const digits = phone.replace(/[\s\-()]+/g, "");
  return /^05\d{8}$/.test(digits);
}

const clients = await db.collection("clients")
  .find({
    phone: { $exists: true, $ne: null },
    $or: [
      { mobile: null },
      { mobile: { $exists: false } },
      { mobile: "" },
    ],
  })
  .toArray();

let moved = 0;
let skipped = 0;

for (const client of clients) {
  const phone = String(client.phone ?? "").trim();
  if (!phone) { skipped++; continue; }

  if (!isMobileNumber(phone)) { skipped++; continue; }

  console.log(
    `${dryRun ? "[DRY] " : ""}${client.display_name ?? client._id}: phone "${phone}" → mobile`,
  );

  if (!dryRun) {
    await db.collection("clients").updateOne(
      { _id: client._id },
      {
        $set: { mobile: phone, updated_at: new Date() },
        $unset: { phone: "" },
      },
    );
  }
  moved++;
}

console.log(`\nDone. Moved: ${moved}, Skipped: ${skipped}${dryRun ? " (dry run)" : ""}`);
await mongo.close();
