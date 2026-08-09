# Workflow Notes — 2026-08-09

This note captures the main logic and flow changes from today's work. It is meant as a practical reference for future fixes around extraction, document processing, clients, contracts, reminders, reports, and calendar behavior.

---

## Upload and Rescan Processing Flow

The upload modal and rescan modal now share the same processing session state.

### UI flow

1. User uploads documents or starts a rescan.
2. The client starts a `rescanModal` Pinia session with:
   - `kind: "upload"` for uploads.
   - `kind: "rescan"` for rescans.
   - queued document IDs.
   - duplicate IDs, when returned by upload.
3. The same `UploadModal` switches to the processing tab.
4. The documents page polls the queued IDs.
5. The modal can be closed and reopened from the documents page with the last known batch state.

### Why this exists

Large uploads and rescans can run in the background. If the modal closes, the user must still be able to reopen it and see:

- Which files are still processing.
- Which files failed.
- Which uploaded files were duplicates.
- Which rescanned documents created reminders.
- Which rescanned documents still have no reminder.

### Key files

- `client/src/stores/rescanModal.ts`
- `client/src/views/DocumentsPage.vue`
- `client/src/components/UploadModal.vue`

---

## AI 429 Rate Limit Handling

OpenAI can return a 429 when many documents are uploaded or rescanned together and the organization hits the token-per-minute limit.

### Server behavior

AI extraction now wraps OpenAI calls with retry logic:

1. Run the extraction request.
2. If the error is not a rate-limit error, fail normally.
3. If it is a 429/rate-limit error:
   - Read `retry-after-ms` or `retry-after` from response headers when available.
   - Otherwise parse messages like `Please try again in 731ms`.
   - Otherwise use exponential backoff.
4. Retry up to 5 attempts.
5. Log each retry as `ai_extraction_rate_limited_retry`.

### Batch rescan behavior

Full rescans now stagger document starts by `1200ms` per document. This reduces the chance of sending many AI extraction requests in the same token window.

### User-facing behavior

The processing modal now keeps the batch visible and shows per-document errors, so a 429 failure does not disappear when the modal closes.

### Key files

- `server/src/pipeline/extractor.ts`
- `server/src/routes/documents.ts`
- `client/src/stores/rescanModal.ts`
- `client/src/components/UploadModal.vue`

---

## Document Status Filters

The documents page now has status counters and status filters.

Supported filters:

- All documents.
- Completed.
- Processing.
- Error.
- No reminder.

The filter is client-side over the loaded documents list and is combined with the existing search, client, and date filters.

### Key file

- `client/src/views/DocumentsPage.vue`

---

## Rescan All

Admin users can run a full rescan.

### Flow

1. Admin clicks the rescan-all action.
2. The UI opens an app modal confirmation, not the browser native confirm dialog.
3. The server verifies the user is an admin.
4. Matching documents are reset to queued/processing state.
5. `processDocument(...)` is called for each document with staggered starts.
6. The shared processing modal tracks the batch.

### Difference between normal rescan and full rescan

Normal rescan is for missing/failed reminder cases. Full rescan is an admin-only rebuild tool for migration-style fixes, for example when the month-diff reminder logic changes and all existing documents need to be reprocessed.

---

## Extraction Cleanup Rules Added/Tightened

Several extraction cleanup rules were added or tightened for Hebrew inspection PDFs.

### Company names

- Do not keep the label prefix `פרטי הלקוח/תופש:` in the company name.
- Normalize `בע\"מ` / `בע"מ` artifacts so a stray slash/backslash does not create names like `מ"ע"מ`.
- Avoid leading `מ` artifacts caused by broken `בע"מ` ordering.
- Prefer matching an existing client by normalized phone number before creating a new company/client.

### Email

- Use one UI email field: `client_email`.
- Detect reversed or label-glued email values, including cases where the raw text contains values such as `Dafar@d-afar.com :מייל`.
- Email is important for reminders because client reminder sending depends on an available recipient.

### Contract number

- If an inspector number appears before the report number, normalize document/contract display values from `484590/8860` to the actual report number where needed.

### Equipment and inspection fields

- `תיאור` should represent the document/equipment category, not table-section noise such as `ליקוים. 3`.
- `ציוד שנבדק` should hold the checked equipment, for example `קורת הרמה`.
- `מספר רישוי` should not be copied from `דגם`. If model is `1008`, license number must not become `1008` unless the source explicitly shows it as the license.
- `דגם` can still hold model values such as `1008`.

---

## Contract and Reminder Rebuild From Extracted Values

The intended flow is that extracted document fields are the source for contracts and reminders.

### AI extract / rescan

When the user runs `חלץ AI` or a document is rescanned:

1. The document raw text is parsed.
2. OCR regex extraction can save a baseline snapshot.
3. AI/template extraction overwrites the document `extracted_fields` with richer values.
4. Client, contract, equipment, and reminders are rebuilt from the latest extracted fields.

### Manual document field update

Manual edits on the document detail page save into `documents.extracted_fields` and update the related contract/reminder data so the UI does not continue showing stale contract values after a user fixes the extracted values.

### Why this matters

The document page may show correct extracted values while the contract card can show old values if the contract/reminder was not rebuilt. Today's rule is: after extraction or manual field save, the contract/reminder should use the latest document fields.

---

## Reminder Date Interval Logic

Reminder future-date jumps are based on the month difference between the document start date and next check/expiry date.

Examples:

- `start_date = 2025-02-17`
- `expiry_date = 2025-08-16`
- Difference is about 6 months.
- The next generated check date should jump another 6 months from the next check date.

If:

- `start_date = 2025-02-17`
- `expiry_date = 2026-08-16`
- Difference is 18 months.

Then future jumps should be 18 months, not a hardcoded 12 months.

The extracted/document field label for this is:

`הפרש בחודשים לבדיקה`

---

## Calendar Work

Calendar UI changes added today:

- Larger previous/next month buttons.
- Cleaner day modal/list UI.
- Contract/report IDs added into calendar item titles so repeated clients on the same date can be distinguished.
- Visible-month DOC report action.
- Visible-month filters for:
  - overdue
  - next 30 days
  - reminders
  - תסקירים only
- Monthly summary counters:
  - overdue
  - due this month
  - sent
  - no email
- Print-friendly calendar view.
- Send all visible reminders action with confirmation.

The visible-month DOC report should export only the currently visible calendar data: reminders plus expiry/test dates, grouped by date and client.

---

## Reports and User Settings

Monthly report generation uses the user's saved report configuration.

Important naming decision:

- `report_config.all_fields` represents the selected fields and their order.
- Monthly reports should use the same selected fields/order as configured by the user.

Admin user settings UI should allow editing the same user settings fields that users can configure themselves, including report/client fields and feature settings.

---

## Admin Panel Work

Admin panel additions/tightening:

- User settings moved out of the detail tab flow into a clearer action/settings UI.
- Role moved into the settings section.
- Missing-email documents list is tied to document IDs.
- Documents without reminders are visible for diagnosis.
- Scanned documents with no reminder can be reviewed from admin.

---

## Client Dedupe Rule

When creating or updating clients from extracted document data:

1. Normalize phone numbers.
2. If a client with that phone already exists, attach the document/contract/reminder to that client.
3. Do not create a new client/company just because the company name was parsed slightly differently.

This is the fallback that prevents dozens of near-duplicate companies when the same customer appears as:

- `מנופי סמי 2000 בע"מ`
- `מנופי סמי 2000 מ"ע"מ`
- `מנופי סמי`
- other bidi-damaged variants.

