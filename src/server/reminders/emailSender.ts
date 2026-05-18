import nodemailer from "nodemailer";
import { getSettings } from "../settings.js";
import type { ReminderWithContext } from "../../shared/types.js";

function buildTransport() {
  const s = getSettings();
  return nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    secure: s.smtpSecure,
    auth: s.smtpUser ? { user: s.smtpUser, pass: s.smtpPass } : undefined,
  });
}

function buildHtml(reminder: ReminderWithContext): string {
  const clientName = reminder.client_name ?? "לקוח לא ידוע";
  const docName = reminder.document_name ?? "";
  const triggerDate = reminder.trigger_date;
  const advanceDays = reminder.advance_days;

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; direction: rtl; background: #f9f9f9; padding: 20px; color: #333; }
    .card { background: #fff; border-radius: 8px; padding: 24px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    h2 { color: #1a6de0; margin-top: 0; }
    .badge { display: inline-block; background: #fff3cd; color: #856404; border: 1px solid #ffc107; border-radius: 4px; padding: 2px 10px; font-size: 13px; }
    .field { margin: 8px 0; }
    .label { font-weight: bold; color: #555; }
    .footer { margin-top: 24px; font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>⏰ תזכורת: ${reminder.title}</h2>
    <p class="badge">${advanceDays} ימים לפני תאריך היעד</p>
    <div class="field"><span class="label">לקוח/חברה:</span> ${clientName}</div>
    ${docName ? `<div class="field"><span class="label">מסמך:</span> ${docName}</div>` : ""}
    <div class="field"><span class="label">תאריך תזכורת:</span> ${triggerDate}</div>
    ${reminder.body ? `<div class="field">${reminder.body}</div>` : ""}
    <div class="footer">
      נשלח על ידי Client Reminder — מערכת תזכורות לקוחות
    </div>
  </div>
</body>
</html>`;
}

export async function sendReminderEmail(
  reminder: ReminderWithContext,
  recipients: string[]
): Promise<{ success: boolean; error?: string }> {
  const settings = getSettings();

  if (!settings.smtpHost) {
    return { success: false, error: "SMTP not configured" };
  }

  try {
    const transport = buildTransport();
    const html = buildHtml(reminder);
    await transport.sendMail({
      from: settings.emailFromName
        ? `"${settings.emailFromName}" <${settings.emailFrom}>`
        : settings.emailFrom,
      to: recipients.join(", "),
      subject: `[תזכורת] ${reminder.title}`,
      html,
      text: `תזכורת: ${reminder.title}\nלקוח: ${reminder.client_name ?? ""}\nתאריך: ${reminder.trigger_date}`,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendTestEmail(to: string): Promise<{ success: boolean; error?: string }> {
  const settings = getSettings();
  if (!settings.smtpHost) return { success: false, error: "SMTP not configured" };

  try {
    const transport = buildTransport();
    await transport.sendMail({
      from: settings.emailFrom || settings.smtpUser,
      to,
      subject: "[Client Reminder] בדיקת חיבור אימייל",
      text: "חיבור ה-SMTP עובד בהצלחה! This is a test email from Client Reminder.",
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
