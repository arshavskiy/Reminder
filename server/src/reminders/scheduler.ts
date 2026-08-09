import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {getSettings} from "../settings";
import {sendReminderEmail} from "./emailSender";
import {sendMonthlyReportToRecipients} from "../reports/monthlyReports";
import type {ReminderWithContext} from "../../src/shared/types.js";
import {logger} from "../logger";
import {clientDisplayName} from "../utils/clientNames";
import {notifyEmailSendFailed, notifyReminderSkipped} from "../push/adminNotify";

let _timer: ReturnType<typeof setInterval> | null = null;

async function runWithHealth(name: string, fn: () => Promise<void>) {
  const startedAt = new Date();
  try {
    await fn();
    await col("scheduler_health").updateOne(
      { name },
      {
        $set: {
          name,
          last_run_at: startedAt,
          last_success_at: startedAt,
          last_error: null,
          consecutive_failures: 0,
        },
      },
      { upsert: true },
    );
  } catch (error: any) {
    const msg = error?.message ?? String(error);
    logger.error(`${name}_failed`, { error: msg });
    await col("scheduler_health").updateOne(
      { name },
      {
        $set: { name, last_run_at: startedAt, last_error: msg },
        $inc: { consecutive_failures: 1 },
      },
      { upsert: true },
    );
  }
}

export function startScheduler() {
  const settings = getSettings();
  const isProd = (process.env.APP_ENV ?? "development") === "production";

  if (!isProd) {
    logger.info("scheduler_skipped", { reason: "APP_ENV is not 'production' — no emails or DB writes from scheduler in dev" });
    return;
  }

  async function tick() {
    if (settings.reminderEnabled) await runWithHealth("checkReminders", checkReminders);
    await runWithHealth("checkMonthlyReports", checkMonthlyReports);
    if (settings.reminderEnabled) await runWithHealth("checkEscalations", checkEscalations);
    await col("scheduler_health").updateOne(
      { name: "tick" },
      { $set: { name: "tick", last_run_at: new Date(), last_error: null, consecutive_failures: 0 } },
      { upsert: true },
    );
  }

  tick();
  _timer = setInterval(tick, settings.reminderCheckIntervalMs);

  logger.info("scheduler_started", {
    reminder_enabled: settings.reminderEnabled,
    interval_seconds: settings.reminderCheckIntervalMs / 1000,
  });
}

export function stopScheduler() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

async function checkMonthlyReports() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const settingsRows = await col("user_settings").find({monthly_report_enabled: true}).toArray();
  for (const row of settingsRows as any[]) {
    const day = Math.min(28, Math.max(1, Number(row.monthly_report_day ?? 1)));
    const hour = Number(row.monthly_report_hour ?? 8);
    if (now.getDate() < day || (now.getDate() === day && now.getHours() < hour)) continue;
    if (row.monthly_report_last_sent === monthKey) continue;

    const user = await col("users").findOne({_id: toObjectId(row.user_id)}) as any;
    const configuredRecipients = String(row.monthly_report_recipients ?? "").split(/[;,\s]+/).filter(Boolean);
    const recipients = uniqueEmails([...configuredRecipients, user?.email]);
    const formats = parseFormats(row.monthly_report_formats);
    if (!recipients.length || !formats.length) continue;

    const result = await sendMonthlyReportToRecipients({
      userId: row.user_id,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      recipients,
      formats,
      rawFields: row.report_config?.client_fields,
      includeClientRecipient: false,
    });
    if (result.success) {
      await col("user_settings").updateOne({_id: row._id}, {$set: {monthly_report_last_sent: monthKey, monthly_report_last_error: null}});
      logger.info("monthly_reports_sent", {
        user_id: row.user_id,
        month: monthKey,
        reports_sent: result.reportsSent,
        recipient_count: recipients.length,
        formats,
      });
    } else {
      await col("user_settings").updateOne({_id: row._id}, {$set: {monthly_report_last_error: result.error ?? "Unknown error"}});
      logger.warn("monthly_reports_failed", { user_id: row.user_id, month: monthKey, error: result.error });
    }
  }
}
function toObjectId(id: unknown): any {
  try { return new ObjectId(String(id)); } catch { return id; }
}

