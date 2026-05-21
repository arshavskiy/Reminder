import { Database } from "bun:sqlite";
import { copyFileSync } from "fs";
import { join } from "path";

const dbPath = join(process.cwd(), "data", "reminder.db");
const backupPath = join(process.cwd(), "data", "reminder.db.auto_dedupe.bak");

try {
  copyFileSync(dbPath, backupPath);
  console.log(`Backup created at: ${backupPath}`);
} catch (err) {
  console.warn("Could not create backup:", err);
}

const db = new Database(dbPath, { create: true });

function runScalar(sql: string) {
  const r = db.prepare(sql).get();
  return r ? Object.values(r)[0] : null;
}

console.log("Duplicates before:");
const dupRows = db
  .prepare(
    "SELECT name, category, COUNT(*) AS n FROM equipment GROUP BY name, category HAVING n>1 ORDER BY n DESC"
  )
  .all();
if (dupRows.length === 0) {
  console.log("  (no duplicates found)");
} else {
  for (const r of dupRows) console.log(`  ${r.name} | ${r.category} -> ${r.n}`);
}

const before = runScalar("SELECT COUNT(*) AS n FROM equipment;");
console.log(`Total rows before: ${before}`);

console.log("Running dedupe (keeping smallest id per name+category) and creating unique index...");
db.run("DELETE FROM equipment WHERE id NOT IN (SELECT MIN(id) FROM equipment GROUP BY name, category);");
db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_unique_name_cat ON equipment (name, category);");

const after = runScalar("SELECT COUNT(*) AS n FROM equipment;");
console.log(`Total rows after: ${after}`);

const dupRowsAfter = db
  .prepare(
    "SELECT name, category, COUNT(*) AS n FROM equipment GROUP BY name, category HAVING n>1 ORDER BY n DESC"
  )
  .all();

console.log("Duplicates after:");
if (dupRowsAfter.length === 0) console.log("  (no duplicates found)");
else for (const r of dupRowsAfter) console.log(`  ${r.name} | ${r.category} -> ${r.n}`);

db.close();

console.log("Done.");
