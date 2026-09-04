/**
 * Sets inspection_type on existing documents (imported before this field
 * existed) by matching their stored file_name / raw_text against each
 * inspection type's known Hebrew phrasing — the same classification the AI
 * extractor now does going forward, run here as a cheap deterministic regex
 * pass instead of a paid re-extraction of every old document.
 *
 * Real documents phrase their title differently from our print-template
 * titles (e.g. a real report says "תסקיר על בדיקת קולט אויר", not our
 * generated "תסקיר בדיקה לקולט אוויר"), so each type has a short list of
 * distinguishing phrases rather than matching the preset title verbatim.
 *
 * Dry run by default; pass --apply to write. Only touches documents where
 * inspection_type is not already set, so a manually-corrected value is never
 * overwritten.
 *
 *   npm run inspection-type:backfill
 *   npm run inspection-type:backfill -- --apply
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { connectDb, closeDb } from "../db/db.js";
import { INSPECTION_PRINT_TEMPLATE_PRESETS } from "../shared/printTemplateLayout.js";

const apply = process.argv.includes("--apply");

// Ordered most-specific-first: a document mentioning both "מכונת הרמה" and
// "מעלית" should still match on whichever phrase is actually in its title,
// but checking accessories/cranes/etc. before the broad "מכונות הרמה" catch-all
// avoids a tower-crane report being misclassified as a generic lifting machine.
const MATCH_PHRASES: Record<string, string[]> = {
  air_receiver: ["קולט אוויר", "קולט אויר", "קולטי אוויר", "קולטי אויר"],
  steam_receiver: ["קולט קיטור", "קולטי קיטור"],
  steam_boiler: ["דוד קיטור", "דודי קיטור"],
  pressure_vessel: ["כלי לחץ", "מיתקן לחץ", "מתקן לחץ"],
  tower_crane: ["עגורן צריח"],
  work_platform: ["במת הרמה"],
  powered_scaffold: ["פיגום ממוכן"],
  escalator: ["דרגנוע"],
  elevator: ["מעלית", "מעליות"],
  lifting_accessory: ["אביזרי הרמה", "אביזר הרמה"],
  lifting_machine: ["מכונת הרמה", "מכונות הרמה", "ציוד הרמה"],
};

// Presets not covered by an explicit phrase list above still get checked
// against their own name/reportTypeLabel — keeps this from silently missing a
// type if MATCH_PHRASES falls out of sync with the preset list.
function phrasesFor(key: string): string[] {
  const explicit = MATCH_PHRASES[key] ?? [];
  const preset = INSPECTION_PRINT_TEMPLATE_PRESETS.find((p) => p.key === key);
  const fromPreset = preset ? [preset.name, preset.reportTypeLabel] : [];
  return [...new Set([...explicit, ...fromPreset])];
}

function classify(text: string): string | null {
  for (const preset of INSPECTION_PRINT_TEMPLATE_PRESETS) {
    const phrases = phrasesFor(preset.key);
    if (phrases.some((phrase) => text.includes(phrase))) return preset.key;
  }
  return null;
}

const db = await connectDb();
try {
  const col = db.collection("documents");
  const candidates = await col
    .find({ inspection_type: { $in: [null, undefined] } } as any)
    .project({ file_name: 1, raw_text: 1 })
    .toArray();

  console.log(`Scanning ${candidates.length} documents without inspection_type...`);

  const matches = new Map<string, number>();
  const updates: Array<{ id: any; type: string }> = [];
  for (const doc of candidates) {
    const haystack = `${(doc as any).file_name ?? ""} ${(doc as any).raw_text ?? ""}`;
    const type = classify(haystack);
    if (type) {
      updates.push({ id: doc._id, type });
      matches.set(type, (matches.get(type) ?? 0) + 1);
    }
  }

  console.log(`Matched ${updates.length} of ${candidates.length}:`);
  console.table(
    [...matches.entries()].map(([type, count]) => ({
      type,
      name: INSPECTION_PRINT_TEMPLATE_PRESETS.find((p) => p.key === type)?.name ?? type,
      count,
    })),
  );

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write inspection_type.");
    process.exit(0);
  }

  let modified = 0;
  for (const { id, type } of updates) {
    const result = await col.updateOne(
      { _id: id, inspection_type: { $in: [null, undefined] } } as any,
      { $set: { inspection_type: type, updated_at: new Date() } } as any,
    );
    if (result.modifiedCount) modified++;
  }
  console.log(`Updated ${modified} documents.`);
} finally {
  await closeDb();
}
