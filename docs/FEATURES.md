# Features



Current feature inventory for ReminderOCR.  

Stack: Node.js 22 / Express · MongoDB · Vue 3 + Naive UI + Tailwind v4 · Railway + Vercel  

**Updated**: 2026-10-01



---



## Authentication



### Email / Password

- Register with email + password (bcrypt, 12 rounds)

- Login is **email + password** only (username is an admin identity field for magic-link users, not a login method)

- Email verification via tokenised link (`verify-email.html` template)

- Login creates a server-side session in MongoDB (`sessions` collection)

- Session cookie (`sid`) is `httpOnly`, `sameSite: lax`, `secure` in production

- `requireAuth()` validates the cookie on every protected route

- Automatic TTL expiry via MongoDB index on `expires_at`



### Password Reset

- "Forgot password" sends a reset link via `reset-password.html` template

- Token is single-use and time-limited



### Google OAuth 2.0

- Full redirect flow with PKCE state stored in `oauth_states` (10-min TTL)

- GIS one-tap credential sign-in (`POST /api/auth/google`)

- Creates or updates user record on every sign-in

- Optional email whitelist via `ALLOWED_EMAILS`



### Route Guards (client-side)

- All routes except `/login` and `/reset-password` require an authenticated session

- Background `fetchMe()` on app startup validates cached session against the server



---



## Role System



Three roles with numeric rank (`user=0`, `pro=1`, `admin=2`):



| Role | Extra access |

|------|-------------|

| `user` | Own data only |

| `pro` | Reserved; maps to basic plan when `plan` is missing |

| `admin` | Settings, User Management, impersonation, **Gmail inbox**, **Invoices** |



- Server-side: `requireRole` / `requireMinRole` throw `403` if rank is too low

- Client-side: router `meta.requireRole` redirects to `/403`; `primaryNav` filters by `minRole`



**Invoices** are admin-only (nav + routes + `/api/invoices`). Full matrix: **[ROLES_AND_PLANS.md](./ROLES_AND_PLANS.md)**.



---



## Tier Feature Flags



Subscription plans have explicit feature-flag settings so tier behavior is visible outside individual route code.



Source files:



- Client pricing display: `client/src/shared/pricingPlans.ts`

- Server enforcement: `server/src/plans/tierFeatures.ts`

- Snapshot on settings: `user_settings.plan_entitlements` (`server/src/plans/planEntitlements.ts`)



Current tier flags:



| Tier | Gmail invoice history | Google Drive | Google Calendar | Auto email reminders | Auto monthly reports | Excel export | Seats | Email accounts |

|------|------------------------|--------------|-----------------|----------------------|----------------------|--------------|-------|----------------|

| Free | Not included | Off | Off | Off | Off | Off | 1 | 1 |

| Basic | 12 months | On | Off | On | On | On | 2 | 2 |

| Business | 4 years | On | On | On | On | On | ∞ | ∞ |



New users always start on **free** until paid. Details: **[ROLES_AND_PLANS.md](./ROLES_AND_PLANS.md)**.



Gmail invoice imports enforce the history flag in both `/api/gmail/inbox` and `/api/gmail/import-all`. Free users receive `gmail_invoice_plan_required`; Basic users are capped at `newer_than:12m`; Business users are capped at `newer_than:48m`.



---



## Document Ingestion



### Supported formats

PDF, DOCX, XLSX, PNG, JPEG, TIFF (and plain `.txt`, `.md`)



### Processing pipeline

1. SHA-256 dedup — skip if user already has this file

2. Copy to `data/documents/<hash>.<ext>`; staging file in `uploads/` deleted immediately after copy

3. Upload to DigitalOcean Spaces / S3-compatible storage if configured (fallback: local disk)

4. Text extraction (each step logs format, char count, and first 200 chars):

   - PDF → `pdf-parse`; OCR fallback via Tesseract if text layer is empty

   - Image → Tesseract OCR

   - DOCX → Mammoth; if extracted text < 50 chars, falls back to Tesseract on embedded page images (supports scanned DOCX)

   - XLSX → SheetJS

5. Template matching — keyword-based selection of extraction schema

6. AI extraction — OpenAI `gpt-4o-mini` or local Ollama

7. Entity saving — client, contract, equipment, tasks, reminders



### Pipeline feature flags (per-user)

Each upload can toggle four stages independently. Flags are saved in `user_settings` and applied via `PipelineOptions`:



| Flag | Default | Controls |

|------|---------|----------|

| `pipeline_ocr` | `true` | Text extraction stage |

| `pipeline_ai` | `true` | AI extraction stage |

| `pipeline_s3` | `true` | S3/Spaces upload |

| `pipeline_entities` | `true` | Client/contract/reminder saving |



Flags are exposed as checkboxes in the Documents page upload area. Changes debounce-save to the server (600 ms).



### Upload results table

Redesigned document list with:

- `PageHeader` with total count and action buttons (upload, refresh, rescan single/all, delete-all, bulk-select/delete)

- `DocumentDropStrip` for drag-and-drop uploads

- AI quota bar showing scan usage (e.g. "5 / 50") with color-coded progress: green normal, yellow at 80%, red at 100%

- Pipeline settings popover with toggles for OCR, AI, S3, and entity creation

- Duplicate upload detection with hidden redundant status badges



### Upload Modal (`UploadModal.vue`)



The upload modal provides three pipeline toggles per upload:



