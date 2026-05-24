// Seed a small starter catalogue of equipment so the הגדרת ציוד page isn't
// empty on first install. All rows are flagged is_active=1 — users edit or
// delete them as needed.

import { col } from "../db/db";

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

export async function seedBuiltinEquipment(): Promise<void> {
  const now = new Date();
  for (const s of SEEDS) {
    await col("equipment").updateOne(
      { name: s.name, category: s.category },
      {
        $setOnInsert: {
          name: s.name,
          category: s.category,
          manufacturer: s.manufacturer ?? null,
          model: s.model ?? null,
          capacity: s.capacity ?? null,
          description: s.description ?? null,
          notes: null,
          is_active: 1,
          created_at: now,
          updated_at: now,
        },
      },
      { upsert: true }
    );
  }
}
