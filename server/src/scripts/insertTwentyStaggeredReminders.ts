/**
 * Inserts 20 pending reminders for a user, staggered 5 minutes apart starting
 * at 15:30 TODAY. Stores both trigger_date (date the scheduler matches on) and
 * trigger_at (the intended fire timestamp, for visibility). Does NOT send.
 *
 * Usage: npx tsx src/scripts/insertTwentyStaggeredReminders.ts [userId] [toEmail]
 */
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const { connectDb, col } = await import("../db/db.js");
await connectDb();

const USER_ID = process.argv[2] || "6a10a0e0453ac80348bb04b3";
const TO_EMAIL = process.argv[3] || "arshavsky.pasha@gmail.com";

const equipmentTypes = ["lift", "accessory", "scaffold", "ladder", "balloon", "intake", "extractor"];
const companies = [
  "שלב 1945 הובלות בע\"מ", "מנוף העמק בע\"מ", "בניה ופיתוח דרום", "תעשיות מתכת גליל",
  "לוגיסטיקה מרכז בע\"מ", "עמל הנדסה", "כרמל שינוע", "אשדוד פורט שירותים",
];
const contactPeople = ["קלודין", "יוסי לוי", "מרים כהן", "דוד אבני", "רונית שגב"];
const contractTypes = ["תסקיר בדיקה תקופתית", "פקיעת חוזה שירות", "תזכורת תשלום חשבונית"];
const manufacturers = ["Hiab", "DAF", "Ferrari", "Palfinger", "Manitou"];
const templateIds = [
  null,
  "6a73a1d0c57da3e065b7b2d1",
  "6a746437c57da3e065b88b7a",
  "6a11a1ec0c05f49738b08bfd",
];

// Base time = today 15:30 local
const base = new Date();
base.setHours(15, 30, 0, 0);
const dateStr = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;

console.log(`\n=== Inserting 20 staggered reminders for user ${USER_ID} ===`);
console.log(`date: ${dateStr}  base time: 15:30  step: 5 min\n`);

const docs: any[] = [];
for (let i = 0; i < 20; i++) {
  const triggerAt = new Date(base.getTime() + i * 5 * 60000); // +5 min each
  const hhmm = `${String(triggerAt.getHours()).padStart(2, "0")}:${String(triggerAt.getMinutes()).padStart(2, "0")}`;
  const eqType = equipmentTypes[i % equipmentTypes.length];
  const contractType = contractTypes[i % contractTypes.length];

  docs.push({
    user_id: USER_ID,
    source_type: "test_batch_staggered",
    trigger_date: dateStr,
    trigger_at: triggerAt,          // intended fire time (visibility; scheduler is date-only)
    scheduled_time: hhmm,
    advance_days: [7, 14, 30, 45, 60][i % 5],
    title: `בדיקה מתוזמנת ${hhmm} — ${contractType}`,
    body: `תזכורת בדיקה מתוזמנת ל-${hhmm}. סוג ציוד: ${eqType}. (#${i + 1}/20)`,
    status: "pending",
    email_to: JSON.stringify([TO_EMAIL]),
    email_template_id: templateIds[i % templateIds.length],
    equipment_type: eqType,
    manufacturer: manufacturers[i % manufacturers.length],
    model: `M-${200 + i}`,
    serial_number: `SN${20260900 + i}`,
    contract_number: `CN-${5000 + i}`,
    contract_type: contractType,
    client_name: companies[i % companies.length],
    contact_person: contactPeople[i % contactPeople.length],
    contact_phone: `05${i % 5}-${String(2000000 + i * 173).slice(0, 7)}`,
    document_name: `מסמך בדיקה מתוזמן ${i + 1}`,
    created_at: new Date(),
    updated_at: new Date(),
    test_batch: true,
  });
}

const result = await col("reminders").insertMany(docs);
console.log(`inserted ${result.insertedCount} reminders (status=pending)\n`);

for (let i = 0; i < docs.length; i++) {
  console.log(`  ${docs[i].scheduled_time}  ${docs[i].title}  [${result.insertedIds[i]}]`);
}

console.log(`\nAll under user_id=${USER_ID}, trigger_date=${dateStr}.`);
console.log(`Note: scheduler matches trigger_date only (no time gate) and runs in production; trigger_at is stored for visibility.\n`);

process.exit(0);
