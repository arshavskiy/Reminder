# Change Log

## 2026-10-01

### Reminder Discovery

- Added Russian support for Gmail obligation search and scan (kind/cue patterns, months, language option); missed deadlines (90 days) shown in their own group.
- Redesigned the discovery page (stat cards, missed/urgent/upcoming groups, due chips) and added an opt-in weekly auto-scan with notification and push for new finds.
- Added Moovit/Pango receipt parsing.

### Dashboard and UI

- Added feature-gated module cards, invoice/receipt chips, a due-soon invoices panel, and clickable stat cards.
- Added הוצאות sidebar sub-pages; hid category/client columns in the reminders table; capped the calendar width.
- Added user web push (enable/disable in the bell; push on reminder email sent).

### Intake

- Added a subscribable ICS calendar feed (business plan).
- Added camera capture in the upload modal and PWA share-to-app.
- Added email-in: forward documents to a personal `in+<token>@in.remindocr.com` address, imported through the existing pipeline.

### Saved Table Views

- Invoices now opens on the last 3 months by default.
- Tables remember filters, date range, sort, page size and view per user on Invoices, Documents, Reminders, Clients, Equipment, Activity log, Gmail inbox and Expense analytics.

### Plans and Announcements

- Made email-in a Business-plan feature (`emailIn` tier flag, server and client mirror); other plans see a Business-plan hint on the Profile card.
- Added a dashboard What's new card (dismissal stored in `user_settings.whats_new_seen`) and `profile` / `discovery` walkthrough tours.
- Added email-in, calendar feed and camera/share to the plan feature lists and landing pages (reminder discovery is not advertised until it is enabled by default).

### API Documentation and Tests

- Documented every API route in `docs/openapi.yaml` (was 36 of about 300) with a coverage test that fails on any undocumented route; added `scripts/openapiGenerate.ts` and refreshed servers, tags and intro.
- Added route tests for email-in, the ICS feed, user push, weekly-scan settings, due-soon invoices and the Resend webhook.
- Fixed six stale tests (pricing amounts, redesigned default reminder email, overdue inspection dates are kept as overdue) and raised the Vitest timeout to 30s so the pipeline-heavy suites stop timing out.

### Bug Fixes

- Fixed Resend webhook verification passing `secret` instead of `webhookSecret` (every webhook failed with "Secret can't be empty").
- Email-in releases its claim on unexpected failure so a replay is not ignored as a duplicate.

## 2026-09-04

### Inspection Reports

- Added `inspection_type` classification: AI extraction now tags which of the 11 inspection presets a תסקיר document is, written to the `documents` collection and backfilled for existing documents via deterministic phrase-matching (`backfillInspectionType.ts`). Distinct from `document_type` (document category).
- Added a documents-page filter and per-row badge for `inspection_type`; removed the older, unrelated `document_type` filter dropdown.
- Added per-inspection-type engineer license numbers (`inspector_numbers_by_type`) alongside the existing single `inspector_number` default, with UI in the engineer profile form. Resolution is per-type override else the default, applied consistently to allocated report numbers and PDF signature blocks.
- Restructured Parts 1/2 of the pressure-equipment print templates (air_receiver, steam_receiver, steam_boiler, pressure_vessel) from a grid + equipment table to a 2-column label:value layout matching the real inspector-issued forms.
- Fixed report-number extraction (`extractCurrentReportNumber`) capturing a bare `:` when a document's report-number label and value render on separate lines.
- Fixed `HydraulicCheckModal.vue`'s print-template list being cached in memory for the life of the session with no refetch on reopen, so DB-side template changes silently didn't appear until a hard page reload.

### Bug Fixes

- Fixed an N+1 query fan-out in the reminders list route causing production `MongoWaitQueueTimeoutError` under load; audited and fixed the same pattern elsewhere (contracts, tasks, dashboard, monthly reports, equipment).
- Fixed `ContractCard.vue` missing `withDefaults()`, which silently disabled reminder action buttons (eye/edit/delete) across every page using the component.

## 2026-08-09

### Document Processing

