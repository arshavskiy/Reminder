import {col} from "../db/db";
import {getSettings} from "../settings";
import {sendReminderEmail} from "./emailSender";
import type {ReminderWithContext} from "../../src/shared/types.js";

let _timer: ReturnType<typeof setInterval> | null = null;

export function startScheduler() {
  const settings = getSettings();
  if (!settings.reminderEnabled) return;

  checkReminders().catch(console.error);
  _timer = setInterval(() => {
    checkReminders().catch(console.error);
  }, settings.reminderCheckIntervalMs);

  console.log(
    `[scheduler] Started — checking every ${settings.reminderCheckIntervalMs / 1000}s`
  );
}

export function stopScheduler() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
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

  for (const reminder of due) {
    const remId = reminder._id?.toString();
    if (sentIds.has(remId)) continue;

    const r = reminder as any;
    const [client, document] = await Promise.all([
      r.client_id
        ? col("clients").findOne({ _id: r.client_id } as any)
        : null,
      r.document_id
        ? col("documents").findOne({ _id: r.document_id } as any)
        : null,
    ]);

    const enriched: ReminderWithContext = {
      ...r,
      id: remId,
      client_name: (client as any)?.display_name ?? null,
      document_name: (document as any)?.file_name ?? null,
    } as any;

    await processReminder(enriched);
  }
}

async function processReminder(reminder: ReminderWithContext) {
  let recipients: string[] = [];
  try {
    recipients = reminder.email_to ? JSON.parse(reminder.email_to) : [];
  } catch {
    recipients = [];
  }

  if (recipients.length === 0 && reminder.client_id) {
    const client = await col("clients").findOne({ _id: reminder.client_id } as any) as any;
    if (client?.email) recipients = [client.email];
  }

  const settings = getSettings();
  if (recipients.length === 0 && !settings.emailFrom) {
    await markSent(reminder);
    return;
  }

  const result = await sendReminderEmail(reminder, recipients);

  const failCount = await col("email_log").countDocuments({
    reminder_id: reminder.id,
    success: 0,
  });

  await col("email_log").insertOne({
    reminder_id: reminder.id,
    to_address: recipients.join(", "),
    subject: `[תזכורת] ${reminder.title}`,
    sent_at: new Date(),
    success: result.success ? 1 : 0,
    error: result.error ?? null,
    smtp_host: getSettings().smtpHost || "in-app-only",
  } as any);

  if (result.success) {
    await markSent(reminder);
  } else if (failCount + 1 >= 3) {
    await col("reminders").updateOne(
      { _id: reminder.id } as any,
      { $set: { status: "error", updated_at: new Date() } }
    );
    console.error(`[scheduler] Reminder ${reminder.id} failed 3 times, marking as error`);
  } else {
    console.warn(
      `[scheduler] Reminder ${reminder.id} send failed (attempt ${failCount + 1}): ${result.error}`
    );
  }
}

async function markSent(reminder: ReminderWithContext) {
  await col("reminders").updateOne(
    { _id: reminder.id } as any,
    { $set: { status: "sent", updated_at: new Date() } }
  );

  if (reminder.client_id) {
    await col("timeline_events").insertOne({
      client_id: reminder.client_id,
      event_type: "email_sent",
      title: `תזכורת נשלחה: ${reminder.title}`,
      event_date: new Date(),
      source_id: reminder.id,
      source_type: "reminder",
      created_at: new Date(),
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
  const today = new Date().toISOString().slice(0, 10);

  // Read advance days from per-user settings, fall back to global
  let advanceDays: number[] = getSettings().reminderAdvanceDays;
  if (userId) {
    const userSettings = await col("user_settings").findOne({ user_id: userId }) as any;
    if (userSettings?.reminder_advance_days) {
      try {
        const parsed = JSON.parse(userSettings.reminder_advance_days);
        if (Array.isArray(parsed) && parsed.length > 0) advanceDays = parsed;
      } catch { /* keep global default */ }
    }
  }

  const contract = await col("contracts").findOne({ _id: contractId } as any) as any;

  const baseLabel = (() => {
    const t = (contract?.contract_type ?? "").toLowerCase();
    if (t.includes("תסקיר") || t.includes("בדיקה")) return "בדיקה הבאה";
    if (t.includes("ביטוח")) return "חידוש ביטוח";
    if (t.includes("אישור") || t.includes("תעודה")) return "חידוש תעודה";
    if (t.includes("חשבונית")) return "תשלום";
    return "פקיעת תוקף";
  })();

  for (const days of advanceDays) {
    const existing = await col("reminders").findOne({
      source_type: "contract_expiry",
      source_id: contractId,
      advance_days: days,
      status: { $ne: "dismissed" },
    });
    if (existing) continue;

    const expiry = new Date(expiryDate);
    expiry.setDate(expiry.getDate() - days);
    const triggerDate = expiry.toISOString().slice(0, 10);

    if (triggerDate <= today) continue;

    const title = `${baseLabel} ב-${triggerDate} (יעד: ${expiryDate})`;

    await col("reminders").insertOne({
      ...(userId && { user_id: userId }),
      source_type: "contract_expiry",
      source_id: contractId,
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
