/**
 * Sends every email template type to arshavsky.pasha@gmail.com for visual testing.
 * Run: node scripts/send-all-test-emails.mjs
 *
 * Emails sent:
 *   1. Digital monthly expense report — he
 *   2. Digital monthly expense report — en
 *   3. Digital monthly expense report — ru
 *   4. Contract monthly report (owner copy)
 *   5. Reminder email (first upcoming reminder found for owner)
 */
import dotenv from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { MongoClient, ObjectId } from "mongodb";
import nodemailer from "nodemailer";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });
dotenv.config({ path: resolve(__dirname, "../.env.dev") });
dotenv.config({ path: resolve(__dirname, "../.env") });

const ADMIN_EMAIL = "arshavsky.pasha@gmail.com";

// ── DB ────────────────────────────────────────────────────────────────────────
const uri = process.env.MONGODB_LOCAL_URI ?? process.env.MONGODB_URI;
if (!uri) throw new Error("No MONGODB_URI env var");
const client = new MongoClient(uri);
await client.connect();
const db = client.db(process.env.MONGODB_DB ?? "reminder-app");
const col = (name) => db.collection(name);

// ── transport ─────────────────────────────────────────────────────────────────
let transport;
if (process.env.RESEND_API_KEY) {
  transport = null; // use Resend HTTP API below
} else {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

async function sendMail({ from, to, subject, html, text }) {
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));
    console.log(`  ✓ sent via Resend — id: ${json.id}`);
    return json.id;
  } else {
    const info = await transport.sendMail({ from, to, subject, html, text });
    console.log(`  ✓ sent via SMTP — messageId: ${info.messageId}`);
    return info.messageId;
  }
}

// ── look up owner ─────────────────────────────────────────────────────────────
const owner = await col("users").findOne({ email: ADMIN_EMAIL });
if (!owner) throw new Error(`User not found: ${ADMIN_EMAIL}`);
const userId = String(owner._id);
console.log(`Owner: ${owner.name} (${owner.email})  id=${userId}  plan=${owner.plan}`);

const fromName = owner.name ?? "RemindOCR";
const fromEmail = process.env.EMAIL_FROM ?? "noreply@remindocr.com";
const from = `${fromName} <${fromEmail}>`;

// ── helpers ───────────────────────────────────────────────────────────────────
function prevMonth(now) {
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return { year, month, from: new Date(year, month - 1, 1), to: new Date(year, month, 1) };
}

function fmt(n) { return `₪${Math.round(n).toLocaleString("he-IL")}`; }

const CATEGORY_LABELS = {
  transport:   { he: "תחבורה",         en: "Transport",       ru: "Транспорт"    },
  household:   { he: "חשבונות הבית",   en: "Household bills", ru: "Коммунальные" },
  digital:     { he: "דיגיטל",          en: "Digital",         ru: "Диджитал"     },
  general:     { he: "כללי",            en: "General",         ru: "Прочее"       },
};
function catLabel(key, locale) {
  return CATEGORY_LABELS[key]?.[locale] ?? key;
}

const MONTH_NAMES = {
  he: ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"],
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  ru: ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"],
};

// ── 1-3: Digital expense report (he / en / ru) ────────────────────────────────
console.log("\n── Digital Expense Report ──────────────────────────────────────────");

const now = new Date();
const pm = prevMonth(now);

const invoices = await col("invoices").find({
  user_id: userId,
  cash_flow: { $ne: "income" },
  invoice_date: { $gte: pm.from, $lt: pm.to },
}).toArray();

console.log(`  Found ${invoices.length} invoices for ${pm.year}-${pm.month}`);

// Build a minimal category summary (or synthetic if none found)
let categories;
if (invoices.length === 0) {
  // Synthetic demo data so the email is non-empty
  categories = [
    { key: "household", total: 450, suppliers: [{ name: "חברת החשמל", total: 250 }, { name: "בזק", total: 200 }] },
    { key: "digital",   total: 120, suppliers: [{ name: "GitHub", total: 12 }, { name: "Railway", total: 108 }] },
    { key: "transport", total: 300, suppliers: [{ name: "פז", total: 300 }] },
  ];
  console.log("  No invoices found — using synthetic demo data");
} else {
  const byCategory = {};
  for (const inv of invoices) {
    const key = inv.category ?? "general";
    if (!byCategory[key]) byCategory[key] = { key, total: 0, suppliers: {} };
    byCategory[key].total += inv.amount ?? 0;
    const sup = inv.supplier_name ?? inv.vendor ?? "ספק";
    byCategory[key].suppliers[sup] = (byCategory[key].suppliers[sup] ?? 0) + (inv.amount ?? 0);
  }
  categories = Object.values(byCategory).map((c) => ({
    key: c.key,
    total: c.total,
    suppliers: Object.entries(c.suppliers).map(([name, total]) => ({ name, total })),
  }));
}