- Added a shared upload/rescan processing session so the modal can be closed and reopened with the last batch state.
- Added per-document processing rows for uploads and rescans, including errors, duplicates, reminder assigned/missing state, and remaining count.
- Added document status filters and counters on the documents page: all, completed, processing, error, and no reminder.
- Added admin-only rescan-all flow with a custom confirmation modal and background polling.

### AI Extraction

- Added OpenAI 429/rate-limit retry handling with retry-after parsing, exponential fallback, and retry logging.
- Staggered bulk rescan AI starts to reduce token-per-minute spikes during many-document rescans.
- Documented the latest extraction rebuild flow: OCR/AI updates `documents.extracted_fields`, then client/contract/equipment/reminder data should rebuild from those fields.

### Hebrew PDF Cleanup

- Documented company-name cleanup rules for bidi-damaged `בע"מ` values and `פרטי הלקוח/תופש:` prefixes.
- Documented single-email behavior using `client_email`.
- Documented equipment field rules so `תיאור`, `ציוד שנבדק`, `מספר רישוי`, and `דגם` do not overwrite each other incorrectly.
- Documented client dedupe fallback by normalized phone number to avoid duplicate companies from slightly different parsed names.

### Reminders and Calendar

- Documented next-check interval logic based on the month difference between `start_date` and `expiry_date`.
- Documented calendar visible-month report/filter actions and monthly summary counters.

## 2026-08-03

### Document Extraction

- Fixed `equipment_description` extraction so the Hebrew label/value split is handled correctly: `תיאור` is the field name and `מכונת הרמה` is the equipment description value.
- Added Hebrew display support for `checked_equipment` as `ציוד שנבדק`.
- Added `license_number` extraction from `מספר רישוי`, including short numeric values such as 4-6 digits.
- Removed fallback behavior that confused `מספר רישוי` with `מיקוד`.
- Added contact email extraction from document headers.
- Improved `client_company` handling so company names can include numbers without moving the number to the wrong side of the name.
- Improved `contact_person` extraction from `איש קשר`.
- Removed address fields from extraction/client-facing payloads where they are not needed.

### Clients

- Updated client table to use the UI framework table components.
- Added RTL-friendly table alignment and spacing for Hebrew client data.
- Added `contact_person` to the clients table.
- Changed row click behavior to open the client page directly instead of opening a modal.
- Updated the client details page with the correct data object fields.
- Added document check date and next inspection date to the client page.
- Fixed display-name spacing for Hebrew names with numbers, preserving names such as `מולטיפק פלסטיק 1990`.

### Calendar

- Added a user setting feature flag for showing only upcoming scheduled tests.
- Updated calendar event titles to show company name and contact name.
- Updated the event popup title to match the calendar event title.
- Removed noisy technical document fields from the popup.
- Added contact name, phone number, and email to the popup when available.

### Reports

- Added a year selector to the reports page.
- Added field selection for all report fields.
- Preselected the tracking report fields:
  - `תאריך`
  - `מה נבדק`
  - `תופש/איש קשר`
  - `טלפון`
  - `רלוונטי`
  - `מספר רישוי`
  - `הערות`
- Changed internal monthly reports to aggregate by `expiry_date`, so selecting month `08` includes only contracts whose next check date is in August.
- Replaced PDF output with DOCX and XLSX report files.
- Added RTL report formatting:
  - Centered report title.
  - Right-aligned table cell text.
  - RTL-aware column order for Hebrew reports.
- Added monthly internal report flow:
  - Sent on the 1st of each month.
  - Sent to the user email or configured report recipients.
  - Uses the tracking format `מעקב בדיקות לחודש 01.MM`.
- Added client future-test report flow:
  - Sends owner/internal email with client report attachments.
  - Sends client email with document links and file names.
- Added npm scripts for sending reports:
  - `npm run report:send-all`
  - `npm run report:send-client`
  - `npm run report:send-both`
  - `npm run report:send-client-future-owner`
  - `npm run report:send-client-future`
  - `npm run report:send-client-links`
  - `npm run report:send-client-future-links`

### Email Flows

- Sent the internal monthly report email to `arshavsky.pasha@gmail.com` for the selected month.
- Sent owner-facing client future reports with attached generated files.
- Added client-facing emails that include document links with file names instead of attaching generated reports.
