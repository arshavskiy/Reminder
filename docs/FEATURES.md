# Features

Current feature inventory for ReminderOCR.  
Stack: Node.js 20 / Express · MongoDB · Vue 3 + Naive UI · Railway + Vercel

---

## Authentication

### Email / Password
- Register with email + password (bcrypt, 12 rounds)
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
| `pro` | Reserved for future plan features |
| `admin` | Settings page, User Management table (list, change role, activate/deactivate) |

- Server-side: `requireRole(ctx, minRole)` throws `403` if rank is too low
- Client-side: router guard redirects to `/403`; `primaryNav` computed filters nav by `minRole`

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

---

## Client Management

- Full CRUD with search (`display_name`, `email`)
- `entity_type`: `company` or `person`
- Fields: `id_number`, `email`, `phone`, `address`, `notes`, `tags`
- Per-client counts: documents, contracts, open reminders
- Timeline view — chronological event log (document added, email sent, etc.)
- Linked documents list

### Client deduplication (on import)
Four-level fuzzy match (all scoped to the importing user):
1. `id_number` exact match
2. Phone number (normalised — strip spaces and dashes)
3. Case-insensitive exact name match
4. Normalised name — strips `בע"מ`, `ltd`, `inc`, punctuation, collapses whitespace

On match: existing record is enriched with any new fields; no duplicate is created.

---

## Contract / Inspection Tracking

- Fields: `contract_number`, `contract_type`, `start_date`, `expiry_date`, `amount`, `currency`, `counterparty`, `summary`
- Status: `active` / `expired` / `cancelled` / `renewed`
- Filter by `kind=contract` (has contract number, not an inspection) or `kind=inspection` (type matches `תסקיר|בדיקה`)
- Expiring-soon endpoint: contracts expiring within N days
- Linked to client and source document

---

## Reminders

### Auto-generation
When a contract with `expiry_date` is saved (via import or manually), `generateContractReminders` creates one reminder per advance day in the schedule (default: 90, 60, 30 days before).

Dedup: existing non-dismissed reminder for the same `(source_id, advance_days)` is not duplicated.

### Statuses
`pending` → `sent` / `snoozed` / `dismissed` / `error`

### Manual actions
- Dismiss, snooze to a specific date, send-now
- Create manual reminders not tied to a contract

### Email delivery
- Nodemailer SMTP (Gmail or any SMTP server)
- HTML email with `{{variable}}` template substitution
- Multiple recipients (JSON array in `email_to`)
- Falls back to client's `email` field if `email_to` is empty

### Scheduler
- Background interval (default 60 s, configurable)
- Idempotent: checks `email_log` before sending
- Failure retry: logs each attempt; marks `error` after 3 failures

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

- Fields: `name`, `category`, `manufacturer`, `model`, `serial_number`, `capacity`, `load_capacity_test`, `load_radius`, `description`, `notes`, `is_active`
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
## Monthly Email Reports

The Reports page (`/reports`) controls automatic monthly delivery of contract and inspection reports.

Settings include:

- Enable or disable automatic delivery
- Recipients, or the account email when recipients are left empty
- Day of month (`1`-`28`)
- Hour of day (`00:00`-`23:00`)
- PDF and/or CSV attachments

The manual report generator lets users choose report fields with Hebrew labels. CSV attachments use Hebrew headers with UTF-8 BOM and RTL display markers for spreadsheet compatibility.

The scheduler checks these settings during its normal interval. It creates one report per client and sends it to the client email plus the user recipients, at most once per calendar month per user. The page includes a report-month picker, client selector, and a manual generate-and-send action.