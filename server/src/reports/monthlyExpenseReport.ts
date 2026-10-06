import { col } from "../db/db";
import { sendEmailWithAttachments } from "../reminders/emailSender";
import { normalizeProviderCategory } from "../invoices/expenseFacets";
import { effectivePlanId, featureFlagsForUser } from "../plans/tierFeatures";
import { resolveAccountReportRecipients } from "./monthlyReportRecipients";
import { loadDigitalTemplate } from "../email-templates/loader";
import { renderTemplate } from "../templates/renderEmail";
import { logger } from "../logger";

type Locale = "he" | "en" | "ru";

function resolveLocale(raw: unknown): Locale {
  if (raw === "en") return "en";
  if (raw === "ru") return "ru";
  return "he";
}

// ── category labels ────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, Record<Locale, string>> = {
  transport:   { he: "תחבורה",         en: "Transport",       ru: "Транспорт"    },
  parking:     { he: "חניה",            en: "Parking",         ru: "Парковка"     },
  fuel:        { he: "דלק",             en: "Fuel",            ru: "Топливо"      },
  food:        { he: "מזון",            en: "Food",            ru: "Питание"      },
  household:   { he: "חשבונות הבית",   en: "Household bills", ru: "Коммунальные" },
  government:  { he: "ממשלה",           en: "Government",      ru: "Госпошлины"   },
  insurance:   { he: "ביטוח",           en: "Insurance",       ru: "Страхование"  },
  finance:     { he: "פיננסים",         en: "Finance",         ru: "Финансы"      },
  travel:      { he: "תיירות",          en: "Travel",          ru: "Туризм"       },
  healthcare:  { he: "בריאות",          en: "Healthcare",      ru: "Здоровье"     },
  education:   { he: "לימודים",         en: "Education",       ru: "Образование"  },
  retail:      { he: "קמעונאות",        en: "Retail",          ru: "Шоппинг"      },
  digital:     { he: "דיגיטל",          en: "Digital",         ru: "Диджитал"     },
  development: { he: "פיתוח",           en: "Development",     ru: "Разработка"   },
  general:     { he: "כללי",            en: "General",         ru: "Прочее"       },
  payment:     { he: "לא מסווג",        en: "Uncategorized",   ru: "Без категории"},
};

function categoryLabel(key: string, locale: Locale): string {
  return CATEGORY_LABELS[key]?.[locale] ?? key;
}

// ── i18n strings for subject and plain-text ────────────────────────────────
const I18N: Record<Locale, {
  subject: (month: string, total: string) => string;
  breakdown: string;
  unknown: string;
}> = {
  he: {
    subject: (m, t) => `סיכום הוצאות ${m} — ${t}`,
    breakdown: "פירוט לפי קטגוריה",
    unknown: "ספק לא מזוהה",
  },
  en: {
    subject: (m, t) => `${m} expense summary — ${t}`,
    breakdown: "Breakdown by category",
    unknown: "Unknown supplier",
  },
  ru: {
    subject: (m, t) => `Расходы за ${m} — ${t}`,
    breakdown: "Разбивка по категориям",
    unknown: "Неизвестный поставщик",
  },
};

// ── month labels ───────────────────────────────────────────────────────────
const MONTH_NAMES: Record<Locale, string[]> = {
  he: ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"],
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  ru: ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"],
};

function monthLabel(year: number, month: number, locale: Locale): string {
  return `${MONTH_NAMES[locale][month - 1]} ${year}`;
}

// ── helpers ────────────────────────────────────────────────────────────────
function prevMonth(now: Date) {
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return { year, month, from: new Date(year, month - 1, 1), to: new Date(year, month, 1) };
}

function fmt(amount: number): string {
  return `₪${Math.round(amount).toLocaleString("he-IL")}`;
}

