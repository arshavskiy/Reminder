# Reminder Email Process Flow

## Overview
Reminders are triggered by the scheduler, rendered with template variables, and sent via Resend email service.

---

## 1. Scheduler Trigger

**File**: `server/src/reminders/scheduler.ts`

- Runs periodically (configurable interval, default 5 minutes)
- Queries `reminders` collection for pending/snoozed items
- Filters by `status: "pending"` and advance days threshold
- Calls `sendReminderEmailTo()` for each eligible reminder

---

## 2. Build Email Variables

**File**: `server/src/reminders/emailSender.ts` → `buildEmailVars()`

Fetches data from multiple sources:

### User Profile (engineer_profiles)
- `engineer_name` — full name
- `engineer_company` — company name (bold in brand bar)
- `company_exp` — company subtitle/description
- `comp_logo` — logo URL (S3 public bucket)
- `engineer_phone` — contact phone
- `license_number` — license ID
- `inspector_id_start` — next inspection number
- `membership_start_date` — membership date

### Reminder Data (reminders)
- `title` — document/contract name
- `advance_days` — days until expiry (30, 60, etc.)
- `trigger_date` — when reminder was created
- `client_name` — client company
- `contact_person` — contact name
- `contact_phone` — contact phone
- `equipment_type` — equipment being inspected (optional)
- `expiry_date` — document expiry date
- `document_number` — contract/document ID

### Fallbacks
- `from_name|ReminderOCR` — sender name fallback to "ReminderOCR"

---

## 3. Select Email Template

**File**: `server/src/reminders/emailSender.ts`

Priority order:
1. User's personal default (`user_settings.default_email_template_id`)
2. Reminder's assigned template (`reminders.email_template_id`)
3. System default (`is_default: 1` in email_templates)

### Available Templates (Atlas: `reminder-app.email_templates`)

| ID | Name | Type | Usage |
|---|---|---|---|
| `6a73a1d0c57da3e065b7b2d1` | תזכורת בדיקה — פצ׳רסקי | Dynamic | User-specific with client data |
| `6a746437c57da3e065b88b7a` | תזכורת בדיקה — פצ׳רסקי (סטטי) | Static | 30-day fixed inspection |
| `6a11a1ec0c05f49738b08bfc` | ברירת מחדל | Default | Fallback template |

---

## 4. Render Template

**File**: `server/src/templates/renderEmail.ts` → `renderTemplate()`

Uses custom Mustache-style engine:

### Syntax
- `{{var}}` — simple variable
- `{{var|fallback}}` — value or fallback literal
- `{{#if var}}...{{/if}}` — conditional block (no {{else}} support)

### Example
```html
{{#if engineer_company}}
<div style="font-weight: 700;">{{engineer_company}}</div>
{{/if}}
{{#if equipment_type}}
<div>🔧 {{equipment_type}}</div>
{{/if}}
```

---

## 5. Send Email

**File**: `server/src/reminders/emailSender.ts` → `sendReminderEmailTo()`

### Resend API Call
```js
{
  from: "noreply@reminder.app",
  to: recipient_email,
  subject: rendered_subject,
  html: rendered_html,
  reply_to: engineer_phone (if present)
}
```

### Log Entry (email_log collection)
```js
{
  user_id: userId,
  reminder_id: reminderId,
  recipient: email,
  log_type: "reminder",
  success: true/false,
  error: error_message (if failed),
  sent_at: Date.now()
}
```

---

## 6. Test Email Flow

**File**: `server/src/routes/templates.ts` → `POST /api/email-templates/:id/send-test`

Two paths:

### Path A: With reminder_id (realistic data)
1. Query `reminders` collection
2. Load associated client & document
3. Call `sendReminderEmailTo()` with real reminder context
4. Uses actual engineer profile data

### Path B: No reminder_id (sample data)
1. Call `sendTestEmail(to, template_id, userId)`
2. Loads engineer profile for userId
3. Uses hardcoded sample reminder vars
4. Logs as `log_type: "test"`

---

## 7. Company Brand Bar (New Feature)