async function resolveReminderContract(reminder: any): Promise<any | null> {
  if (reminder.source_type !== "contract_expiry" || !reminder.source_id || !reminder.user_id) return null;
  const sourceId = String(reminder.source_id);
  return col("contracts").findOne({
    user_id: reminder.user_id,
    $or: [
      { _id: toObjectId(sourceId) },
      { id: sourceId },
    ],
  });
}

function parseIsoDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (d.getFullYear() !== Number(match[1]) || d.getMonth() !== Number(match[2]) - 1 || d.getDate() !== Number(match[3])) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatIsoDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function resolveInspectionIntervalMonths(contract: any): number {
  const explicit = Number(
    contract.inspection_interval_months ??
    contract.manual_fields?.inspection_interval_months ??
    contract.manual_fields?.interval_months
  );
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const start = parseIsoDateOnly(String(contract.start_date ?? ""));
  const expiry = parseIsoDateOnly(String(contract.expiry_date ?? ""));
  if (start && expiry && expiry.getTime() > start.getTime()) {
    const months = (expiry.getFullYear() - start.getFullYear()) * 12 + expiry.getMonth() - start.getMonth();
    return Math.max(1, months);
  }

  return 12;
}

function uniqueEmails(values: Array<unknown>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim() !== "").map((value) => value.trim().toLowerCase()))];
}

function parseFormats(raw: unknown): string[] {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return ["docx", "xlsx"];
    const selected = parsed
      .map((format) => format === "doc" ? "docx" : format)
      .filter((format) => format === "docx" || format === "xlsx" || format === "csv");
    return selected.length ? selected : ["docx", "xlsx"];
  } catch { return ["docx", "xlsx"]; }
}

async function checkReminders() {
  const today = new Date().toISOString().slice(0, 10);

  // Get IDs of reminders that already have a successful email
  const sentLogs = await col("email_log")
    .find({ success: 1, reminder_id: { $ne: null } })
    .project({ reminder_id: 1 })
    .toArray();
  const sentIds = new Set(sentLogs.map((l: any) => l.reminder_id));

  const due = await col("reminders")
    .find({
      status: "pending",
      trigger_date: { $lte: today },
    })
    .toArray();

  logger.debug("reminder_check_completed", { due_count: due.length });

  for (const reminder of due) {
    const remId = reminder._id?.toString();
    if (sentIds.has(remId)) continue;

    const r = reminder as any;
    const [client, document, contract] = await Promise.all([
      r.client_id
        ? col("clients").findOne({ _id: r.client_id } as any)
        : null,
      r.document_id
        ? col("documents").findOne({ _id: r.document_id } as any)
        : null,
      resolveReminderContract(r),
    ]);

    const enriched: ReminderWithContext = {
      ...r,
      id: remId,
      client_name: clientDisplayName((client as any)?.display_name),
      document_name: (document as any)?.file_name ?? null,
      contract_number: (contract as any)?.contract_number ?? null,
      contract_type: (contract as any)?.contract_type ?? null,
    } as any;

    await processReminder(enriched);
  }
}

