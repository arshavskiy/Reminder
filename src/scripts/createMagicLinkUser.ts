import "dotenv/config";
import {closeDb, col, connectDb} from "../db/db";
import {createMagicLinkToken} from "../auth/session";
import {DEFAULT_FEATURES} from "../features";

/**
 * Creates (or reuses) a user and prints a one-time magic-link sign-in URL.
 *
 * Usage:
 *   npm run auth:magic-link -- --email=someone@example.com [--name="Someone"] [--role=admin]
 */

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

async function main() {
  const email = parseArg("email")?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Provide a valid email: --email=someone@example.com");
  }

  const name = parseArg("name") ?? null;
  const role = parseArg("role") ?? "user";
  if (!["admin", "pro", "user"].includes(role)) {
    throw new Error(`Invalid role "${role}". Use admin, pro, or user.`);
  }

  await connectDb();

  await col("users").updateOne(
    { email },
    {
      $set: { last_login_at: null },
      $setOnInsert: {
        email,
        name,
        picture_url: null,
        role,
        is_active: 1,
        email_verified: 1,
        created_at: new Date(),
      },
    },
    { upsert: true }
  );

  const user = await col("users").findOne({ email }) as any;
  if (!user) throw new Error("User not found after upsert");

  await col("user_settings").updateOne(
    { user_id: user._id.toString() },
    {
      $setOnInsert: {
        user_id: user._id.toString(),
        theme: "light",
        email_from_name: null,
        reminder_advance_days: "[90,60,30]",
        ocr_language: "heb+eng",
        features: DEFAULT_FEATURES,
      },
    },
    { upsert: true }
  );

  const token = await createMagicLinkToken(user._id.toString());
  const baseUrl = process.env.SERVER_URL ?? "http://localhost:3737";
  const magicLink = `${baseUrl}/auth/magic?token=${token}`;

  console.log(`[magic-link] User: ${email} (role: ${role}, id: ${user._id.toString()})`);
  console.log(`[magic-link] Link expires in 15 minutes and can be used once:`);
  console.log(magicLink);
}

main()
  .catch((err) => {
    console.error("[magic-link] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
