# Reminder App — Features & Flows

## Overview

A Hebrew-first document management and reminder system. Users upload business documents (inspection reports, contracts, invoices), the server extracts structured data via AI, creates client records and contract entries, and automatically sends email reminders before expiry dates.

**Stack:** Node.js / Express · MongoDB · Vue 3 + Naive UI · Deployed on Railway (server) + Vercel (client)

---

## Authentication

### Email / Password
- Register with email + password (bcrypt hashed, 12 rounds)
- Email verification via tokenized link sent to inbox using `verify-email.html` template
- Login creates a server-side session stored in MongoDB (`sessions` collection)
- Session cookie (`sid`) is `httpOnly`, `sameSite: lax`
- Session validated on every protected route via `requireAuth()`
- Sessions expire and are cleaned up automatically

### Password Reset
- "Forgot password" flow sends a reset link via `reset-password.html` template
- Token is single-use and expires

### Google OAuth (optional)
- Configured via `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` settings
- OAuth callback creates or updates user record

### Route Guards (client)
- All routes except `/login` and `/reset-password` require an authenticated session
- `router.beforeEach` calls `authStore.fetchMe()` on first load to validate the session
- Unauthenticated users are redirected to `/login`
- Session is persisted across page refreshes (no re-login on refresh)

---

## Document Pipeline

### Import Methods
1. **Browser upload** — drag-and-drop zone or "בחר קבצים" button; supports PDF, DOCX, XLSX, TXT, MD, PNG, JPG, TIFF
2. **Server path import** — paste an absolute server path via "נתיב שרת" button
3. **Watch folder** — server watches a configured folder; any new supported file is automatically imported

### Processing Stages
Each document goes through these stages (progress pushed via polling):
1. `queued` — document record inserted in MongoDB, file copied to `data/documents/`
2. `processing / extracting_text` — PDF parsed (text layer); if scanned → Tesseract OCR
3. `processing / ocr` — OCR for image files and scanned PDFs
4. `processing / ai_extraction` — AI extracts structured fields (OpenAI or Ollama)
5. `processing / saving_entities` — client, contract, reminders, equipment saved to DB
6. `done` / `error`

### Deduplication
- SHA-256 hash checked before inserting; duplicate files are skipped silently

### File Storage
- Local: `data/documents/<hash>.<ext>`
- Production: DigitalOcean Spaces (S3-compatible); falls back to local if Spaces not configured

### AI Extraction — Two Modes

**Template-driven (primary):**
- Document text is matched against `doc_templates` by keyword scoring
- Matched template's fields define the JSON schema sent to the AI
- AI returns a flat object matching the template's field keys
- For inspection templates (`תסקיר`), AI also extracts a `_equipment[]` array

**Generic fallback:**
- Used when no template matches
- Fixed schema: client, contract, dates, parties, tasks, summary, confidence

### Extraction Dump
- Every AI run is saved to `data/extractions/<timestamp>_doc<id>_<name>.json` for audit

---

## Entity Saving

After AI extraction, the importer automatically creates/updates:

### Clients
- Matched by `display_name` (case-insensitive regex)
- Creates new client if not found; merges email/phone/address if existing record is missing them
- Contact person appended to `notes` field
- Links document to client via `document_clients` collection

### Contracts / Inspections
- Inserted per document with: contract number, type, start date, expiry date, amount, currency, summary
- Drives reminder generation (see below)

### Equipment (inspection reports only)
- AI extracts all equipment items found in the document (`_equipment[]`)
- Each item upserted into `equipment` collection by `name + serial_number`
- Fields: name, category (lift/accessory/scaffold/ladder/balloon/intake/extractor/other), manufacturer, model, serial number, load capacity

### Timeline Events
- `document_added` event created per client when a document is imported
- `email_sent` event created when a reminder email is successfully delivered

### Tasks
- Generic extraction can produce tasks with due dates
- Stored in `tasks` collection linked to document and client

---

## Reminders

### Automatic Generation
- Created when a contract/inspection with an `expiry_date` is saved
- One reminder per configured advance-days value (e.g. 30, 14, 7 days before)
- Title is smart-labelled based on contract type:
  - תסקיר/בדיקה → "בדיקה הבאה"
  - ביטוח → "חידוש ביטוח"
  - אישור/תעודה → "חידוש תעודה"
  - חשבונית → "תשלום"
  - default → "פקיעת תוקף"
