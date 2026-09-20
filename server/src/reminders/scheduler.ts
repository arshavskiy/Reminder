import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {getSettings} from "../settings";
import {sendGroupedReminderEmail, sendReminderEmail} from "./emailSender";
import {advanceDaysForUser, parseAdvanceDays} from "./advanceDays";
import {sendMonthlyReportToRecipients} from "../reports/monthlyReports";
import {
  isMonthlyReportDue,
  monthlyReportMonthKey,
  resolveAccountReportRecipients,
} from "../reports/monthlyReportRecipients";
import type {ReminderWithContext} from "../../src/shared/types.js";
import {logger} from "../logger";
import { syncAllCalendars, pushReminderToCalendar, parseCalendarTime } from "../calendar/sync";
import {insertReminderIfAllowed} from "../quotas/reminderQuota";
import {featureFlagsForUser} from "../plans/tierFeatures";
import {clientDisplayName} from "../utils/clientNames";
import {notifyEmailSendFailed, notifyPersonalReminderDue, notifyReminderSkipped} from "../push/adminNotify";
import {parseObjectRecord, parseReminderEmailTo, pickContractEmail, pickContractEmailWithMeta} from "../contracts/contractEmail.js";
import {buildGroupedItemsTable, expiryFromReminderTitle, groupedReminderKey} from "./groupedReminderEmail";
import {isProcessPaused} from "../ops/processControl";

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
    // Checked every tick, not once at start, so an admin pause takes effect
    // without a redeploy and survives one. The timer keeps firing while paused;
    // it just does no work, which is what makes resuming a flag flip.
    if (await isProcessPaused("scheduler")) {
      logger.info("scheduler_tick_skipped_paused", {});
      return;
    }
    if (settings.reminderEnabled) await runWithHealth("checkReminders", checkReminders);
    await runWithHealth("checkMonthlyReports", checkMonthlyReports);
    if (settings.reminderEnabled) await runWithHealth("checkEscalations", checkEscalations);
    await runWithHealth("syncCalendars", syncAllCalendars);
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
  const monthKey = monthlyReportMonthKey(now);
  const settingsRows = await col("user_settings").find({monthly_report_enabled: true}).toArray();
  for (const row of settingsRows as any[]) {
    if (!isMonthlyReportDue({
      now,
      day: row.monthly_report_day,
      hour: row.monthly_report_hour,
      lastSent: row.monthly_report_last_sent,
    })) continue;

    const user = await col("users").findOne({_id: toObjectId(row.user_id)}) as any;
    if (!featureFlagsForUser(user).automaticMonthlyReports) continue;
    // Automatic combined report: account recipients only (never client emails).
    // Empty recipients → app user's email only.
    const recipients = resolveAccountReportRecipients({
      configuredRecipients: row.monthly_report_recipients,
      accountEmail: user?.email ?? null,
    });
    const formats = parseFormats(row.monthly_report_formats);
    if (!recipients.length || !formats.length) {
      if (!recipients.length) {
        logger.warn("monthly_reports_skipped_no_recipients", {
          user_id: row.user_id,
          month: monthKey,
          has_account_email: Boolean(user?.email),
        });
      }
      continue;
    }

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
      await col("user_settings").updateOne({_id: row._id}, {$set: {monthly_report_last_sent: `${monthKey} (${new Date().toISOString()})`, monthly_report_last_error: null}});
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

function idLookup(id: unknown): Record<string, unknown> {
  const raw = String(id);
  const clauses: Array<Record<string, unknown>> = [{ _id: raw }];
  try { clauses.unshift({ _id: new ObjectId(raw) }); } catch { /* keep string id */ }
  return { $or: clauses };
}

async function findById(collection: string, id: unknown): Promise<any | null> {
  if (id == null || id === "") return null;
  return col(collection).findOne(idLookup(id) as any);
}

async function resolveReminderContract(reminder: any): Promise<any | null> {
  if (!reminder.source_id) return null;
  const sourceType = String(reminder.source_type ?? "");
  if (sourceType && sourceType !== "contract_expiry" && sourceType !== "manual") return null;
  const sourceId = String(reminder.source_id);
  const or: Array<Record<string, unknown>> = [{ _id: sourceId }, { id: sourceId }];
  try { or.unshift({ _id: new ObjectId(sourceId) }); } catch { /* keep string id */ }
  return col("contracts").findOne({ $or: or });
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

function textField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
      trigger_date: { $lte: today },
      $or: [
        { status: "pending" },
        { status: "triggered", source_type: "personal" },
        // Retry when a business email may have been added later
        { status: "no_email" },
        {
          status: "error",
          $or: [
            { email_to: null },
            { email_to: "" },
            { email_to: { $exists: false } },
          ],
        },
      ],
    })
    .toArray();

  const autoSendByUser = new Map<string, boolean>();
  async function allowsAutomaticEmailReminders(userId: unknown): Promise<boolean> {
    const id = String(userId ?? "");
    if (!id) return false;
    if (autoSendByUser.has(id)) return autoSendByUser.get(id)!;
    const owner = await col("users").findOne({_id: toObjectId(id)}) as any;
    const allowed = featureFlagsForUser(owner).automaticEmailReminders;
    autoSendByUser.set(id, allowed);
    return allowed;
  }

  logger.debug("reminder_check_completed", { due_count: due.length });

  type Prepared = {
    reminder: ReminderWithContext;
    recipients: string[];
    recipientSource: string;
    contract: any;
    document: any;
    client: any;
  };
  const prepared: Prepared[] = [];

  for (const reminder of due) {
    const remId = reminder._id?.toString();
    if (sentIds.has(remId)) continue;
    if ((reminder as any).source_type === "personal") {
      await handlePersonalReminderDue({ ...(reminder as any), id: remId });
      continue;
    }
    if (!(await allowsAutomaticEmailReminders((reminder as any).user_id))) {
      logger.info("reminder_auto_send_skipped_plan", { reminder_id: remId, user_id: (reminder as any).user_id ?? null });
      continue;
    }

    const r = reminder as any;
    const contract = await resolveReminderContract(r);
    const clientId = r.client_id ?? contract?.client_id ?? null;
    const documentId = r.document_id ?? contract?.document_id ?? null;
    const [client, document] = await Promise.all([
      clientId ? findById("clients", clientId) : null,
      documentId ? findById("documents", documentId) : null,
    ]);

    const enriched: ReminderWithContext = {
      ...r,
      id: remId,
      client_id: clientId,
      document_id: documentId,
      client_name: clientDisplayName((client as any)?.display_name),
      document_name: (document as any)?.file_name ?? null,
      contract_number: (contract as any)?.contract_number ?? null,
      contract_type: (contract as any)?.contract_type ?? null,
    } as any;

    const parsedTo = parseReminderEmailTo(r.email_to);
    const fallbackEmail = pickContractEmail(
      contract,
      parseObjectRecord((document as any)?.extracted_fields),
      client as { email?: unknown } | null,
    );
    const recipients = parsedTo.length ? parsedTo : (fallbackEmail ? [fallbackEmail] : []);
    prepared.push({
      reminder: enriched,
      recipients,
      recipientSource: parsedTo.length ? "reminder.email_to" : fallbackEmail ? "contract_document_or_client" : "none",
      contract,
      document,
      client,
    });
  }

  const groups = new Map<string, Prepared[]>();
  const ungrouped: Prepared[] = [];
  for (const row of prepared) {
    const email = row.recipients[0]?.trim();
    if (!email) {
      ungrouped.push(row);
      continue;
    }
    const key = groupedReminderKey(row.reminder.client_id, row.reminder.trigger_date, email);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const row of ungrouped) {
    await processReminder(row.reminder);
  }

  for (const [, items] of groups) {
    if (items.length === 1) {
      await processReminder(items[0].reminder);
      continue;
    }
    await processGroupedReminders(items);
  }
}

