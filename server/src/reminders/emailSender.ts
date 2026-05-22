import nodemailer from "nodemailer";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { getSettings, getDataDir } from "../settings";
import { col } from "../db/db";
import { renderTemplate, type EmailVars } from "../templates/renderEmail";
import { pickEmailTemplate, loadEmailTemplate } from "../templates/seedEmailTemplates";
import type { ReminderWithContext } from "../../src/shared/types.js";

function buildTransport() {
  const s = getSettings();
  const pass = (s.smtpPass ?? "").replace(/\s+/g, "");
  return nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    secure: s.smtpSecure,
    auth: s.smtpUser ? { user: s.smtpUser, pass } : undefined,
    tls: {
      rejectUnauthorized: s.smtpRejectUnauthorized !== false,
    },
  });
}

async function buildEmailVars(reminder: ReminderWithContext): Promise<EmailVars> {
  const settings = getSettings();
  const vars: EmailVars = {
    title: reminder.title,
    trigger_date: reminder.trigger_date,
    advance_days: reminder.advance_days,
    body: reminder.body ?? null,
    client_name: reminder.client_name,
    document_name: reminder.document_name,
    from_name: settings.emailFromName,
  };

  if (reminder.client_id) {
    const c = await col("clients").findOne({ _id: reminder.client_id } as any) as any;
    if (c) {
      vars.client_company = c.display_name;
      vars.contact_email = c.email;
      vars.contact_phone = c.phone;
      vars.client_address = c.address;
    }
  }

  if (reminder.document_id) {
    const d = await col("documents").findOne({ _id: reminder.document_id } as any) as any;
    if (d) {
      vars.document_type = d.document_type;
      vars.document_number = d.document_number;
      if (d.extracted_fields) {
        try {
          const fields = JSON.parse(d.extracted_fields) as Record<string, unknown>;
          for (const [k, v] of Object.entries(fields)) {
            if (vars[k] === undefined && (typeof v === "string" || typeof v === "number")) {
              vars[k] = v as string | number;
            }
          }
        } catch { /* ignore */ }
      }

      const ct = await col("contracts").findOne(
        { document_id: reminder.document_id },
        { sort: { _id: -1 } }
      ) as any;
      if (ct) {
        vars.contract_number ??= ct.contract_number;
        vars.contract_type ??= ct.contract_type;
        vars.start_date ??= ct.start_date;
        vars.expiry_date ??= ct.expiry_date;
        vars.amount ??= ct.amount;
        vars.currency ??= ct.currency;
      }
    }
  }

  return vars;
}

