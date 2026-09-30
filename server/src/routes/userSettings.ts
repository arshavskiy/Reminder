import express from "express";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {requireAuth} from "../auth/middleware";
import {DEFAULT_FEATURES, DEFAULT_FEATURES_NESTED, featuresToNested, normalizeFeatures} from "../features";
import {buildPlanEntitlements, newUserSettingsBase, persistPlanEntitlements} from "../plans/planEntitlements";
import {effectivePlanId, planAllowsDocumentImport, PLAN_GATE_MESSAGES} from "../plans/tierFeatures";
import {obligationLangErrorBody, parseObligationSearchLangs} from "../gmail/obligationSearch";

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

    let user: { plan?: string | null; role?: string | null } | null = null;
    try {
      user = await col("users").findOne({ _id: new ObjectId(auth.userId) }) as any;
    } catch {
      user = null;
    }
    const plan_entitlements = buildPlanEntitlements(user);
    const row = await col("user_settings").findOne({ user_id: auth.userId });
    if (!row) {
      // Single source of truth for new-account defaults — newUserSettingsBase is
      // plan-aware (a lapsed trial starts with cloud storage off).
      const defaults = {
        ...newUserSettingsBase(auth.userId, user),
        report_config: DEFAULT_REPORT_CONFIG,
        plan_entitlements,
        plan_entitlements_updated_at: new Date(),
      };
      await col("user_settings").updateOne(
        { user_id: auth.userId },
        { $setOnInsert: defaults },
        { upsert: true }
      );
      res.json(defaults);
      return;
    }
    // Always normalize features to nested format — fixes flat keys, string booleans, mixed corrupt data
    {
      const rawFeatures = (row as any).features ?? (row as any).features_json;
      const flat = normalizeFeatures(rawFeatures) ?? DEFAULT_FEATURES;
      const nested = featuresToNested(flat);
      // Only write if not already clean nested (avoid unnecessary writes)
      const alreadyNested = rawFeatures && typeof rawFeatures === "object" &&
        !Array.isArray(rawFeatures) &&
        Object.values(rawFeatures).every((v) => typeof v === "object" && v !== null && !Array.isArray(v)) &&
        Object.values(rawFeatures).every((v) => Object.values(v as object).every((vv) => typeof vv === "boolean"));
      if (!alreadyNested) {
        await col("user_settings").updateOne(
          { user_id: auth.userId },
          { $set: { features: nested }, $unset: { features_json: "" } },
        );
        (row as any).features = nested;
      }
      delete (row as any).features_json;
    }
    if (!(row as any).report_config) {
      await col("user_settings").updateOne(
        { user_id: auth.userId },
        { $set: { report_config: DEFAULT_REPORT_CONFIG } },
      );
      (row as any).report_config = DEFAULT_REPORT_CONFIG;
    }
    await persistPlanEntitlements(auth.userId);
    const { _id, ...rest } = row as any;
    res.json({ id: _id?.toString(), ...rest, plan_entitlements });
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
      s3_store_invoices?: boolean;
      s3_store_inspection_reports?: boolean;
      discovery_auto_scan?: boolean;
      discovery_langs?: string[] | string;
    };

    const patch: Record<string, unknown> = {};
    if (body.theme !== undefined)                  patch.theme = body.theme;
    if (body.email_from_name !== undefined)        patch.email_from_name = body.email_from_name ?? null;
    if (body.reminder_advance_days !== undefined)  patch.reminder_advance_days = body.reminder_advance_days;
    if (body.ocr_language !== undefined)           patch.ocr_language = body.ocr_language;
    if (body.monthly_report_enabled !== undefined) {
      const entitlements = await persistPlanEntitlements(auth.userId);
      if (Boolean(body.monthly_report_enabled) && !entitlements.automaticMonthlyReports) {
        res.status(403).json({
          error: "automatic_reports_plan_required",
          message: PLAN_GATE_MESSAGES.automaticMonthlyReports,
        });
        return;
      }
      patch.monthly_report_enabled = Boolean(body.monthly_report_enabled);
    }
    if (body.monthly_report_recipients !== undefined) patch.monthly_report_recipients = String(body.monthly_report_recipients ?? "");
    if (body.monthly_report_day !== undefined) patch.monthly_report_day = Math.min(28, Math.max(1, Number(body.monthly_report_day)));
    if (body.monthly_report_hour !== undefined) patch.monthly_report_hour = Math.min(23, Math.max(0, Number(body.monthly_report_hour)));
    if (body.monthly_report_formats !== undefined) patch.monthly_report_formats = body.monthly_report_formats;
    if (body.report_config !== undefined) patch.report_config = normalizeReportConfig(body.report_config);
    if (body.calendar_next_tests_only !== undefined) patch.calendar_next_tests_only = Boolean(body.calendar_next_tests_only);
    if (body.discovery_langs !== undefined) {
      const langs = parseObligationSearchLangs(body.discovery_langs);
      if (typeof langs === "string") {
        res.status(400).json(obligationLangErrorBody(langs));
        return;
      }
      patch.discovery_langs = langs;
    }
    if (body.discovery_auto_scan !== undefined) {
      const enable = Boolean(body.discovery_auto_scan);
      if (enable) {
        // The scan needs the same plan the manual scan needs; refuse here so the
        // toggle cannot be switched on for an account the scheduler would skip.
        let planUser: any = null;
        try { planUser = await col("users").findOne({ _id: new ObjectId(auth.userId) }); } catch { /* treated as no plan */ }
        if (!planAllowsDocumentImport(effectivePlanId(planUser))) {
          res.status(403).json({ error: "plan_no_document_import", message: PLAN_GATE_MESSAGES.documentImport });
          return;
        }
      }
      patch.discovery_auto_scan = enable;
    }
    if (body.default_email_template_id !== undefined) patch.default_email_template_id = body.default_email_template_id ?? null;
    if (body.s3_store_invoices !== undefined || body.s3_store_inspection_reports !== undefined) {
      // A plan without fileStorage cannot turn cloud storage back on: without
      // this the toggles were writable straight from the request body, so a
      // digital account could re-enable the storage its plan excludes.
      const wantsStorage = Boolean(body.s3_store_invoices) || Boolean(body.s3_store_inspection_reports);
      const entitlements = await persistPlanEntitlements(auth.userId);
      if (wantsStorage && !entitlements.fileStorage) {
        res.status(403).json({
          error: "file_storage_plan_required",
          message: PLAN_GATE_MESSAGES.fileStorage,
        });
        return;
      }
      if (body.s3_store_invoices !== undefined) patch.s3_store_invoices = Boolean(body.s3_store_invoices);
      if (body.s3_store_inspection_reports !== undefined) patch.s3_store_inspection_reports = Boolean(body.s3_store_inspection_reports);
    }
    const rawFeatures = body.features !== undefined ? body.features : body.features_json;
    if (rawFeatures !== undefined) {
      try {
        const flat = normalizeFeatures(rawFeatures);
        patch.features = flat ? featuresToNested(flat) : null;
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid features" });
        return;
      }
    }

    const setOnInsert: Record<string, unknown> = { user_id: auth.userId };
    if (patch.features === undefined) setOnInsert.features = DEFAULT_FEATURES_NESTED;
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

    const plan_entitlements = await persistPlanEntitlements(auth.userId);
    const row = await col("user_settings").findOne({ user_id: auth.userId });
    const { _id, ...rest } = (row ?? {}) as any;
    res.json({ id: _id?.toString(), ...rest, plan_entitlements });
  });
}
