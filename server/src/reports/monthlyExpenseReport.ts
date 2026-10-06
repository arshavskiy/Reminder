import { col } from "../db/db";
import { sendEmailWithAttachments } from "../reminders/emailSender";
import { normalizeProviderCategory } from "../invoices/expenseFacets";
import { effectivePlanId, featureFlagsForUser } from "../plans/tierFeatures";
import { resolveAccountReportRecipients } from "./monthlyReportRecipients";
import { logger } from "../logger";

const CATEGORY_LABELS: Record<string, string> = {
  transport: "תחבורה",
  parking: "חניה",
  fuel: "דלק",
  food: "מזון",
  household: "חשבונות הבית",
  government: "ממשלה",
  insurance: "ביטוח",
  finance: "פיננסים",
  travel: "תיירות",
  healthcare: "בריאות",
  education: "לימודים",
  retail: "קמעונאות",
  digital: "דיגיטל",
  development: "פיתוח",
  general: "כללי",
  payment: "לא מסווג",
};

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

function fmt(amount: number): string {
  return `₪${Math.round(amount).toLocaleString("he-IL")}`;
}

/** Previous calendar month: { year, month (1-based), fromDate, toDate } */
function prevMonth(now: Date) {
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-based
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 1); // exclusive upper bound
  return { year, month, from, to };
}

function monthLabel(year: number, month: number): string {
  const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  return `${MONTHS[month - 1]} ${year}`;
}

