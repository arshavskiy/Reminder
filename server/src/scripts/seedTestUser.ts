import "./loadEnv";
import { connectDb, col } from "../db/db";
import { hashPassword } from "../auth/emailAuth";
import { createMagicLinkToken } from "../auth/session";

const EMAIL = "test-lite@example.com";
const PASSWORD = "testpass123";
const NAME = "Test Lite User";

async function main() {
  await connectDb();

  let user = await col("users").findOne({ email: EMAIL }) as any;
  if (!user) {
    const hash = await hashPassword(PASSWORD);
    const result = await col("users").insertOne({
      email: EMAIL,
      password_hash: hash,
      name: NAME,
      role: "user",
      plan: "business",
      is_active: 1,
      email_verified: 1,
      locale: "en",
      created_at: new Date(),
      updated_at: new Date(),
    } as any);
    user = { _id: result.insertedId, email: EMAIL, plan: "business" };
    console.log("Created test user:", user._id.toString());
  } else {
    console.log("User exists:", user._id.toString());
    await col("users").updateOne({ _id: user._id }, { $set: { role: "user", plan: "business" } });
  }

  const token = await createMagicLinkToken(user._id.toString(), user.plan);
  const serverUrl = process.env.SERVER_URL || "http://localhost:3737";
  console.log(`\nMagic link:\n${serverUrl}/auth/magic?token=${token}\n`);

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
