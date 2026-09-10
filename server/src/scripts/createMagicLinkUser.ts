// Must come first: db.ts reads MONGODB_* into top-level consts at import time,
// and ESM hoists imports above statement code — so calling dotenv.config() in
// the body here ran after db.ts had already evaluated, leaving it on its
// localhost fallback while .env.local pointed somewhere else entirely.
import "./loadEnv";
import {closeDb, col, connectDb, runWithDbTarget} from "../db/db";
import {createMagicLinkToken, magicLinkTtlMinutes} from "../auth/session";
import {DEFAULT_NEW_USER_PLAN, ensureUserSettingsWithEntitlements} from "../plans/planEntitlements";

/**
 * Creates (or reuses) a user and prints a one-time magic-link sign-in URL.
 *
 * Usage:
 *   npm run auth:magic-link -- --email=someone@example.com [--name="Someone"] [--role=admin] [--plan=trial|basic|business]
 *   npm run auth:magic-link -- --username=demo [--name="Demo"] [--role=user] [--plan=trial]
 *   npm run auth:magic-link -- --production --email=someone@example.com
 *
 * Plan defaults to trial. The 30-day window starts when the user clicks the
 * printed link, not now — pass --trial-days=0 to force an already-lapsed
 * trial instead, for testing the read-only state a user lands in when the
 * trial runs out.
 *
 * Writes to the local database unless --production (or --target=production) is passed, which
 * creates a real account in the customer database and prints a link against
 * SERVER_URL, defaulting to https://api.remindocr.com for production.
 */

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

const targetArg = parseArg("target");
if (targetArg !== undefined && !["local", "production"].includes(targetArg)) {
    throw new Error("Invalid --target. Use local or production.");
}
if (process.argv.includes("--production") && targetArg === "local") {
    throw new Error("--production cannot be combined with --target=local");
}
const target = process.argv.includes("--production") || targetArg === "production"
    ? "production"
    : "local";

if (target === "production") {
    if (!process.env.MONGODB_PRODUCTION_URI) {
        throw new Error("--target=production needs MONGODB_PRODUCTION_URI to be set");
    }
    console.log("[magic-link] TARGET: production — this creates a real account in the customer database.");
}

async function main() {
  const emailRaw = parseArg("email")?.trim().toLowerCase() || null;
  const usernameRaw = parseArg("username")?.trim().toLowerCase() || null;
  const email = emailRaw || null;
  const username = usernameRaw || null;

  if (!email && !username) {
    throw new Error("Provide --email=someone@example.com and/or --username=demo");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid --email value");
  }
  if (username && (!USERNAME_RE.test(username) || username.includes("@"))) {
    throw new Error("Invalid --username (2–32 chars: letters, digits, . _ -; no @)");
  }

  const name = parseArg("name") ?? null;
  const role = parseArg("role") ?? "user";
  if (!["admin", "pro", "user"].includes(role)) {
    throw new Error(`Invalid role "${role}". Use admin, pro, or user.`);
  }

  const planArg = parseArg("plan") ?? DEFAULT_NEW_USER_PLAN;
  if (!["free", "trial", "digital", "basic", "business"].includes(planArg)) {
    throw new Error(`Invalid plan "${planArg}". Use free, trial, basic, or business.`);
  }
  const plan = planArg as "free" | "trial" | "digital" | "basic" | "business";

  // The 30-day trial window starts when the user actually clicks the magic
  // link (see /auth/magic), not when this script creates the account — a
  // link that sits unopened for a week shouldn't burn a week of trial.
  // --trial-days=0 is the one exception: it makes an already-lapsed trial
  // for testing read-only mode, so it's applied here up front instead.
  const trialDaysArg = parseArg("trial-days");
  const trialDays = trialDaysArg == null ? null : Number(trialDaysArg);
  if (trialDaysArg != null && !Number.isFinite(trialDays)) {
    throw new Error(`Invalid --trial-days "${trialDaysArg}". Use a number, e.g. 14 or 0.`);
  }
  const trialEndsAt = plan === "trial" && trialDays != null
    ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
    : null;

  await connectDb();

  const identityQuery = email && username
    ? { $or: [{ email }, { username }] }
    : email
      ? { email }
      : { username };

  const existing = await col("users").findOne(identityQuery as any) as any;
  const now = new Date();

  if (existing) {
    // Only touch trial_ends_at when --trial-days was explicitly passed (the
    // lapsed-trial test case) or the account has never started one — a plain
    // re-run to reprint the link must not reset an already-running trial.
    const trialUpdate = trialDaysArg != null
      ? { trial_ends_at: trialEndsAt }
      : existing.trial_ends_at
        ? {}
        : { trial_ends_at: trialEndsAt };
    await col("users").updateOne(
      { _id: existing._id },
      {
        $set: {
          ...(email ? { email } : {}),
          ...(username ? { username } : {}),
          ...(name != null ? { name } : {}),
          role,
          plan,
          ...trialUpdate,
          is_active: 1,
          email_verified: email ? 1 : (existing.email_verified ?? 0),
          updated_at: now,
        },
      },
    );
  } else {
    await col("users").insertOne({
      email,
      // Omit username entirely rather than storing null: the unique index counts
      // nulls as duplicates, so a second email-only user would be rejected.
      ...(username ? { username } : {}),
      name: name ?? null,
      picture_url: null,
      password_hash: null,
      email_verified: email ? 1 : 0,
      role,
      plan,
      trial_ends_at: trialEndsAt,
      is_active: 1,
      company_name: null,
      phone: null,
      created_at: now,
      last_login_at: null,
    } as any);
  }

  const user = await col("users").findOne(identityQuery as any) as any;
  if (!user) throw new Error("User not found after upsert");

  await ensureUserSettingsWithEntitlements(user._id.toString(), user);

  const token = await createMagicLinkToken(user._id.toString(), plan);
  const baseUrl = (process.env.SERVER_URL?.trim()
    || (target === "production" ? "https://api.remindocr.com" : "http://localhost:3737"))
    .replace(/\/+$/, "");
  const magicLink = `${baseUrl}/auth/magic?token=${token}`;

  const label = user.email || user.username || user._id.toString();
  const trialNote = trialEndsAt
    ? `, trial ${trialEndsAt > new Date() ? "ends" : "ended"} ${trialEndsAt.toISOString().slice(0, 10)}`
    : "";
  console.log(`[magic-link] User: ${label} (role: ${role}, plan: ${plan}${trialNote}, id: ${user._id.toString()})`);
  console.log(`[magic-link] Link expires in ${magicLinkTtlMinutes(plan)} minutes and can be used multiple times until then:`);
  console.log(magicLink);
}

runWithDbTarget(target, main)
  .catch((err) => {
    console.error("[magic-link] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
