import express from "express";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {HTTPException, requireAuth} from "../auth/middleware";
import {featureFlagsForUser, PLAN_GATE_MESSAGES} from "../plans/tierFeatures";
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
      if (format === "xlsx") {
        const user = await col("users").findOne({ _id: new ObjectId(userId) }) as any;
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
