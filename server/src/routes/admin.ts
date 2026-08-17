import express from "express";
import {ObjectId} from "mongodb";
import {extname} from "path";
import {col} from "../db/db";
import {requireAuth, requireRole} from "../auth/middleware";
import type {UserRole} from "../../src/shared/types.js";
import {getSettings} from "../settings.js";
import {sendPushToAdmins} from "../push/pushService.js";
import {DEFAULT_FEATURES, normalizeFeatures} from "../features.js";

const VALID_ROLES: UserRole[] = ["admin", "pro", "user"];
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

function flatUser(doc: any) {
  if (!doc) return doc;
  const { _id, password_hash, verification_token, reset_token, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}

export function registerAdminRoutes(app: express.Application) {
  // All /api/admin/* routes require admin role
  async function adminAuth(req: express.Request, res: express.Response) {
    try {
      const auth = await requireAuth(req.headers.cookie ?? undefined);
      requireRole(auth, "admin");
      return auth;
    } catch (err: any) {
      res.status(err.status ?? 403).json({ error: err.message });
      return null;
    }
  }

  // GET /api/admin/users — list all users
  app.get("/api/admin/users", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const users = await col("users")
      .find({})
      .sort({ created_at: -1 })
      .toArray();

    res.json(users.map(flatUser));
  });

  // ── Web Push subscription (admin notifications) ───────────────────────────
  // GET /api/admin/push/vapid-key
  app.get("/api/admin/push/vapid-key", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
  });

  // POST /api/admin/push/subscribe
  app.post("/api/admin/push/subscribe", async (req, res) => {
    const auth = await adminAuth(req, res);
    if (!auth) return;
    const { endpoint, keys } = req.body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: "Invalid subscription" });
      return;
    }
    await col("push_subscriptions").updateOne(
      { user_id: auth.userId, endpoint },
      { $set: { user_id: auth.userId, endpoint, keys, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
      { upsert: true },
    );
    res.status(201).json({ ok: true });
  });

  // POST /api/admin/push/unsubscribe
  app.post("/api/admin/push/unsubscribe", async (req, res) => {
    const auth = await adminAuth(req, res);
    if (!auth) return;
    const { endpoint } = req.body as { endpoint?: string };
    await col("push_subscriptions").deleteOne({ user_id: auth.userId, endpoint });
    res.json({ ok: true });
  });

  // POST /api/admin/push/test — send a test notification to the caller's admins
  app.post("/api/admin/push/test", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    await sendPushToAdmins({
      title: "בדיקת התראה",
      body: "התראות אדמין פעילות ✓",
      data: { url: "/admin" },
    });
    res.json({ ok: true });
  });

  // PUT /api/admin/users/:id — update role / is_active
  app.put("/api/admin/users/:id", async (req, res) => {
    const auth = await adminAuth(req, res);
    if (!auth) return;

    const { role, is_active } = req.body as { role?: string; is_active?: number };

    const updates: Record<string, any> = { updated_at: new Date() };

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role as UserRole)) {
        res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
        return;
      }
      updates.role = role;
    }

    if (is_active !== undefined) {
      updates.is_active = is_active ? 1 : 0;
    }

    let filter: Record<string, any>;
    try {
      filter = { _id: new ObjectId(req.params.id) };
    } catch {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    // Prevent admin from demoting themselves
    if (role && role !== "admin" && req.params.id === auth.userId) {
      res.status(400).json({ error: "Cannot change your own role" });
      return;
    }

    await col("users").updateOne(filter, { $set: updates });
    const updated = await col("users").findOne(filter);
    res.json(flatUser(updated));
  });


  // ── Monitoring: Documents & Extraction ────────────────────────────────────
  // GET /api/admin/monitor/documents
  app.get("/api/admin/monitor/documents", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const [byUserStatus, failed, stuck, storage] = await Promise.all([
      // Per-user, per-status counts
      col("documents").aggregate([
        {
          $group: {
            _id: { user_id: "$user_id", status: "$processing_status" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.user_id": 1 } },
      ]).toArray(),

      // Failed extractions with error messages
      col("documents").find(
        { processing_status: "error" },
        { projection: { _id: 1, user_id: 1, original_filename: 1, error_message: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(50).toArray(),

      // Stuck in queued (older than 10 minutes)
      col("documents").find(
        {
          processing_status: "queued",
          created_at: { $lt: new Date(Date.now() - 10 * 60 * 1000) },
        },
        { projection: { _id: 1, user_id: 1, original_filename: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(50).toArray(),

      // S3 storage per user
      col("documents").aggregate([
        { $match: { file_size_bytes: { $exists: true, $gt: 0 } } },
        {
          $group: {
            _id: "$user_id",
            total_bytes: { $sum: "$file_size_bytes" },
            doc_count: { $sum: 1 },
          },
        },
        { $sort: { total_bytes: -1 } },
      ]).toArray(),
    ]);

    // Build per-user status matrix from byUserStatus
    const userStatusMap: Record<string, Record<string, number>> = {};
    for (const row of byUserStatus) {
      const uid = row._id.user_id ?? "unknown";
      if (!userStatusMap[uid]) userStatusMap[uid] = {};
      userStatusMap[uid][row._id.status ?? "unknown"] = row.count;
    }

    res.json({
      byUserStatus: userStatusMap,
      failed: failed.map((d: any) => ({
        id: d._id?.toString(),
        user_id: d.user_id,
        filename: d.original_filename,
        error: d.error_message,
        created_at: d.created_at,
      })),
      stuck: stuck.map((d: any) => ({
        id: d._id?.toString(),
        user_id: d.user_id,
        filename: d.original_filename,
        created_at: d.created_at,
      })),
      storage: storage.map((s: any) => ({
        user_id: s._id,
        total_bytes: s.total_bytes,
        doc_count: s.doc_count,
      })),
    });
  });

  // GET /api/admin/documents/:id — fetch any document regardless of owner
  app.get("/api/admin/documents/:id", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    let filter: Record<string, any>;
    try { filter = { _id: new ObjectId(req.params.id) }; } catch {
      res.status(400).json({ error: "Invalid id" }); return;
    }
    const doc = await col("documents").findOne(filter);
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    const { _id, ...rest } = doc as any;
    res.json({ id: _id.toString(), ...rest });
  });

  // GET /api/admin/documents/:id/download — signed URL for any document
  app.get("/api/admin/documents/:id/download", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    let filter: Record<string, any>;
    try { filter = { _id: new ObjectId(req.params.id) }; } catch {
      res.status(400).json({ error: "Invalid id" }); return;
    }
    const doc = (await col("documents").findOne(filter)) as any;
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    if (!doc.spaces_key) { res.status(404).json({ error: "No S3 file" }); return; }
    try {
      const { getSpacesSignedUrl } = await import("../storage/spaces.js");
      const SIGNED_URL_TTL = 7 * 24 * 3600;
      const expiresAt: Date | null = doc.signed_url_expires_at ? new Date(doc.signed_url_expires_at) : null;
      const needsRefresh = !doc.download_url || !expiresAt || expiresAt.getTime() - Date.now() < 3600_000;
      let url: string = doc.download_url ?? "";
       if (needsRefresh) {
        url = await getSpacesSignedUrl(doc.spaces_key, SIGNED_URL_TTL, doc.file_name ?? undefined);
        const { ObjectId } = await import("mongodb");
        await col("documents").updateOne({ _id: new ObjectId(req.params.id) }, {
          $set: { download_url: url, signed_url_expires_at: new Date(Date.now() + SIGNED_URL_TTL * 1000), updated_at: new Date() },
        });
      }
      res.json({ url, source: "s3" });
    } catch {
      res.status(500).json({ error: "Failed to generate signed URL" });
    }
  });

  // GET /api/admin/monitor/extractions?user_id=&page=&limit=
  app.get("/api/admin/monitor/extractions", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const userId = req.query.user_id as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? "50", 10)));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { processing_status: "done" };
    if (userId) filter.user_id = userId;

    const [docs, total] = await Promise.all([
      col("documents").find(filter, {
        projection: {
          _id: 1, user_id: 1, file_name: 1, document_type: 1,
          extracted_fields: 1, processing_status: 1, created_at: 1,
        },
      }).sort({ created_at: -1 }).skip(skip).limit(limit).toArray(),
      col("documents").countDocuments(filter),
    ]);

    res.json({
      total,
      page,
      limit,
      docs: docs.map((d: any) => {
        let fields: Record<string, any> = {};
        try { fields = d.extracted_fields ? JSON.parse(d.extracted_fields) : {}; } catch { fields = {}; }
        return {
          id: d._id?.toString(),
          user_id: d.user_id,
          filename: d.file_name,
          document_type: d.document_type ?? fields.document_type ?? null,
          created_at: d.created_at,
          fields,
        };
      }),
    });
  });

  // ── Monitoring: Reminders ─────────────────────────────────────────────────
  // GET /api/admin/monitor/reminders
  app.get("/api/admin/monitor/reminders", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const [pendingReminders, statusCounts, failedSends, failedEscalations] = await Promise.all([
      // All pending reminders across all users
      col("reminders").find(
        { status: "pending" },
        { projection: { _id: 1, user_id: 1, client_id: 1, trigger_date: 1, note: 1, doc_type: 1 } },
      ).sort({ trigger_date: 1 }).limit(100).toArray(),

      // Status counts per user
      col("reminders").aggregate([
        {
          $group: {
            _id: { user_id: "$user_id", status: "$status" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.user_id": 1 } },
      ]).toArray(),

      // Failed sends from email_log (scheduler writes log_type "send")
      col("email_log").find(
        { success: 0, log_type: { $in: ["send", "reminder"] } },
        { projection: { _id: 1, user_id: 1, recipient: 1, to_address: 1, error: 1, sent_at: 1, reminder_id: 1 } },
      ).sort({ sent_at: -1 }).limit(50).toArray(),

      // Failed escalations
      col("email_log").find(
        { success: 0, log_type: "escalation" },
        { projection: { _id: 1, user_id: 1, recipient: 1, to_address: 1, error: 1, sent_at: 1, reminder_id: 1 } },
      ).sort({ sent_at: -1 }).limit(50).toArray(),
    ]);

    // Build per-user status matrix
    const userStatusMap: Record<string, Record<string, number>> = {};
    for (const row of statusCounts) {
      const uid = row._id.user_id ?? "unknown";
      if (!userStatusMap[uid]) userStatusMap[uid] = {};
      userStatusMap[uid][row._id.status ?? "unknown"] = row.count;
    }

    res.json({
      pending: pendingReminders.map((r: any) => ({
        id: r._id?.toString(),
        user_id: r.user_id,
        client_id: r.client_id?.toString?.() ?? r.client_id,
        trigger_date: r.trigger_date,
        note: r.note,
        doc_type: r.doc_type,
      })),
      byUserStatus: userStatusMap,
      failedSends: failedSends.map((l: any) => ({
        id: l._id?.toString(),
        user_id: l.user_id,
        recipient: l.recipient ?? l.to_address ?? null,
        error: l.error,
        sent_at: l.sent_at,
        reminder_id: l.reminder_id?.toString?.() ?? l.reminder_id,
      })),
      failedEscalations: failedEscalations.map((l: any) => ({
        id: l._id?.toString(),
        user_id: l.user_id,
        recipient: l.recipient ?? l.to_address ?? null,
        error: l.error,
        sent_at: l.sent_at,
        reminder_id: l.reminder_id?.toString?.() ?? l.reminder_id,
      })),
    });
  });

  // ── Monitoring: Scheduler ─────────────────────────────────────────────────
  // GET /api/admin/monitor/scheduler
  app.get("/api/admin/monitor/scheduler", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const [healthRows, lastRunStats, monthlySettings] = await Promise.all([
      // Health records for each named cron job
      col("scheduler_health").find({}).toArray(),

      // Stats from the most recent batch: emails sent/failed in last 1 hour window
      col("email_log").aggregate([
        { $match: { sent_at: { $gte: new Date(Date.now() - 3600 * 1000) } } },
        { $group: { _id: "$success", count: { $sum: 1 } } },
      ]).toArray(),

      // Monthly report schedule per user
      col("user_settings").find(
        {},
        {
          projection: {
            _id: 0, user_id: 1,
            monthly_report_enabled: 1, monthly_report_day: 1,
            monthly_report_hour: 1, monthly_report_last_sent: 1,
            monthly_report_last_error: 1,
          },
        },
      ).toArray(),
    ]);

    const sentLastHour = lastRunStats.find((r: any) => r._id === 1)?.count ?? 0;
    const failedLastHour = lastRunStats.find((r: any) => r._id === 0)?.count ?? 0;

    const { getSettings } = await import("../settings.js");
    const intervalMs = getSettings().reminderCheckIntervalMs;

    const tickHealth = healthRows.find((r: any) => r.name === "tick") as any;
    const lastRunTime = tickHealth?.last_run_at ?? null;
    const nextRunTime = lastRunTime ? new Date(new Date(lastRunTime).getTime() + intervalMs) : null;

    res.json({
      lastRunTime,
      nextRunTime,
      intervalSeconds: Math.round(intervalMs / 1000),
      sentLastHour,
      failedLastHour,
      jobs: healthRows.map((r: any) => ({
        name: r.name,
        last_run_at: r.last_run_at ?? null,
        last_success_at: r.last_success_at ?? null,
        last_error: r.last_error ?? null,
        consecutive_failures: r.consecutive_failures ?? 0,
      })),
      monthlySchedule: monthlySettings.map((s: any) => ({
        user_id: s.user_id,
        enabled: !!s.monthly_report_enabled,
        day: s.monthly_report_day ?? null,
        hour: s.monthly_report_hour ?? null,
        last_sent: s.monthly_report_last_sent ?? null,
        last_error: s.monthly_report_last_error ?? null,
      })),
    });
  });

  // ── Monitoring: Monthly Reports ────────────────────────────────────────────
  // GET /api/admin/monitor/monthly-reports
  app.get("/api/admin/monitor/monthly-reports", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const [userSettings, failedReports] = await Promise.all([
      col("user_settings").find(
        {},
        {
          projection: {
            _id: 0,
            user_id: 1,
            monthly_report_enabled: 1,
            monthly_report_day: 1,
            monthly_report_hour: 1,
            monthly_report_formats: 1,
            monthly_report_recipients: 1,
            monthly_report_last_sent: 1,
            monthly_report_last_error: 1,
          },
        },
      ).toArray(),

      // Failed monthly report sends
      col("email_log").find(
        { success: 0, log_type: "monthly_report" },
        { projection: { _id: 1, user_id: 1, recipient: 1, error: 1, sent_at: 1 } },
      ).sort({ sent_at: -1 }).limit(50).toArray(),
    ]);

    res.json({
      schedules: userSettings.map((s: any) => ({
        user_id: s.user_id,
        enabled: !!s.monthly_report_enabled,
        day: s.monthly_report_day ?? null,
        hour: s.monthly_report_hour ?? null,
        formats: s.monthly_report_formats ?? [],
        recipients: s.monthly_report_recipients ?? [],
        last_sent: s.monthly_report_last_sent ?? null,
        last_error: s.monthly_report_last_error ?? null,
      })),
      failedDeliveries: failedReports.map((l: any) => ({
        id: l._id?.toString(),
        user_id: l.user_id,
        recipient: l.recipient,
        error: l.error,
        sent_at: l.sent_at,
      })),
    });
  });

  // ── Extraction Quality ────────────────────────────────────────────────────
  // GET /api/admin/monitor/extraction-quality
  app.get("/api/admin/monitor/extraction-quality", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const [allRuns, recentFailures, slowRuns] = await Promise.all([
      col("extractions").aggregate([
        {
          $group: {
            _id: "$backend",
            runs: { $sum: 1 },
            parsed_ok: { $sum: { $cond: ["$parsed_ok", 1, 0] } },
            avg_exec_ms: { $avg: "$exec_ms" },
          },
        },
        { $sort: { runs: -1 } },
      ]).toArray(),

      col("extractions").find(
        { parsed_ok: false },
        { projection: { _id: 1, document_id: 1, user_id: 1, backend: 1, model: 1, error: 1, exec_ms: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(50).toArray(),

      col("extractions").find(
        { exec_ms: { $gt: 30000 } },
        { projection: { _id: 1, document_id: 1, backend: 1, model: 1, exec_ms: 1, created_at: 1 } },
      ).sort({ exec_ms: -1 }).limit(20).toArray(),
    ]);

    const totalRuns = allRuns.reduce((s: number, r: any) => s + r.runs, 0);
    const totalOk = allRuns.reduce((s: number, r: any) => s + r.parsed_ok, 0);
    const totalExecMs = allRuns.reduce((s: number, r: any) => s + (r.avg_exec_ms ?? 0) * r.runs, 0);

    const byBackend: Record<string, any> = {};
    for (const r of allRuns as any[]) {
      byBackend[r._id ?? "unknown"] = {
        runs: r.runs,
        parsed_ok: r.parsed_ok,
        success_rate: r.runs > 0 ? Math.round((r.parsed_ok / r.runs) * 100) : 0,
        avg_exec_ms: Math.round(r.avg_exec_ms ?? 0),
      };
    }

    res.json({
      summary: {
        total_runs: totalRuns,
        parsed_ok: totalOk,
        parse_success_rate: totalRuns > 0 ? Math.round((totalOk / totalRuns) * 100) : 0,
        avg_exec_ms: totalRuns > 0 ? Math.round(totalExecMs / totalRuns) : 0,
        by_backend: byBackend,
      },
      recent_failures: recentFailures.map((r: any) => ({
        id: r._id?.toString(),
        document_id: r.document_id?.toString?.() ?? r.document_id,
        user_id: r.user_id,
        backend: r.backend,
        model: r.model,
        error: r.error,
        exec_ms: r.exec_ms,
        created_at: r.created_at,
      })),
      slow_runs: slowRuns.map((r: any) => ({
        id: r._id?.toString(),
        document_id: r.document_id?.toString?.() ?? r.document_id,
        backend: r.backend,
        model: r.model,
        exec_ms: r.exec_ms,
        created_at: r.created_at,
      })),
    });
  });

  // ── Pipeline Gaps ─────────────────────────────────────────────────────────
  // GET /api/admin/monitor/pipeline-gaps
  app.get("/api/admin/monitor/pipeline-gaps", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const [noS3, stuckProcessing, skippedReminders, scannedWithoutReminder, documentsForEmailAudit] = await Promise.all([
      col("documents").find(
        { processing_status: "done", $or: [{ spaces_key: { $exists: false } }, { spaces_key: null }] },
        { projection: { _id: 1, user_id: 1, file_name: 1, original_filename: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(50).toArray(),

      col("documents").find(
        { processing_status: "processing", created_at: { $lt: tenMinutesAgo } },
        { projection: { _id: 1, user_id: 1, file_name: 1, original_filename: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(50).toArray(),

      col("email_log").find(
        { log_type: "skipped" },
        { projection: { _id: 1, user_id: 1, reminder_id: 1, created_at: 1, sent_at: 1, subject: 1 } },
      ).sort({ sent_at: -1 }).limit(50).toArray(),

      col("documents").aggregate([
        { $match: { processing_status: "done" } },
        { $addFields: { document_id_string: { $toString: "$_id" } } },
        {
          $lookup: {
            from: "reminders",
            localField: "document_id_string",
            foreignField: "document_id",
            as: "reminders",
          },
        },
        { $match: { reminders: { $size: 0 } } },
        { $sort: { created_at: -1 } },
        { $limit: 100 },
        {
          $project: {
            _id: 1,
            user_id: 1,
            file_name: 1,
            original_filename: 1,
            document_type: 1,
            document_kind: 1,
            extracted_fields: 1,
            created_at: 1,
          },
        },
      ]).toArray(),

      col("documents").find(
        { processing_status: "done", extracted_fields: { $exists: true, $ne: null } },
        { projection: { _id: 1, user_id: 1, file_name: 1, original_filename: 1, document_type: 1, document_kind: 1, extracted_fields: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(250).toArray(),
    ]);

    function parseExtractedFields(extractedFields: unknown): Record<string, any> {
      try {
        if (typeof extractedFields === "string") return JSON.parse(extractedFields);
        if (extractedFields && typeof extractedFields === "object") return extractedFields as Record<string, any>;
      } catch {
        return {};
      }
      return {};
    }

    function readReminderDate(extractedFields: unknown): string | null {
      const fields = parseExtractedFields(extractedFields);
      return fields.expiry_date ?? fields.next_action_date ?? null;
    }

    function readExtractedEmail(extractedFields: unknown): string | null {
      const fields = parseExtractedFields(extractedFields);
      const value = fields.client_email ?? fields.contact_email ?? fields.email;
      return typeof value === "string" && value.trim() ? value.trim() : null;
    }

    const missingEmails = documentsForEmailAudit
      .map((d: any) => ({
        id: d._id?.toString(),
        user_id: d.user_id,
        filename: d.file_name ?? d.original_filename,
        document_type: d.document_type ?? d.document_kind ?? null,
        reminder_date: readReminderDate(d.extracted_fields),
        extracted_email: readExtractedEmail(d.extracted_fields),
        created_at: d.created_at,
      }))
      .filter((d: any) => d.reminder_date && !d.extracted_email)
      .slice(0, 100);

    res.json({
      no_s3: noS3.map((d: any) => ({
        id: d._id?.toString(),
        user_id: d.user_id,
        filename: d.file_name ?? d.original_filename,
        created_at: d.created_at,
      })),
      stuck_processing: stuckProcessing.map((d: any) => ({
        id: d._id?.toString(),
        user_id: d.user_id,
        filename: d.file_name ?? d.original_filename,
        created_at: d.created_at,
      })),
      skipped_reminders: skippedReminders.map((l: any) => ({
        id: l._id?.toString(),
        user_id: l.user_id,
        reminder_id: l.reminder_id?.toString?.() ?? l.reminder_id,
        note: l.subject,
        created_at: l.sent_at ?? l.created_at,
      })),
      missing_emails: missingEmails,
      scanned_without_reminder: scannedWithoutReminder.map((d: any) => ({
        id: d._id?.toString(),
        user_id: d.user_id,
        filename: d.file_name ?? d.original_filename,
        document_type: d.document_type ?? d.document_kind ?? null,
        reminder_date: readReminderDate(d.extracted_fields),
        created_at: d.created_at,
      })),
    });
  });

  // ── Reprocess document ────────────────────────────────────────────────────
  // POST /api/admin/documents/:id/reprocess
  app.post("/api/admin/documents/:id/reprocess", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    let filter: Record<string, any>;
    try { filter = { _id: new ObjectId(req.params.id) }; } catch {
      res.status(400).json({ error: "Invalid id" }); return;
    }
    const doc = await col("documents").findOne(filter) as any;
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    await col("documents").updateOne(filter, {
      $set: { processing_status: "queued", error_message: null, updated_at: new Date() },
      $unset: { extracted_fields: "" },
    });

    try {
      const importer = await import("../pipeline/importer.js");
      const processFn = (importer as any).processDocument;
      const reprocessFn = (importer as any).reprocessDocument ?? (importer as any).importDocument;
      const filePath = doc.file_path ?? doc.original_path;
      const mimeType = doc.mime_type ?? "application/octet-stream";
      const ext = extname(String(filePath ?? doc.file_name ?? "")).toLowerCase();

      if (typeof processFn === "function" && filePath && ext) {
        processFn(req.params.id, String(filePath), mimeType, ext, undefined, doc.user_id, { skipAi: false }).catch(() => {});
      } else if (typeof reprocessFn === "function") {
        reprocessFn(req.params.id, doc.user_id, { skipAi: false }).catch(() => {});
      }
    } catch {
      // importer may export different name — try alternative
      try {
        const importer = await import("../pipeline/importer.js");
        const fn = (importer as any).reprocessDocument ?? (importer as any).importDocument;
        if (fn) fn(req.params.id, doc.user_id, { skipAi: false }).catch(() => {});
      } catch { /* will process on next queue check */ }
    }

    res.json({ ok: true });
  });

  // ── Retry escalation ──────────────────────────────────────────────────────
  // POST /api/admin/reminders/:id/retry-escalation
  app.post("/api/admin/reminders/:id/retry-escalation", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const settings = getSettings();
    if (!settings.escalationEmail) {
      res.status(400).json({ error: "escalationEmail not configured" }); return;
    }

    let reminder: any;
    try {
      const filter = { _id: new ObjectId(req.params.id) };
      reminder = await col("reminders").findOne(filter);
    } catch {
      // try string id
      reminder = await col("reminders").findOne({ id: req.params.id });
    }
    if (!reminder) { res.status(404).json({ error: "Reminder not found" }); return; }

    try {
      const { sendReminderEmail } = await import("../reminders/emailSender.js");
      const remId = reminder._id?.toString() ?? req.params.id;
      const subject = `[Escalation Retry] ${reminder.title ?? reminder.note ?? "Reminder"}`;
      const body = `Admin-triggered retry escalation for reminder ${remId}`;

      const result = await (sendReminderEmail as any)(
        { ...reminder, id: remId, client_name: null, document_name: null, title: subject, body },
        [settings.escalationEmail]
      );

      await col<Record<string, any>>("email_log").insertOne({
        reminder_id: remId,
        log_type: "escalation",
        to_address: settings.escalationEmail,
        subject,
        sent_at: new Date(),
        success: result.success ? 1 : 0,
        error: result.error ?? null,
        user_id: reminder.user_id ?? null,
        recipient: settings.escalationEmail,
      });

      res.json({ ok: result.success, error: result.error ?? null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Contract advances ─────────────────────────────────────────────────────
  // GET /api/admin/monitor/contract-advances
  app.get("/api/admin/monitor/contract-advances", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const rows = await col("contract_advances").find({}).sort({ advanced_at: -1 }).limit(100).toArray();
    res.json(rows.map((r: any) => ({
      id: r._id?.toString(),
      user_id: r.user_id,
      contract_id: r.contract_id,
      client_id: r.client_id,
      previous_expiry: r.previous_expiry,
      new_expiry: r.new_expiry,
      interval_months: r.interval_months,
      advanced_at: r.advanced_at,
    })));
  });

  // ── Admin settings ────────────────────────────────────────────────────────
  // GET /api/admin/settings  (replaces the stub)
  app.get("/api/admin/settings", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const s = getSettings();

    // Fetch db name from connection
    let dbName = "";
    try {
      const { getDb } = await import("../db/db.js");
      dbName = (getDb() as any).databaseName ?? "";
    } catch { /* non-critical */ }

    res.json({
      appEnv: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
      dbName,
      reminderEnabled: s.reminderEnabled,
      autoExtract: s.autoExtract,
      reminderCheckIntervalMs: s.reminderCheckIntervalMs,
      escalationEmail: s.escalationEmail || null,
      escalationThresholdDays: s.escalationThresholdDays,
      smtpHost: s.smtpHost,
      smtpPort: s.smtpPort,
      smtpFrom: s.emailFrom,
      aiBackend: s.aiBackend,
      openAiModel: s.openAiModel,
      openAiKeyPresent: !!s.openAiKey,
      s3BucketPresent: !!s.doSpacesBucket,
      userDocumentLimit: s.userDocumentLimit,
    });
  });

  // ── Download monthly report for a user (admin) ───────────────────────────
  // GET /api/admin/monthly-reports/download/:userId
  app.get("/api/admin/monthly-reports/download/:userId", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const { userId } = req.params;
    try {
      const { generateMonthlyTrackingReport, generateMonthlyContractReports, reportPeriodKey } =
        await import("../reports/monthlyReports.js");
      const now = new Date();
      const year = Number(req.query.year ?? now.getFullYear());
      const rawMonth = req.query.month;
      const month = rawMonth == null || rawMonth === "" ? undefined : Number(rawMonth);
      const format = String(req.query.format ?? "docx");
      const clientId = typeof req.query.clientId === "string" ? req.query.clientId : undefined;
      const fields = req.query.fields
        ? String(req.query.fields).split(",").map((f) => f.trim()).filter(Boolean)
        : undefined;

      if (format !== "docx" && format !== "xlsx" && format !== "csv") {
        res.status(400).json({ error: "format must be docx, xlsx or csv" }); return;
      }

      const report = clientId
        ? await generateMonthlyContractReports(userId, year, month, fields, clientId)
        : await generateMonthlyTrackingReport(userId, year, month, fields);

      const periodKey = reportPeriodKey(year, month);
      const filename = `report-${userId.slice(-6)}-${periodKey}.${format}`;
      const content = format === "docx" ? report.docx : format === "xlsx" ? report.xlsx : report.csv;
      res.setHeader("Content-Type",
        format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader("Content-Length", content.length);
      res.end(content);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Report generation failed" });
    }
  });

  // ── Trigger monthly report for one user ───────────────────────────────────
  // POST /api/admin/monthly-reports/trigger/:userId
  app.post("/api/admin/monthly-reports/trigger/:userId", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const { userId } = req.params;

    try {
      const body = req.body as {
        year?: number;
        month?: number;
        formats?: string[];
        recipients?: string[];
        fields?: string[];
        clientId?: string;
        deliveryMode?: "combined" | "client";
      };
      const { sendMonthlyReportToRecipients, sendMonthlyReportsPerClient } = await import("../reports/monthlyReports.js");
      const now = new Date();
      const year = Number(body.year ?? now.getFullYear());
      // month: null means "whole year"; undefined/missing also means whole year for admin trigger
      const month = (body.month != null && body.month !== 0) ? Number(body.month) : undefined;

      // Resolve recipients: body > user settings > user email
      let recipients: string[] = body.recipients?.length ? body.recipients : [];
      if (!recipients.length) {
        const userSettings = await col("user_settings").findOne({ user_id: userId }) as any;
        const raw = userSettings?.monthly_report_recipients ?? "";
        recipients = raw ? raw.split(/[;,\s]+/).filter(Boolean) : [];
      }
      if (!recipients.length) {
        const user = await col("users").findOne({ _id: new ObjectId(userId) }) as any;
        if (user?.email) recipients = [user.email];
      }

      // Resolve formats: body > user settings > default
      let formats: string[] = [];
      if (body.formats?.length) {
        formats = body.formats.filter((f) => f === "docx" || f === "xlsx" || f === "csv");
      }
      if (!formats.length) {
        const userSettings = await col("user_settings").findOne({ user_id: userId }) as any;
        try { formats = JSON.parse(userSettings?.monthly_report_formats ?? '["docx"]'); } catch { formats = ["docx"]; }
      }
      if (!formats.length) formats = ["docx"];

      const deliveryMode = body.deliveryMode ?? (body.clientId ? "client" : "combined");
      const result = deliveryMode === "client"
        ? await sendMonthlyReportsPerClient({
            userId, year, month, recipients, formats,
            rawFields: body.fields,
            clientId: body.clientId,
            includeClientRecipient: true,
          })
        : await sendMonthlyReportToRecipients({
            userId, year, month, recipients, formats,
            rawFields: body.fields,
            clientId: body.clientId,
            includeClientRecipient: false,
          });

      await col<Record<string, any>>("email_log").insertOne({
        user_id: userId,
        log_type: "monthly_report",
        sent_at: new Date(),
        success: result.success ? 1 : 0,
        error: result.error ?? null,
        recipient: recipients.join(", ") || null,
        subject: `Monthly Report — Admin Triggered ${year}${month ? `-${String(month).padStart(2, "0")}` : ""}`,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: read/write user settings ──────────────────────────────────────
  // GET /api/admin/users/:id/settings
  app.get("/api/admin/users/:id/settings", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
      const row = await col("user_settings").findOne({ user_id: req.params.id }) as any;
      res.json(row ? (() => { const { _id, ...r } = row; return r; })() : {});
    } catch (err: any) {
      console.error("admin user settings error:", err);
      res.status(500).json({ error: err.message ?? "Failed to load user settings" });
    }
  });

  // PUT /api/admin/users/:id/settings
  app.put("/api/admin/users/:id/settings", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const body = req.body as {
      theme?: string;
      email_from_name?: string | null;
      reminder_advance_days?: string;
      ocr_language?: string;
      pipeline_ocr?: boolean;
      pipeline_ai?: boolean;
      pipeline_s3?: boolean;
      pipeline_entities?: boolean;
      monthly_report_enabled?: boolean;
      monthly_report_recipients?: string;
      monthly_report_day?: number;
      monthly_report_hour?: number;
      monthly_report_formats?: string;
      report_config?: unknown;
      calendar_next_tests_only?: boolean;
      default_email_template_id?: number | string | null;
      features?: Record<string, boolean> | string | null;
      features_json?: string | null;
    };
    const patch: Record<string, any> = { updated_at: new Date() };
    if (body.theme !== undefined) patch.theme = body.theme === "dark" ? "dark" : "light";
    if (body.email_from_name !== undefined) patch.email_from_name = body.email_from_name ?? null;
    if (body.reminder_advance_days !== undefined) patch.reminder_advance_days = String(body.reminder_advance_days ?? "[90,60,30]");
    if (body.ocr_language !== undefined) patch.ocr_language = String(body.ocr_language ?? "heb+eng");
    if (body.pipeline_ocr !== undefined) patch.pipeline_ocr = Boolean(body.pipeline_ocr);
    if (body.pipeline_ai !== undefined) patch.pipeline_ai = Boolean(body.pipeline_ai);
    if (body.pipeline_s3 !== undefined) patch.pipeline_s3 = Boolean(body.pipeline_s3);
    if (body.pipeline_entities !== undefined) patch.pipeline_entities = Boolean(body.pipeline_entities);
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
    const setOnInsert: Record<string, any> = { user_id: req.params.id };
    if (patch.features === undefined) setOnInsert.features = DEFAULT_FEATURES;
    if (patch.report_config === undefined) setOnInsert.report_config = DEFAULT_REPORT_CONFIG;
    const update: Record<string, any> = {
      $set: patch,
      $setOnInsert: setOnInsert,
    };
    if (rawFeatures !== undefined) update.$unset = { features_json: "" };
    await col("user_settings").updateOne(
      { user_id: req.params.id },
      update,
      { upsert: true },
    );
    res.json({ ok: true });
  });

  // ── User detail breakdown ─────────────────────────────────────────────────
  // GET /api/admin/users/:id/detail
  app.get("/api/admin/users/:id/detail", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
    const userId = req.params.id;

    const [documents, emailLogs, reminderCounts, extractions, schedulerErrors] = await Promise.all([
      // All documents for this user (with extracted_fields + template id for field coverage)
      col("documents").find(
        { user_id: userId },
        { projection: { _id: 1, file_name: 1, processing_status: 1, error_message: 1, spaces_key: 1, file_size_bytes: 1, created_at: 1, document_type: 1, extracted_fields: 1, template_id: 1 } },
      ).sort({ created_at: -1 }).limit(200).toArray(),

      // All email log entries for this user
      col("email_log").find(
        { user_id: userId },
        { projection: { _id: 1, log_type: 1, success: 1, recipient: 1, to_address: 1, subject: 1, error: 1, sent_at: 1, reminder_id: 1 } },
      ).sort({ sent_at: -1 }).limit(100).toArray(),

      // Reminder status counts
      col("reminders").aggregate([
        { $match: { user_id: userId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).toArray(),

      // Recent extraction runs for this user
      col("extractions").find(
        { user_id: userId },
        { projection: { _id: 1, document_id: 1, backend: 1, model: 1, parsed_ok: 1, exec_ms: 1, error: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(50).toArray(),

      // Scheduler errors involving this user
      col("email_log").find(
        { user_id: userId, success: 0 },
        { projection: { _id: 1, log_type: 1, error: 1, sent_at: 1, recipient: 1 } },
      ).sort({ sent_at: -1 }).limit(50).toArray(),
    ]);

    const reminderStatusMap: Record<string, number> = {};
    for (const r of reminderCounts) reminderStatusMap[r._id ?? "unknown"] = r.count;

    // Fetch templates for field coverage analysis
    const templateIds = [...new Set(documents.map((d: any) => d.template_id).filter(Boolean))];
    const templateLookupIds = [...new Set(templateIds.flatMap((id: any) => {
      const ids: any[] = [id, String(id)];
      const numericId = Number(id);
      if (Number.isFinite(numericId)) ids.push(numericId);
      return ids;
    }))];
    const templates = templateLookupIds.length
      ? await col("doc_templates").find({ id: { $in: templateLookupIds } }).toArray()
      : [];
    const templateMap: Record<string, any> = {};
    for (const t of templates) templateMap[String((t as any).id)] = t;

    function normalizeTemplateFields(raw: any): Array<{ key: string }> {
      if (typeof raw === "string") {
        try {
          return normalizeTemplateFields(JSON.parse(raw));
        } catch {
          return [];
        }
      }
      if (!Array.isArray(raw)) return [];
      return raw
        .map((field) => typeof field === "string" ? { key: field } : field)
        .filter((field) => field && typeof field.key === "string");
    }

    function computeFieldCoverage(doc: any) {
      const tplId = doc.template_id;
      if (!tplId || !templateMap[String(tplId)]) return null;
      const tpl = templateMap[String(tplId)];
      const fields = normalizeTemplateFields(tpl.fields);
      let extracted: Record<string, any> = {};
      try {
        const raw = doc.extracted_fields;
        if (!raw) extracted = {};
        else if (typeof raw === "string") extracted = JSON.parse(raw);
        else extracted = raw;
      } catch { extracted = {}; }
      const present: string[] = [];
      const missing: string[] = [];
      const nulled: string[] = [];
      for (const f of fields) {
        const val = extracted[f.key];
        if (!(f.key in extracted)) missing.push(f.key);
        else if (val === null || val === "" || (Array.isArray(val) && val.length === 0)) nulled.push(f.key);
        else present.push(f.key);
      }
      return {
        template_name: tpl.name,
        total_fields: fields.length,
        present,
        missing,
        nulled,
        coverage_pct: fields.length
          ? Math.round((present.length / fields.length) * 100)
          : null,
      };
    }

    res.json({
      documents: documents.map((d: any) => ({
        id: d._id?.toString(),
        filename: d.file_name,
        status: d.processing_status,
        error: d.error_message ?? null,
        has_s3: !!d.spaces_key,
        size_bytes: d.file_size_bytes ?? 0,
        document_type: d.document_type ?? null,
        created_at: d.created_at,
        field_coverage: computeFieldCoverage(d),
      })),
      emailLogs: emailLogs.map((l: any) => ({
        id: l._id?.toString(),
        log_type: l.log_type,
        success: l.success,
        recipient: l.recipient ?? l.to_address ?? null,
        subject: l.subject ?? null,
        error: l.error ?? null,
        sent_at: l.sent_at,
        reminder_id: l.reminder_id?.toString?.() ?? null,
      })),
      reminderStatus: reminderStatusMap,
      extractions: extractions.map((e: any) => ({
        id: e._id?.toString(),
        document_id: e.document_id,
        backend: e.backend,
        model: e.model,
        parsed_ok: e.parsed_ok,
        exec_ms: e.exec_ms,
        error: e.error ?? null,
        created_at: e.created_at,
      })),
      failedEmails: schedulerErrors.map((e: any) => ({
        id: e._id?.toString(),
        log_type: e.log_type,
        error: e.error,
        sent_at: e.sent_at,
        recipient: e.recipient,
      })),
    });
    } catch (err: any) {
      console.error("user detail error:", err);
      res.status(500).json({ error: err.message ?? "Failed to load user detail" });
    }
  });
}