async function processReminder(reminder: ReminderWithContext) {
  const settings = getSettings();
  const remId = reminder.id;
  let recipients: string[] = [];
  let recipientSource = "none";

  try {
    const parsed = reminder.email_to ? JSON.parse(reminder.email_to) : [];
    if (Array.isArray(parsed) && parsed.length > 0) {
      recipients = parsed.filter(Boolean);
      recipientSource = "reminder.email_to";
    }
  } catch {
    logger.warn("reminder_email_to_malformed", { reminder_id: remId });
  }

  if (recipients.length === 0 && reminder.client_id) {
    const client = await col("clients").findOne({ _id: reminder.client_id } as any) as any;
    if (client?.email) {
      recipients = [client.email];
      recipientSource = `client (${client.display_name ?? reminder.client_id})`;
    } else {
      logger.warn("reminder_client_email_missing", {
        reminder_id: remId,
        client_id: reminder.client_id,
      });
    }
  }

  if (recipients.length === 0) {
    logger.warn("reminder_send_skipped", {
      reminder_id: remId,
      title: reminder.title,
      reason: "no_recipients",
      user_id: (reminder as any).user_id ?? null,
    });
    await col("email_log").insertOne({
      reminder_id: remId,
      user_id: (reminder as any).user_id ?? null,
      log_type: "skipped",
      to_address: "",
      recipient: "",
      subject: `תזכורת - ${reminder.title}`,
      sent_at: new Date(),
      success: 0,
      error: "no recipients resolved",
      smtp_host: settings.smtpHost || "in-app-only",
    } as any);
    notifyReminderSkipped({ title: reminder.title });
    await markSent(reminder);
    return;
  }

  logger.info("reminder_send_started", {
    reminder_id: remId,
    title: reminder.title,
    user_id: (reminder as any).user_id ?? null,
    recipient_count: recipients.length,
    recipient_source: recipientSource,
  });

  const result = await sendReminderEmail(reminder, recipients);

  const failCount = await col("email_log").countDocuments({
    reminder_id: remId,
    log_type: "send",
    success: 0,
  });

  await col("email_log").insertOne({
    reminder_id: remId,
    user_id: (reminder as any).user_id ?? null,
    log_type: "send",
    to_address: recipients.join(", "),
    recipient: recipients.join(", "),
    subject: `תזכורת - ${reminder.title}`,
    sent_at: new Date(),
    success: result.success ? 1 : 0,
    error: result.error ?? null,
    smtp_host: settings.smtpHost || "in-app-only",
    via: (process.env.RESEND_API_KEY ? "resend" : "smtp"),
  } as any);

  if (result.success) {
    logger.info("reminder_sent", {
      reminder_id: remId,
      title: reminder.title,
      user_id: (reminder as any).user_id ?? null,
      recipient_count: recipients.length,
    });
    await markSent(reminder);
  } else if (failCount + 1 >= 3) {
    await col("reminders").updateOne(
      { _id: remId } as any,
      { $set: { status: "error", updated_at: new Date() } }
    );
    logger.error("reminder_send_failed_final", {
      reminder_id: remId,
      title: reminder.title,
      user_id: (reminder as any).user_id ?? null,
      attempt: failCount + 1,
      error: result.error,
    });
    notifyEmailSendFailed({ recipient: recipients.join(", "), error: result.error, title: reminder.title });
  } else {
    logger.warn("reminder_send_failed", {
      reminder_id: remId,
      title: reminder.title,
      user_id: (reminder as any).user_id ?? null,
      attempt: failCount + 1,
      error: result.error,
    });
  }
}

async function markSent(reminder: ReminderWithContext) {
  await col("reminders").updateOne(
    { _id: reminder.id } as any,
    { $set: { status: "sent", updated_at: new Date() } }
  );

  if (reminder.client_id) {
    const parts: string[] = [];
    if (reminder.document_name) parts.push(`מסמך: ${reminder.document_name}`);
    if (reminder.advance_days)  parts.push(`${reminder.advance_days} ימים מראש`);
    parts.push(`תאריך יעד: ${reminder.trigger_date}`);

    await col("timeline_events").insertOne({
      client_id: reminder.client_id,
      event_type: "email_sent",
      title: `תזכורת נשלחה: ${reminder.title}`,
      description: parts.join(" · "),
      event_date: new Date(),
      source_id: reminder.id,
      source_type: "reminder",
      created_at: new Date(),
    } as any);
  }

  await advanceContractAfterSentReminder(reminder);
}

