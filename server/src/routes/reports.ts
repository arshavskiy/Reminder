import express from "express";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {HTTPException, requireAuth} from "../auth/middleware";
import {featureFlagsForUser, normalizePlanId, PLAN_GATE_MESSAGES} from "../plans/tierFeatures";
import {
    generateMonthlyContractReports,
    generateMonthlyTrackingReport,
    normalizeAllReportFields,
    normalizeMonthlyReportFields,
    reportPeriodKey,
    sendMonthlyReportsPerClient,
    sendMonthlyReportToRecipients,
} from "../reports/monthlyReports";
import {resolveAccountReportRecipients, uniqueEmails} from "../reports/monthlyReportRecipients";
import {renderHtmlPdf} from "./printTemplates";
import {normalizeProviderCategory} from "../invoices/expenseFacets";

export function registerReportRoutes(app: express.Application) {
  app.get("/api/reports/monthly/download", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    try {
      const now = new Date();
      const year = Number(req.query.year ?? now.getFullYear());
      const month =
        req.query.month == null || req.query.month === ""
          ? undefined
          : Number(req.query.month);
      const format = String(req.query.format ?? "docx");
      const user = await col("users").findOne({ _id: new ObjectId(userId) }) as any;
      if (normalizePlanId(user?.plan ?? user?.role) === "expired") {
        res.status(403).json({ error: "export_plan_required", message: "ייצוא דוחות אינו זמין במסלול שפג תוקפו." });
        return;
      }
      if (format === "xlsx") {
        if (!featureFlagsForUser(user).excelExport) {
          res.status(403).json({ error: "excel_export_plan_required", message: PLAN_GATE_MESSAGES.excelExport });
          return;
        }
      }
      const clientId =
        typeof req.query.clientId === "string" ? req.query.clientId : undefined;
      const mode = typeof req.query.mode === "string" ? req.query.mode : undefined;
      if (mode && mode !== "all" && mode !== "client") {
        res.status(400).json({ error: "mode must be all or client" });
        return;
      }
      const reportMode = clientId || mode === "client" ? "client" : "all";
      const selectedFields = parseSelectedFields(req.query.fields)
        ?? await loadSavedReportFields(userId, reportMode);
      if (!validPeriod(year, month)) {
        res.status(400).json({ error: "Invalid year or month" });
        return;
      }
      if (format !== "docx" && format !== "xlsx" && format !== "csv") {
        res.status(400).json({ error: "format must be docx, xlsx or csv" });
        return;
      }

      const report = reportMode === "client"
        ? await generateMonthlyContractReports(
            userId,
            year,
            month,
            selectedFields,
            clientId,
          )
        : await generateMonthlyTrackingReport(
            userId,
            year,
            month,
            selectedFields,
          );
      const periodKey = reportPeriodKey(year, month);
      const filename = `contracts-report-${periodKey}.${format}`;
      const content =
        format === "docx"
          ? report.docx
          : format === "xlsx"
            ? report.xlsx
            : report.csv;
      res.setHeader(
        "Content-Type",
        format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/csv; charset=utf-8",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.setHeader("Content-Length", content.length);
      res.end(content);
    } catch (err) {
      res
        .status(500)
        .json({
          error:
            err instanceof Error ? err.message : "Report generation failed",
        });
    }
  });

  app.post("/api/reports/monthly/send", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    try {
      const now = new Date();
      const body = req.body as {
        year?: number;
        month?: number | string | null;
        formats?: string[];
        recipients?: string[];
        clientId?: string;
        fields?: string[];
        deliveryMode?: "combined" | "client";
      };
      const year = Number(body.year ?? now.getFullYear());
      const month = body.month == null || body.month === "" ? undefined : Number(body.month);
      if (!validPeriod(year, month)) {
        res.status(400).json({ error: "Invalid year or month" });
        return;
      }
      const [settings, user] = await Promise.all([
        col("user_settings").findOne({ user_id: userId }) as Promise<any>,
        col("users").findOne({ _id: new ObjectId(userId) }) as Promise<any>,
      ]);
      if (!featureFlagsForUser(user).automaticMonthlyReports) {
        res.status(403).json({
          error: "automatic_reports_plan_required",
          message: PLAN_GATE_MESSAGES.automaticMonthlyReports,
        });
        return;
      }
      const baseRecipients = body.recipients?.length ? body.recipients : null;
      const recipients = baseRecipients?.length
        ? uniqueEmails(baseRecipients)
        : resolveAccountReportRecipients({
            configuredRecipients: settings?.monthly_report_recipients,
            accountEmail: user?.email ?? null,
          });
      const deliveryMode = body.deliveryMode === "combined" ? "combined" : "client";
      const formats = body.formats?.length
        ? normalizeFormats(body.formats)
        : parseFormats(settings?.monthly_report_formats);
      const savedFields = savedReportFieldsFromSettings(settings, "client");
      const selectedFields = body.fields?.length ? body.fields : savedFields;
      if (!formats.length) {
        res.status(400).json({ error: "Configure at least one file format" });
        return;
      }
      // Combined/account reports need account recipients; client mode can rely on client emails.
      if (deliveryMode === "combined" && !recipients.length) {
        res.status(400).json({
          error: "Configure at least one recipient (or use an account with an email)",
        });
        return;
      }

      const result =
        deliveryMode === "combined"
          ? await sendMonthlyReportToRecipients({
              userId,
              year,
              month,
              recipients,
              formats,
              rawFields: selectedFields,
              clientId: body.clientId,
              includeClientRecipient: false,
            })
          : await sendMonthlyReportsPerClient({
              userId,
              year,
              month,
              recipients,
              formats,
              rawFields: selectedFields,
              clientId: body.clientId,
              includeClientRecipient: true,
            });
      const periodKey = reportPeriodKey(year, month);
      const sentAt = new Date().toISOString();
      if (result.success) {
        await col("user_settings").updateOne(
          { user_id: userId },
          {
            $set: {
              monthly_report_last_sent: `${periodKey} (${sentAt})`,
              monthly_report_last_error: null,
            },
          },
          { upsert: true },
        );
      } else {
        await col("user_settings").updateOne(
          { user_id: userId },
          {
            $set: {
              monthly_report_last_error: result.error ?? "שליחה נכשלה",
            },
          },
          { upsert: true },
        );
      }
      res.status(result.success ? 200 : 502).json(result);
    } catch (err) {
      res
        .status(500)
        .json({
          error: err instanceof Error ? err.message : "Report delivery failed",
        });
    }
  });

  // ── Annual summary PDF ────────────────────────────────────────────────────
  app.get("/api/reports/annual-summary.pdf", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try {
      auth = await requireAuth(req.headers.cookie);
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const now = new Date();
    const year = Number(req.query.year ?? now.getFullYear() - (now.getMonth() < 1 ? 1 : 0));
    const locale = (req.query.locale as string) === "ru" ? "ru" : (req.query.locale as string) === "en" ? "en" : "he";

    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      res.status(400).json({ error: "invalid_year" });
      return;
    }

    const from = new Date(year, 0, 1);
    const to   = new Date(year + 1, 0, 1);

    const invoices = await col("invoices").find({
      user_id: auth.userId,
      cash_flow: { $ne: "income" },
      invoice_date: { $gte: from, $lt: to },
    }).toArray() as any[];

    const CATEGORY_LABELS: Record<string, Record<string, string>> = {
      transport:   { he: "תחבורה",        en: "Transport",       ru: "Транспорт" },
      parking:     { he: "חניה",           en: "Parking",         ru: "Парковка" },
      fuel:        { he: "דלק",            en: "Fuel",            ru: "Топливо" },
      food:        { he: "מזון",           en: "Food",            ru: "Питание" },
      household:   { he: "חשבונות הבית",  en: "Household bills", ru: "Коммунальные" },
      government:  { he: "ממשלה",          en: "Government",      ru: "Госпошлины" },
      insurance:   { he: "ביטוח",          en: "Insurance",       ru: "Страхование" },
      finance:     { he: "פיננסים",        en: "Finance",         ru: "Финансы" },
      travel:      { he: "תיירות",         en: "Travel",          ru: "Туризм" },
      healthcare:  { he: "בריאות",         en: "Healthcare",      ru: "Здоровье" },
      education:   { he: "לימודים",        en: "Education",       ru: "Образование" },
      retail:      { he: "קמעונאות",       en: "Retail",          ru: "Шоппинг" },
      digital:     { he: "דיגיטל",         en: "Digital",         ru: "Диджитал" },
      development: { he: "פיתוח",          en: "Development",     ru: "Разработка" },
      general:     { he: "כללי",           en: "General",         ru: "Прочее" },
      payment:     { he: "לא מסווג",       en: "Uncategorized",   ru: "Без категории" },
    };
    const MONTHS: Record<string, string[]> = {
      he: ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"],
      en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
      ru: ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"],
    };
    const I18N: Record<string, Record<string, string>> = {
      he: { title: `סיכום שנתי ${year}`, totalLabel: "סה\"כ הוצאות", categoryLabel: "קטגוריה", amountLabel: "סכום", monthLabel: "חודש", generatedBy: "RemindOCR — נוצר אוטומטית", currency: "₪" },
      en: { title: `Annual Expense Summary ${year}`, totalLabel: "Total expenses", categoryLabel: "Category", amountLabel: "Amount", monthLabel: "Month", generatedBy: "RemindOCR — generated automatically", currency: "₪" },
      ru: { title: `Годовой отчёт о расходах ${year}`, totalLabel: "Итого расходов", categoryLabel: "Категория", amountLabel: "Сумма", monthLabel: "Месяц", generatedBy: "RemindOCR — сформировано автоматически", currency: "₪" },
    };
    const i18n = I18N[locale];
    const isRtl = locale === "he";
    const dir = isRtl ? "rtl" : "ltr";

    // Aggregate by category and by month
    const catTotals = new Map<string, number>();
    const monthTotals = new Map<number, number>();
    let grandTotal = 0;

    for (const inv of invoices) {
      const amount: number = inv.amount_ils ?? inv.amount ?? 0;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const catKey = normalizeProviderCategory(inv.provider_category) ?? "general";
      const month: number = inv.invoice_date instanceof Date
        ? inv.invoice_date.getMonth()
        : new Date(inv.invoice_date).getMonth();
      grandTotal += amount;
      catTotals.set(catKey, (catTotals.get(catKey) ?? 0) + amount);
      monthTotals.set(month, (monthTotals.get(month) ?? 0) + amount);
    }

    const fmt = (n: number) => `${i18n.currency}${Math.round(n).toLocaleString("he-IL")}`;

    const catRows = [...catTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, total]) => {
        const label = CATEGORY_LABELS[key]?.[locale] ?? key;
        return `<tr>
          <td style="padding:9px 14px;font-size:14px;color:#111827;">${label}</td>
          <td style="padding:9px 14px;font-size:14px;font-weight:700;color:#16a34a;text-align:${isRtl ? "left" : "right"};direction:ltr;">${fmt(total)}</td>
        </tr>`;
      }).join("");

    const monthRows = [...monthTotals.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([m, total]) => {
        const label = MONTHS[locale][m];
        return `<tr>
          <td style="padding:8px 14px;font-size:13px;color:#374151;">${label}</td>
          <td style="padding:8px 14px;font-size:13px;font-weight:600;color:#1e40af;text-align:${isRtl ? "left" : "right"};direction:ltr;">${fmt(total)}</td>
        </tr>`;
      }).join("");

    const html = `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #f8fafc; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1a2e1a; direction: ${dir}; }
  .header { background: linear-gradient(135deg, #065f46, #059669); border-radius: 14px; padding: 28px 32px; margin-bottom: 28px; color: #fff; }
  .header h1 { margin: 0 0 6px; font-size: 26px; font-weight: 800; }
  .header .sub { font-size: 14px; opacity: 0.85; }
  .total-banner { background: #dcfce7; border: 2px solid #16a34a; border-radius: 12px; padding: 20px 28px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: center; }
  .total-banner .label { font-size: 14px; font-weight: 600; color: #166534; }
  .total-banner .amount { font-size: 36px; font-weight: 800; color: #14532d; direction: ltr; }
  .section { background: #fff; border-radius: 12px; margin-bottom: 24px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
  .section-title { padding: 14px 18px; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #d1fae5; background: #f0fdf4; }
  table { width: 100%; border-collapse: collapse; }
  tr:nth-child(even) { background: #fafafa; }
  td { border-bottom: 1px solid #f3f4f6; }
  tr:last-child td { border-bottom: none; }
  .footer { margin-top: 32px; text-align: center; font-size: 11px; color: #9ca3af; }
</style>
</head>
<body>
<div class="header">
  <h1>${i18n.title}</h1>
  <div class="sub">${auth.user?.email ?? ""}</div>
</div>

${grandTotal > 0 ? `
<div class="total-banner">
  <div class="label">${i18n.totalLabel}</div>
  <div class="amount">${fmt(grandTotal)}</div>
