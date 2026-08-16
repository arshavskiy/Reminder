import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {getSettings} from "../settings";
import {sendGroupedReminderEmail, sendReminderEmail} from "./emailSender";
import {sendMonthlyReportToRecipients} from "../reports/monthlyReports";
import type {ReminderWithContext} from "../../src/shared/types.js";
import {logger} from "../logger";
import {clientDisplayName} from "../utils/clientNames";
import {notifyEmailSendFailed, notifyReminderSkipped} from "../push/adminNotify";
import {parseObjectRecord, parseReminderEmailTo, pickContractEmail} from "../contracts/contractEmail.js";
import {buildGroupedItemsTable, expiryFromReminderTitle, groupedReminderKey} from "./groupedReminderEmail";

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
      trigger_date: { $lte: today },
      $or: [
        { status: "pending" },
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
    if ((reminder as any).status === "error") {
      logger.debug("reminder_send_still_no_recipients", { reminder_id: remId });
      return;
    }
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
    notifyReminderSkipped({
      title: reminder.title,
      reminderId: remId,
      clientId: reminder.client_id,
      userId: (reminder as any).user_id ?? null,
      reason: "no_recipients",
    });
    await col("reminders").updateOne(
      { _id: toObjectId(remId) } as any,
      { $set: { status: "error", updated_at: new Date() } },
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

export function resolveContractReminderEmail(
    contactEmail?: string | null,
    contract?: { manual_fields?: Record<string, unknown> | null } | null,
    client?: { email?: string | null } | null,
): string | null {
  const manual = contract?.manual_fields && typeof contract.manual_fields === "object"
      ? contract.manual_fields
      : {};
  const candidates = [
    contactEmail,
    typeof manual.contact_email === "string" ? manual.contact_email : null,
    typeof manual.client_email === "string" ? manual.client_email : null,
    client?.email,
  ];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
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
  const emailResolved = resolveContractReminderEmail(contactEmail, contract, client);
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

  for (const days of settings.reminderAdvanceDays) {
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
      if (!existing.email_to) {
        await col("reminders").updateOne(
          { _id: existing._id },
          { $set: { email_to: JSON.stringify([emailResolved]), updated_at: new Date() } },
        );
      }
      continue;
    }

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
      email_to: JSON.stringify([emailResolved]),
      title: equipment ? `${title} | ${equipment}` : title,
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    } as any);
  }
}
