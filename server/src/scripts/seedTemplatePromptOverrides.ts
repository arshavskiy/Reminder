/**
 * Freeze the current built-in template prompts into DB-editable overrides.
 *
 * For every doc_template that has a cached_system_prompt but no
 * full_prompt_override yet, copy the cached prompt into full_prompt_override.
 * Once set, buildPromptForTemplate returns it verbatim and it is NEVER
 * regenerated from code — so edits in the template editor stick.
 *
 * Idempotent: skips templates that already have a full_prompt_override.
 * env is loaded before ../db/db is imported (db.ts captures MONGODB_URI at import
 * time; ESM hoists static imports, so we dynamic-import after dotenv).
 *
 * Run:  npx tsx src/scripts/seedTemplatePromptOverrides.ts   [--force]
 */
import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({path: resolve(__dirname, "../../.env")});

const force = process.argv.includes("--force");

async function main() {
  const {connectDb, col, closeDb, getDb} = await import("../db/db.js");
  await connectDb();

  const rows = await col<any>("doc_templates").find({}).toArray();
  let updated = 0;
  let skipped = 0;

  for (const t of rows) {
    const cached = t.cached_system_prompt;
    if (!cached || typeof cached !== "string" || !cached.trim()) {
      skipped++;
      continue;
    }
    if (t.full_prompt_override?.trim() && !force) {
      skipped++;
      continue;
    }
    await col("doc_templates").updateOne(
      {_id: t._id},
      {$set: {full_prompt_override: cached, updated_at: new Date()}}
    );
    updated++;
    console.log(`  froze prompt → override: ${t.name} (${cached.length} ch)${t.user_id ? " [user]" : " [builtin]"}`);
  }

  console.log(`\ndb: ${getDb().databaseName} | done — ${updated} template(s) updated, ${skipped} skipped.`);
  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
