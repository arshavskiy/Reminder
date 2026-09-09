// One-time migration: engineer_profiles collection is retired — every field
// it held moves onto the matching users document (same fields the app code
// now reads/writes directly on users). Only sets fields the user doesn't
// already have a non-empty value for, so it never clobbers data a user
// entered separately on both sides.
//
// Dry run by default; pass --apply to write. --production (or
// --target=production) targets the customer database.
//
//   npx tsx src/scripts/migrateEngineerProfilesToUsers.ts
//   npx tsx src/scripts/migrateEngineerProfilesToUsers.ts --apply
//   npx tsx src/scripts/migrateEngineerProfilesToUsers.ts --production --apply
import "./loadEnv";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb, runWithDbTarget} from "../db/db";

const apply = process.argv.includes("--apply");
const targetArg = process.argv.find((a) => a.startsWith("--target="))?.slice("--target=".length);
const target = process.argv.includes("--production") || targetArg === "production" ? "production" : "local";
if (target === "production" && !process.env.MONGODB_PRODUCTION_URI) {
  throw new Error("--production needs MONGODB_PRODUCTION_URI to be set");
}

// Every field engineer_profiles ever held, minus the bookkeeping fields
// (_id, user_id, updated_at) that don't apply to the merged doc.
const PROFILE_FIELDS = [
  "inspector_number", "inspector_numbers_by_type", "title", "expertise",
  "mr_number", "mg_number", "membership_start_date", "inspector_id_start",
  "next_inspection_seq", "company_name", "company_registration",
  "company_subtitle", "company_phone", "company_email", "company_logo_url",
  "address", "city",
] as const;

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

async function main() {
  await connectDb();

  const profiles = await col("engineer_profiles").find({}).toArray() as any[];
  console.log(`[migrate] ${profiles.length} engineer_profiles docs (target: ${target})`);

  let updated = 0;
  let skippedNoUser = 0;
  let skippedNothingToSet = 0;
  let invalidUserId = 0;

  for (const profile of profiles) {
    let userId: ObjectId;
    try {
      userId = new ObjectId(profile.user_id);
    } catch {
      console.log(`[migrate] SKIP invalid user_id: ${profile.user_id}`);
      invalidUserId++;
      continue;
    }

    const user = await col("users").findOne({_id: userId} as any) as any;
    if (!user) {
      console.log(`[migrate] SKIP no matching user: ${profile.user_id}`);
      skippedNoUser++;
      continue;
    }

    const patch: Record<string, unknown> = {};
    for (const field of PROFILE_FIELDS) {
      if (isEmpty(profile[field])) continue;
      if (!isEmpty(user[field])) continue;
      patch[field] = profile[field];
    }

    if (!Object.keys(patch).length) {
      skippedNothingToSet++;
      continue;
    }

    console.log(`[migrate] user ${profile.user_id}: ${JSON.stringify(patch)}`);
    if (apply) {
      await col("users").updateOne({_id: userId} as any, {$set: patch});
    }
    updated++;
  }

  console.log(
    `[migrate] ${apply ? "Updated" : "Would update"}: ${updated}, ` +
    `skipped (already set / nothing to migrate): ${skippedNothingToSet}, ` +
    `skipped (no matching user): ${skippedNoUser}, invalid user_id: ${invalidUserId}`,
  );
  if (!apply) console.log("[migrate] Dry run only. Pass --apply to write.");
  else console.log("[migrate] Done. engineer_profiles is no longer read by the app — drop the collection manually once you've confirmed this looks right.");
}

runWithDbTarget(target, main)
  .catch((err) => {
    console.error("[migrate] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
