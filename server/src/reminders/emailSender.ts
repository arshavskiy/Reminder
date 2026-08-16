import nodemailer from "nodemailer";
import {ObjectId} from "mongodb";
import {getSettings} from "../settings";
import {col} from "../db/db";
import {type EmailVars, renderTemplate} from "../templates/renderEmail";
import {loadEmailTemplate, loadEmailTemplateByName, pickEmailTemplate} from "../templates/seedEmailTemplates";
import {loadReminderTemplate} from "../email-templates/loader";
import type {ReminderWithContext} from "../../src/shared/types.js";
import {logger} from "../logger";
import {prepareGroupedTemplateHtml} from "./groupedReminderEmail.js";

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
      {{#if license_number}}<div class="field"><span class="label"> מספר רישוי </span><span class="value"> {{license_number}} </span></div>{{/if}}
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

const GMAIL_SAFE_HTML_BYTES = 90 * 1024;
const DATA_IMAGE_RE = /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s-]+/i;

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
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

// Resend HTTP API transport — used when RESEND_API_KEY is set (bypasses SMTP port blocks)
async function sendViaResend(opts: {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}): Promise<void> {
  const { Resend } = await import("resend");
  const client = new Resend(process.env.RESEND_API_KEY);
  const result = await client.emails.send({
    from: opts.from,
    to: opts.to,
    cc: opts.cc?.length ? opts.cc : undefined,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });
  if (result.error) throw new Error(result.error.message ?? JSON.stringify(result.error));
}

function useResend(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function formatFrom(settings: ReturnType<typeof getSettings>): string {
  return settings.emailFromName
    ? `${settings.emailFromName} <${settings.emailFrom || settings.smtpUser}>`
    : (settings.emailFrom || settings.smtpUser);
}

function tryObjectId(id: string | number): any {
  try {
    return new ObjectId(String(id));
  } catch {
    return id;
  }
}

function firstNonEmpty(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function formatAddress(fromName: string, fromEmail: string): string {
  return fromEmail ? `"${fromName.replace(/"/g, "'")}" <${fromEmail}>` : fromEmail;
}

function absoluteServerUrl(path: string): string | null {
  const base = firstNonEmpty(process.env.SERVER_URL, process.env.API_PUBLIC_URL);
  if (!base) return null;
  try {
    return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
  } catch {
    return null;
  }
}

function templateAssetUrl(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;
  const hosted = hostedImageUrl(logoPath);
  if (hosted) return hosted;
  if (DATA_IMAGE_RE.test(logoPath)) return null;
  return absoluteServerUrl(`/api/assets/${encodeURIComponent(logoPath)}`);
}

function hostedImageUrl(value: unknown): string | null {
  const url = firstNonEmpty(value);
  if (!url || DATA_IMAGE_RE.test(url)) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

async function resolveSenderName(userId: string | number | null | undefined): Promise<string> {
  const settings = getSettings();
  if (!userId) return firstNonEmpty(settings.emailFromName, "ReminderOCR") ?? "ReminderOCR";

  const [userSettings, engineerProfile, user] = await Promise.all([
    col("user_settings").findOne({ user_id: String(userId) }) as Promise<any>,
    col("engineer_profiles").findOne({ user_id: String(userId) }) as Promise<any>,
    col("users").findOne({ _id: tryObjectId(userId) } as any) as Promise<any>,
  ]);

  return firstNonEmpty(
    userSettings?.email_from_name,
    engineerProfile?.company_name,
    user?.company_name,
    settings.emailFromName,
    "ReminderOCR",
  ) ?? "ReminderOCR";
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
  vars.license_number ??= firstNonEmpty(eq.license_number, eq.lisence_number);
  vars.lisence_number ??= firstNonEmpty(eq.lisence_number, eq.license_number);
  vars.checked_equipment ??= firstNonEmpty(
    eq.checked_equipment,
    eq.description,
    eq.name,
    [
      EQUIPMENT_CATEGORY_LABELS[eq.category] ?? eq.category,
      eq.manufacturer,
      eq.model,
      eq.serial_number ? `מס׳ ${eq.serial_number}` : null,
      firstNonEmpty(eq.license_number, eq.lisence_number) ? `רישוי ${firstNonEmpty(eq.license_number, eq.lisence_number)}` : null,
    ].filter(Boolean).join(" ")
  );
}

function applyFieldMap(vars: EmailVars, fields: unknown): void {
  const data = parseFieldMap(fields);
  for (const [key, value] of Object.entries(data)) {
    if (vars[key] == null && (typeof value === "string" || typeof value === "number")) {
      vars[key] = value;
    }
  }
}

function parseFieldMap(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function applyContractVars(vars: EmailVars, contract: any): void {
  if (!contract) return;
  applyFieldMap(vars, contract.manual_fields);
  vars.contract_number = contract.contract_number ?? vars.contract_number;
  vars.contract_type = contract.contract_type ?? vars.contract_type;
  vars.start_date = contract.start_date ?? vars.start_date;
  vars.expiry_date = contract.expiry_date ?? vars.expiry_date;
  vars.amount ??= contract.amount;
  vars.currency ??= contract.currency;
  vars.client_company ??= contract.counterparty;
  vars.equipment_description ??= contract.equipment_description ?? contract.summary;
  vars.checked_equipment ??= firstNonEmpty(
    contract.checked_equipment,
    contract.equipment_description,
    contract.summary,
  );
  const manualFields = parseFieldMap(contract.manual_fields);
  const equipment = Array.isArray(manualFields._equipment) ? manualFields._equipment[0] : null;
  if (equipment) applyEquipmentVars(vars, equipment);
}

async function resolveContractForReminder(reminder: ReminderWithContext): Promise<any | null> {
  const r = reminder as any;
  const userFilter = r.user_id ? { user_id: String(r.user_id) } : {};
  const sourceId = r.source_id == null ? "" : String(r.source_id);
  if (sourceId && sourceId !== "NaN") {
    const direct = await col("contracts").findOne({
      ...userFilter,
      $or: [
        { _id: tryObjectId(sourceId) },
        { id: sourceId },
      ],
    } as any) as any;
    if (direct) return direct;
  }
  if (reminder.document_id) {
    const byDocument = await col("contracts").findOne(
      {...userFilter, document_id: reminder.document_id} as any,
      { sort: { _id: -1 } }
    ) as any;
    if (byDocument) return byDocument;
  }
  if (reminder.client_id) {
    return col("contracts").findOne(
      {...userFilter, client_id: reminder.client_id} as any,
      { sort: { _id: -1 } }
    ) as Promise<any>;
  }
  return null;
}

async function buildEmailVars(reminder: ReminderWithContext): Promise<EmailVars> {
  const userId = String((reminder as any).user_id ?? "");
  const [senderName, engineerProfile, user, linkedContract] = await Promise.all([
    resolveSenderName(userId),
    userId ? col("engineer_profiles").findOne({ user_id: userId }) as Promise<any> : Promise.resolve(null),
    userId ? col("users").findOne({ _id: tryObjectId(userId) } as any) as Promise<any> : Promise.resolve(null),
    resolveContractForReminder(reminder),
  ]);
  const vars: EmailVars = {
    title: reminder.title,
    trigger_date: reminder.trigger_date,
    advance_days: reminder.advance_days,
    body: reminder.body ?? null,
    client_name: reminder.client_name,
    document_name: reminder.document_name,
    contract_number: (reminder as any).contract_number ?? null,
    contract_type: (reminder as any).contract_type ?? null,
    from_name: senderName,
    engineer_name: firstNonEmpty(engineerProfile?.full_name, user?.name, senderName) ?? senderName,
    inspector_number: firstNonEmpty(engineerProfile?.inspector_number) ?? null,
    engineer_phone: firstNonEmpty(engineerProfile?.company_phone, user?.phone) ?? null,
    engineer_company: firstNonEmpty(engineerProfile?.company_name, user?.company_name) ?? null,
    engineer_subtitle: firstNonEmpty(engineerProfile?.company_subtitle) ?? null,
    company_exp: firstNonEmpty(engineerProfile?.company_subtitle) ?? null,
    comp_logo: hostedImageUrl(firstNonEmpty(engineerProfile?.company_logo_url, user?.picture_url)),
  };

  // Equipment fields stored directly on the reminder take precedence over the
  // client/document fallbacks below (which use ??=), so the user's edits in the
  // reminder modal are what actually get sent.
  const r = reminder as any;
  if (r.equipment_type) vars.equipment_type = EQUIPMENT_CATEGORY_LABELS[r.equipment_type] ?? r.equipment_type;
  if (r.manufacturer) vars.manufacturer = r.manufacturer;
  if (r.model) vars.model = r.model;
  if (r.serial_number) vars.serial_number = r.serial_number;
  if (r.license_number || r.lisence_number) {
    vars.license_number = firstNonEmpty(r.license_number, r.lisence_number);
    vars.lisence_number = firstNonEmpty(r.lisence_number, r.license_number);
  }

  applyContractVars(vars, linkedContract);

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
      if (ct) applyContractVars(vars, ct);

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
      if (d.spaces_key) {
        try {
          const { getSpacesSignedUrl } = await import("../storage/spaces.js");
          vars.document_url = await getSpacesSignedUrl(d.spaces_key, 7 * 24 * 3600, d.file_name ?? undefined);
        } catch { /* non-critical — omit var if storage not configured */ }
      }
      applyFieldMap(vars, d.extracted_fields);

      const ct = await col("contracts").findOne(
        { document_id: reminder.document_id },
        { sort: { _id: -1 } }
      ) as any;
      if (ct) applyContractVars(vars, ct);

      const eq = await col("equipment").findOne(
        { document_id: reminder.document_id },
        { sort: { _id: -1 } }
      ) as any;
      if (eq) applyEquipmentVars(vars, eq);
    }
  }

  return vars;
}

function stripEmailHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRenderedBusinessData(html: string, vars: EmailVars): boolean {
  const visible = stripEmailHtml(html);
  return [
    vars.client_company,
    vars.contract_number,
    vars.expiry_date,
    vars.checked_equipment,
    vars.equipment_description,
    vars.contact_person,
  ].some((value) => {
    const text = value == null ? "" : String(value).trim();
    return text.length >= 2 && visible.includes(text);
  });
}

function needsInspectionTemplateFallback(tpl: any, renderedHtml: string, vars: EmailVars): boolean {
  const templateHtml = String(tpl?.html ?? "");
  const usesPoster = /\{\{\s*poster_url\s*\}\}/.test(templateHtml);
  if (usesPoster && !vars.poster_url) return true;
  if (DATA_IMAGE_RE.test(renderedHtml)) return true;
  if (Buffer.byteLength(renderedHtml, "utf8") > GMAIL_SAFE_HTML_BYTES) return true;
  const visible = stripEmailHtml(renderedHtml);
  return visible.length < 80 && !hasRenderedBusinessData(renderedHtml, vars);
}

function renderFallbackInspectionEmail(vars: EmailVars, reminder: ReminderWithContext) {
  const html = loadReminderTemplate("inspection");
  const subject =
    "[תזכורת בדיקה] {{client_company|הלקוח}} — {{advance_days}} ימים לבדיקה";
  return {
    subject: renderTemplate(subject, vars, { escape: false }) || `תזכורת בדיקה תקופתית ${reminder.title}`,
    html: ensureRtl(renderTemplate(html, vars, { escape: false })),
  };
}

async function resolveReminderTemplate(reminder: ReminderWithContext) {
  let tpl = null as Awaited<ReturnType<typeof loadEmailTemplate>>;

  if (reminder.email_template_id) {
    tpl = await loadEmailTemplate(reminder.email_template_id);
  }

  if (!tpl) {
    // Check user's personal default template before falling back to global default
    const userId = String((reminder as any).user_id ?? "");
    if (userId) {
      const userSettings = await col("user_settings").findOne({ user_id: userId }) as any;
      if (userSettings?.default_email_template_id) {
        tpl = await loadEmailTemplate(userSettings.default_email_template_id);
      }
    }
  }

  if (!tpl) {
    let docTemplateId: string | null = null;
    if (reminder.document_id) {
      const row = await col("documents").findOne({ _id: tryObjectId(reminder.document_id) } as any) as any;
      docTemplateId = row?.template_id ?? null;
    }
    tpl = await pickEmailTemplate(docTemplateId);
  }

  return tpl;
}

async function renderReminderEmail(reminder: ReminderWithContext): Promise<{ subject: string; html: string }> {
  const tpl = await resolveReminderTemplate(reminder);

  const vars = await buildEmailVars(reminder);
  vars.logo_url = templateAssetUrl(tpl?.logo_path);
  // Poster is already a hosted public URL — pass through as-is.
  vars.poster_url = (tpl as any)?.poster_url ?? null;
  // Fall back to the template's example document when the reminder has no
  // real document attached, so the download link still renders.
  if (vars.document_url == null && (tpl as any)?.example_document_url) {
    vars.document_url = (tpl as any).example_document_url;
  }

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
      subject: ` תזכורת בדיקה תקופתית ${reminder.title}`,
      html: `<div dir="rtl"><h2>${reminder.title}</h2><p>${reminder.body ?? ""}</p></div>`,
    };
  }

  const renderedHtml = renderTemplate(tpl.html, vars, { escape: false });
  if (needsInspectionTemplateFallback(tpl, renderedHtml, vars)) {
    logger.warn("reminder_email_template_fallback", {
      reminder_id: reminder.id,
      template_id: (tpl as any)?.id ?? null,
      template_name: tpl?.name ?? null,
      has_poster_url: !!vars.poster_url,
      html_bytes: Buffer.byteLength(renderedHtml, "utf8"),
      has_data_image: DATA_IMAGE_RE.test(renderedHtml),
      visible_text_length: stripEmailHtml(renderedHtml).length,
      has_business_data: hasRenderedBusinessData(renderedHtml, vars),
    });
    return renderFallbackInspectionEmail(vars, reminder);
  }

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
  recipients: string[],
  opts: { skipCc?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
  const settings = getSettings();

  if (!settings.smtpHost && !useResend()) {
    return { success: false, error: "SMTP not configured" };
  }

  try {
    const { subject, html } = await renderReminderEmail(reminder);
    const userId = String((reminder as any).user_id ?? "");
    const senderName = await resolveSenderName(userId);
    const from = formatAddress(senderName, settings.emailFrom);

    // CC the sending user so they get a copy of every reminder they send out.
    // Set SKIP_CC=true to disable (e.g. for test scripts).
    const ccEmail: string[] = [];
    if (userId && !opts.skipCc && process.env.SKIP_CC !== "true") {
      const u = await col("users").findOne({ _id: tryObjectId(userId) } as any) as any;
      const userEmail = u?.email ?? null;
      if (userEmail && !recipients.includes(userEmail)) ccEmail.push(userEmail);
    }

    const text = `תזכורת: ${reminder.title}\nלקוח: ${reminder.client_name ?? ""}\nתאריך: ${reminder.trigger_date}`;
    logger.info("reminder_email_sending", {
      reminder_id: reminder.id,
      user_id: userId || null,
      from,
      to: recipients,
      cc: ccEmail,
      subject,
      via: useResend() ? "resend" : "smtp",
    });
    if (useResend()) {
      await sendViaResend({ from, to: recipients, cc: ccEmail, subject, html, text });
    } else {
      await buildTransport().sendMail({ from, to: recipients.join(", "), cc: ccEmail.join(", ") || undefined, subject, html, text });
    }
    logger.info("reminder_email_sent", {
      reminder_id: reminder.id,
      user_id: (reminder as any).user_id ?? null,
      recipient_count: recipients.length,
      recipients,
      from,
      via: useResend() ? "resend" : "smtp",
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

export async function sendReminderEmailTo(
  to: string,
  reminder: ReminderWithContext,
  opts: { skipCc?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
  return sendReminderEmail(reminder, [to], opts);
}

function renderGroupedFallbackHtml(vars: EmailVars, itemsHtml: string): string {
  return ensureRtl(renderTemplate(loadReminderTemplate("grouped"), {
    ...vars,
    items_table: itemsHtml,
  }, { escape: false }));
}

async function renderGroupedReminderEmail(opts: {
  reminders: ReminderWithContext[];
  clientName: string;
  triggerDate: string;
  itemsHtml: string;
}): Promise<{ subject: string; html: string }> {
  const first = opts.reminders[0];
  const subject = `[תזכורת בדיקה] ${opts.clientName} — ${opts.reminders.length} פריטים`;
  const vars = first ? await buildEmailVars(first) : {};
  vars.client_company = opts.clientName || vars.client_company;
  vars.trigger_date = opts.triggerDate;
  vars.item_count = opts.reminders.length;
  vars.items_table = opts.itemsHtml;
  // Hide the single-item equipment box so grouped mail is not duplicated.
  vars.equipment_type = "";
  vars.manufacturer = "";
  vars.model = "";
  vars.serial_number = "";

  let tpl = null as Awaited<ReturnType<typeof loadEmailTemplate>>;
  try {
    if (first) tpl = await resolveReminderTemplate(first);
  } catch (err) {
    logger.warn("grouped_reminder_template_load_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!tpl) {
    vars.from_name = vars.from_name ?? "ReminderOCR";
    return { subject, html: renderGroupedFallbackHtml(vars, opts.itemsHtml) };
  }

  vars.logo_url = templateAssetUrl(tpl?.logo_path);
  vars.poster_url = (tpl as any)?.poster_url ?? null;
  if (vars.document_url == null && (tpl as any)?.example_document_url) {
    vars.document_url = (tpl as any).example_document_url;
  }

  try {
    const source = prepareGroupedTemplateHtml(tpl.html, opts.itemsHtml);
    const renderedHtml = renderTemplate(source, vars, { escape: false });
    return { subject, html: ensureRtl(renderedHtml) };
  } catch (err) {
    logger.warn("grouped_reminder_template_render_failed", {
      template_id: (tpl as any)?.id ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
    return { subject, html: renderGroupedFallbackHtml(vars, opts.itemsHtml) };
  }
}

export async function sendGroupedReminderEmail(opts: {
  reminders: ReminderWithContext[];
  recipients: string[];
  clientName: string;
  triggerDate: string;
  itemsHtml: string;
}): Promise<{ success: boolean; error?: string; subject: string }> {
  const settings = getSettings();
  const subject = `[תזכורת בדיקה] ${opts.clientName} — ${opts.reminders.length} פריטים`;
  if (!settings.smtpHost && !useResend()) {
    return { success: false, error: "SMTP not configured", subject };
  }
  if (!opts.recipients.length) {
    return { success: false, error: "No recipients configured", subject };
  }
  try {
    const userId = String((opts.reminders[0] as any)?.user_id ?? "");
    const senderName = await resolveSenderName(userId);
    const from = formatAddress(senderName, settings.emailFrom);
    const rendered = await renderGroupedReminderEmail(opts);
    const html = rendered.html;
    const text = `תזכורת בדיקה עבור ${opts.clientName}: ${opts.reminders.length} פריטים למועד ${opts.triggerDate}`;
    const ccEmail: string[] = [];
    if (userId && process.env.SKIP_CC !== "true") {
      const u = await col("users").findOne({ _id: tryObjectId(userId) } as any) as any;
      const userEmail = u?.email ?? null;
      if (userEmail && !opts.recipients.includes(userEmail)) ccEmail.push(userEmail);
    }
    if (useResend()) {
      await sendViaResend({ from, to: opts.recipients, cc: ccEmail, subject: rendered.subject, html, text });
    } else {
      await buildTransport().sendMail({ from, to: opts.recipients.join(", "), cc: ccEmail.join(", ") || undefined, subject: rendered.subject, html, text });
    }
    logger.info("grouped_reminder_email_sent", {
      reminder_ids: opts.reminders.map((row) => row.id),
      recipient_count: opts.recipients.length,
      item_count: opts.reminders.length,
    });
    return { success: true, subject: rendered.subject };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn("grouped_reminder_email_failed", { error, item_count: opts.reminders.length });
    return { success: false, error, subject };
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
  if (!settings.smtpHost && !useResend()) return { success: false, error: "SMTP not configured" };
  if (!recipients.length) return { success: false, error: "No recipients configured" };
  try {
    const from = formatFrom(settings);
    const attachmentList = attachments.length ? attachments : undefined;
    if (useResend()) {
      await sendViaResend({ from, to: recipients, subject, html: html ?? `<pre>${text}</pre>`, text, attachments: attachmentList });
    } else {
      await buildTransport().sendMail({ from, to: recipients.join(", "), subject, text, html, attachments: attachmentList });
    }
    logger.info("email_with_attachments_sent", {
      recipient_count: recipients.length,
      attachment_count: attachments.length,
      via: useResend() ? "resend" : "smtp",
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

export async function sendTestEmail(to: string, emailTemplateId: string | number | null = null, userId?: string): Promise<{ success: boolean; error?: string }> {
  const settings = getSettings();
  if (!settings.smtpHost && !useResend()) return { success: false, error: "SMTP not configured (host is empty)" };
  if (!to) return { success: false, error: "Recipient address is empty" };

  try {
    const transport = useResend() ? null : buildTransport();
    if (transport) await transport.verify();

    // Load real engineer profile vars when userId provided
    let engineerProfile: any = null;
    let user: any = null;
    if (userId) {
      [engineerProfile, user] = await Promise.all([
        col("engineer_profiles").findOne({ user_id: userId }),
        col("users").findOne({ _id: tryObjectId(userId) } as any),
      ]);
    }

    const sampleVars: EmailVars = {
      title: "בדיקה לדוגמה",
      trigger_date: new Date().toISOString().split("T")[0],
      advance_days: 30,
      body: " זהו דוא״ל בדיקה באמצעות תבנית שנבחרה.",
      client_name: " לקוח לדוגמה",
      document_name: " מסמך לדוגמה",
      from_name: firstNonEmpty((engineerProfile as any)?.company_name, user?.company_name, settings.emailFromName, "ReminderOCR") ?? "ReminderOCR",
      client_company: " חברה לדוגמה",
      contact_email: to,
      contact_phone: "050-1234567 ",
      document_type: " בדיקה",
      document_number: "001 ",
      contact_person: " איש קשר לדוגמה",
      expiry_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      engineer_name: firstNonEmpty((engineerProfile as any)?.full_name, user?.name) ?? null,
      inspector_number: firstNonEmpty((engineerProfile as any)?.inspector_number) ?? null,
      license_number: "233017",
      engineer_phone: firstNonEmpty((engineerProfile as any)?.company_phone, user?.phone) ?? null,
      engineer_company: firstNonEmpty((engineerProfile as any)?.company_name, user?.company_name) ?? null,
      engineer_subtitle: firstNonEmpty((engineerProfile as any)?.company_subtitle) ?? null,
      company_exp: firstNonEmpty((engineerProfile as any)?.company_subtitle) ?? null,
      comp_logo: hostedImageUrl((engineerProfile as any)?.company_logo_url),
    };

    const tpl = emailTemplateId
      ? await loadEmailTemplate(emailTemplateId)
      : await pickEmailTemplate(null);

    // Poster + example document come from the template itself so the preview /
    // test render exactly what a real send would show.
    sampleVars.poster_url = (tpl as any)?.poster_url ?? null;
    sampleVars.document_url = (tpl as any)?.example_document_url ?? null;

    let subject = "[Client Reminder] בדיקת חיבור אימייל";
    let html: string;

    if (tpl) {
      subject = renderTemplate(tpl.subject, sampleVars, { escape: false }) || subject;
      html = ensureRtl(renderTemplate(tpl.html, sampleVars, { escape: false }));
    } else {
      html = ensureRtl(renderTemplate(FALLBACK_TEST_HTML, sampleVars, { escape: false }));
    }

    const from = formatFrom(settings);
    if (useResend()) {
      await sendViaResend({ from, to: [to], subject, html });
    } else {
      await transport!.sendMail({ from, to, subject, html });
    }
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
