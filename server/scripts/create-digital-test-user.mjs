/**
 * Creates a Digital-tier test user and issues a magic login link.
 * Run: node scripts/create-digital-test-user.mjs
 */
import dotenv from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });
dotenv.config({ path: resolve(__dirname, "../.env.dev") });

const EMAIL = "digital-test@remindocr.local";
const NAME = "Digital Test";
const BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:4173";

const uri = process.env.MONGODB_LOCAL_URI ?? process.env.MONGODB_URI;
const client = new MongoClient(uri);
await client.connect();
const db = client.db(process.env.MONGODB_DB ?? "reminder-app");

const users = db.collection("users");
const tokens = db.collection("magic_link_tokens");

// Upsert user
let user = await users.findOne({ email: EMAIL });
if (!user) {
  const now = new Date();
  const result = await users.insertOne({
    email: EMAIL,
    name: NAME,
    role: "user",
    plan: "digital",
    email_verified: true,
    is_active: true,
    created_at: now,
    updated_at: now,
  });
  user = await users.findOne({ _id: result.insertedId });
  console.log(`Created user: ${user._id}`);
} else {
  // Ensure plan is digital
  if (user.plan !== "digital") {
    await users.updateOne({ _id: user._id }, { $set: { plan: "digital" } });
    console.log(`Updated plan to digital for existing user: ${user._id}`);
  } else {
    console.log(`User exists: ${user._id}  plan=${user.plan}`);
  }
}

const userId = String(user._id);
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const newExpiry = new Date(Date.now() + TTL_MS);

// Reuse existing valid token or mint new one
const existing = await tokens.findOneAndUpdate(
  { user_id: userId, expires_at: { $gt: new Date() } },
  { $set: { expires_at: newExpiry } },
  { sort: { created_at: -1 } },
);
let token;
if (existing) {
  token = existing.token;
  console.log(`Reused existing magic token`);
} else {
  token = crypto.randomBytes(32).toString("hex");
  await tokens.insertOne({ token, user_id: userId, created_at: new Date(), expires_at: newExpiry });
  console.log(`Minted new magic token`);
}

console.log(`\nDigital test user:`);
console.log(`  email : ${EMAIL}`);
console.log(`  plan  : digital`);
console.log(`  link  : ${BASE_URL}/auth/magic?token=${token}`);

await client.close();