function buildHtml(opts: {
  monthLabel: string;
  total: number;
  categories: Array<{ key: string; total: number; suppliers: Array<{ name: string; total: number }> }>;
  appUrl: string;
}): string {
  const catRows = opts.categories
    .map((cat) => {
      const supplierRows = cat.suppliers
        .map(
          (s) =>
            `<tr><td style="padding:4px 8px 4px 24px;color:#5a6c7d;font-size:13px;">${s.name}</td><td style="padding:4px 8px;text-align:left;color:#2c3e50;font-size:13px;font-weight:600;">${fmt(s.total)}</td></tr>`,
        )
        .join("");
      return `
        <tr style="background:#f7f9fb;">
          <td style="padding:8px 8px 8px 12px;font-weight:700;color:#2c3e50;font-size:14px;">${categoryLabel(cat.key)}</td>
          <td style="padding:8px 8px;text-align:left;font-weight:700;color:#18a058;font-size:14px;">${fmt(cat.total)}</td>
        </tr>
        ${supplierRows}`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; direction: rtl; background: #f5f7fa; padding: 24px; color: #2c3e50; margin: 0; }
    .card { background: #fff; border-radius: 12px; padding: 32px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    h1 { color: #18a058; margin: 0 0 4px; font-size: 22px; }
    .sub { color: #5a6c7d; font-size: 14px; margin: 0 0 24px; }
    .total-row { display: flex; justify-content: space-between; align-items: center; background: #edfaf4; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px; }
    .total-label { font-size: 15px; font-weight: 700; }
    .total-amount { font-size: 22px; font-weight: 800; color: #18a058; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #eef0f3; font-size: 12px; color: #95a5a6; text-align: center; }
    a.cta { display: inline-block; background: #18a058; color: #fff !important; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>סיכום הוצאות — ${opts.monthLabel}</h1>
    <p class="sub">הנה סיכום ההוצאות שלכם לחודש ${opts.monthLabel}</p>
    <div class="total-row">
      <span class="total-label">סה"כ הוצאות</span>
      <span class="total-amount">${fmt(opts.total)}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th style="text-align:right;padding:6px 8px;color:#5a6c7d;font-size:12px;border-bottom:2px solid #eef0f3;">קטגוריה / ספק</th>
          <th style="text-align:left;padding:6px 8px;color:#5a6c7d;font-size:12px;border-bottom:2px solid #eef0f3;">סכום</th>
        </tr>
      </thead>
      <tbody>${catRows}</tbody>
    </table>
    <div style="text-align:center;">
      <a class="cta" href="${opts.appUrl}/invoices">צפייה בכל ההוצאות</a>
    </div>
    <div class="footer">RemindOCR — דוח אוטומטי, אין צורך להשיב</div>
  </div>
</body>
</html>`;
}

export async function sendMonthlyExpenseEmail(opts: {
  userId: string;
  recipients: string[];
  now?: Date;
}): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  const now = opts.now ?? new Date();
  const { year, month, from, to } = prevMonth(now);

  const dateField = "invoice_date";
  const invoices = await col("invoices")
    .find({
      user_id: opts.userId,
      cash_flow: { $ne: "income" },
      [dateField]: { $gte: from, $lt: to },
    })
    .toArray() as any[];

  if (!invoices.length) {
    logger.info("monthly_expense_email_skipped_empty", { user_id: opts.userId, month: `${year}-${month}` });
    return { success: true, skipped: true };
  }

  const categoryTotals = new Map<string, { total: number; suppliers: Map<string, number> }>();
  let grandTotal = 0;

  for (const inv of invoices) {
    const amount: number = inv.amount_ils ?? inv.amount ?? 0;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const catKey = normalizeProviderCategory(inv.provider_category) ?? "general";
    const supplier: string = inv.supplier_name || "ספק לא מזוהה";
    grandTotal += amount;
    if (!categoryTotals.has(catKey)) categoryTotals.set(catKey, { total: 0, suppliers: new Map() });
    const cat = categoryTotals.get(catKey)!;
    cat.total += amount;
    cat.suppliers.set(supplier, (cat.suppliers.get(supplier) ?? 0) + amount);
  }

  if (grandTotal === 0) return { success: true, skipped: true };

  const categories = [...categoryTotals.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([key, data]) => ({
      key,
      total: data.total,
      suppliers: [...data.suppliers.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, total]) => ({ name, total })),
    }));

  const appUrl = process.env.APP_URL ?? "https://app.remindocr.com";
  const label = monthLabel(year, month);
  const html = buildHtml({ monthLabel: label, total: grandTotal, categories, appUrl });
  const subject = `סיכום הוצאות ${label} — ${fmt(grandTotal)}`;
  const text = `סיכום הוצאות ${label}\nסה"כ: ${fmt(grandTotal)}\n\n${categories.map((c) => `${categoryLabel(c.key)}: ${fmt(c.total)}`).join("\n")}`;

  return sendEmailWithAttachments(opts.recipients, subject, text, [], html);
}

export async function checkMonthlyExpenseReports(now = new Date()): Promise<void> {
  // Run on the 2nd of the month at 9:00 (after inspection reports fire on the 1st)
  if (now.getDate() !== 2 || now.getHours() < 9) return;

  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const users = await col("users")
    .find({ plan: "digital" })
    .toArray() as any[];

  for (const user of users) {
    const flags = featureFlagsForUser(user);
    if (!flags.automaticMonthlyReports) continue;
    if (effectivePlanId(user) !== "digital") continue;

    const userId = String(user._id);
    const settings = await col("user_settings").findOne({ user_id: userId }) as any | null;

    const lastSent: string = settings?.monthly_expense_report_last_sent ?? "";
    if (lastSent.startsWith(monthKey)) continue;

    const recipients = resolveAccountReportRecipients({
      configuredRecipients: settings?.monthly_report_recipients,
      accountEmail: user.email,
    });
    if (!recipients.length) continue;

    const result = await sendMonthlyExpenseEmail({ userId, recipients, now });
    if (result.skipped) continue;

    if (result.success) {
      await col("user_settings").updateOne(
        { user_id: userId },
        {
          $set: {
            monthly_expense_report_last_sent: `${monthKey} (${new Date().toISOString()})`,
            monthly_expense_report_last_error: null,
          },
        },
        { upsert: true },
      );
      logger.info("monthly_expense_report_sent", { user_id: userId, month: monthKey, recipients: recipients.length });
    } else {
      await col("user_settings").updateOne(
        { user_id: userId },
        { $set: { monthly_expense_report_last_error: result.error } },
        { upsert: true },
      );
      logger.warn("monthly_expense_report_failed", { user_id: userId, month: monthKey, error: result.error });
    }
  }
}