- Past trigger dates are skipped; duplicates are not re-created

### Scheduler
- Runs on server at a configurable interval (default: every few minutes)
- Finds all `pending` reminders whose `trigger_date ≤ today`
- Sends email to: reminder's `email_to` list → client's email → fallback sender
- Logs to `email_log` collection
- After 3 consecutive failures, marks reminder as `error`

### Manual Reminders
- Created from the Reminders page with: client, title, date, recipient email, template, body

### Quick Test (🧪 תזכורת בדיקה)
- Opens a modal to choose the email template
- Pre-selects the default template
- Creates a reminder with today's date and immediately sends it to the configured test email

### Reminder Actions
- **Send now** — immediately sends the email regardless of trigger date
- **Snooze** — postpones to a chosen date
- **Dismiss** — marks as dismissed without sending

---

## Email Templates

### Built-in Templates (Hebrew HTML)
Four styled RTL templates loaded from disk at startup and seeded into MongoDB:

| Template name | File | Bound to |
|---|---|---|
| ברירת מחדל | `default.html` | All document types (fallback) |
| תסקיר בדיקה תקופתית | `inspection.html` | תסקיר בדיקה |
| פקיעת חוזה שירות | `contract.html` | חוזה שירות |
| תזכורת תשלום חשבונית | `invoice.html` | חשבונית |

- Seeder uses `$set` on `html` and `subject` every boot — so editing the `.html` files updates the DB automatically
- Each template is a full RTL HTML email with colored header, fields table, CTA box, and footer

### Auth Templates
- `verify-email.html` — sent on registration
- `reset-password.html` — sent on password reset

### Template Variables
Available in all reminder templates via `{{varName}}` syntax:

```
{{title}}           reminder title
{{trigger_date}}    date the reminder fires
{{expiry_date}}     document expiry / next inspection date
{{advance_days}}    days before expiry
{{client_company}}  company name
{{contact_person}}  contact person name
{{contact_phone}}   phone number
{{document_number}} document / report number
{{contract_number}} contract number
{{amount}}          monetary amount
{{currency}}        currency code
{{body}}            free-text reminder body
{{from_name}}       sender display name
{{logo_url}}        inline base64 logo (if uploaded)
```

Conditional blocks: `{{#if var}}...{{/if}}`
Fallback values: `{{var|fallback text}}`

### Template Editor
- Drawer with two tabs: **עריכה** (editor) and **תצוגה מקדימה** (live preview)
- "זהה משתנים" — detects all `{{var}}` tokens in the HTML and shows them as clickable chips to insert
- "טען תבנית ברירת מחדל" — loads the correct built-in HTML based on bound doc-template type
- "אפס לברירת מחדל" — resets HTML to the built-in file for this template type
- Logo upload with inline base64 embedding
- Bind template to a specific doc-template type for automatic selection

### Template Selection Logic
When sending a reminder email, the system picks the template in this order:
1. Template explicitly set on the reminder (`email_template_id`)
2. Template bound to the document's doc-template type (`doc_template_id`)
3. Default template (`is_default = 1`)
4. Any template in the collection
5. Inline fallback HTML (hardcoded, always available)

---

## Clients

### List & Search
- Searchable by name and email
- Shows entity type (company / person)

### Client Detail Page (`/clients/:id`)
- Stats: document count, contract count, open reminders
- Contact info: email, phone, ID number, notes
- **Documents tab** — lists all documents linked to this client
- **Timeline tab** — chronological feed of events (document added, email sent, reminder fired)
- Edit modal for name, email, phone, notes

### ID Type
- Client IDs are MongoDB ObjectId strings throughout (not numbers)

---

## Documents Page (`/documents`)

- Top nav entry: **מסמכים**
- Table of all user's documents with processing status badge
- Drag-and-drop upload zone
- **↻ סריקה מחדש** — reprocesses all `error`-status documents
- **🗑 מחק פגומים** — deletes all `error`-status documents and their derived data (extractions, contracts, reminders)
- Legacy documents (imported before auth existed) are automatically claimed by the first authenticated user who opens the page

---

## Contracts / Inspections Page (`/contracts`)

- Lists all contracts and inspection reports
- Filterable by status: active / expired / cancelled / renewed
- Shows: document name, client, contract number, type, expiry date, amount, status

---

## Equipment Page (`/equipment`)

