import express from "express";
import { ObjectId } from "mongodb";
import { col } from "../db/db";
import { requireAuth, HTTPException } from "../auth/middleware";
import {
  generateMonthlyContractReports,
  generateMonthlyTrackingReport,
  reportPeriodKey,
  sendMonthlyReportsPerClient,
  sendMonthlyReportToRecipients,
} from "../reports/monthlyReports";

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
      const selectedFields = parseSelectedFields(req.query.fields);
      const clientId =
        typeof req.query.clientId === "string" ? req.query.clientId : undefined;
      if (!validPeriod(year, month)) {
        res.status(400).json({ error: "Invalid year or month" });
        return;
      }
      if (format !== "docx" && format !== "xlsx" && format !== "csv") {
        res.status(400).json({ error: "format must be docx, xlsx or csv" });
        return;
      }

      const report = clientId
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
        month?: number;
        formats?: string[];
        recipients?: string[];
        clientId?: string;
        fields?: string[];
        deliveryMode?: "combined" | "client";
      };
      const year = Number(body.year ?? now.getFullYear());
      const month = body.month == null ? undefined : Number(body.month);
      if (!validPeriod(year, month)) {
        res.status(400).json({ error: "Invalid year or month" });
        return;
      }
      const [settings, user] = await Promise.all([
        col("user_settings").findOne({ user_id: userId }) as Promise<any>,
        col("users").findOne({ _id: new ObjectId(userId) }) as Promise<any>,
      ]);
      const configuredRecipients = String(
        settings?.monthly_report_recipients ?? "",
      )
        .split(/[;,\s]+/)
        .filter(Boolean);
      const recipients = uniqueEmails([
        ...((body.recipients?.length
          ? body.recipients
          : configuredRecipients) || user?.email),
      ]);
      const formats = body.formats?.length
        ? normalizeFormats(body.formats)
        : parseFormats(settings?.monthly_report_formats);
      if (!recipients.length || !formats.length) {
        res
          .status(400)
          .json({
            error: "Configure at least one recipient and one file format",
          });
        return;
      }

      const result =
        body.deliveryMode === "combined"
          ? await sendMonthlyReportToRecipients({
              userId,
              year,
              month,
              recipients,
              formats,
              rawFields: body.fields,
              clientId: body.clientId,
              includeClientRecipient: false,
            })
          : await sendMonthlyReportsPerClient({
              userId,
              year,
              month,
              recipients,
              formats,
              rawFields: body.fields,
              clientId: body.clientId,
              includeClientRecipient: true,
            });
      const periodKey = reportPeriodKey(year, month);
      if (result.success) {
        await col("user_settings").updateOne(
          { user_id: userId },
          {
            $set: {
              monthly_report_last_sent: periodKey,
              monthly_report_last_error: null,
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

function uniqueEmails(values: Array<unknown>) {
  return [
    ...new Set(
      values
        .filter(
          (value): value is string =>
            typeof value === "string" && value.trim() !== "",
        )
        .map((value) => value.trim().toLowerCase()),
    ),
  ];
}
