/**
 * Move legacy free-tier accounts onto the trial.
 *
 * The free tier no longer exists as something you can sign up to: it is now the
 * lapsed state of a trial. Leaving these accounts on plan "free" would strand
 * them there permanently, with no trial to run and no way to reach the paid
 * plans except by buying blind. This gives each one a full trial window from the
 * moment the migration runs, so they get the same window a new signup gets.
 *
 * Dry run by default; pass --apply to write.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { closeDb, col, connectDb } from "../db/db";
import { newTrialEndsAt } from "../plans/planEntitlements";

const apply = process.argv.includes("--apply");

await connectDb();

try {
  // Legacy accounts store the tier on `plan`, but older rows only ever had
  // `role`, and normalizePlanId treats a missing plan as free — so both shapes
  // have to be caught here or those users stay stranded.
  const candidates = await col("users")
    .find({
      $and: [
        {
          $or: [
            { plan: "free" },
            { plan: { $exists: false } },
            { plan: null },
            { plan: "" },
          ],
        },
        // Never touch an account that is already paying or already on trial.
        { role: { $nin: ["admin", "pro"] } },
      ],
    } as any)
    .project({ _id: 1, email: 1, role: 1, plan: 1, trial_ends_at: 1 })
    .toArray() as Array<Record<string, any>>;

  const trialEndsAt = newTrialEndsAt();
  let updated = 0;
  let skipped = 0;

  for (const user of candidates) {
    // An existing trial_ends_at means this user already had a trial window at
    // some point; re-running the migration must not hand them a fresh one.
    if (user.trial_ends_at) {
      skipped += 1;
      continue;
    }

    console.log(
      `${apply ? "migrate" : "would migrate"}: ${user.email ?? user._id} ` +
      `(role=${user.role ?? "-"}, plan=${user.plan ?? "-"})`,
    );

    if (!apply) continue;

    const result = await col("users").updateOne(
      { _id: user._id } as any,
      { $set: { plan: "trial", trial_ends_at: trialEndsAt, updated_at: new Date() } } as any,
    );
    updated += result.modifiedCount;
  }

  console.log("");
  console.log(`candidates:      ${candidates.length}`);
  console.log(`already trialed: ${skipped}`);
  if (apply) {
    console.log(`updated:         ${updated}`);
    console.log(`trial ends:      ${trialEndsAt.toISOString()}`);
  } else {
    console.log(`would update:    ${candidates.length - skipped}`);
    console.log("");
    console.log("Dry run. Re-run with --apply to write.");
  }
} finally {
  await closeDb();
}
