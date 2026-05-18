import { getDb } from "../db/db.js";
import { getSettings } from "../settings.js";
import { sendReminderEmail } from "./emailSender.js";
import type { ReminderWithContext, WsEvent } from "../../shared/types.js";

type PushFn = (event: WsEvent) => void;

let _push: PushFn | undefined;
let _timer: ReturnType<typeof setInterval> | null = null;

export function startScheduler(push: PushFn) {
  _push = push;
  const settings = getSettings();
  if (!settings.reminderEnabled) return;

  // Run immediately on startup, then on interval
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
  const db = getDb();

  const due = db
    .prepare(
      `SELECT r.*,
              c.display_name AS client_name,
              d.file_name    AS document_name
       FROM reminders r
       LEFT JOIN clients   c ON c.id = r.client_id
       LEFT JOIN documents d ON d.id = r.document_id
       WHERE r.status = 'pending'
         AND r.trigger_date <= date('now')
         AND r.id NOT IN (SELECT reminder_id FROM email_log WHERE success = 1 AND reminder_id IS NOT NULL)`
    )
    .all() as ReminderWithContext[];

  for (const reminder of due) {
    await processReminder(reminder);
  }
}

async function processReminder(reminder: ReminderWithContext) {
  const db = getDb();

  // Collect recipient addresses
  let recipients: string[] = [];
  try {
    recipients = reminder.email_to ? JSON.parse(reminder.email_to) : [];
  } catch {
    recipients = [];
  }

  // Fall back to client email if reminder has no explicit recipients
  if (recipients.length === 0 && reminder.client_id) {
    const client = db
      .prepare("SELECT email FROM clients WHERE id = ?")
      .get(reminder.client_id) as { email: string | null } | null;
    if (client?.email) recipients = [client.email];
  }

  const settings = getSettings();
  if (recipients.length === 0 && !settings.emailFrom) {
    // No email address anywhere — skip sending but mark as sent (in-app only)
    markSent(reminder, recipients, null, null);
    return;
  }

  const result = await sendReminderEmail(reminder, recipients);

  // Count prior failures
  const failCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM email_log WHERE reminder_id = ? AND success = 0"
      )
      .get(reminder.id) as { n: number }
  ).n;

  db.prepare(
    `INSERT INTO email_log (reminder_id, to_address, subject, sent_at, success, error, smtp_host)
     VALUES (?, ?, ?, datetime('now'), ?, ?, ?)`
  ).run(
    reminder.id,
    recipients.join(", "),
    `[תזכורת] ${reminder.title}`,
    result.success ? 1 : 0,
    result.error ?? null,
    getSettings().smtpHost || "in-app-only"
  );

  if (result.success) {
    markSent(reminder, recipients, null, null);
    _push?.({ type: "reminder:fired", reminderId: reminder.id, clientId: reminder.client_id, title: reminder.title });
  } else if (failCount + 1 >= 3) {
    db.prepare(
      `UPDATE reminders SET status='error', updated_at=datetime('now') WHERE id=?`
    ).run(reminder.id);
    _push?.({ type: "reminder:error", reminderId: reminder.id, error: result.error ?? "unknown" });
    console.error(`[scheduler] Reminder ${reminder.id} failed 3 times, marking as error`);
  } else {
    console.warn(`[scheduler] Reminder ${reminder.id} send failed (attempt ${failCount + 1}): ${result.error}`);
  }
}

function markSent(
  reminder: ReminderWithContext,
  _recipients: string[],
  _a: null,
  _b: null
) {
  const db = getDb();
  db.prepare(
    `UPDATE reminders SET status='sent', updated_at=datetime('now') WHERE id=?`
  ).run(reminder.id);

  if (reminder.client_id) {
    db.prepare(
      `INSERT INTO timeline_events (client_id, event_type, title, event_date, source_id, source_type)
       VALUES (?, 'email_sent', ?, datetime('now'), ?, 'reminder')`
    ).run(reminder.client_id, `תזכורת נשלחה: ${reminder.title}`, reminder.id);
  }
}

// Called after a contract is saved with an expiry_date
export function generateContractReminders(
  contractId: number,
  clientId: number | null,
  documentId: number | null,
  expiryDate: string
) {
  const db = getDb();
  const settings = getSettings();
  const today = new Date().toISOString().slice(0, 10);

  // Derive a reminder title from the contract type when available
  const contract = db
    .prepare("SELECT contract_type, contract_number FROM contracts WHERE id=?")
    .get(contractId) as { contract_type: string | null; contract_number: string | null } | null;

  const baseLabel = (() => {
    const t = (contract?.contract_type ?? "").toLowerCase();
    if (t.includes("תסקיר") || t.includes("בדיקה")) return "בדיקה הבאה";
    if (t.includes("ביטוח")) return "חידוש ביטוח";
    if (t.includes("אישור") || t.includes("תעודה")) return "חידוש תעודה";
    if (t.includes("חשבונית")) return "תשלום";
    return "פקיעת תוקף";
  })();

  for (const days of settings.reminderAdvanceDays) {
    // Check dedup
    const exists = db
      .prepare(
        `SELECT id FROM reminders WHERE source_type='contract_expiry' AND source_id=? AND advance_days=? AND status != 'dismissed'`
      )
      .get(contractId, days);
    if (exists) continue;

    // Compute trigger date
    const expiry = new Date(expiryDate);
    expiry.setDate(expiry.getDate() - days);
    const triggerDate = expiry.toISOString().slice(0, 10);

    // Only create if in the future
    if (triggerDate <= today) continue;

    const title = `${baseLabel} בעוד ${days} יום (${expiryDate})`;

    db.prepare(
      `INSERT INTO reminders (source_type, source_id, client_id, document_id, trigger_date, advance_days, title, status)
       VALUES ('contract_expiry', ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(contractId, clientId, documentId, triggerDate, days, title);
  }
}
