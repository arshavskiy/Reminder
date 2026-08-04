import express from "express";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {requireAuth, requireRole} from "../auth/middleware";
import type {UserRole} from "../../src/shared/types.js";

const VALID_ROLES: UserRole[] = ["admin", "pro", "user"];

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

  // GET /api/admin/settings — protected settings (same as /api/settings but explicit admin check)
  app.get("/api/admin/settings", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    res.json({ allowed: true });
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

  // ── Monitoring: Reminders ─────────────────────────────────────────────────
  // GET /api/admin/monitor/reminders
  app.get("/api/admin/monitor/reminders", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const [pendingReminders, statusCounts, failedSends] = await Promise.all([
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

      // Failed sends from email_log
      col("email_log").find(
        { success: 0, log_type: "reminder" },
        { projection: { _id: 1, user_id: 1, recipient: 1, error: 1, sent_at: 1, reminder_id: 1 } },
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
        recipient: l.recipient,
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
}