function groupedTableItem(row: {
  reminder: ReminderWithContext;
  contract: any;
  document: any;
}) {
  const extracted = parseObjectRecord((row.document as any)?.extracted_fields);
  const contract = row.contract ?? {};
  return {
    contract_number: String(contract.contract_number ?? row.reminder.contract_number ?? ""),
    equipment: String(
      extracted.checked_equipment
      ?? extracted.equipment_description
      ?? contract.checked_equipment
      ?? contract.equipment_description
      ?? "",
    ),
    license_number: String(extracted.license_number ?? contract.license_number ?? ""),
    expiry_date: String(
      contract.expiry_date
      ?? expiryFromReminderTitle(row.reminder.title)
      ?? "",
    ),
  };
}

async function processGroupedReminders(items: Array<{
  reminder: ReminderWithContext;
  recipients: string[];
  recipientSource: string;
  contract: any;
  document: any;
  client: any;
}>) {
  const settings = getSettings();
  const first = items[0];
  const recipients = first.recipients;
  const clientName = first.reminder.client_name || "לקוח";
  const result = await sendGroupedReminderEmail({
    reminders: items.map((row) => row.reminder),
    recipients,
    clientName,
    triggerDate: first.reminder.trigger_date,
    itemsHtml: buildGroupedItemsTable(items.map(groupedTableItem)),
  });

  for (const row of items) {
    const remId = row.reminder.id;
    if (row.recipientSource === "contract_document_or_client" && !row.reminder.email_to) {
      await col("reminders").updateOne(
        { _id: toObjectId(remId) } as any,
        { $set: { email_to: JSON.stringify(recipients), updated_at: new Date() } },
      );
    }
    await col("email_log").insertOne({
      reminder_id: remId,
      user_id: (row.reminder as any).user_id ?? null,
      log_type: "send",
      to_address: recipients.join(", "),
      recipient: recipients.join(", "),
      subject: result.subject,
      sent_at: new Date(),
      success: result.success ? 1 : 0,
      error: result.error ?? null,
      smtp_host: settings.smtpHost || "in-app-only",
      via: (process.env.RESEND_API_KEY ? "resend" : "smtp"),
      provider_message_id: result.providerMessageId ?? null,
      grouped: 1,
    } as any);
    if (result.success) {
      await markSent(row.reminder);
    }
  }

  if (result.success) {
    logger.info("grouped_reminders_sent", {
      client_id: first.reminder.client_id ?? null,
      trigger_date: first.reminder.trigger_date,
      item_count: items.length,
      recipient: recipients[0],
    });
  } else {
    logger.warn("grouped_reminders_failed", {
      client_id: first.reminder.client_id ?? null,
      item_count: items.length,
      error: result.error,
    });
    notifyEmailSendFailed({
      recipient: recipients.join(", "),
      error: result.error,
      title: `${clientName} (${items.length} פריטים)`,
    });
  }
}

