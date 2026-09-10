/**
 * Retire the legacy plan value "free" from users.plan.
 *
 * "free" is no longer a plan. A trial that runs out keeps plan "trial" and is
 * resolved to the "expired" entitlements by featureFlagsForUser, so nothing
 * needs to sit on a distinct free row any more. Accounts still carrying the old
 * value are moved onto a trial whose window has already closed, which is the
 * state they were already in — same entitlements, expressed the current way.
 *
 * Rows with no plan at all are treated the same: normalizePlanId read those as
 * free too, so leaving them would keep the value alive by another spelling.
 *
 * Dry run by default; pass --apply to write.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { closeDb, col, connectDb } from "../db/db";

const apply = process.argv.includes("--apply");

await connectDb();

try {
  const candidates = await col("users")
    .find({
      $or: [
        { plan: "free" },
        { plan: { $exists: false } },
        { plan: null },
        { plan: "" },
      ],
    } as any)
    .project({ _id: 1, email: 1, role: 1, plan: 1, trial_ends_at: 1 })
    .toArray() as Array<Record<string, any>>;

  // Already in the past, so these accounts resolve to the expired entitlements
  // immediately rather than being handed a trial they never earned.
  const lapsedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let updated = 0;

  for (const user of candidates) {
    console.log(
      `${apply ? "migrate" : "would migrate"}: ${user.email ?? user._id} ` +
      `(role=${user.role ?? "-"}, plan=${user.plan ?? "(none)"})`,
    );
    if (!apply) continue;

    // Keep an existing trial_ends_at: if the account already had a real trial
    // window, that date is the truth about when it lapsed.
    const result = await col("users").updateOne(
      { _id: user._id } as any,
      {
        $set: {
          plan: "trial",
          trial_ends_at: user.trial_ends_at ?? lapsedAt,
          updated_at: new Date(),
        },
      } as any,
    );
    updated += result.modifiedCount;
  }

  console.log("");
  console.log(`candidates: ${candidates.length}`);
  if (apply) {
    console.log(`updated:    ${updated}`);
  } else {
    console.log("");
    console.log("Dry run. Re-run with --apply to write.");
  }
} finally {
  await closeDb();
}