function buildCategoriesTable(
  categories: Array<{ key: string; total: number; suppliers: Array<{ name: string; total: number }> }>,
  locale: Locale,
): string {
  const isRtl = locale === "he";
  const dir = isRtl ? "rtl" : "ltr";
  const rows = categories.map((cat) => {
    const supplierRows = cat.suppliers
      .map(
        (s) =>
          `<tr>
            <td style="padding:5px 12px 5px ${isRtl ? "8px" : "24px"};padding-${isRtl ? "right" : "left"}:24px;color:#4b7c5c;font-size:13px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">${s.name}</td>
            <td style="padding:5px 8px;text-align:${isRtl ? "left" : "right"};color:#1a2e1a;font-size:13px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-weight:600;direction:ltr;">${fmt(s.total)}</td>
          </tr>`,
      )
      .join("");
    return `
      <tr style="background:#f0fdf4;">
        <td style="padding:9px 12px;font-weight:700;color:#14532d;font-size:14px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">${categoryLabel(cat.key, locale)}</td>
        <td style="padding:9px 8px;text-align:${isRtl ? "left" : "right"};font-weight:700;color:#16a34a;font-size:14px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;direction:ltr;">${fmt(cat.total)}</td>
      </tr>
      ${supplierRows}`;
  }).join("");

  return `<table border="0" cellpadding="0" cellspacing="0" dir="${dir}" role="presentation"
    style="width:100%;border-collapse:collapse;border:1px solid #d1fae5;border-radius:10px;overflow:hidden;" width="100%">
    <thead>
      <tr>
        <th style="text-align:${isRtl ? "right" : "left"};padding:8px 12px;color:#6b7280;font-size:12px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;border-bottom:2px solid #d1fae5;background:#ffffff;">${categoryLabel("general", locale) === "כללי" ? "קטגוריה" : locale === "ru" ? "Категория" : "Category"}</th>
        <th style="text-align:${isRtl ? "left" : "right"};padding:8px 8px;color:#6b7280;font-size:12px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;border-bottom:2px solid #d1fae5;background:#ffffff;">${locale === "he" ? "סכום" : locale === "ru" ? "Сумма" : "Amount"}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── public API ─────────────────────────────────────────────────────────────
export async function sendMonthlyExpenseEmail(opts: {
  userId: string;
  recipients: string[];
  locale?: Locale;
  now?: Date;
}): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  const now     = opts.now ?? new Date();
  const locale  = opts.locale ?? "he";
  const { year, month, from, to } = prevMonth(now);

  const invoices = await col("invoices")
    .find({
      user_id: opts.userId,
      cash_flow: { $ne: "income" },
      invoice_date: { $gte: from, $lt: to },
    })
    .toArray() as any[];

  if (!invoices.length) {
    logger.info("monthly_expense_email_skipped_empty", { user_id: opts.userId, month: `${year}-${month}` });
    return { success: true, skipped: true };
  }

  const i18n = I18N[locale];
  const categoryTotals = new Map<string, { total: number; suppliers: Map<string, number> }>();
  let grandTotal = 0;

  for (const inv of invoices) {
    const amount: number = inv.amount_ils ?? inv.amount ?? 0;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const catKey = normalizeProviderCategory(inv.provider_category) ?? "general";
    const supplier: string = inv.supplier_name || i18n.unknown;
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

  const label      = monthLabel(year, month, locale);
  const totalFmt   = fmt(grandTotal);
  const appUrl     = process.env.APP_URL ?? "https://app.remindocr.com";
  const catTable   = buildCategoriesTable(categories, locale);

  const template = loadDigitalTemplate("expense-report", locale);
  const html = renderTemplate(template, {
    month_label:      label,
    grand_total:      totalFmt,
    categories_table: catTable,
    app_url:          appUrl,
  }, { escape: false });

  const subject  = i18n.subject(label, totalFmt);
  const text     = `${i18n.breakdown}\n\n${categories.map((c) => `${categoryLabel(c.key, locale)}: ${fmt(c.total)}`).join("\n")}\n\n${locale === "he" ? "סה\"כ" : locale === "ru" ? "Итого" : "Total"}: ${totalFmt}`;

  return sendEmailWithAttachments(opts.recipients, subject, text, [], html);
}

export async function checkMonthlyExpenseReports(now = new Date()): Promise<void> {
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

    const locale = resolveLocale(user.ui_locale);
    const result = await sendMonthlyExpenseEmail({ userId, recipients, locale, now });
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
      logger.info("monthly_expense_report_sent", { user_id: userId, month: monthKey, locale, recipients: recipients.length });
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
