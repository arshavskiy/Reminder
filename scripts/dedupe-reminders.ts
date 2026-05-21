import { Database } from "bun:sqlite";
import { copyFileSync } from "fs";
import { join } from "path";

const dbPath = join(process.cwd(), "data", "reminder.db");
const backupPath = join(process.cwd(), "data", "reminder.db.auto_dedupe_reminders.bak");

try {
  copyFileSync(dbPath, backupPath);
  console.log(`Backup created at: ${backupPath}\n`);
} catch (err) {
  console.warn("Could not create backup:", err);
}

const db = new Database(dbPath, { create: true });

console.log("=== REMINDER DEDUPLICATION ===\n");

// Show duplicates before
console.log("Duplicates before:");
const dupBefore = db
  .prepare(
    `SELECT source_type, source_id, advance_days, status, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
     FROM reminders
     WHERE status != 'dismissed'
     GROUP BY source_type, source_id, advance_days, status
     HAVING n > 1
     ORDER BY n DESC`
  )
  .all() as Array<{ source_type: string; source_id: number | null; advance_days: number; status: string; n: number; ids: string }>;

if (dupBefore.length === 0) {
  console.log("  (no duplicates found)");
} else {
  for (const d of dupBefore) {
    console.log(`  ${d.source_type} | src=${d.source_id} | adv=${d.advance_days} | st=${d.status} => ${d.n} rows`);
  }
}

const before = db
  .prepare("SELECT COUNT(*) AS n FROM reminders")
  .get() as { n: number };
console.log(`\nTotal rows before: ${before.n}`);

// Dedupe: keep the earliest id per unique (source_type, source_id, advance_days, status)
// but only for status != 'dismissed' (dismissed reminders can be recreated, so we don't dedupe those)
console.log("\nDeleting duplicates (keeping earliest id per group)...");
db.run(
  `DELETE FROM reminders 
   WHERE id NOT IN (
     SELECT MIN(id) FROM reminders 
     WHERE status != 'dismissed'
     GROUP BY source_type, source_id, advance_days, status
   ) 
   AND status != 'dismissed'`
);

const after = db
  .prepare("SELECT COUNT(*) AS n FROM reminders")
  .get() as { n: number };
console.log(`Total rows after: ${after.n}`);
console.log(`Deleted: ${before.n - after.n} rows`);

// Show duplicates after
console.log("\nDuplicates after:");
const dupAfter = db
  .prepare(
    `SELECT source_type, source_id, advance_days, status, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
     FROM reminders
     WHERE status != 'dismissed'
     GROUP BY source_type, source_id, advance_days, status
     HAVING n > 1
     ORDER BY n DESC`
  )
  .all();

if (dupAfter.length === 0) {
  console.log("  (no duplicates found)");
} else {
  for (const d of dupAfter) {
    console.log(`  ${d.source_type} | src=${d.source_id} | adv=${d.advance_days} | st=${d.status} => ${d.n} rows`);
  }
}

db.close();
console.log("\nDone.");