function logoToDataUrl(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;
  const abs = join(getDataDir(), "assets", logoPath);
  if (!existsSync(abs)) return null;
  try {
    const buf = readFileSync(abs);
    const ext = extname(abs).toLowerCase();
    const mime =
      ext === ".png" ? "image/png" :
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
      ext === ".svg" ? "image/svg+xml" :
      ext === ".gif" ? "image/gif" :
      "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function renderReminderEmail(reminder: ReminderWithContext): Promise<{ subject: string; html: string }> {
  let tpl = null as Awaited<ReturnType<typeof loadEmailTemplate>>;

  if (reminder.email_template_id) {
    tpl = await loadEmailTemplate(reminder.email_template_id);
  }

  if (!tpl) {
    let docTemplateId: string | null = null;
    if (reminder.document_id) {
      const row = await col("documents").findOne({ _id: reminder.document_id } as any) as any;
      docTemplateId = row?.template_id ?? null;
    }
    tpl = await pickEmailTemplate(docTemplateId);
  }

  const vars = await buildEmailVars(reminder);
  vars.logo_url = logoToDataUrl(tpl?.logo_path);

  if (!tpl) {
    return {
      subject: `[תזכורת] ${reminder.title}`,
      html: `<div dir="rtl"><h2>${reminder.title}</h2><p>${reminder.body ?? ""}</p></div>`,
    };
  }

  const renderedHtml = renderTemplate(tpl.html, vars, { escape: false });
  return {
    subject: renderTemplate(tpl.subject, vars, { escape: false }),
    html: ensureRtl(renderedHtml),
  };
}

function ensureRtl(html: string): string {
  const trimmed = html.trim();
  const hasHtml = /<html[\s>]/i.test(trimmed);
  const hasBody = /<body[\s>]/i.test(trimmed);

  let out = trimmed;

  if (hasHtml) {
    out = out.replace(/<html(\s[^>]*)?>/i, (match, attrs = "") => {
      let a = attrs ?? "";
      if (!/\bdir\s*=/i.test(a)) a += ' dir="rtl"';
      if (!/\blang\s*=/i.test(a)) a += ' lang="he"';
      return `<html${a}>`;
    });
  } else if (hasBody) {
    out = `<!DOCTYPE html><html dir="rtl" lang="he">${out}</html>`;
  } else {
    out = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"></head><body dir="rtl" style="direction:rtl; text-align:right; font-family:Arial, sans-serif">${out}</body></html>`;
  }

  out = out.replace(/<body(\s[^>]*)?>/i, (match, attrs = "") => {
    let a = attrs ?? "";
    if (!/\bdir\s*=/i.test(a)) a += ' dir="rtl"';
    if (!/style\s*=/i.test(a)) {
      a += ' style="direction:rtl; text-align:right"';
    } else if (!/direction\s*:/i.test(a)) {
      a = a.replace(/style\s*=\s*"/i, 'style="direction:rtl; text-align:right; ');
    }
    return `<body${a}>`;
  });

  return out;
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
    const { subject, html } = await renderReminderEmail(reminder);
    await transport.sendMail({
      from: settings.emailFrom
        ? `"${settings.emailFromName}" <${settings.emailFrom}>`
        : settings.emailFrom,
      to: recipients.join(", "),
      subject,
      html,
      text: `תזכורת: ${reminder.title}\nלקוח: ${reminder.client_name ?? ""}\nתאריך: ${reminder.trigger_date}`,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function previewReminderEmail(reminder: ReminderWithContext) {
  return renderReminderEmail(reminder);
}

export async function sendTestEmail(to: string, emailTemplateId: string | number | null = null): Promise<{ success: boolean; error?: string }> {
  const settings = getSettings();
  if (!settings.smtpHost) return { success: false, error: "SMTP not configured (host is empty)" };
  if (!to) return { success: false, error: "Recipient address is empty" };

  try {
    const transport = buildTransport();
    await transport.verify();

    let subject = "[Client Reminder] בדיקת חיבור אימייל";
    let html = "חיבור ה-SMTP עובד בהצלחה! This is a test email from Client Reminder.";

    if (emailTemplateId) {
      const tpl = await loadEmailTemplate(emailTemplateId);
      if (tpl) {
        const sampleVars: EmailVars = {
          title: "בדיקה לדוגמה",
          trigger_date: new Date().toISOString().split("T")[0],
          advance_days: 30,
          body: "זהו דוא״ל בדיקה באמצעות תבנית שנבחרה.",
          client_name: "לקוח לדוגמה",
          document_name: "מסמך לדוגמה",
          from_name: settings.emailFromName,
          client_company: "חברה לדוגמה",
          contact_email: to,
          contact_phone: "050-1234567",
          document_type: "בדיקה",
          document_number: "001",
          contact_person: "איש קשר לדוגמה",
        };
        subject = renderTemplate(tpl.subject, sampleVars, { escape: false }) || subject;
        html = renderTemplate(tpl.html, sampleVars, { escape: false }) || html;
      }
    }

    console.log("emails html", html);

    await transport.sendMail({
      from: settings.emailFromName
        ? `"${settings.emailFromName}" <${settings.emailFrom || settings.smtpUser}>`
        : settings.emailFrom || settings.smtpUser,
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { success: false, error: explainSmtpError(raw, settings) };
  }
}

function explainSmtpError(msg: string, s: ReturnType<typeof getSettings>): string {
  if (msg.includes("altnames") || msg.includes("certificate")) {
    return `שגיאת תעודת SSL: ${msg}\n\nאפשרויות:\n` +
      `1. ודא שכתובת ה-Host מדויקת (למשל smtp.gmail.com ולא IP)\n` +
      `2. אם פורט ${s.smtpPort} = 587 → כבה SSL/TLS\n` +
      `3. אם פורט ${s.smtpPort} = 465 → הפעל SSL/TLS\n` +
      `4. עבור שרת פנימי / self-signed: כבה "אמת תעודת SSL" בהגדרות`;
  }
  if (msg.includes("EAUTH") || msg.includes("Username and Password not accepted")) {
    return `שגיאת אימות: ${msg}\n\n` +
      `עבור Gmail/Outlook: השתמש ב-App Password ולא בסיסמת החשבון הרגילה`;
  }
  if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
    return `לא ניתן להתחבר ל-${s.smtpHost}:${s.smtpPort}\n\n` +
      `ודא שה-Host והפורט נכונים, ושאין חוסם רשת/פיירוול`;
  }
  if (msg.includes("ETIMEDOUT")) {
    return `Timeout בחיבור ל-${s.smtpHost}:${s.smtpPort}. ייתכן שהפורט חסום ע"י הפיירוול`;
  }
  return msg;
}
