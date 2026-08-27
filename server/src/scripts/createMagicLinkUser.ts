import "dotenv/config";
import {closeDb, col, connectDb} from "../db/db";
import {createMagicLinkToken} from "../auth/session";
import {DEFAULT_NEW_USER_PLAN, ensureUserSettingsWithEntitlements} from "../plans/planEntitlements";

/**
 * Creates (or reuses) a user and prints a one-time magic-link sign-in URL.
 *
 * Usage:
 *   npm run auth:magic-link -- --email=someone@example.com [--name="Someone"] [--role=admin] [--plan=free|basic|business]
 *   npm run auth:magic-link -- --username=demo [--name="Demo"] [--role=user] [--plan=free]
 */

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

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
  if (!["free", "basic", "business"].includes(planArg)) {
    throw new Error(`Invalid plan "${planArg}". Use free, basic, or business.`);
  }
  const plan = planArg as "free" | "basic" | "business";

  await connectDb();

  const identityQuery = email && username
    ? { $or: [{ email }, { username }] }
    : email
      ? { email }
      : { username };

  const existing = await col("users").findOne(identityQuery as any) as any;
  const now = new Date();

  if (existing) {
    await col("users").updateOne(
      { _id: existing._id },
      {
        $set: {
          ...(email ? { email } : {}),
          ...(username ? { username } : {}),
          ...(name != null ? { name } : {}),
          role,
          plan,
          is_active: 1,
          email_verified: email ? 1 : (existing.email_verified ?? 0),
          updated_at: now,
        },
      },
    );
  } else {
    await col("users").insertOne({
      email,
      username,
      name: name ?? null,
      picture_url: null,
      google_sub: null,
      password_hash: null,
      email_verified: email ? 1 : 0,
      role,
      plan,
      is_active: 1,
      company_name: null,
      phone: null,
      created_at: now,
      last_login_at: null,
    } as any);
  }

  const user = await col("users").findOne(identityQuery as any) as any;
  if (!user) throw new Error("User not found after upsert");

  await ensureUserSettingsWithEntitlements(user._id.toString(), { ...user, role, plan });

  const token = await createMagicLinkToken(user._id.toString());
  const baseUrl = process.env.SERVER_URL ?? "http://localhost:3737";
  const magicLink = `${baseUrl}/auth/magic?token=${token}`;

  const label = user.email || user.username || user._id.toString();
  console.log(`[magic-link] User: ${label} (role: ${role}, plan: ${plan}, id: ${user._id.toString()})`);
  console.log(`[magic-link] Link expires in 15 minutes and can be used once:`);
  console.log(magicLink);
}

main()
  .catch((err) => {
    console.error("[magic-link] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
