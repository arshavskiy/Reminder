import nodemailer from "nodemailer";
import {existsSync, readFileSync} from "fs";
import {extname, join} from "path";
import {ObjectId} from "mongodb";
import {getDataDir, getSettings} from "../settings";
import {col} from "../db/db";
import {type EmailVars, renderTemplate} from "../templates/renderEmail";
import {loadEmailTemplate, loadEmailTemplateByName, pickEmailTemplate} from "../templates/seedEmailTemplates";
import type {ReminderWithContext} from "../../src/shared/types.js";
import {logger} from "../logger";

const FALLBACK_TEST_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; direction: rtl; background: #f5f7fa; padding: 24px; color: #2c3e50; margin: 0; }
    .card { background: #ffffff; border-radius: 12px; padding: 32px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 16px rgba(0,0,0,0.06); text-align: right; }
    .logo { text-align: center; margin-bottom: 16px; }
    .logo img { max-height: 56px; }
    h1 { color: #18a058; margin: 0 0 8px; font-size: 22px; }
    .lead { color: #5a6c7d; margin: 0 0 24px; font-size: 14px; }
    .badge { display: inline-block; background: #fff3cd; color: #856404; border: 1px solid #ffc107; border-radius: 999px; padding: 4px 14px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
    .fields { background: #fafbfc; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
    .field { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eef0f3; font-size: 14px; }
    .field:last-child { border-bottom: none; }
    .field .label { color: #5a6c7d; }
    .field .value { color: #2c3e50; font-weight: 600; }
    .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #eef0f3; font-size: 12px; color: #95a5a6; text-align: center; }
    a.cta { display: inline-block; background: #18a058; color: #fff !important; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    {{#if logo_url}}
    <div class="logo"><img src="{{logo_url}}" alt="לוגו"/></div>
    {{/if}}

    <h1>תזכורת: {{title}}</h1>
    <p class="lead">{{document_type|מסמך}} עבור {{client_company|הלקוח}}</p>

    <div class="badge">{{advance_days}} ימים לפני תאריך היעד</div>

    <div class="fields">
      {{#if client_company}}<div class="field"><span class="label"> לקוח / חברה </span><span class="value"> {{client_company}} </span></div>{{/if}}
      {{#if contact_person}}<div class="field"><span class="label">  איש קשר</span><span class="value"> {{contact_person}} </span></div>{{/if}}
      {{#if contact_phone}}<div class="field"><span class="label"> טלפון </span><span class="value"> {{contact_phone}} </span></div>{{/if}}
      {{#if document_number}}<div class="field"><span class="label"> </span><span class="value"> {{document_number}} </span></div>{{/if}}
      {{#if expiry_date}}<div class="field"><span class="label"> תאריך יעד </span><span class="value"> {{expiry_date}} </span></div>{{/if}}
      {{#if trigger_date}}<div class="field"><span class="label"> תאריך התזכורת </span><span class="value"> {{trigger_date}} </span></div>{{/if}}
    </div>

    {{#if body}}<p>{{body}}</p>

    <div class="footer">
      {{from_name| ReminderOCR }} — תזכורת אוטומטית, אין צורך להשיב
    </div>
  </div>
</body>
</html>`;

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
    // Without explicit timeouts, an unreachable/slow SMTP host (common on
    // some hosting providers' outbound network) leaves send-now hanging for
    // nodemailer's default ~2 minutes with no feedback to the user, instead
    // of failing fast with a clear error.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

function tryObjectId(id: string | number): any {
  try {
    return new ObjectId(String(id));
  } catch {
    return id;
  }
}

const EQUIPMENT_CATEGORY_LABELS: Record<string, string> = {
  lift: "מכונות הרמה",
  accessory: "אביזרי הרמה",
  scaffold: "פיגומים",
  ladder: "מעליות",
  balloon: "מעלונים",
  intake: "קולטי אוויר",
  extractor: "קולטי קיטור",
  other: "אחר",
};

function applyEquipmentVars(vars: EmailVars, eq: any): void {
  vars.equipment_type ??= EQUIPMENT_CATEGORY_LABELS[eq.category] ?? eq.category ?? null;
  vars.manufacturer ??= eq.manufacturer;
  vars.model ??= eq.model;
  vars.serial_number ??= eq.serial_number;
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

  // Equipment fields stored directly on the reminder take precedence over the
  // client/document fallbacks below (which use ??=), so the user's edits in the
  // reminder modal are what actually get sent.
  const r = reminder as any;
  if (r.equipment_type) vars.equipment_type = EQUIPMENT_CATEGORY_LABELS[r.equipment_type] ?? r.equipment_type;
  if (r.manufacturer) vars.manufacturer = r.manufacturer;
  if (r.model) vars.model = r.model;
  if (r.serial_number) vars.serial_number = r.serial_number;

  if (reminder.client_id) {
    const c = await col("clients").findOne({ _id: tryObjectId(reminder.client_id) } as any) as any;
    if (c) {
      vars.client_company = c.display_name;
      vars.contact_person = c.contact_person;
      vars.contact_email = c.email;
      vars.contact_phone = c.phone;
      vars.client_address = c.address;
    }

    // Contract-only reminders (no document_id — e.g. the manual hydraulic-check
    // flow) never hit the document_id branch below, so pull the client's most
    // relevant contract here as a fallback for contract_number/expiry_date/etc.
    if (!reminder.document_id) {
      const sourceId = (reminder as any).source_id;
      const ct = await col("contracts").findOne(
        sourceId
          ? { _id: tryObjectId(sourceId), client_id: reminder.client_id }
          : { client_id: reminder.client_id },
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

      const eq = await col("equipment").findOne(
        { client_id: reminder.client_id },
        { sort: { _id: -1 } }
      ) as any;
      if (eq) applyEquipmentVars(vars, eq);
    }
  }

  if (reminder.document_id) {
    const d = await col("documents").findOne({ _id: tryObjectId(reminder.document_id) } as any) as any;
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

      const eq = await col("equipment").findOne(
        { document_id: reminder.document_id },
        { sort: { _id: -1 } }
      ) as any;
      if (eq) applyEquipmentVars(vars, eq);
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

  const filledKeys = Object.entries(vars).filter(([, v]) => v != null && v !== "").map(([k]) => k);
  logger.debug("reminder_email_rendered", {
    reminder_id: reminder.id,
    client_id: reminder.client_id ?? null,
    document_id: reminder.document_id ?? null,
    template_name: tpl?.name ?? null,
    filled_vars: filledKeys,
  });

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
    const info = await transport.sendMail({
      from: settings.emailFrom
        ? `"${settings.emailFromName}" <${settings.emailFrom}>`
        : settings.emailFrom,
      to: recipients.join(", "),
      subject,
      html,
      text: `תזכורת: ${reminder.title}\nלקוח: ${reminder.client_name ?? ""}\nתאריך: ${reminder.trigger_date}`,
    });
    logger.info("reminder_email_sent", {
      reminder_id: reminder.id,
      recipient_count: recipients.length,
      message_id: (info as any).messageId ?? null,
    });
    return { success: true };
  } catch (err) {
    logger.warn("reminder_email_failed", {
      reminder_id: reminder.id,
      recipient_count: recipients.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendEmailWithAttachments(
  recipients: string[],
  subject: string,
  text: string,
  attachments: Array<{ filename: string; content: Buffer; contentType: string }>,
  html?: string,
): Promise<{ success: boolean; error?: string }> {
  const settings = getSettings();
  if (!settings.smtpHost) return { success: false, error: "SMTP not configured" };
  if (!recipients.length) return { success: false, error: "No recipients configured" };
  try {
    const transport = buildTransport();
    const info = await transport.sendMail({
      from: settings.emailFrom ? `"${settings.emailFromName}" <${settings.emailFrom}>` : settings.emailFrom,
      to: recipients.join(", "),
      subject,
      text,
      html,
      attachments,
    });
    logger.info("email_with_attachments_sent", {
      recipient_count: recipients.length,
      message_id: (info as any).messageId ?? null,
      attachment_count: attachments.length,
    });
    return { success: true };
  } catch (err) {
    logger.warn("email_with_attachments_failed", {
      recipient_count: recipients.length,
      attachment_count: attachments.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
export async function sendMonthlyReportEmail(
  recipients: string[],
  details: {clientName: string; reportMonth: string; recordCount: number},
  attachments: Array<{ filename: string; content: Buffer; contentType: string }>,
): Promise<{ success: boolean; error?: string }> {
  const settings = getSettings();
  const vars: EmailVars = {
    client_company: details.clientName,
    report_month: details.reportMonth,
    report_count: details.recordCount,
    from_name: settings.emailFromName,
  };
  const template = await loadEmailTemplateByName("דוח חודשי ללקוח");
  const subject = template
    ? renderTemplate(template.subject, vars, {escape: false})
    : `דוח חודשי - ${details.clientName} - ${details.reportMonth}`;
  const html = template
    ? ensureRtl(renderTemplate(template.html, vars, {escape: false}))
    : ensureRtl(`<h2>דוח חודשי</h2><p>מצורף דוח עבור ${details.clientName} לתקופה ${details.reportMonth}.</p>`);
  return sendEmailWithAttachments(
    recipients,
    subject,
    `מצורף דוח חודשי עבור ${details.clientName}. מספר רשומות: ${details.recordCount}.`,
    attachments,
    html,
  );
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

    const sampleVars: EmailVars = {
      title: "בדיקה לדוגמה",
      trigger_date: new Date().toISOString().split("T")[0],
      advance_days: 30,
      body: " זהו דוא״ל בדיקה באמצעות תבנית שנבחרה.",
      client_name: " לקוח לדוגמה",
      document_name: " מסמך לדוגמה",
      from_name: settings.emailFromName || " ReminderOCR ",
      client_company: " חברה לדוגמה",
      contact_email: to,
      contact_phone: "050-1234567 ",
      document_type: " בדיקה",
      document_number: "001 ",
      contact_person: " איש קשר לדוגמה",
      expiry_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
    };

    const tpl = emailTemplateId
      ? await loadEmailTemplate(emailTemplateId)
      : await pickEmailTemplate(null);

    let subject = "[Client Reminder] בדיקת חיבור אימייל";
    let html: string;

    if (tpl) {
      subject = renderTemplate(tpl.subject, sampleVars, { escape: false }) || subject;
      html = ensureRtl(renderTemplate(tpl.html, sampleVars, { escape: false }));
    } else {
      html = ensureRtl(renderTemplate(FALLBACK_TEST_HTML, sampleVars, { escape: false }));
    }

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