### Location
Top of both Pechersky templates (before main header)

### Structure
```html
<table>
  <tr>
    {{#if comp_logo}}
    <td width="80" align="center">
      <img src="{{comp_logo}}" width="72" />
    </td>
    {{/if}}
    <td valign="middle">
      <div style="font-weight: 700;">{{engineer_company}}</div>
      {{#if company_exp}}<div>{{company_exp}}</div>{{/if}}
    </td>
  </tr>
</table>
```

### Logo Storage
- **Source**: User uploads in ProfilePage → `POST /api/profile/company-logo`
- **Storage**: S3 public bucket `public-files-8278jm7in96i`
- **Path**: `images/<userId>/logo_<timestamp>.<ext>`
- **URL**: `https://s3-public-presigner-production-0215.up.railway.app/images/<userId>/logo_<timestamp>.<ext>`
- **DB**: Stored in `engineer_profiles.company_logo_url`

---

## 8. Email Client Compatibility

### RTL (Right-to-Left)
- HTML: `<html lang="he" dir="rtl">`
- Email clients interpret first `<td>` as rightmost, last `<td>` as leftmost
- Icon tables: no `direction:` or `text-align` (let RTL flow naturally)

### Icon Centering
```html
<table width="26" height="26" style="margin:0 auto;">
  <tr>
    <td align="center" valign="middle" style="font-size:26px;">
      📞
    </td>
  </tr>
</table>
```
- Margin auto + align="center" ensures center in RTL
- No inline `direction:` or `text-align`

### Logo Images
- **GMail blocks**: base64 `data:` URIs
- **Solution**: Hosted HTTPS URL (S3 public bucket)
- **Resend preview**: Shows base64 correctly (it's a browser)
- **Actual Gmail**: Fetches HTTPS URL only

---

## 9. Database Collections

### reminders
```js
{
  _id: ObjectId,
  user_id: ObjectId,
  client_id: ObjectId,
  document_id: ObjectId,
  email_template_id: ObjectId,
  status: "pending" | "snoozed" | "sent",
  advance_days: 30,
  trigger_date: Date,
  created_at: Date,
  updated_at: Date
}
```

### engineer_profiles
```js
{
  user_id: ObjectId,
  engineer_name: string,
  engineer_company: string,
  company_subtitle: string,
  company_logo_url: string (HTTPS),
  company_phone: string,
  company_registration: string,
  license_number: string,
  inspector_id_start: number,
  membership_start_date: string (YYYY-MM-DD)
}
```

### email_log
```js
{
  user_id: ObjectId,
  reminder_id: ObjectId,
  recipient: string,
  log_type: "reminder" | "test" | "escalation",
  success: boolean,
  error: string,
  sent_at: Date
}
```

### email_templates
```js
{
  _id: ObjectId,
  name: string,
  html: string (Mustache template),
  subject: string,
  is_default: 0 | 1,
  updated_at: Date
}
```

---

## 10. Error Handling

### Failures logged to email_log
- Invalid email address
- Resend API error
- Template rendering error
- Missing required variables

### Retries
- Scheduled reminder: retries on next scheduler tick (5 min default)
- Test email: returns error immediately
- Failed escalations: manual retry via `/api/admin/reminders/:id/retry-escalation`

---

## 11. Configuration

**File**: `server/src/settings.ts`

```js
const settings = {
  reminderCheckIntervalMs: 5 * 60 * 1000,  // 5 minutes
  escalationEmail: "admin@reminder.app",
  escalationThresholdDays: 7,
  smtpHost, Port, From: ...
};
```

---

## Process Diagram

```
┌─────────────────────┐
│  Scheduler Tick     │
│  (every 5 min)      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Query Pending       │
│ Reminders           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Load Engineer       │
│ Profile + Client    │
│ + Document Data     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Build Template      │
│ Variables           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Select Template     │
│ (personal > user > default)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Render HTML + Subj  │
│ (Mustache engine)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Send via Resend     │
│ Email Service       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Log Success/Failure │
│ (email_log)         │
└─────────────────────┘
```
