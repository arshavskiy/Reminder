// Seed the default email template on first boot.
// Users can edit / clone / disable. Bound to no doc_template = used as fallback.

import { col } from "../db/db";
import { loadReminderTemplate } from "../email-templates/loader";
import type { EmailTemplate } from "../../src/shared/types.js";

const DEFAULT_HTML    = loadReminderTemplate("default");
const INSPECTION_HTML = loadReminderTemplate("inspection");
const CONTRACT_HTML   = loadReminderTemplate("contract");
const INVOICE_HTML    = loadReminderTemplate("invoice");
const MONTHLY_REPORT_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f5f7fa;color:#2c3e50;font-family:Arial,sans-serif;direction:rtl;text-align:right">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e4e8ed;border-radius:10px;padding:28px">
    <h1 style="margin:0 0 12px;color:#18a058;font-size:22px">דוח חודשי</h1>
    <p style="margin:0 0 20px;line-height:1.6">שלום {{client_company|לקוח}}, מצורף דוח החוזים והתסקירים עבור {{report_month}}.</p>
    <table style="width:100%;border-collapse:collapse;background:#fafbfc">
      <tr><td style="padding:10px;border-bottom:1px solid #e4e8ed;color:#5a6c7d">לקוח</td><td style="padding:10px;border-bottom:1px solid #e4e8ed;font-weight:600">{{client_company}}</td></tr>
      <tr><td style="padding:10px;color:#5a6c7d">מספר רשומות</td><td style="padding:10px;font-weight:600">{{report_count}}</td></tr>
    </table>
    <p style="margin:20px 0 0;line-height:1.6">קובצי הדוח מצורפים להודעה זו.</p>
    <p style="margin:24px 0 0;padding-top:14px;border-top:1px solid #e4e8ed;color:#95a5a6;font-size:12px">{{from_name|RemindOCR}}</p>
  </div>
</body>
</html>`;

interface TemplateSeed {
  name: string;
  subject: string;
  html: string;
  is_default: number;
  doc_template_name: string | null; // matched by name to find doc_template_id
}

const SEEDS: TemplateSeed[] = [
  {
    name: "דוח חודשי ללקוח",
    subject: "דוח חודשי - {{client_company}} - {{report_month}}",
    html: MONTHLY_REPORT_HTML,
    is_default: 0,
    doc_template_name: null,
  },  {
    name: "ברירת מחדל",
    subject: "[תזכורת] {{title}}",
    html: DEFAULT_HTML,
    is_default: 1,
    doc_template_name: null,
  },
  {
    name: "תסקיר בדיקה תקופתית",
    subject: "[תזכורת בדיקה] {{client_company}} — {{advance_days}} ימים לבדיקה",
    html: INSPECTION_HTML,
    is_default: 0,
    doc_template_name: "תסקיר בדיקה",
  },
  {
    name: "פקיעת חוזה שירות",
    subject: "[פקיעת חוזה] {{client_company}} — {{advance_days}} ימים לפקיעה",
    html: CONTRACT_HTML,
    is_default: 0,
    doc_template_name: "חוזה שירות",
  },
  {
    name: "תזכורת תשלום חשבונית",
    subject: "[תשלום] {{client_company}} — חשבונית {{document_number}}",
    html: INVOICE_HTML,
    is_default: 0,
    doc_template_name: "חשבונית",
  },
];

export async function seedDefaultEmailTemplate(): Promise<void> {
  for (const seed of SEEDS) {
    let doc_template_id: string | null = null;
    if (seed.doc_template_name) {
      const dt = await col("doc_templates").findOne({ name: seed.doc_template_name }) as any;
      if (dt) doc_template_id = dt._id?.toString() ?? null;
    }

    const now = new Date();
    await col("email_templates").updateOne(
      { name: seed.name },
      {
        // Always refresh html + subject from disk so stale DB rows get fixed on boot
        $set: {
          html: seed.html,
          subject: seed.subject,
          updated_at: now,
        },
        $setOnInsert: {
          name: seed.name,
          is_default: seed.is_default,
          doc_template_id,
          reminder_category: null,
          logo_path: null,
          created_at: now,
        },
      },
      { upsert: true }
    );
  }
}

export async function loadEmailTemplate(id: string | number): Promise<EmailTemplate | null> {
  const { ObjectId } = await import("mongodb");
  let filter: Record<string, any>;
  try {
    filter = { _id: new ObjectId(String(id)) };
  } catch {
    filter = { _id: id };
  }
  const row = await col("email_templates").findOne(filter) as any;
  if (!row) return null;
  const { _id, ...rest } = row;
  return { id: _id?.toString(), ...rest } as any;
}

export async function pickEmailTemplate(docTemplateId: string | number | null): Promise<EmailTemplate | null> {
  if (docTemplateId) {
    const bound = await col("email_templates").findOne(
      { doc_template_id: String(docTemplateId) },
      { sort: { is_default: -1, _id: 1 } }
    ) as any;
    if (bound) {
      const { _id, ...rest } = bound;
      return { id: _id?.toString(), ...rest } as any;
    }
  }

  // The seeds write is_default as 0/1, but rows edited through the template UI
  // store it as a boolean, and { is_default: 1 } does not match true in Mongo.
  // Matching both stops the lookup silently falling through to "first row by
  // _id", which picked an arbitrary template rather than the marked default.
  const def = await col("email_templates").findOne(
    { is_default: { $in: [1, true] } },
    { sort: { _id: 1 } }
  ) as any;
  if (def) {
    const { _id, ...rest } = def;
    return { id: _id?.toString(), ...rest } as any;
  }

  const any = await col("email_templates").findOne({}, { sort: { _id: 1 } }) as any;
  if (!any) return null;
  const { _id, ...rest } = any;
  return { id: _id?.toString(), ...rest } as any;
}

export async function pickEmailTemplateForCategory(category: string | null): Promise<EmailTemplate | null> {
  if (category) {
    const bound = await col("email_templates").findOne(
      { reminder_category: category },
      { sort: { is_default: -1, _id: 1 } }
    ) as any;
    if (bound) {
      const { _id, ...rest } = bound;
      return { id: _id?.toString(), ...rest } as any;
    }
  }
  return pickEmailTemplate(null);
}

export async function loadEmailTemplateByName(name: string): Promise<EmailTemplate | null> {
  const row = await col("email_templates").findOne({name}) as any;
  if (!row) return null;
  const {_id, ...rest} = row;
  return {id: _id?.toString(), ...rest} as any;
}