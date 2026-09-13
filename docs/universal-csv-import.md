# RemindOCR table import

Open the dashboard's **ייבוא Excel / CSV** button. Choose or drop a file, review the preview and validation messages, then confirm the import. CSV, XLSX and XLS are parsed directly, without AI, OCR, or document extraction.

Each row becomes a standalone reminder item — category, dates, optional client — with no PDF upload and no contract created. This is a separate flow from the document/contract pipeline; imported rows never touch the `documents` or `contracts` collections.

Download the same 20-item dataset in any of these formats:

- `/templates/remindocr-import-20-en.csv`: English headers.
- `/templates/remindocr-import-20-he.csv`: Hebrew headers.
- `/templates/remindocr-import-20.xlsx`: Hebrew headers and native Excel dates.

Source files live in `client/src/public/templates/` because Vite's root is `client/src`. Putting files in `client/public` does not serve these downloads and can return the HTML app shell instead.

All three files contain the same 20 expiry IDs, five fictional clients and 20 reminders, with English and Hebrew item names. Importing another version skips reminders already imported. These examples contain placeholder document references and example.com recipients. Replace them before real use.

The older `/templates/remindocr-universal-import-example.csv` remains available with eight items and 22 reminders to demonstrate multiple reminder offsets. Screenshots informed the labels and categories; no personal data was copied from them.

## File rules

- One row represents one reminder item, its optional client and its reminder schedule.
- Keep the header row. `Expiry Name` and `Expiry Date` are required. Other fields are optional in the interchange format. Include `Client External ID` and `Client Name` when creating a linked client.
- Text dates use `YYYY-MM-DD`. XLSX/XLS numeric dates are supported in the 1900 and 1904 date systems. Start Date and Audit Date must not follow Expiry Date (Start Date only). Formulas are rejected; paste values instead.
- Save as UTF-8 CSV. Quote values containing commas, quotes or line breaks; double embedded quotes. The example includes quoted descriptions and Hebrew text.
- Use semicolons inside `Tags`, `Reminder Advance Days` and `Reminder Recipients`. Days are nonnegative integers from 0 to 3650, with up to ten offsets per row. Duplicates collapse. Zero means the expiry date itself; a blank schedule defaults to zero.
- Recipients also accept a JSON array string (`["a@x.com", "b@x.com"]`), matching the `notification_email` column some external tools export. Semicolon-separated lists still work.
- Limits: 5 MB, 500 data rows total and 100 columns. All populated worksheets are imported; each must begin with a header row. Unknown columns are reported and ignored.
- Recipients default to Client Email if Reminder Recipients is empty. No email address is required to create the reminder. Sending follows the existing account scheduler and recipient-resolution behavior.
- Treat IDs and phone numbers as text. Empty cells mean missing values, not the string `null`.
- Document contains a filename/reference only. Attachments must be uploaded and resolved separately.
- All contacts are fictional. Replace sample addresses and review recipients before enabling delivery.

## Field mapping

The parser recognizes English and Hebrew aliases, including `שם תזכורת`, `תאריך תפוגה`, `קטגוריה`, `שם לקוח`, `אימייל לקוח`, and `ימי התראה`. See the Hebrew CSV for all supported example headers.