| Toggle | Default | Effect |

|--------|---------|--------|

| חילוץ AI | on | Runs AI field extraction (Stage B) |

| צור לקוחות וחוזים | on | Saves client / contract / equipment entities; disabled automatically when AI is off |

| צור תזכורות | on | Generates reminders from expiry dates; disabled automatically when entities is off |



The OCR regex baseline (Stage A) always runs regardless of these toggles.



### On-demand AI extraction modal

When `pipeline_ai` is enabled, uploading files opens an extraction-fields modal instead of uploading immediately. The user defines which fields to extract:



| Column | Description |

|--------|-------------|

| Key | Machine-readable field name |

| תווית | Hebrew display label |

| סוג | Field type (`text`, `date`, `number`, `currency`, `boolean`) |



"+ הוסף שדה" adds a new row. "העלה ללא הגדרה" skips field definition and uploads without AI schema. "הרץ חילוץ" / "העלה ועבד" confirms.



The `↻` (reprocess) button on existing documents now opens the same modal in "existing doc" mode, so ad-hoc extraction can be re-run with a different schema without re-uploading.



### Reprocessing

Any document can be re-run through the extraction pipeline via `POST /api/documents/:id/extract`:

- Supply `fields[]` (ad-hoc schema) **or** `templateId` (saved template) **or** neither (generic extraction)

- Previous extraction data (extractions, tasks, contracts, reminders, timeline events) is wiped before re-running

- `scanned_count` is incremented only when extraction actually runs



---



## AI Extraction



### OCR regex baseline (`extractFromOcr`) — Stage A



Runs **always** on every upload (before AI, regardless of `skipAi`). Uses regex patterns to extract:



- `expiry_date` — matches Hebrew expiry labels (`בתוקף עד`, `תוקף עד`, `בדיקה הבאה`, etc.) in both forward and reversed bidi order

- `contact_name` — matched against `איש קשר`, `שם הלקוח`, `תופש`, etc.

- `contact_phone` — Israeli mobile/landline, normalised to `XXX-XXXXXXX`

- `contact_email` — auto-corrects reversed bidi email addresses

- `client_address` — from `כתובת`, `ישוב`, or `פרטים מלאים`

- `po_box` — from `ת.ד` / `P.O. Box`

- `document_type` — keyword classification (`תסקיר בדיקה`, `חוזה`, `הסכם`, `חשבונית`, `תעודה`)



Results are saved immediately. If AI (Stage B) runs later, it overwrites these fields with richer data.



### Generic extraction (`extractDocument`)

Prompt returns `ExtractionResult`:

- `client_name`, `client_company`, `client_id`, `client_email`, `client_phone`, `client_address`

- `document_type`, `document_number`, `contract_number`, `contract_type`

- `start_date`, `expiry_date`, `amount`, `currency`

- `parties[]`, `tasks[]`, `summary_hebrew`



### Template-based extraction (`extractWithTemplate`)

Template defines a field list and an `expiry_field`. Prompt is structured per template type (inspection report, contract, invoice, etc.).



### Ad-hoc extraction (no saved template)

`POST /api/documents/:id/extract` accepts an inline `fields[]` array (`key`, `label_he`, `type`). A transient `DocTemplate` is constructed server-side so the same `extractWithTemplate` path runs without saving anything to `doc_templates`.



### Quota (`ai_extracted` flag)



Each document is tagged at insert time with `ai_extracted: true/false` depending on whether AI extraction ran.



The `user` role is limited to `USER_DOCUMENT_LIMIT` (default: **25**) AI-extracted documents. The quota check:



- Only counts documents where `ai_extracted: true`

- Is **skipped entirely** when uploading with AI disabled (`skipAi=true`) — OCR-only uploads are unlimited

- `pro` and `admin` roles bypass the quota check completely



`document_limit_reached` (HTTP 403) is returned when `count(ai_extracted=true) + files.length > limit`.



### Backends

- **OpenAI** — `gpt-4o-mini` via `OPENAI_API_KEY`

- **Ollama** — any local model via `OLLAMA_URL` + `OLLAMA_MODEL`

- Switchable per-document or globally via Settings



### Inspection type classification (`inspection_type`)

Distinct from `document_type` (document category: contract, invoice, inspection report, etc.). `inspection_type` records *which of the 11 inspection presets* a תסקיר document is (`lifting_machine`, `lifting_accessory`, `elevator`, `escalator`, `tower_crane`, `work_platform`, `powered_scaffold`, `air_receiver`, `steam_receiver`, `steam_boiler`, `pressure_vessel`).

- AI extraction schema includes `"inspection_type": string | null`, classified against a dynamically-built enum listing (from `INSPECTION_PRINT_TEMPLATE_PRESETS`, not hardcoded, so new presets are picked up automatically)
- `validInspectionType()` rejects any AI-returned value that isn't a real preset key
- Written to the `documents` collection alongside `document_type`/`document_number` by `saveExtractionEntities()`
- Existing documents backfilled via `server/src/scripts/backfillInspectionType.ts` — deterministic Hebrew phrase-matching (not AI re-extraction), dry-run by default (`npm run inspection-type:backfill`, `:apply` to write)
- Documents page: filter dropdown "סינון לפי סוג תסקיר" and a type badge/subline on each row (tile grid and list view), built from server-side `inspectionTypeCounts` aggregate so options aren't limited to loaded rows



---



## Client Management



- Full CRUD with search (`display_name`, `email`)