- Catalogue of lifting equipment, accessories, scaffolding, etc.
- Filterable by category
- Items are auto-added when inspection reports are processed
- Manual add/edit/delete via the UI
- Categories: lift, accessory, scaffold, ladder, balloon, intake, extractor, other

---

## Document Templates (`/doc-templates`)

- Defines the AI extraction schema per document type
- Fields have: key, Hebrew label, type (text/number/date/phone/email/currency/list), required flag, hint, example
- `expiry_field` — which date field drives reminder generation
- `match_keywords` — keywords used to auto-select the template for a scanned document
- Built-in templates: תסקיר בדיקה, חוזה שירות, חשבונית

---

## Search (`/search`)

- Full-text search across documents (raw text), clients, and contracts
- Returns highlighted snippets for documents

---

## Dashboard (`/`)

- Stats cards: total documents, clients, contracts, active contracts, inspections, pending reminders, expiring soon (≤30 days)
- Recent documents panel
- Upcoming reminders panel

---

## Settings (`/settings`)

| Section | Settings |
|---|---|
| AI | Backend (OpenAI / Ollama), model, API key, Ollama URL |
| OCR | Language, auto-extract toggle, max chars |
| SMTP | Host, port, SSL, user, password, reject unauthorized, from address, from name |
| Reminders | Enable/disable, advance days (multi-value), check interval, test email, test template |
| Watch folder | Enable/disable, folder path |
| Storage | DigitalOcean Spaces key/secret/endpoint/bucket/region |
| CORS | Allowed origins |

### Credential Auto-Detection
- On startup and when a file is dropped into the watch folder, the server scans for credential files (`.env`, `.key`, etc.)
- Recognised patterns: OpenAI key, SMTP credentials, MongoDB URI, Google OAuth, DO Spaces
- Values are applied to settings automatically if not already set

---

## API Routes

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register with email + password |
| POST | `/api/auth/login` | Login, set session cookie |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/auth/verify-email` | Verify email token |
| POST | `/api/auth/forgot-password` | Send reset email |
| POST | `/api/auth/reset-password` | Reset with token |
| GET | `/api/documents` | List user's documents |
| POST | `/api/documents/upload` | Upload files (multipart) |
| POST | `/api/documents/import` | Import by server path |
| POST | `/api/documents/rescan` | Reprocess error docs |
| DELETE | `/api/documents/corrupt` | Delete error docs |
| GET | `/api/documents/:id` | Get document |
| DELETE | `/api/documents/:id` | Delete document |
| POST | `/api/documents/:id/reprocess` | Reprocess one document |
| GET | `/api/clients` | List clients |
| GET | `/api/clients/:id` | Client detail + stats |
| PUT | `/api/clients/:id` | Update client |
| GET | `/api/clients/:id/documents` | Client's documents |
| GET | `/api/clients/:id/timeline` | Client's timeline |
| GET | `/api/contracts` | List contracts |
| GET | `/api/reminders` | List reminders |
| POST | `/api/reminders` | Create reminder |
| POST | `/api/reminders/:id/send-now` | Send immediately |
| POST | `/api/reminders/:id/snooze` | Snooze |
| POST | `/api/reminders/:id/dismiss` | Dismiss |
| GET | `/api/email-templates` | List email templates |
| POST | `/api/email-templates` | Create template |
| PUT | `/api/email-templates/:id` | Update template |
| DELETE | `/api/email-templates/:id` | Delete template |
| GET | `/api/email-templates/defaults/:name` | Get built-in HTML (default/inspection/contract/invoice/verify-email/reset-password) |
| POST | `/api/email-templates/vars` | Detect `{{vars}}` in HTML |
| POST | `/api/email-templates/preview` | Render preview with sample data |
| POST | `/api/email/test` | Send test email |
| GET | `/api/doc-templates` | List doc templates |
| GET | `/api/equipment` | List equipment |
| GET | `/api/dashboard` | Dashboard stats |
| GET | `/api/search` | Full-text search |
| GET | `/api/settings` | Get settings |
| PUT | `/api/settings` | Update settings |

---

## Deployment

| Component | Platform |
|---|---|
| Client (Vue SPA) | Vercel |
| Server (Express API) | Railway |
| Database | MongoDB Atlas |
| File storage | DigitalOcean Spaces |

- Client communicates with server via `VITE_API_BASE` env var
- Server uses `MONGODB_URI`, `SESSION_SECRET`, `ALLOWED_ORIGINS` env vars
- No WebSockets in production — document processing status updates via polling