| CSV fields | Destination / handling |
| --- | --- |
| Expiry Name | Reminder `title` and reminder item `name`. |
| Expiry Date, Start Date | Reminder item `expiry_date`, `start_date`. |
| Type/category | Reminder item `category` and reminder `reminder_category`. Free text — see Categories below. |
| Description / Notes | Reminder item `description` and reminder `body`. |
| Owner | Saved in `import_metadata`; does not assign an app user or change tenant ownership. |
| Document, Document Number | Document is saved as reference metadata only; no upload or fetch. Document Number maps to `reference_number` and reminder context. |
| URL | Reminder item `url`. Stored as-is, not validated as a live link. |
| Audit Date | Reminder item `audit_date`. Same date parsing as Expiry/Start Date. |
| Compliance ID | Alias for External ID (the tenant-scoped import key). |
| Folder, Priority, Location | Preserve as import metadata until supported destinations exist. Priority examples: `low`, `medium`, `high`. |
| Tags | Preserve as reminder item metadata. Client `tags` is a separate scope; do not silently apply item tags to the client. |
| External ID | Tenant-scoped item import key. If absent, derives a key from name, expiry date and client identity. Changed values under an already imported ID are rejected. |
| Client External ID | Tenant-scoped client import key, falling back to email then name. Repeated keys reuse clients created by this importer. Conflicting client details within a file are rejected; existing client records are not overwritten or merged by name. |
| Client Name, Client Type | Client `display_name`, `entity_type` (`company` or `person`). |
| Contact Person, Client Email, Client Phone | Client `contact_person`, `email`, `phone`. |
| Client Address, Client City | Client `address`, `city`. |
| Reminder Advance Days | Expand into one reminder per offset; map each to `advance_days`. Calculate `trigger_date = Expiry Date - offset` using calendar days. |
| Reminder Recipients / Notification Email | Split into email addresses (semicolon list or JSON array) and serialize to reminder `email_to` using the app's JSON-array representation. |
| Reminder Status | Only pending reminders may be imported. Existing reminders retain their current status when skipped. |
| Contract Status | Accepted for compatibility with legacy files; this flow does not create contracts, so the value is not otherwise used. |

## Categories and email templates

Category is free text — whatever the file contains becomes the reminder's category, no fixed list is enforced. The Email Templates page lets a template bind to a specific category (alongside the existing document-type binding), suggesting previously used categories in a combobox while still accepting new ones.

At import time, each row's template is chosen per-row (not once for the whole file), in this order:

1. A template bound to that row's category, if one exists.
2. The user's personal default template (`user_settings.default_email_template_id`).
3. The global default template.

Rows with no category, or a category with no bound template, fall through to steps 2–3. This selection happens once, at import — it is not re-evaluated later, so binding or unbinding a template after import does not change already-created reminders.

## Reminders page — category view

The Reminders page (`/reminders`) shows **Name** and **Category** columns for every reminder, including table-import rows. When at least one table-import category exists, a category sidebar appears above the table (hidden entirely otherwise); selecting a category filters the table to just that category, composing with the existing status/date filters rather than replacing them. Category counts and the filtered list are served by `GET /api/reminders/categories` and the `category` query param on `GET /api/reminders`.

## Calendar behavior and acceptance example

The existing calendar sync creates an all-day event on each reminder's `trigger_date`, with an exclusive end date of the following day. It does not create a separate event on the expiry date unless a zero-day reminder exists. Calendar connection and plan eligibility remain prerequisites.

The dashboard calendar only shows table-import (and other non-inspection) reminders when the "הצג רק בדיקות מתוכננות" (show only scheduled tests) toggle is off — that toggle restricts the calendar/dashboard to equipment inspection expiries only. Completing an import turns the toggle off for the current session; it reverts to the saved preference on reload.

For `EXP-001`, expiry `2027-01-15` and offsets `30;7;0` produce reminder/calendar dates `2026-12-16`, `2027-01-08` and `2027-01-15`. The full example requests 22 reminders across 8 expiry items and 5 clients, before quotas, validation and delivery settings are applied.

The preview reports invalid rows, ignored columns and past trigger dates. Past dates are retained and may become due immediately after confirmation. Confirmation reparses the uploaded file and checks reminder quotas before saving. Writes are resumable rather than transactional: retry the same unchanged file after an interrupted import. Deterministic tenant-scoped IDs prevent duplicate clients, reminder items and reminders on retries. Existing imported data is not updated by this create-only flow.

API endpoints: authenticated multipart `POST /api/reminders/table-import/preview` and `/confirm`, with a `file` field. They inherit the reminder/calendar feature gate. Preview does not write records. The dashboard refreshes reminders and switches to their calendar view after confirmation.

Relevant app code: `server/src/imports/reminderTable.ts`, `server/src/imports/reminderItem.ts`, `server/src/routes/reminderTableImport.ts`, `server/src/routes/reminders.ts` (list + categories endpoints), `server/src/templates/seedEmailTemplates.ts` (`pickEmailTemplateForCategory`), `client/src/components/ReminderTableImport.vue`, `client/src/views/RemindersPage.vue`, `client/src/views/EmailTemplatesPage.vue`, `server/src/reminders/scheduler.ts`, `server/src/calendar/sync.ts`.
