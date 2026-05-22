// Seed the default email template on first boot.
// Users can edit / clone / disable. Bound to no doc_template = used as fallback.

import { col } from "../db/db";
import type { EmailTemplate } from "../../src/shared/types.js";

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; direction: rtl; background: #f5f7fa; padding: 24px; color: #2c3e50; margin: 0; }
    .card { background: #ffffff; border-radius: 12px; padding: 32px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 16px rgba(0,0,0,0.06); text-align: right;}
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
      {{#if client_company}}<div class="field"><span class="label">לקוח / חברה</span><span class="value"> {{client_company}} </span></div>{{/if}}
      {{#if contact_person}}<div class="field"><span class="label">איש קשר</span><span class="value"> {{contact_person}} </span></div>{{/if}}
      {{#if contact_phone}}<div class="field"><span class="label">טלפון</span><span class="value"> {{contact_phone}} </span></div>{{/if}}
      {{#if document_number}}<div class="field"><span class="label">מספר מסמך</span><span class="value"> {{document_number}} </span></div>{{/if}}
      {{#if expiry_date}}<div class="field"><span class="label">תאריך יעד</span><span class="value"> {{expiry_date}} </span></div>{{/if}}
      {{#if trigger_date}}<div class="field"><span class="label">תאריך התזכורת</span><span class="value"> {{trigger_date}} </span></div>{{/if}}
    </div>

    {{#if body}}<p>{{body}}</p>{{/if}}

    <div class="footer">
      {{from_name|תזכורת לקוח}} — תזכורת אוטומטית, אין צורך להשיב
    </div>
  </div>
</body>
</html>`;

export async function seedDefaultEmailTemplate(): Promise<void> {
  await col("email_templates").updateOne(
    { name: "ברירת מחדל" },
    {
      $setOnInsert: {
        name: "ברירת מחדל",
        subject: "[תזכורת] {{title}}",
        html: DEFAULT_HTML,
        is_default: 1,
        doc_template_id: null,
        logo_path: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    },
    { upsert: true }
  );
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

  const def = await col("email_templates").findOne(
    { is_default: 1 },
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