</div>

<div class="section">
  <div class="section-title">${i18n.categoryLabel}</div>
  <table>
    <thead><tr>
      <th style="padding:10px 14px;text-align:${isRtl ? "right" : "left"};font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">${i18n.categoryLabel}</th>
      <th style="padding:10px 14px;text-align:${isRtl ? "left" : "right"};font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">${i18n.amountLabel}</th>
    </tr></thead>
    <tbody>${catRows}</tbody>
  </table>
</div>

<div class="section">
  <div class="section-title">${i18n.monthLabel}</div>
  <table>
    <thead><tr>
      <th style="padding:10px 14px;text-align:${isRtl ? "right" : "left"};font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">${i18n.monthLabel}</th>
      <th style="padding:10px 14px;text-align:${isRtl ? "left" : "right"};font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">${i18n.amountLabel}</th>
    </tr></thead>
    <tbody>${monthRows}</tbody>
  </table>
</div>` : `<p style="text-align:center;color:#6b7280;padding:40px;">${locale === "he" ? "אין הוצאות לשנה זו" : locale === "ru" ? "Нет расходов за этот год" : "No expenses found for this year"}</p>`}

<div class="footer">${i18n.generatedBy}</div>
</body></html>`;

    try {
      const pdfBuffer = await renderHtmlPdf(html);
      const filename = `annual-expenses-${year}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(pdfBuffer));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "PDF generation failed" });
    }
  });
}

async function loadSavedReportFields(userId: string, mode: "all" | "client"): Promise<string[]> {
  const settings = await col("user_settings").findOne({ user_id: userId }) as any;
  return savedReportFieldsFromSettings(settings, mode);
}

function savedReportFieldsFromSettings(settings: any, mode: "all" | "client"): string[] {
  const raw = mode === "client"
    ? settings?.report_config?.client_fields
    : settings?.report_config?.all_fields;
  return mode === "client"
    ? normalizeMonthlyReportFields(raw)
    : normalizeAllReportFields(raw);
}

function parseSelectedFields(raw: unknown): string[] | undefined {
  if (Array.isArray(raw))
    return raw.filter((field): field is string => typeof field === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed))
        return parsed.filter(
          (field): field is string => typeof field === "string",
        );
    } catch {
      return raw
        .split(",")
        .map((field) => field.trim())
        .filter(Boolean);
    }
  }
  return undefined;
}

function parseFormats(raw: unknown): string[] {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return normalizeFormats(parsed);
  } catch {
    return ["docx", "xlsx"];
  }
}

function validPeriod(year: number, month?: number): boolean {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return false;
  if (month == null) return true;
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

function normalizeFormats(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ["docx", "xlsx"];
  const selected = raw
    .map((format) => (format === "doc" ? "docx" : format))
    .filter(
      (format) => format === "docx" || format === "xlsx" || format === "csv",
    );
  return selected.length ? selected : ["docx", "xlsx"];
}
