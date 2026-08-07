import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const { connectDb, col } = await import("../db/db.js");
await connectDb();

const USER_ID = process.argv[2] || "6a10a0e0453ac80348bb04b3";

const all = await col("reminders").find({ user_id: USER_ID }).sort({ trigger_date: 1 }).toArray();
console.log(`\nTOTAL reminders for user ${USER_ID}: ${all.length}\n`);

const byStatus: Record<string, number> = {};
for (const r of all as any[]) byStatus[r.status ?? "?"] = (byStatus[r.status ?? "?"] ?? 0) + 1;
console.log("by status:", byStatus);

const bySource: Record<string, number> = {};
for (const r of all as any[]) bySource[r.source_type ?? "?"] = (bySource[r.source_type ?? "?"] ?? 0) + 1;
console.log("by source_type:", bySource);

console.log("\nrows (status | trigger_date | title):");
for (const r of all as any[]) {
  console.log(`  ${(r.status ?? "?").padEnd(8)} | ${r.trigger_date ?? "?"} | ${r.title}`);
}

process.exit(0);