const grandTotal = categories.reduce((s, c) => s + c.total, 0);

for (const locale of ["he", "en", "ru"]) {
  const monthStr = `${MONTH_NAMES[locale][pm.month - 1]} ${pm.year}`;
  const isRtl = locale === "he";
  const dir = isRtl ? "rtl" : "ltr";
  const subjects = {
    he: `סיכום הוצאות ${monthStr} — ${fmt(grandTotal)}`,
    en: `${monthStr} expense summary — ${fmt(grandTotal)}`,
    ru: `Расходы за ${monthStr} — ${fmt(grandTotal)}`,
  };
  const catRows = categories.map((c) =>
    `<tr style="background:#f0fdf4;">
      <td style="padding:8px 12px;font-weight:700;color:#14532d;">${catLabel(c.key, locale)}</td>
      <td style="padding:8px;text-align:${isRtl?"left":"right"};font-weight:700;color:#16a34a;direction:ltr;">${fmt(c.total)}</td>
    </tr>` +
    c.suppliers.map((s) =>
      `<tr><td style="padding:4px 12px 4px 24px;color:#4b7c5c;font-size:13px;">${s.name}</td>
      <td style="padding:4px 8px;text-align:${isRtl?"left":"right"};font-size:13px;direction:ltr;">${fmt(s.total)}</td></tr>`
    ).join("")
  ).join("");

  const html = `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><title>Expense Report</title></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f8fafb;margin:0;padding:20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:linear-gradient(135deg,#16a34a,#059669);padding:28px 24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;">${locale==="he"?"סיכום הוצאות":locale==="ru"?"Расходы":"Expense Summary"}</h1>
      <p style="color:#bbf7d0;margin:6px 0 0;font-size:15px;">${monthStr}</p>
    </div>
    <div style="padding:24px;">
      <div style="background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;margin-bottom:20px;">
        <p style="color:#6b7280;font-size:13px;margin:0 0 4px;">${locale==="he"?"סה״כ":locale==="ru"?"Итого":"Total"}</p>
        <p style="color:#14532d;font-size:28px;font-weight:700;margin:0;direction:ltr;">${fmt(grandTotal)}</p>
      </div>
      <table border="0" cellpadding="0" cellspacing="0" dir="${dir}" style="width:100%;border-collapse:collapse;border:1px solid #d1fae5;border-radius:8px;overflow:hidden;">
        <thead><tr>
          <th style="text-align:${isRtl?"right":"left"};padding:8px 12px;color:#6b7280;font-size:12px;border-bottom:2px solid #d1fae5;">${locale==="he"?"קטגוריה":locale==="ru"?"Категория":"Category"}</th>
          <th style="text-align:${isRtl?"left":"right"};padding:8px;color:#6b7280;font-size:12px;border-bottom:2px solid #d1fae5;">${locale==="he"?"סכום":locale==="ru"?"Сумма":"Amount"}</th>
        </tr></thead>
        <tbody>${catRows}</tbody>
      </table>
      <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:20px;">RemindOCR · ${locale==="he"?"דוח חודשי אוטומטי":locale==="ru"?"Автоматический ежемесячный отчет":"Monthly auto-report"}</p>
    </div>
  </div>
</body></html>`;

  const text = `${locale==="he"?"סיכום הוצאות":locale==="ru"?"Расходы":"Expense Summary"} ${monthStr}\n${locale==="he"?"סה״כ":"Total"}: ${fmt(grandTotal)}`;

  console.log(`\n  [${locale.toUpperCase()}] ${subjects[locale]}`);
  try {
    await sendMail({ from, to: ADMIN_EMAIL, subject: subjects[locale], html, text });
  } catch (err) {
    console.error(`  ✗ FAILED: ${err.message}`);
  }
}

// ── 4: Contract monthly report ────────────────────────────────────────────────
console.log("\n── Contract Monthly Report ─────────────────────────────────────────");

