import nodemailer from "nodemailer";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { getSettings, getDataDir } from "../settings";
import { getDb } from "../db/db";
import { renderTemplate, type EmailVars } from "../templates/renderEmail";
import { pickEmailTemplate, loadEmailTemplate } from "../templates/seedEmailTemplates";
import type { ReminderWithContext } from "../../src/shared/types.js";

function buildTransport() {
  const s = getSettings();
  // Gmail app passwords are displayed with spaces ("abcd efgh ijkl mnop") for
  // readability, but SMTP auth needs them without spaces. Strip whitespace.
  const pass = (s.smtpPass ?? "").replace(/\s+/g, "");
  return nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    secure: s.smtpSecure,
    auth: s.smtpUser ? { user: s.smtpUser, pass } : undefined,
    tls: {
      // Allow opting out of strict cert verification for self-signed / internal SMTP servers.
      // Default (true) keeps full validation for Gmail, SendGrid, etc.
      rejectUnauthorized: s.smtpRejectUnauthorized !== false,
    },
  });
}

/**
 * Build the variables map for the email template engine.
 * Sources, in order of priority (later overrides earlier):
 *   1. Static reminder fields (title, trigger_date, advance_days)
 *   2. Client row (display_name → client_company, email, phone)
 *   3. Document row (file_name → document_name, document_type, document_number)
 *   4. Contract row (start_date, expiry_date, contract_number)
 *   5. documents.extracted_fields JSON (all dynamic template fields)
 */
function buildEmailVars(reminder: ReminderWithContext): EmailVars {
  const db = getDb();
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
    const c = db
      .prepare("SELECT display_name, email, phone, address FROM clients WHERE id = ?")
      .get(reminder.client_id) as
      | { display_name: string; email: string | null; phone: string | null; address: string | null }
      | null;
    if (c) {
      vars.client_company = c.display_name;
      vars.contact_email = c.email;
      vars.contact_phone = c.phone;
      vars.client_address = c.address;
    }
  }

  if (reminder.document_id) {
    const d = db
      .prepare(
        "SELECT file_name, document_type, document_number, extracted_fields FROM documents WHERE id = ?"
      )
      .get(reminder.document_id) as
      | { file_name: string; document_type: string | null; document_number: string | null; extracted_fields: string | null }
      | null;
    if (d) {
      vars.document_type = d.document_type;
      vars.document_number = d.document_number;
      // Spread the dynamic extraction so all template-defined fields are available
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
    }

    // Contract date info
    const ct = db
      .prepare(
        `SELECT contract_number, contract_type, start_date, expiry_date, amount, currency
         FROM contracts WHERE document_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(reminder.document_id) as
      | { contract_number: string | null; contract_type: string | null; start_date: string | null;
          expiry_date: string | null; amount: number | null; currency: string | null }
      | null;
    if (ct) {
      vars.contract_number ??= ct.contract_number;
      vars.contract_type ??= ct.contract_type;
      vars.start_date ??= ct.start_date;
      vars.expiry_date ??= ct.expiry_date;
      vars.amount ??= ct.amount;
      vars.currency ??= ct.currency;
    }
  }

  return vars;
}

/** Convert a stored logo path (relative under data/assets) to a data: URL so it's embedded inline. */
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

function renderReminderEmail(reminder: ReminderWithContext): { subject: string; html: string } {
  const db = getDb();

  // Template selection cascade:
  //   1. If the reminder has an explicit email_template_id, use it.
  //   2. Else look up the document's doc_template_id and find the email
  //      template bound to it.
  //   3. Else fall back to the global default email template.
  let tpl = null as ReturnType<typeof loadEmailTemplate>;
  if (reminder.email_template_id) {
    tpl = loadEmailTemplate(db, reminder.email_template_id);
  }

  if (!tpl) {
    let docTemplateId: number | null = null;
    if (reminder.document_id) {
      const row = db
        .prepare("SELECT template_id FROM documents WHERE id = ?")
        .get(reminder.document_id) as { template_id: number | null } | null;
      docTemplateId = row?.template_id ?? null;
    }
    tpl = pickEmailTemplate(db, docTemplateId);
  }

  const vars = buildEmailVars(reminder);
  vars.logo_url = logoToDataUrl(tpl?.logo_path);

  if (!tpl) {
    // Bare-bones fallback when no email_templates exist
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

/**
 * Many user-edited templates either omit `<html>` entirely or have it without
 * `dir="rtl"`. Email clients (especially Gmail) don't inherit direction from
 * surrounding chrome, so Hebrew text often gets left-aligned mixed with
 * mangled punctuation.
 *
 * Strategy:
 *   - If the body has a `<html>` tag, inject `dir="rtl" lang="he"` into it.
 *   - If not, wrap the body in a minimal RTL document.
 *   - Always force a top-level `<body dir="rtl">` so even bare-fragment
 *     templates render correctly when mail clients strip the <html> tag.
 */
function ensureRtl(html: string): string {
  const trimmed = html.trim();
  const hasHtml = /<html[\s>]/i.test(trimmed);
  const hasBody = /<body[\s>]/i.test(trimmed);

  let out = trimmed;

  if (hasHtml) {
    // Inject dir/lang on the existing <html> tag (only if not already present)
    out = out.replace(/<html(\s[^>]*)?>/i, (match, attrs = "") => {
      let a = attrs ?? "";
      if (!/\bdir\s*=/i.test(a)) a += ' dir="rtl"';
      if (!/\blang\s*=/i.test(a)) a += ' lang="he"';
      return `<html${a}>`;
    });
  } else if (hasBody) {
    // Wrap in a minimal <html> shell
    out = `<!DOCTYPE html><html dir="rtl" lang="he">${out}</html>`;
  } else {
    // Bare fragment — wrap fully
    out = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"></head><body dir="rtl" style="direction:rtl; text-align:right; font-family:Arial, sans-serif">${out}</body></html>`;
  }

  // Also stamp <body> with dir/text-align so Gmail's "strip head" sanitisation
  // doesn't lose the direction. Only adds attrs if missing.
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
    const { subject, html } = renderReminderEmail(reminder);
    await transport.sendMail({
      from: settings.emailFrom
        ? `"${settings.emailFrom}" <${settings.emailFromName}>`
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

/** Render the email body for preview without sending. Used by the templates UI. */
export function previewReminderEmail(reminder: ReminderWithContext) {
  return renderReminderEmail(reminder);
}

export async function sendTestEmail(to: string, emailTemplateId: number | null = null): Promise<{ success: boolean; error?: string }> {
  const settings = getSettings();
  if (!settings.smtpHost) return { success: false, error: "SMTP not configured (host is empty)" };
  if (!to) return { success: false, error: "Recipient address is empty" };

  try {
    const transport = buildTransport();

    // Verify the connection + auth first — gives a clearer error than sendMail()
    await transport.verify();

    let subject = "[Client Reminder] בדיקת חיבור אימייל";
    let html = "חיבור ה-SMTP עובד בהצלחה! This is a test email from Client Reminder.";

    // If a template is specified, use it with sample data
    if (emailTemplateId) {
      const tpl = loadEmailTemplate(getDb(), emailTemplateId);
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

    console.log('emails html', html);

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

// Make SMTP errors more actionable for the user
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