async function processReminder(reminder: ReminderWithContext) {
  if ((reminder as any).source_type === "personal") {
    return handlePersonalReminderDue(reminder);
  }

  const settings = getSettings();
  const remId = reminder.id;
  let recipients: string[] = parseReminderEmailTo(reminder.email_to);
  let recipientSource = recipients.length ? "reminder.email_to" : "none";

  if (recipients.length === 0) {
    const contract = await resolveReminderContract(reminder);
    const clientId = reminder.client_id ?? (contract as any)?.client_id ?? null;
    const documentId = reminder.document_id ?? (contract as any)?.document_id ?? null;
    const [client, document] = await Promise.all([
      clientId ? findById("clients", clientId) : null,
      documentId ? findById("documents", documentId) : null,
    ]);
    const fallbackEmail = pickContractEmail(
      contract,
      parseObjectRecord((document as any)?.extracted_fields),
      client as { email?: unknown } | null,
    );
    if (fallbackEmail) {
      recipients = [fallbackEmail];
      recipientSource = "contract_document_or_client";
    } else {
      logger.warn("reminder_client_email_missing", {
        reminder_id: remId,
        client_id: clientId,
        client_found: Boolean(client),
        client_has_email: Boolean((client as any)?.email),
        document_id: documentId,
        document_found: Boolean(document),
        contract_found: Boolean(contract),
      });
    }
  }

  if (recipients.length === 0) {
    const currentStatus = String((reminder as any).status ?? "");
    if (currentStatus === "no_email") {
      logger.debug("reminder_send_still_no_recipients", { reminder_id: remId });
      return;
    }
    logger.warn("reminder_send_skipped", {
      reminder_id: remId,
      title: reminder.title,
      reason: "no_recipients",
      user_id: (reminder as any).user_id ?? null,
    });
    // First skip (or migrate legacy status:"error" with no recipients) → no_email once
    if (currentStatus !== "error") {
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
      notifyReminderSkipped({
        title: reminder.title,
        reminderId: String(remId),
        clientId: reminder.client_id != null ? String(reminder.client_id) : null,
        userId: (reminder as any).user_id != null ? String((reminder as any).user_id) : null,
        reason: "no_recipients",
      });
    }
    await col("reminders").updateOne(
      { _id: toObjectId(remId) } as any,
      { $set: { status: "no_email", updated_at: new Date() } },
    );
    return;
  }

  logger.info("reminder_send_started", {
    reminder_id: remId,
    title: reminder.title,
    user_id: (reminder as any).user_id ?? null,
    recipient_count: recipients.length,
    recipient_source: recipientSource,
  });

  if (recipientSource === "contract_document_or_client" && !reminder.email_to) {
    await col("reminders").updateOne(
      { _id: toObjectId(remId) } as any,
      { $set: { email_to: JSON.stringify(recipients), updated_at: new Date() } },
    );
  }

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
    provider_message_id: result.providerMessageId ?? null,
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
      { _id: toObjectId(remId) } as any,
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
    { _id: toObjectId(reminder.id) } as any,
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

}

