/**
 * Verifies the act-as override is admin-only and never escalates:
 *  1. A non-admin session with acting_as_user_id set must be ignored.
 *  2. An admin session impersonating keeps its own admin role.
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const { connectDb, col } = await import("../db/db.js");
await connectDb();
const { verifySessionIdentity, setActingAsUser } = await import("../auth/session.js");
const { randomBytes } = await import("crypto");

const admin = await col("users").findOne({ role: "admin" }) as any;
const target = await col("users").findOne({ email: "pechersky.m@gmail.com" }) as any;
const nonAdmin = await col("users").findOne({ role: { $in: ["user", "pro"] } }) as any;

function mkSession(userId: string) {
  const id = randomBytes(16).toString("hex");
  return col("sessions").insertOne({
    _id: id as any,
    user_id: userId,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 3600_000),
  } as any).then(() => id);
}

// 1. Non-admin tries to impersonate
const badSession = await mkSession(nonAdmin._id.toString());
await setActingAsUser(badSession, target._id.toString());
const badIdentity = await verifySessionIdentity(badSession);
console.log("non-admin impersonation ignored:", badIdentity?.actingAs === null,
  `(actingAs=${badIdentity?.actingAs?.email ?? "null"})`);

// 2. Admin impersonating keeps admin role
const goodSession = await mkSession(admin._id.toString());
await setActingAsUser(goodSession, target._id.toString());
const goodIdentity = await verifySessionIdentity(goodSession);
console.log("admin keeps own role:", goodIdentity?.user.role === "admin",
  `(role=${goodIdentity?.user.role})`);
console.log("admin acting as target:", goodIdentity?.actingAs?.email === target.email,
  `(actingAs=${goodIdentity?.actingAs?.email})`);

await col("sessions").deleteMany({ _id: { $in: [badSession, goodSession] } } as any);
process.exit(0);
