/**
 * Seed a single shared/global default pipeline profile (user_id: null) that
 * mirrors the extraction config currently in effect (backend, model, OCR
 * language, max chars, reminder advance days). Prompt rules are left empty —
 * the actual prompt stays owned by each doc_template.
 *
 * Idempotent: upserts on { user_id: null, name: "ברירת מחדל" }.
 *
 * NOTE: env MUST be loaded before ../db/db is imported, because db.ts captures
 * MONGODB_URI in a module-level const at import time. ESM hoists static imports
 * above code, so we load dotenv first and then DYNAMICALLY import db/settings.
 *
 * Run:  npx tsx src/scripts/seedDefaultPipelineProfile.ts
 */
import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({path: resolve(__dirname, "../../.env")});

const PROFILE_NAME = "ברירת מחדל";

async function main() {
  const {connectDb, col, closeDb} = await import("../db/db.js");
  const {getEffectiveSettings} = await import("../effectiveSettings.js");

  await connectDb();
  const s = await getEffectiveSettings();
  const model = s.aiBackend === "ollama" ? s.ollamaModel : s.openAiModel;
  const now = new Date();

  const result = await col("pipeline_profiles").updateOne(
    {user_id: null, name: PROFILE_NAME},
    {
      $set: {
        name: PROFILE_NAME,
        description: "פרופיל ברירת מחדל — משקף את הגדרות המערכת הנוכחיות (מודל, OCR, חילוץ).",
        ai_backend: s.aiBackend,
        ai_model: model,
        ocr_language: s.ocrLanguage,
        extraction_max_chars: s.extractionMaxChars,
        reminder_advance_days: s.reminderAdvanceDays ?? null,
        default_template_id: null,
        custom_prompt_rules: null,
        updated_at: now,
      },
      $setOnInsert: {user_id: null, created_at: now},
    },
    {upsert: true}
  );

  const {getDb} = await import("../db/db.js");
  console.log("db:", getDb().databaseName, "|", result.upsertedCount ? "created" : "updated", "default profile:", model, s.ocrLanguage);
  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