export async function advanceContractAfterSentReminder(reminder: ReminderWithContext): Promise<void> {
  logger.info("contract_cycle_advance_skipped", {
    reminder_id: reminder.id,
    source_type: (reminder as any).source_type ?? null,
    reason: "sending reminders must not mutate contract expiry dates",
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

  for (const days of await advanceDaysForUser(userId)) {
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

      await insertReminderIfAllowed(userId, {
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
      });
  }
}

/**
 * Create a personal/internal reminder for the given user: no client, and no
 * email unless the user explicitly opts in (emailTo). It always reaches the
 * user via push notification and the in-app notification bell, and (through
 * the existing calendar sync, which syncs any "pending" reminder regardless
 * of category) their Google Calendar. `source_type: "personal"` is the only
 * thing that marks it internal — reminder_category stays free for the
 * user's own tag (e.g. ביטוח, רכב), same as any other reminder, so it's
 * still organizable/filterable by category.
 * Mirrors generateTaskReminders's advance-day loop, but keyed on a
 * user-supplied title/date pair instead of a task/document.
 */
export async function createPersonalReminder(
  userId: string,
  title: string,
  targetDate: string,
  options?: {
    reminderCategory?: string | null;
    emailTo?: string | null;
    remindBeforeDays?: number | number[] | string | null;
    syncCalendar?: boolean;
    calendarKind?: "task" | "event";
    calendarTime?: string | null;
  },
): Promise<{ created: number }> {
  if (!/^\d{4}-\d{2}-\d{2}/.test(targetDate)) {
    throw new Error("targetDate must be YYYY-MM-DD");
  }
  const label = title.trim().slice(0, 120) || "תזכורת אישית";
  const reminderCategory = options?.reminderCategory?.trim() || "Personal";
  const emailTo = options?.emailTo?.trim() || null;
  let created = 0;

  // One row on the chosen target date. Extra "remind me before" days used to
  // insert more reminders (e.g. 7 days earlier plus the real date).
  const extraDays = parseAdvanceDays(options?.remindBeforeDays) ?? [];
  const storedAdvanceDays = extraDays[0] ?? 0;

  const insertedId = await insertReminderIfAllowed(userId, {
    user_id: userId,
    source_type: "personal",
    client_id: null,
    document_id: null,
    email_to: emailTo ? JSON.stringify([emailTo]) : null,
    reminder_category: reminderCategory,
    trigger_date: targetDate,
    expiry_date: targetDate,
    advance_days: storedAdvanceDays,
    title: label,
    calendar_sync: options?.syncCalendar !== false,
    calendar_kind: options?.calendarKind === "event" ? "event" : "task",
    calendar_time: options?.calendarKind === "event" ? parseCalendarTime(options.calendarTime) : null,
    status: "pending",
    created_at: new Date(),
    updated_at: new Date(),
  });
  let calendarReminderId: string | null = null;
  if (insertedId) {
    created += 1;
    calendarReminderId = insertedId;
  }

  if (calendarReminderId && options?.syncCalendar !== false) {
    try {
      await pushReminderToCalendar(userId, calendarReminderId);
    } catch (e) {
      logger.warn("calendar_personal_sync_failed", {
        user_id: userId,
        reminder_id: calendarReminderId,
        error: String(e),
      });
    }
  }

  if (created) {
    const dueIds = await flushDuePersonalReminders(userId);
    if (calendarReminderId && !dueIds.includes(calendarReminderId)) {
      await col("notifications").insertOne({
        user_id: userId,
        kind: "personal_reminder",
        reminder_id: calendarReminderId,
        title: label,
        body: `יעד: ${targetDate}`,
        created_at: new Date(),
        read_at: null,
      } as any);
      await col("reminders").updateOne(
        { _id: toObjectId(calendarReminderId), status: { $in: ["pending", "no_email", "error"] } } as any,
        { $set: { status: "triggered", triggered_at: new Date(), updated_at: new Date() } },
      );
    }
  }

  return { created };
}

/**
 * Fire due personal reminders for one user (in-app + optional email) and
 * update their status. Safe to call from the scheduler, list endpoints, or
 * create — already-triggered rows are skipped.
 */
export async function flushDuePersonalReminders(userId: string): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const due = await col("reminders")
    .find({
      user_id: userId,
      source_type: "personal",
      status: { $in: ["pending", "triggered", "no_email", "error"] },
      trigger_date: { $lte: today },
    })
    .toArray();
  const ids: string[] = [];
  for (const reminder of due as any[]) {
    const id = String(reminder._id);
    await handlePersonalReminderDue({ ...reminder, id });
    ids.push(id);
  }
  return ids;
}

/** Mark pending personal reminders that already have a bell notification. */
export async function backfillTriggeredFromNotifications(userId: string): Promise<number> {
  const notifs = await col("notifications")
    .find({
      user_id: userId,
      kind: { $in: ["personal_reminder", "personal_reminder_due"] },
    })
    .project({ reminder_id: 1 })
    .toArray() as Array<{ reminder_id?: unknown }>;
  const ids = [...new Set(notifs.map((n) => String(n.reminder_id ?? "")).filter(Boolean))];
  if (!ids.length) return 0;
  const result = await col("reminders").updateMany(
    {
      user_id: userId,
      source_type: "personal",
      status: { $in: ["pending", "no_email", "error"] },
      _id: { $in: ids.map((id) => toObjectId(id)) },
    } as any,
    { $set: { status: "triggered", triggered_at: new Date(), updated_at: new Date() } },
  );
  return result.modifiedCount;
}

/**
 * Delivery for a due personal reminder: push notification + in-app
 * notification row, always. Only sends an actual email when the reminder
 * carries email_to (the user's own opt-in "also email me" checkbox) — a
 * plain personal reminder never touches email_log. Marks the reminder
 * "triggered" (in-app / push) or "sent" (opt-in email succeeded).
 * Triggered rows stay on the calendar; sent/dismissed do not.
 */
async function handlePersonalReminderDue(reminder: ReminderWithContext) {
  const remId = reminder.id;
  const userId = (reminder as any).user_id ?? null;

  const current = await col("reminders").findOne({ _id: toObjectId(remId) } as any);
  const currentStatus = String((current as any)?.status ?? "");
  if (!current || !["pending", "triggered", "no_email", "error"].includes(currentStatus)) {
    return;
  }
  if (currentStatus === "triggered" && userId) {
    const alreadyDue = await col("notifications").findOne({
      user_id: userId,
      kind: "personal_reminder_due",
      reminder_id: remId,
    } as any);
    if (alreadyDue) return;
  }

  logger.info("personal_reminder_due", { reminder_id: remId, user_id: userId, title: reminder.title });

  if (userId) {
    await col("notifications").insertOne({
      user_id: userId,
      kind: "personal_reminder_due",
      reminder_id: remId,
      title: reminder.title,
      body: (reminder as any).expiry_date ? `יעד: ${(reminder as any).expiry_date}` : "",
      created_at: new Date(),
      read_at: null,
    } as any);

    await notifyPersonalReminderDue({
      userId: String(userId),
      title: reminder.title,
      reminderId: String(remId),
    });
  }

  const optInRecipients = parseReminderEmailTo(reminder.email_to);
  let status: "triggered" | "sent" = "triggered";
  if (optInRecipients.length) {
    const result = await sendReminderEmail(reminder, optInRecipients);
    if (result.success) status = "sent";
    else notifyEmailSendFailed({ recipient: optInRecipients.join(", "), error: result.error, title: reminder.title });
  }

  await col("reminders").updateOne(
    { _id: toObjectId(remId) } as any,
    { $set: { status, triggered_at: new Date(), updated_at: new Date() } },
  );
}

export function resolveContractReminderEmail(
    contactEmail?: string | null,
    contract?: { manual_fields?: Record<string, unknown> | null; contact_email?: unknown; client_email?: unknown } | null,
    client?: { email?: string | null } | null,
): string | null {
  return pickContractEmail(
    { ...contract, contact_email: contactEmail ?? contract?.contact_email },
    null,
    client,
  );
}

export async function generateContractReminders(
  contractId: string,
  clientId: string | null,
  documentId: string | null,
  expiryDate: string,
  userId?: string,
  contactEmail?: string | null
) {
  const settings = getSettings();
  const today = new Date().toISOString().slice(0, 10);

  let contractOid: any;
  try { const { ObjectId } = await import("mongodb"); contractOid = new ObjectId(contractId); } catch { contractOid = contractId; }
  const contract = await col("contracts").findOne({ _id: contractOid }) as any;

  let client: any = null;
  if (clientId) {
    let clientOid: any = clientId;
    try { const { ObjectId } = await import("mongodb"); clientOid = new ObjectId(clientId); } catch {}
    client = await col("clients").findOne({_id: clientOid}) as any;
  }
  const emailMeta = pickContractEmailWithMeta(
    { ...contract, contact_email: contactEmail ?? contract?.contact_email },
    null,
    client,
  );
  const manualFields = parseObjectRecord(contract?.manual_fields);
  const emailResolved = emailMeta.email;
  if (emailMeta.corrected) {
    logger.info("contract_reminder_email_autocorrected", {
      contract_id: contractId,
      user_id: userId ?? null,
      from: emailMeta.raw,
      to: emailResolved,
    });
  }
  if (!emailResolved) {
    logger.info("contract_reminder_skipped_no_email", { contract_id: contractId, user_id: userId ?? null });
    const cleared = await col("reminders").deleteMany({
      ...(userId && { user_id: userId }),
      source_type: "contract_expiry",
      source_id: contractId,
      status: { $in: ["pending", "snoozed"] },
    });
    if (cleared.deletedCount) {
      logger.info("contract_reminders_removed_no_email", {
        user_id: userId ?? null,
        contract_id: contractId,
        deleted_count: cleared.deletedCount,
      });
    }
    return;
  }

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

  // Past expiry: mark contract overdue, skip all reminders.
  if (expiryDate < today) {
    if (contract && contract.status !== "expired") {
      await col("contracts").updateOne(
        { _id: contractOid },
        { $set: { status: "expired", updated_at: new Date() } }
      );
      logger.info("contract_marked_overdue", {
        contract_id: contractId,
        expiry_date: expiryDate,
        user_id: userId ?? null,
      });
    }
    return;
  }

  const baseLabel = (() => {
    const t = (contract?.contract_type ?? "").toLowerCase();
    if (t.includes("תסקיר") || t.includes("בדיקה")) return "בדיקה הבאה";
    if (t.includes("ביטוח")) return "חידוש ביטוח";
    if (t.includes("אישור") || t.includes("תעודה")) return "חידוש תעודה";
    if (t.includes("חשבונית")) return "תשלום";
    return "פקיעת תוקף";
  })();

  for (const days of await advanceDaysForUser(userId)) {
    const expiry = new Date(expiryDate);
    expiry.setDate(expiry.getDate() - days);
    const calculatedTrigger = expiry.toISOString().slice(0, 10);

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
    if (existing) {
      if (!(existing as { email_to?: unknown }).email_to) {
        await col("reminders").updateOne(
          { _id: existing._id },
          { $set: { email_to: JSON.stringify([emailResolved]), updated_at: new Date() } },
        );
      }
      continue;
    }

    const title = `${baseLabel} ב-${expiryDate}`;

    const equipment = contract?.equipment_description ?? contract?.checked_equipment ?? null;

      await insertReminderIfAllowed(userId, {
      ...(userId && { user_id: userId }),
      source_type: "contract_expiry",
      source_id: contractId,
      client_id: clientId,
      document_id: documentId,
      trigger_date: triggerDate,
      advance_days: days,
      email_to: JSON.stringify([emailResolved]),
      ...(emailMeta.corrected && emailMeta.raw ? { email_autocorrected_from: emailMeta.raw } : {}),
      client_company: clientDisplayName((client as any)?.display_name),
      client_name: clientDisplayName((client as any)?.display_name),
      contact_person: textField((client as any)?.contact_person) ?? textField(manualFields.contact_person),
      client_email: textField((client as any)?.email) ?? textField(manualFields.contact_email) ?? textField(manualFields.client_email) ?? emailResolved,
      client_phone: textField((client as any)?.phone) ?? textField(manualFields.contact_phone),
      contract_number: textField(contract?.contract_number),
      contract_type: textField(contract?.contract_type),
      title: equipment ? `${title} | ${equipment}` : title,
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
      });
  }

  await syncContractRemindersToCalendar(userId, contractId);
}

/**
 * Mirror a contract's pending reminders onto the user's Google Calendar.
 * Fire-and-forget: a calendar outage must never fail reminder generation.
 */
async function syncContractRemindersToCalendar(userId: string | undefined, contractId: string): Promise<void> {
  if (!userId) return;
  try {
    const reminders = await col("reminders")
      .find({ user_id: userId, source_type: "contract_expiry", source_id: contractId })
      .toArray() as Array<{ _id: unknown }>;
    for (const reminder of reminders) {
      await pushReminderToCalendar(userId, String(reminder._id));
    }
  } catch (e) {
    logger.warn("calendar_contract_sync_failed", { user_id: userId, contract_id: contractId, error: String(e) });
  }
}