const reportSubject = `דוח חודשי ספטמבר 2026 — 5 חוזים`;
const reportHtml = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f8fafb;padding:20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#1e3a5f;padding:28px 24px;text-align:right;">
      <h1 style="color:#fff;margin:0;font-size:20px;">דוח חודשי ספטמבר 2026</h1>
      <p style="color:#93c5fd;margin:6px 0 0;font-size:14px;">פבל — 5 חוזים פעילים</p>
    </div>
    <div style="padding:24px;">
      <p style="color:#374151;font-size:15px;">שלום פבל,</p>
      <p style="color:#374151;font-size:14px;">להלן סיכום הדוח החודשי שלך לספטמבר 2026:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        <thead><tr style="background:#f1f5f9;">
          <th style="text-align:right;padding:8px 12px;color:#475569;border-bottom:2px solid #e2e8f0;">לקוח</th>
          <th style="text-align:right;padding:8px;color:#475569;border-bottom:2px solid #e2e8f0;">תאריך</th>
          <th style="text-align:left;padding:8px;color:#475569;border-bottom:2px solid #e2e8f0;">סכום</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:8px 12px;">לקוח A</td><td style="padding:8px;">30/09/2026</td><td style="padding:8px;direction:ltr;">₪5,000</td></tr>
          <tr style="background:#f8fafc;"><td style="padding:8px 12px;">לקוח B</td><td style="padding:8px;">15/09/2026</td><td style="padding:8px;direction:ltr;">₪3,200</td></tr>
          <tr><td style="padding:8px 12px;">לקוח C</td><td style="padding:8px;">01/09/2026</td><td style="padding:8px;direction:ltr;">₪2,800</td></tr>
        </tbody>
      </table>
      <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:20px;">RemindOCR · דוח אוטומטי חודשי</p>
    </div>
  </div>
</body></html>`;

console.log(`  Subject: ${reportSubject}`);
try {
  await sendMail({ from, to: ADMIN_EMAIL, subject: reportSubject, html: reportHtml, text: "דוח חודשי ספטמבר 2026" });
} catch (err) {
  console.error(`  ✗ FAILED: ${err.message}`);
}

// ── 5: Reminder email ─────────────────────────────────────────────────────────
console.log("\n── Reminder Email ──────────────────────────────────────────────────");

const reminder = await col("reminders").findOne(
  { user_id: userId, is_deleted: { $ne: true } },
  { sort: { trigger_date: 1 } }
);

if (!reminder) {
  console.log("  No reminders found — sending synthetic example");
}

const reminderTitle = reminder?.title ?? "חידוש ביטוח רכב";
const reminderClient = reminder?.client_name ?? reminder?.client ?? "לקוח לדוגמה";
const reminderDate = reminder?.trigger_date
  ? new Date(reminder.trigger_date).toLocaleDateString("he-IL")
  : new Date().toLocaleDateString("he-IL");
const reminderNotes = reminder?.notes ?? "יש לחדש את הביטוח לפני תאריך הפקיעה";

const reminderSubject = `תזכורת: ${reminderTitle}`;
const reminderHtml = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f8fafb;padding:20px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:24px;text-align:right;">
      <h1 style="color:#fff;margin:0;font-size:20px;">🔔 תזכורת חשובה</h1>
    </div>
    <div style="padding:24px;">
      <h2 style="color:#1e1b4b;font-size:18px;margin:0 0 16px;">${reminderTitle}</h2>
      <table style="width:100%;font-size:14px;">
        <tr><td style="color:#6b7280;padding:4px 0;width:80px;">לקוח:</td><td style="color:#111827;font-weight:600;">${reminderClient}</td></tr>
        <tr><td style="color:#6b7280;padding:4px 0;">תאריך:</td><td style="color:#111827;font-weight:600;">${reminderDate}</td></tr>
      </table>
      ${reminderNotes ? `<div style="background:#f5f3ff;border-right:4px solid #7c3aed;border-radius:4px;padding:12px 14px;margin-top:16px;font-size:14px;color:#4c1d95;">${reminderNotes}</div>` : ""}
      <div style="text-align:center;margin-top:24px;">
        <a href="https://remindocr.com" style="background:#7c3aed;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">פתח ב-RemindOCR</a>
      </div>
      <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:20px;">RemindOCR · תזכורת אוטומטית</p>
    </div>
  </div>
</body></html>`;

console.log(`  Subject: ${reminderSubject}`);
try {
  await sendMail({ from, to: ADMIN_EMAIL, subject: reminderSubject, html: reminderHtml, text: `תזכורת: ${reminderTitle}\nלקוח: ${reminderClient}\nתאריך: ${reminderDate}` });
} catch (err) {
  console.error(`  ✗ FAILED: ${err.message}`);
}

// ── done ──────────────────────────────────────────────────────────────────────
console.log("\n✓ All emails dispatched to " + ADMIN_EMAIL);
await client.close();
