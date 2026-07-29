import express from "express";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {requireAuth, HTTPException} from "../auth/middleware";
import {generateMonthlyContractReports, sendMonthlyReportsPerClient} from "../reports/monthlyReports";

export function registerReportRoutes(app: express.Application) {
  app.get("/api/reports/monthly/download", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({error: err.message});
      return;
    }

    try {
      const now = new Date();
      const year = Number(req.query.year ?? now.getFullYear());
      const month = Number(req.query.month ?? now.getMonth() + 1);
      const format = String(req.query.format ?? "pdf");
      const selectedFields = parseSelectedFields(req.query.fields);
      const clientId = typeof req.query.clientId === "string" ? req.query.clientId : undefined;
      if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
        res.status(400).json({error: "Invalid year or month"});
        return;
      }
      if (format !== "pdf" && format !== "csv") {
        res.status(400).json({error: "format must be pdf or csv"});
        return;
      }

      const report = await generateMonthlyContractReports(userId, year, month, selectedFields, clientId);
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      const filename = `contracts-report-${monthKey}.${format}`;
      const content = format === "pdf" ? report.pdf : report.csv;
      res.setHeader("Content-Type", format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader("Content-Length", content.length);
      res.end(content);
    } catch (err) {
      res.status(500).json({error: err instanceof Error ? err.message : "Report generation failed"});
    }
  });

  app.post("/api/reports/monthly/send", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({error: err.message});
      return;
    }

    try {
      const now = new Date();
      const body = req.body as {year?: number; month?: number; formats?: string[]; recipients?: string[]; clientId?: string};
      const year = Number(body.year ?? now.getFullYear());
      const month = Number(body.month ?? now.getMonth() + 1);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        res.status(400).json({error: "Invalid year or month"});
        return;
      }
      const [settings, user] = await Promise.all([
        col("user_settings").findOne({user_id: userId}) as Promise<any>,
        col("users").findOne({_id: new ObjectId(userId)}) as Promise<any>,
      ]);
      const configuredRecipients = String(settings?.monthly_report_recipients ?? "").split(/[;,\s]+/).filter(Boolean);
      const recipients = uniqueEmails([...(body.recipients?.length ? body.recipients : configuredRecipients), user?.email]);
      const formats = body.formats?.length ? body.formats : parseFormats(settings?.monthly_report_formats);
      if (!recipients.length || !formats.length) {
        res.status(400).json({error: "Configure at least one recipient and one file format"});
        return;
      }

      const result = await sendMonthlyReportsPerClient({userId, year, month, recipients, formats, clientId: body.clientId});
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      if (result.success) {
        await col("user_settings").updateOne({user_id: userId}, {$set: {monthly_report_last_sent: monthKey, monthly_report_last_error: null}}, {upsert: true});
      }
      res.status(result.success ? 200 : 502).json(result);
    } catch (err) {
      res.status(500).json({error: err instanceof Error ? err.message : "Report delivery failed"});
    }
  });
}

function parseSelectedFields(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) return raw.filter((field): field is string => typeof field === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((field): field is string => typeof field === "string");
    } catch {
      return raw.split(",").map((field) => field.trim()).filter(Boolean);
    }
  }
  return undefined;
}

function parseFormats(raw: unknown): string[] {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.filter((format) => format === "pdf" || format === "csv") : ["pdf", "csv"];
  } catch {
    return ["pdf", "csv"];
  }
}

function uniqueEmails(values: Array<unknown>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim() !== "").map((value) => value.trim().toLowerCase()))];
}