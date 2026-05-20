// Seed a small starter catalogue of equipment so the הגדרת ציוד page isn't
// empty on first install. All rows are flagged is_active=1 — users edit or
// delete them as needed.

import type { Database } from "bun:sqlite";

interface SeedRow {
  name: string;
  category: string;
  manufacturer?: string;
  model?: string;
  capacity?: string;
  description?: string;
}

const SEEDS: SeedRow[] = [
  {
    name: "במת הרמה",
    category: "lift",
    description: "במת הרמה",
  },
  {
    name: "מגבה רכב במבנה מספריים",
    category: "lift",
    description:
      "מלגזה בהנעת דיזל, נעה על 6 גלגלים פניאומטיים, תורן דו שלבי, צידוד+ הטיה+ ממקם קלשונים+ הרמה עד גובה מירבי של 3.5 מ'. הרמה ע\"י זוג בוכנות+ זוג שרשראות 3X4 בפסיעה 2\".",
  },
  {
    name: "אונקלים יעודיים להרמת מכולה",
    category: "accessory",
    manufacturer: "Valart",
    model: "2760GSI",
    capacity: "20 מ\"מ, אורך 30 ס\"מ",
    description:
      "שרשרת 20 מ\"מ, אורך 30 ס\"מ. אביזר חיבור למכולה יצרן - Valart, 2760GSI",
  },
];

export function seedBuiltinEquipment(db: Database) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO equipment (name, category, manufacturer, model, capacity, description, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  );
  for (const s of SEEDS) {
    insert.run(
      s.name,
      s.category,
      s.manufacturer ?? null,
      s.model ?? null,
      s.capacity ?? null,
      s.description ?? null
    );
  }
}
