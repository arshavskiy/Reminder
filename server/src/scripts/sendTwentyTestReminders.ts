/**
 * Creates 20 varied reminders for a user and sends each to a target address,
 * writing email_log rows in the same shape the scheduler uses so the admin
 * monitoring report can be validated end-to-end.
 *
 * Usage: npx tsx src/scripts/sendTwentyTestReminders.ts [userId] [toEmail]
 */
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const USER_ID = process.argv[2] || "6a10a0e0453ac80348bb04b3";
const TO_EMAIL = process.argv[3] || "arshavsky.pasha@gmail.com";
const COUNT = Number(process.argv[4] || "20");

const { connectDb, col } = await import("../db/db.js");
const { sendReminderEmail } = await import("../reminders/emailSender.js");
const { getSettings } = await import("../settings.js");

await connectDb();
const settings = getSettings();

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
}

const equipmentTypes = ["lift", "accessory", "scaffold", "ladder", "balloon", "intake", "extractor"];
const companies = [
  "שלב 1945 הובלות בע\"מ", "מנוף העמק בע\"מ", "בניה ופיתוח דרום", "תעשיות מתכת גליל",
  "לוגיסטיקה מרכז בע\"מ", "עמל הנדסה", "כרמל שינוע", "אשדוד פורט שירותים",
];
const contactPeople = ["קלודין", "יוסי לוי", "מרים כהן", "דוד אבני", "רונית שגב"];
const contractTypes = ["תסקיר בדיקה תקופתית", "פקיעת חוזה שירות", "תזכורת תשלום חשבונית"];
const manufacturers = ["Hiab", "DAF", "Ferrari", "Palfinger", "Manitou"];

// Template IDs to rotate through (varied rendering)
const templateIds = [
  null, // default via pickEmailTemplate
  "6a73a1d0c57da3e065b7b2d1", // פצ׳רסקי
  "6a746437c57da3e065b88b7a", // פצ׳רסקי (סטטי)
  "6a11a1ec0c05f49738b08bfd", // תסקיר בדיקה תקופתית
];

console.log(`\n=== Sending 20 test reminders to ${TO_EMAIL} for user ${USER_ID} ===`);
console.log(`via: ${process.env.RESEND_API_KEY ? "resend" : "smtp"} | from: ${settings.emailFrom}\n`);

let ok = 0;
let fail = 0;

for (let i = 0; i < COUNT; i++) {
  const advanceDays = [7, 14, 30, 45, 60][i % 5];
  const triggerDate = isoInDays([-3, 5, 12, 30, 90][i % 5]); // some past, some future
  const company = companies[i % companies.length];
  const eqType = equipmentTypes[i % equipmentTypes.length];
  const contractType = contractTypes[i % contractTypes.length];

  const reminderDoc: any = {
    user_id: USER_ID,
    source_type: "test_batch",
    trigger_date: triggerDate,
    advance_days: advanceDays,
    title: `בדיקה #${i + 1} — ${contractType}`,
    body: `זוהי תזכורת בדיקה מספר ${i + 1} מתוך 20. סוג ציוד: ${eqType}.`,
    status: "pending",
    email_to: JSON.stringify([TO_EMAIL]),
    email_template_id: templateIds[i % templateIds.length],
    equipment_type: eqType,
    manufacturer: manufacturers[i % manufacturers.length],
    model: `M-${100 + i}`,
    serial_number: `SN${20260800 + i}`,
    contract_number: `CN-${4000 + i}`,
    contract_type: contractType,
    client_name: company,
    contact_person: contactPeople[i % contactPeople.length],
    contact_phone: `05${i % 5}-${String(1000000 + i * 137).slice(0, 7)}`,
    document_name: `מסמך בדיקה ${i + 1}`,
    created_at: new Date(),
    updated_at: new Date(),
    test_batch: true,
  };

  const ins = await col("reminders").insertOne(reminderDoc);
  const remId = ins.insertedId;

  // Build the ReminderWithContext object the sender expects
  const reminderCtx: any = {
    id: remId,
    ...reminderDoc,
  };

  const result = await sendReminderEmail(reminderCtx, [TO_EMAIL]);

  // Mirror the scheduler's email_log write
  await col("email_log").insertOne({
    reminder_id: remId,
    user_id: USER_ID,
    log_type: "send",
    to_address: TO_EMAIL,
    recipient: TO_EMAIL,
    subject: `תזכורת - ${reminderDoc.title}`,
    sent_at: new Date(),
    success: result.success ? 1 : 0,
    error: result.error ?? null,
    smtp_host: settings.smtpHost || "in-app-only",
    via: process.env.RESEND_API_KEY ? "resend" : "smtp",
    test_batch: true,
  } as any);

  await col("reminders").updateOne(
    { _id: remId },
    { $set: { status: result.success ? "sent" : "pending", updated_at: new Date() } }
  );

  if (result.success) {
    ok++;
    console.log(`  [${i + 1}/${COUNT}]✓ sent  | tpl=${templateIds[i % templateIds.length] ?? "default"} eq=${eqType} adv=${advanceDays}d`);
  } else {
    fail++;
    console.log(`  [${i + 1}/${COUNT}]✗ FAIL  | ${result.error}`);
  }
}

console.log(`\n=== DONE: ${ok} sent, ${fail} failed ===`);
console.log(`email_log rows written with log_type="send", user_id=${USER_ID}, recipient=${TO_EMAIL}`);
console.log(`Check admin report: GET /api/admin/monitor/reminders and user detail Emails tab\n`);

process.exit(0);
