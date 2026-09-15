/**
 * Splits the old combined "בדיקות וחידושים" / "Inspections & Renewals"
 * table-import category into two: items whose name reads as an inspection
 * (בדיקת/בדיקה/inspection/טיפול) move to "תסקיר בדיקה" — the same category
 * already used by contract-derived (PDF) inspection reminders, so both flows
 * land in one sidebar bucket — everything else (חידוש/renewal) becomes
 * "חידושים".
 *
 * Only touches reminders/reminder_items whose current category is exactly
 * one of the two old combined values, so a category a user has since edited
 * by hand is left alone.
 *
 * Dry run by default; pass --apply to write.
 *
 *   npm run reminder-category-split:backfill
 *   npm run reminder-category-split:backfill -- --apply
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { connectDb, closeDb } from "../db/db.js";

const apply = process.argv.includes("--apply");

const OLD_CATEGORIES = ["בדיקות וחידושים", "Inspections & Renewals"];
const INSPECTION_HINTS = ["בדיקת", "בדיקה", "טיפול", "inspection"];
const NEW_INSPECTION_CATEGORY = "תסקיר בדיקה";
const NEW_RENEWAL_CATEGORY = "חידושים";

function classify(name: string): string {
  const lower = name.toLowerCase();
  return INSPECTION_HINTS.some((hint) => lower.includes(hint.toLowerCase()))
    ? NEW_INSPECTION_CATEGORY
    : NEW_RENEWAL_CATEGORY;
}

const db = await connectDb();
try {
  const counts = new Map<string, number>();

  for (const [collectionName, nameField, categoryField] of [
    ["reminders", "title", "reminder_category"],
    ["reminder_items", "name", "category"],
  ] as const) {
    const col = db.collection(collectionName);
    const candidates = await col
      .find({ [categoryField]: { $in: OLD_CATEGORIES } } as any)
      .project({ [nameField]: 1 })
      .toArray();

    console.log(`${collectionName}: ${candidates.length} rows in the old combined category`);

    const updates: Array<{ id: any; category: string }> = [];
    for (const row of candidates) {
      const name = String((row as any)[nameField] ?? "");
      const category = classify(name);
      updates.push({ id: row._id, category });
      counts.set(`${collectionName}:${category}`, (counts.get(`${collectionName}:${category}`) ?? 0) + 1);
    }

    if (!apply) continue;

    let modified = 0;
    for (const { id, category } of updates) {
      const result = await col.updateOne(
        { _id: id, [categoryField]: { $in: OLD_CATEGORIES } } as any,
        { $set: { [categoryField]: category, updated_at: new Date() } } as any,
      );
      if (result.modifiedCount) modified++;
    }
    console.log(`${collectionName}: updated ${modified} rows`);
  }

  console.log("\nClassification breakdown:");
  console.table([...counts.entries()].map(([key, count]) => ({ key, count })));

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write.");
  }
} finally {
  await closeDb();
}
