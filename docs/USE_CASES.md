# Use Cases — Reminder Emailer Generator

What the system is for: a Hebrew/RTL document & contract management tool that ingests
documents (PDF / DOCX / images / XLSX), extracts structured fields via OCR + AI,
tracks expiry/due dates, and **automatically emails branded Hebrew reminders** before
those dates — with escalation and a full audit log.

This document lists the supported use cases and, for each, whether it is wired
end-to-end, needs configuration, or is manual-only. Status reflects the code, not
just the data model.

---

## 1. Expiry-driven reminders (the core)

- **Inspection report (תסקיר) renewal reminders** — the next-inspection date is
  extracted from the document and reminders are generated automatically.
  `generateContractReminders()` is called from contract creation, document
  processing, and bulk import.
- **Contract expiry reminders** — notify before a contract reaches its `expiry_date`.
- **Certificate / license / insurance expiry** — any document whose template defines
  an expiry date field drives a reminder. Reminder labels adapt to the type
  ("בדיקה הבאה" / "חידוש ביטוח" / "חידוש תעודה" / "תשלום" / "פקיעת תוקף").
- **Multi-stage advance warnings** — a reminder is created per entry in
  `reminderAdvanceDays`. **Default is now `[30, 14, 3]`** (30/14/3 days before),
  overridable via the `REMINDER_ADVANCE_DAYS` env var or settings.

**Status: ✅ wired end-to-end** (requires SMTP configured to actually send).

## 2. Per-equipment inspection scheduling

- Reminders for the next test/inspection date of a specific lifting machine,
  accessory, scaffold, or elevator. On import, a mapped `next_inspection_date`
  creates a stub contract and generates the reminders (`routes/equipment.ts`).

**Status: ✅ wired end-to-end.**

## 3. Task due-date reminders

- A task with a `due_date` generates the same multi-stage advance-warning reminders
  as contracts (`generateTaskReminders()`), keyed on `source_type: "task"`.
- Fires from three paths: AI-extracted tasks during document import,
  `POST /api/tasks` (manual create), and `PUT /api/tasks/:id` (when a due date is
  set or changed). Generation is idempotent per `(taskId, advance_days)` and skips
  tasks that are `done`/`cancelled` or already past due.

**Status: ✅ wired end-to-end.**

## 4. Escalation & internal alerts

- **Overdue escalation** — a reminder still `pending` more than
  `escalationThresholdDays` (default 3) past its trigger date is escalated to an
  internal manager address. Sent once per reminder, logged as `log_type: "escalation"`.

**Status: ⚠️ implemented but dormant until `escalationEmail` is set**
(env `ESCALATION_EMAIL` or settings). No-ops while empty.

## 5. Template-driven, branded emails

- **Per-document-type templates** — a different email body per document type, with a
  default fallback (`pickEmailTemplate`).
- **Variable substitution** — `{{title}}`, client/company, contact, expiry/trigger
  dates, contract fields, and any extracted field are merged into the template.
- **Logo / branding** — uploaded logo embedded inline as a base64 data-URL.
- **Hebrew/RTL** — every outgoing email is forced to `dir="rtl"`.

**Status: ✅ wired end-to-end.**

## 6. Manual & lifecycle reminders

- **Manual one-off reminders** — `POST /api/reminders` (`source_type: "manual"`).
- **Snooze / dismiss / send-now** — all three endpoints exist on `/api/reminders/:id`.

**Status: ✅ wired end-to-end.**

## 7. Bulk onboarding & auto-intake

- **XLSX import** — clients/contracts parsed from a spreadsheet feed the importer,
  which generates the reminder schedule for the imported set.
- **Watch-folder / document auto-intake** — drop a document in → OCR → AI extract →
  reminders created with no manual entry.

**Status: ✅ wired end-to-end.**

## 8. Testing & operations

- **Test email** — `POST /api/email/test` verifies SMTP and renders a sample using a
  chosen template, with Hebrew-language SMTP error explanations.
- **Email audit log** — every send / skip / escalation recorded in `email_log`
  (recipient, subject, success, error, smtp host).
- **Retry handling** — a failing send is retried up to 3× before the reminder is
  marked `error`.
- **Client timeline** — a sent reminder writes an `email_sent` event to the client
  timeline.

**Status: ✅ wired end-to-end.**

---

## Configuration checklist

| Capability | Required setting | Default |
|---|---|---|
| Any email sending | `smtpHost` (+ port/user/pass) | empty → sending no-ops |
| Sender identity | `emailFrom`, `emailFromName` | name `ReminderOCR` |
| Multi-stage warnings | `reminderAdvanceDays` / `REMINDER_ADVANCE_DAYS` | `[30, 14, 3]` |
| Scheduler | `reminderEnabled`, `reminderCheckIntervalMs` | on, every 10 min |
| Overdue escalation | `escalationEmail` / `ESCALATION_EMAIL` | empty → off |
| Escalation timing | `escalationThresholdDays` | 3 |
