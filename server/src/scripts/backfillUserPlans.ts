import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { closeDb, col, connectDb } from "../db/db";
import type { UserPlan } from "../shared/types";

const apply = process.argv.includes("--apply");

await connectDb();

try {
  const users = await col("users")
    .find({ $or: [{ plan: { $exists: false } }, { plan: null }, { plan: "" }] } as any)
    .project({ _id: 1, email: 1, role: 1, plan: 1 })
    .toArray() as Array<Record<string, any>>;

  const counts: Record<UserPlan, number> = { expired: 0, trial: 0, digital: 0, basic: 0, business: 0 };
  let updated = 0;

  for (const user of users) {
    const plan = planFromRole(user.role);
    counts[plan] += 1;
    if (!apply) continue;
    const result = await col("users").updateOne(
      { _id: user._id } as any,
      { $set: { plan, updated_at: new Date() } } as any,
    );
    updated += result.modifiedCount;
  }

  console.log(JSON.stringify({
    scanned: users.length,
    updated,
    counts,
    applied: apply,
  }, null, 2));
} finally {
  await closeDb();
}

function planFromRole(role: string | null | undefined): UserPlan {
  if (role === "admin") return "business";
  if (role === "pro") return "basic";
  // Rows with no plan predate the field; they get a trial like a new signup
  // rather than being stranded in the lapsed state.
  return "trial";
}