export async function advanceContractAfterSentReminder(reminder: ReminderWithContext): Promise<void> {
  const r = reminder as any;
  if (r.source_type !== "contract_expiry" || !r.source_id || !r.user_id) return;

  const remainingPending = await col("reminders").countDocuments({
    user_id: r.user_id,
    source_type: "contract_expiry",
    source_id: r.source_id,
    status: "pending",
  });
  if (remainingPending > 0) return;

  const contract = await resolveReminderContract(r);
  if (!contract?.expiry_date) return;

  const currentExpiry = parseIsoDateOnly(String(contract.expiry_date));
  if (!currentExpiry) return;

  const intervalMonths = resolveInspectionIntervalMonths(contract);
  const nextExpiry = addMonths(currentExpiry, intervalMonths);
  const currentExpiryIso = formatIsoDateOnly(currentExpiry);
  const nextExpiryIso = formatIsoDateOnly(nextExpiry);
  const contractId = contract._id?.toString() ?? String(r.source_id);

  await col("contracts").updateOne(
    { _id: contract._id, user_id: r.user_id },
    {
      $set: {
        start_date: currentExpiryIso,
        expiry_date: nextExpiryIso,
        status: "active",
        updated_at: new Date(),
      },
    } as any
  );

  await col<Record<string, any>>("contract_advances").insertOne({
    user_id: r.user_id,
    contract_id: contractId,
    client_id: contract.client_id ?? r.client_id ?? null,
    previous_expiry: currentExpiryIso,
    new_expiry: nextExpiryIso,
    interval_months: intervalMonths,
    advanced_at: new Date(),
  });

  await generateContractReminders(
    contractId,
    contract.client_id ?? r.client_id ?? null,
    contract.document_id ?? r.document_id ?? null,
    nextExpiryIso,
    r.user_id
  );

  const reminderPatch: Record<string, unknown> = { updated_at: new Date() };
  for (const key of ["email_to", "equipment_type", "manufacturer", "model", "serial_number"]) {
    if (r[key] != null) reminderPatch[key] = r[key];
  }
  await col("reminders").updateMany(
    {
      user_id: r.user_id,
      source_type: "contract_expiry",
      source_id: contractId,
      status: "pending",
    },
    { $set: reminderPatch } as any
  );

  logger.info("contract_cycle_advanced", {
    reminder_id: reminder.id,
    contract_id: contractId,
    previous_expiry_date: currentExpiryIso,
    next_expiry_date: nextExpiryIso,
    interval_months: intervalMonths,
  });
}

async function checkEscalations() {
  const settings = getSettings();
  if (!settings.escalationEmail) return;

  const threshold = settings.escalationThresholdDays ?? 3;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - threshold);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  // Reminders still pending N+ days past their trigger date
  const overdue = await col("reminders")
    .find({ status: "pending", trigger_date: { $lte: cutoffIso } })
    .toArray();

  if (!overdue.length) return;

  // IDs that already have an escalation log entry
  const escalatedLogs = await col("email_log")
    .find({ log_type: "escalation", reminder_id: { $in: overdue.map((r: any) => r._id?.toString()) } })
    .project({ reminder_id: 1 })
    .toArray();
  const escalatedIds = new Set(escalatedLogs.map((l: any) => l.reminder_id));

  for (const reminder of overdue) {
    const remId = reminder._id?.toString();
    if (escalatedIds.has(remId)) continue;

    const r = reminder as any;
    const subject = `[הסלמה] תזכורת לא טופלה: ${r.title}`;
    const body = `התזכורת "${r.title}" לא טופלה במשך ${threshold} ימים מאז ${r.trigger_date}. נא לטפל.`;

    const result = await sendReminderEmail(
      { ...r, id: remId, client_name: null, document_name: null, title: subject, body } as ReminderWithContext,
      [settings.escalationEmail]
    );

    await col("email_log").insertOne({
      reminder_id: remId,
      log_type: "escalation",
      to_address: settings.escalationEmail,
      subject,
      sent_at: new Date(),
      success: result.success ? 1 : 0,
      error: result.error ?? null,
      smtp_host: settings.smtpHost || "in-app-only",
    } as any);

    if (result.success) {
      logger.warn("reminder_escalation_sent", {
        reminder_id: remId,
        user_id: r.user_id ?? null,
        threshold_days: threshold,
      });
    } else {
      logger.warn("reminder_escalation_failed", {
        reminder_id: remId,
        user_id: r.user_id ?? null,
        threshold_days: threshold,
        error: result.error,
      });
    }
  }
}

/**
 * Create advance-warning reminders for a task that has a due date.
 * Mirrors generateContractReminders but keyed on source_type "task".
 * Idempotent: skips an (taskId, advance_days) pair that already has a
 * non-dismissed reminder, so it is safe to call on every task update.
 */
