/**
 * Copy the built-in generic extraction prompt into system_settings so it becomes
 * DB-editable (used for documents that match no template). Idempotent — only sets
 * genericExtractionPrompt if not already present, unless --force.
 *
 * env is loaded before ../db/db is imported (db.ts captures MONGODB_URI at import
 * time; ESM hoists static imports, so we dynamic-import after dotenv).
 *
 * Run:  npx tsx src/scripts/seedGenericPrompt.ts   [--force]
 */
import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({path: resolve(__dirname, "../../.env")});

const force = process.argv.includes("--force");

async function main() {
  const {connectDb, col, closeDb, getDb} = await import("../db/db.js");
  const {DEFAULT_GENERIC_SYSTEM_PROMPT} = await import("../pipeline/extractor.js");
  const {invalidateSettingsCache} = await import("../effectiveSettings.js");

  await connectDb();

  const existing = await col<any>("system_settings").findOne({_id: "global"});
  if (existing?.genericExtractionPrompt?.trim() && !force) {
    console.log("genericExtractionPrompt already set — skipping (use --force to overwrite).");
    await closeDb();
    process.exit(0);
  }

  await col("system_settings").updateOne(
    {_id: "global" as any},
    {$set: {genericExtractionPrompt: DEFAULT_GENERIC_SYSTEM_PROMPT, updated_at: new Date()}},
    {upsert: true}
  );
  invalidateSettingsCache();

  console.log(`db: ${getDb().databaseName} | seeded genericExtractionPrompt (${DEFAULT_GENERIC_SYSTEM_PROMPT.length} ch).`);
  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
