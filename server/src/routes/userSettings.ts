import express from "express";
import {col} from "../db/db";
import {requireAuth} from "../auth/middleware";
import {DEFAULT_FEATURES, normalizeFeatures} from "../features";

const DEFAULT_REPORT_CONFIG = {
  all_fields: [
    "tracking_date",
    "tracking_checked",
    "client",
    "contact_person",
    "tracking_phone",
    "tracking_license_number",
    "tracking_relevant",
    "tracking_notes",
  ],
  client_fields: [
    "contract_number",
    "contract_type",
    "client",
    "contact_person",
    "contact_phone",
    "contact_email",
    "client_address",
    "start_date",
    "expiry_date",
    "status",
    "source_document",
    "equipment",
    "reminders",
  ],
};

function normalizeReportConfig(raw: unknown) {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const cleanArray = (input: unknown) =>
    Array.isArray(input)
      ? [...new Set(input.filter((field): field is string => typeof field === "string" && field.trim() !== "").map((field) => field.trim()))]
      : undefined;
  return {
    all_fields: cleanArray(value.all_fields) ?? DEFAULT_REPORT_CONFIG.all_fields,
    client_fields: cleanArray(value.client_fields) ?? DEFAULT_REPORT_CONFIG.client_fields,
  };
}

export function registerUserSettingsRoutes(app: express.Application) {
  app.get("/api/user-settings", async (req, res) => {
    let auth;
    try {
      auth = await requireAuth(req.headers.cookie ?? undefined);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const row = await col("user_settings").findOne({ user_id: auth.userId });
    if (!row) {
      const defaults = {
        user_id: auth.userId,
        theme: "light",
        email_from_name: null,
        reminder_advance_days: "[90,60,30]",
        ocr_language: "heb+eng",
        features: DEFAULT_FEATURES,
        calendar_next_tests_only: false,
        monthly_report_enabled: false,
        monthly_report_recipients: "",
        monthly_report_day: 1,
        monthly_report_hour: 8,
        monthly_report_formats: JSON.stringify(["docx", "xlsx"]),
        monthly_report_last_sent: null,
        report_config: DEFAULT_REPORT_CONFIG,
      };
      await col("user_settings").updateOne(
        { user_id: auth.userId },
        { $setOnInsert: defaults },
        { upsert: true }
      );
      res.json(defaults);
      return;
    }
    if (!(row as any).features) {
      const features = normalizeFeatures((row as any).features_json) ?? DEFAULT_FEATURES;
      await col("user_settings").updateOne(
        { user_id: auth.userId },
        { $set: { features }, $unset: { features_json: "" } },
      );
      (row as any).features = features;
      delete (row as any).features_json;
    }
    if (!(row as any).report_config) {
      await col("user_settings").updateOne(
        { user_id: auth.userId },
        { $set: { report_config: DEFAULT_REPORT_CONFIG } },
      );
      (row as any).report_config = DEFAULT_REPORT_CONFIG;
    }
    const { _id, ...rest } = row as any;
    res.json({ id: _id?.toString(), ...rest });
  });

  app.put("/api/user-settings", async (req, res) => {
    let auth;
    try {
      auth = await requireAuth(req.headers.cookie ?? undefined);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = req.body as {
      theme?: string;
      email_from_name?: string;
      reminder_advance_days?: string;
      ocr_language?: string;
      monthly_report_enabled?: boolean;
      monthly_report_recipients?: string;
      monthly_report_day?: number;
      monthly_report_hour?: number;
      monthly_report_formats?: string;
      report_config?: unknown;
      calendar_next_tests_only?: boolean;
      default_email_template_id?: string | null;
      features?: Record<string, boolean> | string | null;
      features_json?: string | null;
    };

    const patch: Record<string, unknown> = {};
    if (body.theme !== undefined)                  patch.theme = body.theme;
    if (body.email_from_name !== undefined)        patch.email_from_name = body.email_from_name ?? null;
    if (body.reminder_advance_days !== undefined)  patch.reminder_advance_days = body.reminder_advance_days;
    if (body.ocr_language !== undefined)           patch.ocr_language = body.ocr_language;
    if (body.monthly_report_enabled !== undefined) patch.monthly_report_enabled = Boolean(body.monthly_report_enabled);
    if (body.monthly_report_recipients !== undefined) patch.monthly_report_recipients = String(body.monthly_report_recipients ?? "");
    if (body.monthly_report_day !== undefined) patch.monthly_report_day = Math.min(28, Math.max(1, Number(body.monthly_report_day)));
    if (body.monthly_report_hour !== undefined) patch.monthly_report_hour = Math.min(23, Math.max(0, Number(body.monthly_report_hour)));
    if (body.monthly_report_formats !== undefined) patch.monthly_report_formats = body.monthly_report_formats;
    if (body.report_config !== undefined) patch.report_config = normalizeReportConfig(body.report_config);
    if (body.calendar_next_tests_only !== undefined) patch.calendar_next_tests_only = Boolean(body.calendar_next_tests_only);
    if (body.default_email_template_id !== undefined) patch.default_email_template_id = body.default_email_template_id ?? null;
    const rawFeatures = body.features !== undefined ? body.features : body.features_json;
    if (rawFeatures !== undefined) {
      try {
        patch.features = normalizeFeatures(rawFeatures);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid features" });
        return;
      }
    }

    const setOnInsert: Record<string, unknown> = { user_id: auth.userId };
    if (patch.features === undefined) setOnInsert.features = DEFAULT_FEATURES;
    if (patch.report_config === undefined) setOnInsert.report_config = DEFAULT_REPORT_CONFIG;

    const update: Record<string, unknown> = {
      $set: patch,
      $setOnInsert: setOnInsert,
    };
    if (rawFeatures !== undefined) update.$unset = { features_json: "" };

    await col("user_settings").updateOne(
      { user_id: auth.userId },
      update,
      { upsert: true }
    );

    const row = await col("user_settings").findOne({ user_id: auth.userId });
    const { _id, ...rest } = (row ?? {}) as any;
    res.json({ id: _id?.toString(), ...rest });
  });
}