export async function generateTaskReminders(
  taskId: string,
  clientId: string | null,
  documentId: string | null,
  dueDate: string | null,
  description: string,
  userId?: string
) {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}/.test(dueDate)) return;

  const settings = getSettings();
  const today = new Date().toISOString().slice(0, 10);

  // Nothing to remind about if the due date has already passed.
  if (dueDate < today) return;

  const label = description.trim().slice(0, 60) || "משימה";

  for (const days of settings.reminderAdvanceDays) {
    const existing = await col("reminders").findOne({
      source_type: "task",
      source_id: taskId,
      advance_days: days,
      status: { $ne: "dismissed" },
    });
    if (existing) continue;

    const due = new Date(dueDate);
    due.setDate(due.getDate() - days);
    const calculatedTrigger = due.toISOString().slice(0, 10);

    // Clamp a past advance-trigger to today so the scheduler still fires it.
    const triggerDate = calculatedTrigger < today ? today : calculatedTrigger;

    const title = `משימה: ${label} (יעד: ${dueDate})`;

    await col("reminders").insertOne({
      ...(userId && { user_id: userId }),
      source_type: "task",
      source_id: taskId,
      client_id: clientId,
      document_id: documentId,
      trigger_date: triggerDate,
      advance_days: days,
      title,
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    } as any);
  }
}

export async function generateContractReminders(
  contractId: string,
  clientId: string | null,
  documentId: string | null,
  expiryDate: string,
  userId?: string
) {
  const settings = getSettings();
  const today = new Date().toISOString().slice(0, 10);

  let contractOid: any;
  try { const { ObjectId } = await import("mongodb"); contractOid = new ObjectId(contractId); } catch { contractOid = contractId; }
  const contract = await col("contracts").findOne({ _id: contractOid }) as any;
  const cleared = await col("reminders").deleteMany({
    ...(userId && { user_id: userId }),
    source_type: "contract_expiry",
    source_id: contractId,
    status: { $in: ["pending", "snoozed", "error"] },
  });
  if (cleared.deletedCount) {
    logger.info("contract_reminders_replaced", {
      user_id: userId ?? null,
      contract_id: contractId,
      deleted_count: cleared.deletedCount,
      expiry_date: expiryDate,
    });
  }

  const baseLabel = (() => {
    const t = (contract?.contract_type ?? "").toLowerCase();
    if (t.includes("תסקיר") || t.includes("בדיקה")) return "בדיקה הבאה";
    if (t.includes("ביטוח")) return "חידוש ביטוח";
    if (t.includes("אישור") || t.includes("תעודה")) return "חידוש תעודה";
    if (t.includes("חשבונית")) return "תשלום";
    return "פקיעת תוקף";
  })();

  for (const days of settings.reminderAdvanceDays) {
    const expiry = new Date(expiryDate);
    expiry.setDate(expiry.getDate() - days);
    const calculatedTrigger = expiry.toISOString().slice(0, 10);

    // If the expiry date itself is already past, skip entirely — nothing to remind about.
    if (expiryDate < today) continue;

    // If the advance-warning trigger is already past but expiry is still future,
    // clamp to today so the scheduler fires it on the next check.
    const triggerDate = calculatedTrigger < today ? today : calculatedTrigger;

    const existing = await col("reminders").findOne({
      source_type: "contract_expiry",
      source_id: contractId,
      advance_days: days,
      trigger_date: triggerDate,
      status: { $ne: "dismissed" },
    });
    if (existing) continue;

    // The date shown must be the inspection/expiry target ("בדיקה הבאה ב-…"),
    // not the trigger date (when the email fires, e.g. 30 days earlier), which
    // otherwise reads as if the inspection itself is on the earlier date.
    const title = `${baseLabel} ב-${expiryDate}`;

    const equipment = contract?.equipment_description ?? contract?.checked_equipment ?? null;

    await col("reminders").insertOne({
      ...(userId && { user_id: userId }),
      source_type: "contract_expiry",
      source_id: contractId,
      client_id: clientId,
      document_id: documentId,
      trigger_date: triggerDate,
      advance_days: days,
      title: equipment ? `${title} | ${equipment}` : title,
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    } as any);
  }
}
