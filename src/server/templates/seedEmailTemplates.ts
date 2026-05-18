// Seed the default email template on first boot.
// Users can edit / clone / disable. Bound to no doc_template = used as fallback.

import type { Database } from "bun:sqlite";
import type { EmailTemplate } from "../../shared/types.js";

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; direction: rtl; background: #f5f7fa; padding: 24px; color: #2c3e50; margin: 0; }
    .card { background: #ffffff; border-radius: 12px; padding: 32px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
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
      {{#if client_company}}<div class="field"><span class="label">לקוח / חברה</span><span class="value">{{client_company}}</span></div>{{/if}}
      {{#if contact_person}}<div class="field"><span class="label">איש קשר</span><span class="value">{{contact_person}}</span></div>{{/if}}
      {{#if contact_phone}}<div class="field"><span class="label">טלפון</span><span class="value">{{contact_phone}}</span></div>{{/if}}
      {{#if document_number}}<div class="field"><span class="label">מספר מסמך</span><span class="value">{{document_number}}</span></div>{{/if}}
      {{#if expiry_date}}<div class="field"><span class="label">תאריך יעד</span><span class="value">{{expiry_date}}</span></div>{{/if}}
      {{#if trigger_date}}<div class="field"><span class="label">תאריך התזכורת</span><span class="value">{{trigger_date}}</span></div>{{/if}}
    </div>

    {{#if body}}<p>{{body}}</p>{{/if}}

    <div class="footer">
      {{from_name|תזכורת לקוח}} — תזכורת אוטומטית, אין צורך להשיב
    </div>
  </div>
</body>
</html>`;

export function seedDefaultEmailTemplate(db: Database) {
  db.prepare(
    `INSERT OR IGNORE INTO email_templates (name, subject, html, is_default)
     VALUES (?, ?, ?, 1)`
  ).run("ברירת מחדל", "[תזכורת] {{title}}", DEFAULT_HTML);
}

export function loadEmailTemplate(db: Database, id: number): EmailTemplate | null {
  const row = db.prepare("SELECT * FROM email_templates WHERE id = ?").get(id) as EmailTemplate | null;
  return row;
}

export function pickEmailTemplate(db: Database, docTemplateId: number | null): EmailTemplate | null {
  // 1. specific email-template bound to this doc-template
  if (docTemplateId) {
    const bound = db.prepare(
      "SELECT * FROM email_templates WHERE doc_template_id = ? ORDER BY is_default DESC, id ASC LIMIT 1"
    ).get(docTemplateId) as EmailTemplate | null;
    if (bound) return bound;
  }
  // 2. any default template
  const def = db.prepare(
    "SELECT * FROM email_templates WHERE is_default = 1 ORDER BY id ASC LIMIT 1"
  ).get() as EmailTemplate | null;
  if (def) return def;
  // 3. any template
  return db.prepare("SELECT * FROM email_templates ORDER BY id ASC LIMIT 1").get() as EmailTemplate | null;
}