- `entity_type`: `company` or `person`

- Fields: `id_number`, `email`, `phone`, `mobile`, `fax`, `address`, `city`, `po_box`, `client_zipcode`, `notes`, `tags`

- Per-client counts: documents, contracts, open reminders

- Timeline view — chronological event log (document added, email sent, etc.)

- Linked documents list



### Client deduplication (on import)

Five-tier fuzzy match (all scoped to the importing user), checked in priority order:

1. `id_number` exact match (government/company ID)

2. Phone number (normalised — strip spaces and dashes)

2b. Email match (case-insensitive)

3. Normalised name — strips `בע"מ`, `ltd`, `inc`, punctuation, collapses whitespace

4. Exact name fallback (case-insensitive)



Promotion: when both a phone-only match and a named-company match exist, the named-company match wins.



On match: existing record is enriched with any new fields; no duplicate is created.



---



## Contract / Inspection Tracking



- Fields: `contract_number`, `contract_type`, `start_date`, `expiry_date`, `amount`, `currency`, `counterparty`, `summary`

- Status: `active` / `expired` / `cancelled` / `renewed` / `draft`

- Filter by `kind=contract` (has contract number, not an inspection) or `kind=inspection` (type matches `תסקיר|בדיקה`)

- Expiring-soon endpoint: contracts expiring within N days

- Linked to client and source document



### Server-side status counts

`GET /api/contracts` returns a `counts` object alongside results with `all`, `active`, `expired`, `cancelled`, and `draft` tallies computed via MongoDB `$group` aggregation in parallel with the main query.



### Row issues and highlights

`rowIssues.ts` detects problems per row:

- Duplicate report numbers across contracts

- Missing expiry dates on active contracts

- Active contracts with no reminders

- Documents with processing errors



Issues render as color-coded tags: `tag--bad` (red) for errors, `tag--warn` (yellow) for warnings.



---



## Reminders



### Auto-generation

When a contract with `expiry_date` is saved (via import or manually), `generateContractReminders` creates one reminder per advance day in the schedule (default: 90, 60, 30 days before).



Dedup: existing non-dismissed reminder for the same `(source_id, advance_days)` is not duplicated.



### Statuses

`pending` → `sent` / `snoozed` / `dismissed` / `no_email` / `error`

- `no_email` — due, but no business recipient could be resolved (no email sent, including no CC)



### Manual actions

- Dismiss, snooze to a specific date, send-now

- Create manual reminders not tied to a contract



### Bulk table import (CSV/XLS/XLSX)

Standalone reminders — category, dates, optional client — with no PDF upload and no contract created. Separate flow from the document/contract pipeline; see `docs/universal-csv-import.md` for the full field mapping.

- Each row's email template is picked per-row by matching its category against a template bound to that category (Email Templates page), falling back to the user's default template, then the global default.

- Reminders page shows a category sidebar (only when at least one table-import category exists) that filters the Name/Category-augmented reminders table.

- Dashboard calendar hides these reminders while "הצג רק בדיקות מתוכננות" (show only scheduled tests) is on — that toggle restricts the view to equipment inspections only.



### Email delivery

- Resend API (primary) or Nodemailer SMTP fallback

- HTML email with `{{variable}}` template substitution

- **To:** business email only — from the reminder, else contract / inspection PDF fields, else client record

- **CC:** app user email (copy); disable with `SKIP_CC=true` or `skipCc` on test sends

- No recipients → skip / mark error (no fallback To the account email)

- Multiple recipients allowed if stored on the reminder (`email_to` JSON array)

- Bounce handling for Resend delivery errors



### Same-day email grouping

Reminders to the same client on the same trigger date are grouped into a single email. Grouped items produce an HTML `{{items_table}}` with all reminder details. Key: `clientId + triggerDate + email`.



### Items table injection

If the email template contains `{{items_table}}` or `{{{items_table}}}`, the grouped items table is placed there directly. Otherwise, `injectItemsTable` searches for landmark elements (`.cta-box`, `.warning-box`, `.renewal-box`, `.footer`, or `</body>`) and inserts before the first match found.



### Scheduler

- Runs only when `APP_ENV=production` (skipped in local/dev)

- Tick interval from `REMINDER_CHECK_INTERVAL_MS` (default **1 hour**)

- Each tick: `checkReminders` → `checkMonthlyReports` → `checkEscalations` → calendar sync; writes `scheduler_health`

- Idempotent: skips reminders that already have a successful `email_log` row

- Plan gate: automatic reminder send requires `automaticEmailReminders`

- Failure retry: logs each attempt; marks `error` after repeated failures

### Reminder email templates

Resolution order when sending:

1. `reminder.email_template_id` (set on create from the user's default when omitted)

2. `user_settings.default_email_template_id`

3. Email template bound to the document's `doc_template_id`, else global `is_default`

Template HTML is filled via `buildEmailVars` (client, contract, equipment, engineer profile, document fields).



### Google Calendar Sync



Users can connect Google Calendar from Profile settings and mirror pending/snoozed reminders into a dedicated secondary Google calendar.



- OAuth uses the narrow `calendar.app.created` scope, so ReminderOCR manages only calendars/events it created.

- The dedicated calendar is named `תסקירים`; existing old labels are renamed during sync.

- Reminder events are all-day events. Titles use `תסקיר לא בתוקף - <company name>`.

- Event details include the reminder snapshot: client/company, contact person, email, phone, contract number/type, equipment details, and the original reminder text.

- Older reminders missing snapshot fields are repaired from linked client/contract/document data during sync and saved back to `reminders`.

- Manual sync endpoint: `POST /api/calendar/sync`; status endpoint: `GET /api/calendar/status`.

- Google date moves are pulled back to the reminder when the remote event is newer than the last app push; deleted Google events dismiss the reminder.



### Reminder Escalation



If a reminder stays `pending` for more than N days past its `trigger_date`, an escalation email is sent to a supervisor address.



**Configuration** (global settings, admin-only):



| Setting | Default | Description |

|---------|---------|-------------|

| `escalationEmail` | `""` | Supervisor address; escalation is disabled when empty |

| `escalationThresholdDays` | `3` | Days past `trigger_date` before escalation fires |



**Mechanism:**

- `checkEscalations()` runs on every scheduler tick alongside `checkReminders()`

- Finds all `pending` reminders whose `trigger_date ≤ today − threshold`

- Checks `email_log` for existing entries with `log_type: "escalation"` for that `reminder_id` — no duplicate escalations are sent

- On success, inserts an `email_log` row with `log_type: "escalation"`; does **not** change the reminder's `status` (the original reminder remains `pending` for normal processing)

- Env override: `ESCALATION_EMAIL` sets the address without going through settings UI



---



## Equipment Catalog



- Fields: `name`, `category`, `manufacturer`, `model`, `serial_number`, `capacity`, `description`, `notes`, `is_active`

- Multi-value fields (string arrays): `load_capacity_work`, `load_capacity_test`, `load_radius` — support multiple values per equipment record, split on "/" during import

- Serial number is a sparse unique index — dedup on import

- Linked to source document and client

- Filter by category, text search, or client

- Category stats chip bar in the UI

- Backfill endpoint: patches missing `client_id`/`document_id` from existing extractions



### Equipment Service History Timeline



Per-equipment chronological log of all past inspections, accessible via the "היסטוריה" tab in the equipment drawer.



**Endpoint:** `GET /api/equipment/:id/history`



- Collects all document IDs linked to the equipment — via `document_id` on the record and via any sibling records sharing the same `serial_number`

- Fetches all `contracts` whose `document_id` is in that set, sorted by `start_date` descending

- Each history event is enriched from the linked document's `extracted_fields`:

  - `inspector` — from `inspector` or `contact_person` field

  - `load_capacity_test` — test load value

  - `test_pressure` — hydraulic test pressure

  - `pass_fail` — inspection result

- `days_until` is computed server-side from `expiry_date` relative to today; negative = already expired

- UI: vertical timeline with color-coded dots (`active` green / `expired` red / `renewed` blue / `cancelled` grey), expiry countdown badge, and a direct link to the source document



### Bulk XLSX Equipment Import



Batch-create equipment records from a spreadsheet without manual data entry.



**Endpoints:**

- `POST /api/equipment/import-xlsx/preview` — parse uploaded file, return `{ headers, total, preview }` (first 5 rows); no DB writes

- `POST /api/equipment/import-xlsx/confirm` — save all rows using the confirmed column mapping



**Flow:**

1. User drops or selects an `.xlsx` / `.xls` file

2. Server returns column headers and a 5-row preview

3. Client shows a mapping grid: each equipment field mapped to a spreadsheet column; headers are auto-matched on obvious name similarity

4. User confirms → server iterates all rows, deduplicates by `serial_number`, inserts new records

5. If a `next_inspection_date` column is mapped and contains a valid ISO date, a stub inspection contract + reminder chain is generated automatically



**Dedup:** rows whose `serial_number` already exists for the user are skipped (counted in `skipped`).  

**Result:** `{ created: N, skipped: M }` shown on a confirmation screen.



### Certificate Expiry Calendar



Color-coded view of certificate expiry dates overlaid on the existing reminder calendar.



**Endpoint:** `GET /api/equipment/expiry-calendar?from=&to=`



- Queries `contracts` where `expiry_date` is set and `contract_type` matches inspection keywords (`תסקיר|בדיקה|inspection|certificate`), or `contract_type` is null

- Each item is enriched with `client_name` (from `clients`) and `equipment_name` (from the first equipment record linked to the same `document_id`)

- `urgency` is computed server-side:



| Value | Condition |

|-------|-----------|

| `overdue` | `days_until < 0` |

| `critical` | `0 ≤ days_until ≤ 30` |

| `warning` | `31 ≤ days_until ≤ 90` |

| `ok` | `days_until > 90` |



- `ReminderCalendar.vue` accepts an `expiryItems` prop and renders expiry pills alongside reminder pills in both **month grid** and **agenda** views

- Pills are colored by urgency: red / orange / yellow / green

- Clicking a pill opens a popover with equipment name, client, contract number, and days-until text

- Dashboard fetches expiry items on mount and passes them to the calendar



---



## Email Templates



- Stored in MongoDB `email_templates` collection

- HTML with `{{variable}}` placeholders (client_name, expiry_date, document_name, etc.)

- Built-in templates: inspection reminder, contract reminder, invoice reminder

- CRUD via Settings page (admin)

- Preview with sample data

- `{{items_table}}` placeholder for grouped reminder items (auto-injected if missing)

- `items_table` exposed in template editor for live preview



---



## Remembered UI Filters



`sessionStorage`-backed filter persistence per page. `readRememberedFilter` / `writeRememberedFilter` helpers save the selected filter tab key, surviving in-session navigation without polluting permanent storage.

### Saved table views

- Table pages remember the user's selections between visits in `localStorage`, per user and page (`ui.table.<userId>.<page>`): Invoices, Documents, Reminders, Clients, Equipment, Activity log, Gmail inbox and Expense analytics. Saved: filters, date range, sort column and direction, page size and list/grid view. Free-text search is not saved, so a forgotten term never makes a list look empty
- Date ranges are saved as a preset id (a "3m" stays the trailing three months) or as explicit dates; an explicit "all time" is distinct from never having chosen
- Invoices opens on the last 3 months until the user picks something else
- Code: `shared/tableState.ts` (pure helpers, tested in `tableState.test.ts`), `composables/useTableState.ts` (`usePersistedTableState`, `useTableSort`). Saved values are validated on restore, so stale options fall back to defaults
- Views are stored in the browser, so they do not follow the user to another device



---



## Missing Fields Detection



Documents and contracts with incomplete data are flagged with red highlights in the UI. `rowIssues.ts` checks for:

- Missing expiry dates

- Duplicate report numbers

- Active contracts without reminders

- Processing errors on documents



Expiry date aliasing: `next_inspection_date` falls back to `expiry_date` when the primary field is missing.



---



## Admin Page



Route: `/admin` — admin-only console:



- User list with role / plan editing, activate/deactivate, and full profile fields (email, username, phone, company)

- **Magic Links** — create/upsert users by email and/or username, set plan/role, issue a 15-minute one-time sign-in link (no public username login). See [ADMIN_MAGIC_LINKS.md](./ADMIN_MAGIC_LINKS.md)

- **Gmail inbox** — admin-only invoice import tools (moved out of primary user nav)

- **DB target switcher** — `local` vs `production` Mongo via `X-Admin-Db-Target` (auth stays on primary)

- Monitoring: documents, emails, reminders, monthly reports, bad emails, issues (per-doc AI rescan)

- Roomier nav, cards, and table column spacing for admin pages



---



## Full-Text Search



- Searches across documents, clients, and contracts in a single request

- Regex-based (case-insensitive) on indexed fields

- Results scoped to the authenticated user



---



## Settings



### Global (admin-only, `/api/settings`)

- AI backend: OpenAI or Ollama

- OCR language

- SMTP configuration

- Reminder advance-day schedule

- Email sender name and address



### Per-user (`/api/user-settings`)

- UI theme: light / dark

- Email sender name

- Reminder advance days

- OCR language override

- Pipeline flags: `pipeline_ocr`, `pipeline_ai`, `pipeline_s3`, `pipeline_entities`



---



## Profile Page



- Avatar (Google picture or name initials)

- Role badge (מנהל מערכת / Pro / משתמש)

- Live reminder stats (active, snoozed, completed)

- Settings form (theme, email name, reminder days, OCR language)

- Account info (joined date, last login)

- Danger zone: disconnect all sessions

- Admin-only section: Users Management table with inline role selector and activate/deactivate toggle



### Engineer profile — inspector license numbers

- `inspector_number` — single legacy license number used as the default/fallback
- `inspector_numbers_by_type` — optional per-inspection-type override map (`{ [presetKey]: string }`), keys validated against the real `INSPECTION_PRINT_TEMPLATE_PRESETS` list server-side
- UI: collapsed-by-default "+ הוסף רישוי לפי בדיקה" section under the engineer profile form (ProfilePage and OnboardingWizard) with one input per inspection type
- Resolution order (`resolveInspectorNumber`, mirrored client/server): per-type override if set for the report's category, else `inspector_number`, else empty
- Used to: prefix allocated report numbers (`allocateReportNumber`), and resolve the correct signature number in generated PDFs (`getEngineerData`, scoped by `reportTypeKey`)



---



## Dashboard



Stats scoped to the authenticated user:

- Total documents, clients, contracts, inspections

- Active contracts, expiring soon (30 days), pending reminders

- Recent documents (last 5)

- Upcoming reminders (next 10, sorted by trigger date)



---



## WebSocket / Polling



Real-time document processing updates pushed to the client:

- `document:queued` — file accepted

- `document:progress` — OCR / AI stage with percentage

- `document:done` — processing complete or failed



---



## File Storage



| Mode | When | Details |

|------|------|---------|

| Local | `DO_SPACES_KEY` not set | `data/documents/<sha256>.<ext>` |

| Spaces | `DO_SPACES_KEY` set | `@aws-sdk/client-s3` upload; presigned URLs (1-hour) |



Files are deduplicated by hash — re-uploading the same file returns the existing document record.



## Contract and Inspection Exports



The Contracts page includes an export generator for the currently filtered records. Users can choose the client, status, contract type, date range, and columns before selecting a format:



- CSV: UTF-8 CSV with a BOM, suitable for spreadsheets and data systems.

- Excel: RTL `.xlsx` workbook with equipment rows expanded.

- PDF: print-ready Hebrew HTML that can be printed or saved as PDF from the browser.



The page also provides a monthly PDF report. It asks for a month and downloads a server-generated PDF containing all contracts and inspections started in that month, including client details, dates, status, amount, source document, equipment, and related reminders.



---



## Inspection Print Templates



### Pages and routes



| Route | Page | Purpose |

|-------|------|---------|

| `/print-templates` | PrintTemplatesHubPage | Landing page — choose between layout editor and Excel editor |

| `/print-templates/layout` | SimplePrintTemplatesPage | Section-based template editor (list, edit, compose modes) |

| `/print-templates/excel` | PrintTemplatesPage | Grid/table-based editor (list, compose, design modes) |

| `/contracts/:contractId/draft` | ContractDraftPage | Live table preview with inline fields, draft actions |



### Two editor types



**Excel editor** (`editorType: "grid"`): stores `cols`, `rows`, and `cells` arrays. Each cell has a type (label, field, image), optional spans, per-side borders, font size, color. Features: merge/unmerge, row clone, formula line editing, partial rich text (bold + color), copy/paste, images from uploads or URLs. Rendered server-side via `renderTemplateHtml` as an HTML table.



**Section editor** (`editorType: "sections"`): stores a `layout` object with typed sections (header, fields, equipment_table, findings, static_text, signature, image, footer) plus global styles (borderColor, borderWidth). Rendered via `renderSectionTemplateHtml`. Includes field size and bold controls, title/subtitle size and weight controls, image support.



### API endpoints



| Method | Path | Description |

|--------|------|-------------|

| GET | `/api/print-templates` | List visible templates (owned + shared) |

| GET | `/api/print-templates/:id` | Single template |

| POST | `/api/print-templates` | Create |

| PUT | `/api/print-templates/:id` | Update (or copy-on-write clone) |

| DELETE | `/api/print-templates/:id` | Delete (admin-only for shared) |

| GET | `/api/print-templates/:id/draft` | Load draft (optionally scoped by contractId) |

| PUT | `/api/print-templates/:id/draft` | Save draft |

| DELETE | `/api/print-templates/:id/draft` | Delete draft |

| POST | `/api/print-templates/:id/pdf` | Render PDF inline (Puppeteer) |

| POST | `/api/print-templates/:id/pdf/save` | Render PDF, persist as document, link to contract, delete draft |

| GET | `/api/print-templates/drafts` | List all user drafts with enriched metadata |



### Copy-on-write shared templates

When a non-admin user edits a shared template, the server creates a personal clone with `source_template_id` pointing to the original. Listing hides the original shared template when a personal copy exists (`copiedSourceIds` filter). Signature images are preserved during cloning.



### Access control

- **Visibility**: users see own templates + all shared ones

- **Mutation**: owners can always edit; admins can edit shared templates; non-admins get a copy-on-write clone

- **Sharing**: admin-created templates are automatically `is_shared: true`

- **Deletion**: shared templates can only be deleted by admins (403 otherwise)



### Draft-to-contract flow



1. `תסקיר חדש` (hydraulic check modal) collects client, equipment, interval, and template fields in a multi-step wizard with draft persistence

2. Saves a `print_template_drafts` row and opens `/print-templates/:templateId/draft`

3. Compose page allows inline cell editing and side panel editing

4. `pdf/save` renders PDF, creates a `documents` record (local + S3), links it to the contract, promotes status from "draft" to "active", deletes the draft

5. Also supports: save draft, print PDF, create contract + reminders, edit contract



**Linkage**: drafts store `meta.client_id` and `meta.equipment_ids`. When a contract is created, `contract_id` is saved back to the draft. Correct binding for `מספר רישוי` is `license_number` (accepts 7-digit values).



### Pressure-equipment layout (air_receiver, steam_receiver, steam_boiler, pressure_vessel)

These 4 presets report on a single vessel with many physical attributes, matching the real inspector-issued forms' layout instead of the multi-item `equipment_table` used by the other 7 preset types (lifting_machine, elevator, etc.):

- Part 1 (client details) and Part 2 (equipment attributes) render as `fields` sections with `columns: 2` (label:value pairs, 2 per row) instead of the 3-column grid + `equipment_table` used elsewhere
- `air_receiver` additionally has Parts 3/4/6 (last hydraulic test, test results, permitted working pressure) and a 14-field equipment attribute list (`AIR_RECEIVER_EQUIPMENT_COLUMNS`); the other 3 pressure types keep the shared 7-field list (`PRESSURE_EQUIPMENT_COLUMNS`)
- Branch logic lives in `createInspectionPrintTemplateLayout()` in `server/src/shared/printTemplateLayout.ts` and its byte-identical client mirror `client/src/shared/printTemplateLayout.ts` (hand-duplicated, no build-time sync — edit both)
- After editing this file, reseed the shared DB templates: `npm run print-templates:seed-inspections:apply` (local; production needs a separate direct-Mongo script since `connectDb()`'s `MONGODB_TARGET` production switch is currently dead code)
- `HydraulicCheckModal.vue`'s `loadPrintTemplates()` refetches the template list on every open (not cached) so DB-side template edits appear without a hard page reload



Full technical reference: [INSPECTION_TEMPLATE_FLOW.md](./INSPECTION_TEMPLATE_FLOW.md) and [CONTRACT_DOCUMENT_REMINDER_FLOW.md](./CONTRACT_DOCUMENT_REMINDER_FLOW.md).



---



## Monthly Email Reports



The Reports page (`/reports`) controls automatic monthly delivery of contract and inspection reports.



### Monthly report settings



- Enable or disable automatic delivery

- Recipients, or the account email when recipients are left empty

- Day of month (`1`-`28`)

- Hour of day (`00:00`-`23:00`)

- DOCX and/or XLSX attachments (configurable per report)



### Automatic delivery

The scheduler calls `checkMonthlyReports` on each tick (production only). For each user with `monthly_report_enabled: true` and plan flag `automaticMonthlyReports`:

- Due when configured day/hour has passed and `monthly_report_last_sent` does not already start with the current month key (e.g. `2026-08`)

- **Recipients are account-side only** — never client emails. Uses `monthly_report_recipients` when set; otherwise the **app user's email only**

- Sends a combined report via `sendMonthlyReportToRecipients` at most once per calendar month per user



### Manual send

`POST /api/reports/monthly/send` supports two delivery modes:

- **combined** — single report to account recipients (same rules as automatic; not to clients)

- **client** — per-client reports via `sendMonthlyReportsPerClient`, optionally including each client's email



### Last-sent tracking

On success: `user_settings.monthly_report_last_sent` is set to `"periodKey (ISO timestamp)"` (e.g. `"2026-08 (2026-08-15T10:30:00Z)"`). On failure: `monthly_report_last_error` is set. The Reports page displays the last-sent value in a success alert.



### Report formats

Download endpoint supports DOCX, XLSX, and CSV with configurable field selection. CSV uses Hebrew headers with UTF-8 BOM and RTL display markers. The manual report generator lets users choose report fields with Hebrew labels. Report-month picker and client selector available in the UI.



### Expiry date display

Expiry dates in reports and contracts are displayed as original date minus one day (adjusted for end-of-day semantics).


---

## Recent Additions (2026-10)

### Reminder Discovery (Gmail scan)

- Scans Gmail for obligations and deadlines, saved in `reminder_discoveries` and shown on page load (`/discover-reminders`)
- Languages: Hebrew, English, Russian (per-user `discovery_langs`); Russian kind/cue patterns and month names
- Missed deadlines (last 90 days) in their own group beside urgent and upcoming; due chips and 4 stat cards
- **Weekly auto-scan**: `discovery_auto_scan` switch ("סריקה שבועית והתראה"); scheduler `checkDiscoveryScans` (3 users per tick, production only) sends in-app notification + web push for new finds only
- **Scan schedule per user**: the discovery scan runs daily or weekly (`discovery_scan_frequency`, default weekly; chosen on the Discover reminders page). The **daily invoice scan** (`invoices_auto_scan`, Business plan, switch on the Invoices page) queues the same Gmail import job as the "import all" button (`enqueueAutoInvoiceImport`), limited to the last 14 days, skipped while another import is queued or running; the finished job notifies the user (in-app and push) only when something was imported. Both run from the hourly scheduler (`checkDiscoveryScans`, `checkInvoiceScans`; production only), at most 3 users per tick, and a user is marked as scanned before the work starts so a failing account is retried next interval, not every hour. Daily means every 20 hours or more, so the hourly tick never skips a day. The switches (and the discovery frequency) appear in three places that share the same user settings: the Invoices page, the Discover reminders page and Profile → settings, in the "קליטת מסמכים וסנכרון" card (which also holds the email-in address and the calendar feed, separate from the Google connections card). Both jobs show on the admin scheduler monitor and process dashboard (`SCHEDULER_HEALTH_NAMES`, guarded by `schedulerHealthNames.test.ts`). Code: `gmail/autoScan.ts`
- Moovit/Pango public-transport receipts parsed inline (`parsePango`)

### Dashboard

- Module cards (invoices, discovery, Gmail, field, quotes) shown only when the feature is enabled in settings
- Invoice and receipt stat chips (business plan + `pages.invoices`)
- "Due soon" invoices panel (`GET /api/invoices/due-soon`) with one-click add-reminder
- The dashboard calendar also shows unpaid invoice payment dates (same Business-plan and invoices-page gate as the due-soon panel; `GET /api/invoices/due-soon?from=&to=` lists a month) and new suggestions from the discovery page (only when `pages.discovery` is on). Both use dashed pills coloured by urgency and open the invoice or the discovery page
- Invoices page has a "לתשלום" chip (count of unpaid invoices that have a payment date; `GET /api/invoices?unpaidOnly=1`, `unpaidDueCount`) that filters to them sorted by payment date; the list also sorts by `dueDate` with undated rows last
- **Import review queue** (`review/reviewRules.ts`, `reviewStore.ts`, `routes/review.ts`, page `/review`): documents brought in unattended (Gmail import, email-in, Drive; not manual uploads) are checked when processing finishes (`evaluateReviewForDocument`). Flagged reasons: low extraction confidence, missing amount, missing date, unidentified supplier, possibly not an invoice, missing required fields, no expiry date on an inspection/contract type. A flagged document gets `review: {status: pending, reasons, source, flagged_at}`; approved or dismissed ones are never re-queued. The Review page (sidebar item under the documents group with a count badge, and a dashboard banner) lists them newest first with approve, open and remove; removing archives the invoice and dismisses the pending reminders made from the document, approving a possible non-invoice makes it count again. Routes: `GET /api/review`, `GET /api/review/count`, `POST /api/review/approve`, `POST /api/review/:id/dismiss`
- **Invoice / receipt pairing** (`invoices/pairing.ts`, `pairingStore.ts`): a receipt is linked to the invoice, bill or payment request it paid when the supplier (or a shared reference number), amount and currency match and the receipt is dated within 90 days after the invoice (one day before is tolerated). Linking is automatic after each import (`pairInvoiceByDocumentId`, Gmail inline receipts) and only when there is a single clear candidate; ties are left alone. A paired invoice counts as paid (leaves the to-pay and due-soon lists), is not flagged as a duplicate, and is left out of the expense totals so the payment is counted once (the receipt counts; the "requested" view still lists the invoice). Pairs carry `paired_with`, `pair_status` (auto, confirmed), `pair_score` on both documents
- Pair routes: `POST /api/invoices/pairs/scan` (backfill), `POST /api/invoices/:id/pair` (confirm by hand), `DELETE /api/invoices/:id/pair` (unlink; the two are remembered as not matching). The Invoices page tags paired rows, offers "unlink" in the row menu, and runs the backfill once per user on first visit
- `.dash__stats` cards are links: documents, clients, inspections, pending, expiring, invoices, receipts

### Push Notifications (users)

- `/api/push/vapid-key|subscribe|unsubscribe`; enable/disable row in the notification bell
- Push sent when a reminder email is sent (`notifyOwnerReminderSent`) and on new discoveries
- Needs VAPID keys (not set on dev)

### What's new card and tours

- Dashboard card (`WhatsNewCard.vue`, messages in `locales/whatsNewMessages.ts`) lists the new features once per release; dismissal is stored per user as `user_settings.whats_new_seen` (`PUT /api/user-settings`). Bump `WHATS_NEW_RELEASE` to show it again
- Business-only items show a plan tag instead of a button on other plans; the weekly scan item appears only when `pages.discovery` is on
- Walkthrough tours `profile` (email-in, calendar feed) and `discovery` (weekly scan) start from the card
- Plan lists and landing pages (`client/src/shared/pricingCatalog.json`, `npm run pricing:sync`) mention email-in, calendar feed and camera/share (reminder discovery is left out until `pages.discovery` is on by default)

### Navigation and Tables

- הוצאות sidebar sub-pages: invoices table and expenses graph
- Reminders table hides category and client columns; last four columns 50-80px
- Reminder calendar capped at 880px

### Easier Intake

#### ICS calendar feed

- Subscribable read-only feed for Apple/Outlook/any calendar; same entitlement as Google Calendar sync (`googleCalendarSync`)
- Routes: `GET /api/calendar/feed/status`, `POST /api/calendar/feed/token` (create/rotate), `DELETE /api/calendar/feed`, public `GET /api/calendar/feed/<64hex>.ics`
- Token in `user_settings.calendar_feed_token`; minimal event description (no client email/phone); profile card with copy, webcal link, rotate, disable
- Code: `server/src/calendar/icsFeed.ts`

#### Camera capture and share-to-app

- Upload modal "take photo" input (`capture="environment"`), shown only on touch devices (`(pointer: coarse) and (hover: none)`); hidden on desktop
- PWA `share_target` (POST `/share-target`; pdf, png, jpeg, tiff): service worker stores files in Cache `remindocr-shared-files`, redirects to `/dashboard?shared=1`, dashboard opens the upload modal with them
- Works on installed Android Chrome PWA; not iOS Safari

#### Email-in

- **Business plan only** (`emailIn` tier flag, also admin; the Profile card shows a Business-plan hint on other plans). Per-user address `in+<24hex>@in.remindocr.com` (token in `user_settings`); profile card "העברת מסמכים בדואר" with copy, rotate, disable; hidden unless `INBOUND_EMAIL_DOMAIN` is set
- Routes: `GET /api/inbound-email/status`, `POST /token`, `DELETE /api/inbound-email`
- Flow: Resend `email.received` webhook (`/api/webhooks/resend`, Svix-verified) -> `inbound/inboundEmail.ts` claims the email id (idempotent), skips auto-replies, imports PDF/image attachments via `importFile` (hash dedup, document quota enforced); body-only mail goes to the inline receipt parser and discovery; then notification + push
- Limits: 10 attachments, 20MB, 50 emails per day per user; a failed run releases the claim so a replay works
- Env: `INBOUND_EMAIL_DOMAIN`, `RESEND_INBOUND_API_KEY` (full-access key; falls back to `RESEND_API_KEY`), `RESEND_WEBHOOK_SECRET`
- DNS: MX `in` -> `inbound-smtp.ap-northeast-1.amazonaws.com` (10)
- Status: deployed on dev; webhook and dedup path verified, fresh-import run pending; not on master

### Planned (not built)

VAT/accountant export with SHAAM allocation number, subscription detection, cash-flow forecast, category budgets, certificate expiry tracker, reminders from extracted tasks, Russian UI locale, WhatsApp intake/channel, review queue, payment gateway, public API.

### API documentation and tests

- Swagger UI at `/api-docs`, spec at `/api-docs.json` (from `docs/openapi.yaml`): every Express route (about 300) is documented, with tags, parameters, request bodies and error responses; email-in, ICS feed, push, due-soon, discovery scan and the Resend webhook carry full schemas
- `openapiCoverage.test.ts` fails when a route has no spec entry, a documented route no longer exists, a path parameter is undeclared or a `$ref` is broken
- `npx tsx scripts/openapiGenerate.ts` (in `server/`) adds missing entries from `scripts/openapiSummaries.ts`
- Route tests for the new features: `inboundEmailRoutes`, `calendarFeedRoutes`, `userPushRoutes`, `userSettingsDiscovery`, `invoiceDueSoonRoute`, `resendWebhookRoute` (shared in-memory DB in `__tests__/helpers/memoryDb.ts`)

