// Must come first: db.ts reads MONGODB_* into top-level consts at import time,
// and ESM hoists imports above statement code.
import "./loadEnv";
import {closeDb, col, connectDb, runWithDbTarget} from "../db/db";
import {createMagicLinkToken} from "../auth/session";
import {DEFAULT_NEW_USER_PLAN, ensureUserSettingsWithEntitlements} from "../plans/planEntitlements";

/**
 * Creates a trial user account in the LOCAL database for every inspector_leads
 * row that has an email, and writes a fresh magic-link sign-in URL back onto
 * that lead document (fields: appUserId, appMagicLink, appMagicLinkCreatedAt).
 *
 * The magic link is single-use and expires in 15 minutes (see
 * createMagicLinkToken) — it's meant to be consumed shortly after this run,
 * not stored indefinitely as a working link. Re-run this script to refresh
 * stale links before actually sending them out.
 *
 * trial_ends_at is intentionally left unset: the trial starts on first
 * /auth/magic click, not when this script provisions the account.
 *
 * Writes to the local database unless --production (or --target=production)
 * is passed, which writes to the real customer database instead.
 *
 * Dry run by default; pass --apply to write.
 *   npm run inspector-leads:create-trial-users
 *   npm run inspector-leads:create-trial-users -- --apply
 *   npm run inspector-leads:create-trial-users -- --apply --limit=20
 *   npm run inspector-leads:create-trial-users -- --apply --production
 */

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : null;

const targetArg = process.argv.find((a) => a.startsWith("--target="))?.slice("--target=".length);
if (targetArg !== undefined && !["local", "production"].includes(targetArg)) {
  throw new Error("Invalid --target. Use local or production.");
}
const target = process.argv.includes("--production") || targetArg === "production" ? "production" : "local";
if (target === "production" && !process.env.MONGODB_PRODUCTION_URI) {
  throw new Error("--production needs MONGODB_PRODUCTION_URI to be set");
}
if (target === "production") {
  console.log("[trial-from-leads] TARGET: production — this creates real accounts in the customer database.");
}

async function main() {
  await connectDb();

  const query = {email: {$exists: true, $nin: [null, ""]}};
  let cursor = col("inspector_leads").find(query as any);
  if (limit && Number.isFinite(limit)) cursor = cursor.limit(limit);
  const leads = await cursor.toArray() as any[];

  console.log(`[trial-from-leads] ${leads.length} lead(s) with an email.`);
  if (!apply) {
    console.log("Dry run only. Run with --apply to create users and write magic links.");
    process.exit(0);
  }

  const baseUrl = (process.env.SERVER_URL?.trim() || "http://localhost:3737").replace(/\/+$/, "");
  let created = 0;
  let reused = 0;
  let skipped = 0;

  for (const lead of leads) {
    const email = String(lead.email ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      skipped++;
      continue;
    }

    const now = new Date();
    const existing = await col("users").findOne({email});
    if (existing) {
      reused++;
    } else {
      await col("users").insertOne({
        email,
        name: lead.name ?? null,
        picture_url: null,
        password_hash: null,
        email_verified: 1,
        role: "user",
        plan: DEFAULT_NEW_USER_PLAN,
        trial_ends_at: null,
        is_active: 1,
        company_name: lead.company ?? null,
        phone: lead.phone ?? null,
        created_at: now,
        last_login_at: null,
      } as any);
      created++;
    }

    const user = await col("users").findOne({email}) as any;
    await ensureUserSettingsWithEntitlements(user._id.toString(), user);

    const token = await createMagicLinkToken(user._id.toString());
    const magicLink = `${baseUrl}/auth/magic?token=${token}`;

    await col("inspector_leads").updateOne(
      {_id: lead._id},
      {
        $set: {
          appUserId: user._id.toString(),
          appMagicLink: magicLink,
          appMagicLinkCreatedAt: now,
        },
      },
    );
  }

  console.log(`[trial-from-leads] Created: ${created}, reused existing: ${reused}, skipped (bad email): ${skipped}.`);
}

runWithDbTarget(target, main)
  .catch((err) => {
    console.error("[trial-from-leads] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
