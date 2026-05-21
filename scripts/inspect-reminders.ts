import { Database } from "bun:sqlite";
import { join } from "path";

const dbPath = join(process.cwd(), "data", "reminder.db");
const db = new Database(dbPath, { create: true });

console.log("=== REMINDER TABLE INSPECTION ===\n");

const total = db
  .prepare("SELECT COUNT(*) AS n FROM reminders")
  .get() as { n: number };
console.log(`Total reminders: ${total.n}\n`);

// Find potential duplicates by (source_type, source_id, advance_days, status)
// This is a reasonable dedup key — same contract reminder at same advance time
console.log("Duplicate groups (source_type, source_id, advance_days, status != 'dismissed'):");
const dupes = db
  .prepare(
    `SELECT source_type, source_id, advance_days, status, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
     FROM reminders
     WHERE status != 'dismissed'
     GROUP BY source_type, source_id, advance_days, status
     HAVING n > 1
     ORDER BY n DESC`
  )
  .all() as Array<{ source_type: string; source_id: number | null; advance_days: number; status: string; n: number; ids: string }>;

if (dupes.length === 0) {
  console.log("  (no duplicates found)\n");
} else {
  for (const d of dupes) {
    console.log(
      `  ${d.source_type} | src=${d.source_id} | adv=${d.advance_days} | st=${d.status} => ${d.n} rows (ids: ${d.ids})`
    );
  }
  console.log();
}

// Show a sample of reminders
console.log("Sample reminders (first 20):");
const samples = db
  .prepare(
    `SELECT id, source_type, source_id, trigger_date, advance_days, title, status 
     FROM reminders 
     ORDER BY id DESC 
     LIMIT 20`
  )
  .all();

for (const s of samples) {
  console.log(`  ${s.id} | ${s.source_type} src=${s.source_id} | ${s.trigger_date} | adv=${s.advance_days} | st=${s.status} | ${s.title.slice(0, 50)}`);
}

db.close();
