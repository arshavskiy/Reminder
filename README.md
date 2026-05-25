# ReminderOCR

Hebrew-first document management and contract reminder platform. Upload inspection reports, contracts, and invoices — AI extracts structured data, auto-creates client and contract records, and emails reminders before expiry dates.

```
Browser → Vercel (Vue 3 SPA)
              ↓ VITE_API_BASE
Railway → Express + Node.js (API + OCR pipeline)
              ↓                    ↓
MongoDB Atlas              S3-compatible storage
(documents, users,         (Railway Bucket / storageapi.dev /
 contracts, reminders)      DigitalOcean Spaces — optional)
```

---

## Features

- **Document ingestion** — PDF, DOCX, XLSX, PNG/JPEG/TIFF; Tesseract OCR for scanned Hebrew files
- **AI extraction** — GPT-4o-mini (or local Ollama) pulls client name, ID number, dates, contract number, and equipment list from raw text
- **OCR-only mode** — upload files for text storage without consuming AI quota (used by certificates section)
- **Client dedup** — fuzzy name matching strips `בע"מ`/`ltd`/punctuation; also matches on national ID or phone number
- **Auto-reminders** — per-user configurable advance-day schedule (default 30 days before expiry); email sent via SMTP with HTML templates
- **Equipment catalog** — serial-number-keyed records linked to scanned document and client
- **Multi-user auth** — Google OAuth 2.0 + email/password; all data strictly scoped to the authenticated user
- **Role system** — `user` / `pro` / `admin`; admin-only Settings page and User Management table
- **Document quota** — per-user scan limit tracked by a persistent `scanned_count` counter (never decremented on delete); per-user override in `user_settings`
- **S3-compatible file storage** — Railway Bucket, storageapi.dev, or DigitalOcean Spaces; presigned download URLs; local disk fallback
- **PROCESS_ONLY mode** — process documents for OCR/AI without saving files locally or to S3
- **Engineer profile** — inspector number, credentials, certificates with OCR upload and download links
- **RTL Hebrew UI** — full right-to-left layout, dark/light theme, Naive UI component library

---

## Stack

| Layer | Technology |
|-------|-----------|
| Server | Node.js 20, Express, TypeScript (ESM) |
| Database | MongoDB Atlas (native driver, no Mongoose) |
| AI | OpenAI `gpt-4o-mini` · local Ollama fallback |
| OCR | Tesseract.js (Hebrew + English) |
| File storage | S3-compatible (Railway Bucket / storageapi.dev / DigitalOcean Spaces) · local disk fallback |
| Client | Vue 3, Vite, Pinia, Naive UI, Vue Router 4 |
| Auth | Google OAuth 2.0 (GIS) + bcrypt email/password + MongoDB sessions |
| Deploy | Railway (server) · Vercel (client) |

---

## Quick Start

### Prerequisites

- Node.js 20+
- MongoDB running locally (`mongodb://127.0.0.1:27017`) **or** a MongoDB Atlas URI
- OpenAI API key **or** Ollama running locally

### 1. Install

```bash
git clone <repo-url> && cd Reminder

cd server && npm install
cd ../client && npm install
```

### 2. Configure the server

```bash
cd server
cp .env.example .env   # then edit with your values
```

Minimum required vars for local dev:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
OPENAI_LOCAL_API_KEY=sk-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3737/auth/google/callback
SESSION_SECRET=<random 32+ chars>
```

### 3. Run

```bash
# Terminal 1 — server (hot reload)
cd server && npm run dev

# Terminal 2 — client
cd client && npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api`, `/auth`, and `/ws` to the server on port 3737 — no `VITE_API_BASE` needed in dev.

---

## Environment Variables

All configuration is env-only — no `settings.json` file is used. Settings are loaded once at startup from `process.env`.

### Server

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `MONGODB_URI` | ✓ | `mongodb://127.0.0.1:27017` | Connection string |
| `MONGODB_DB` | | `reminder-app` | Database name |
| `PORT` | | `3737` | HTTP port |
| `OPENAI_LOCAL_API_KEY` | ✓* | — | OpenAI API key (takes priority over `OPENAI_API_KEY`) |
| `OPENAI_API_KEY` | ✓* | — | Fallback OpenAI key (avoid if system env var may conflict) |
| `OPENAI_MODEL` | | `gpt-4o-mini` | OpenAI model |
| `OLLAMA_URL` | | `http://localhost:11434` | Local Ollama endpoint |
| `OLLAMA_MODEL` | | `llama3.1` | Ollama model name |
| `AI_BACKEND` | | `openai` | `openai` or `ollama` |
| `OCR_LANGUAGE` | | `heb+eng` | Tesseract language string |
| `AUTO_EXTRACT` | | `true` | Run AI extraction after OCR |
| `EXTRACTION_MAX_CHARS` | | `8000` | Truncate raw text before sending to AI |
| `PROCESS_ONLY` | | `false` | `true` = OCR/AI only, skip all file storage |
| `GOOGLE_CLIENT_ID` | ✓ | — | OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | ✓ | — | OAuth 2.0 client secret |
| `GOOGLE_REDIRECT_URI` | ✓ | `http://localhost:3737/auth/google/callback` | OAuth callback URL |
| `SESSION_SECRET` | ✓ | — | Cookie signing secret (32+ chars) |
| `ALLOWED_EMAILS` | | — | Comma-separated Google email whitelist |
| `SMTP_HOST` | ✓ | — | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | | `587` | |
| `SMTP_SECURE` | | `false` | `true` for port 465 |
| `SMTP_USER` | ✓ | — | SMTP login |
| `SMTP_PASS` | ✓ | — | SMTP password or Gmail app password |
| `SMTP_REJECT_UNAUTHORIZED` | | `true` | `false` to accept self-signed certs |
| `EMAIL_FROM` | ✓ | — | Sender address |
| `EMAIL_FROM_NAME` | | `ReminderOCR` | Sender display name |
| `ALLOWED_ORIGINS` | | — | CORS origins (comma-separated) |
| `DATA_DIR` | | `./data` | Local data directory |
| `USER_DOCUMENT_LIMIT` | | `25` | Default AI scan quota for `user` role |
| `WATCH_FOLDER_ENABLED` | | `false` | Auto-import files dropped into `WATCH_FOLDER` |
| `WATCH_FOLDER` | | — | Absolute path to watch folder |
| `REMINDER_ENABLED` | | `true` | Enable background reminder scheduler |
| `REMINDER_CHECK_INTERVAL_MS` | | `60000` | How often the scheduler checks for due reminders |
| `TEST_EMAIL` | | — | Default recipient for test emails |

#### S3-compatible storage (pick one set)

**Railway Bucket** (recommended on Railway):

| Variable | Description |
|----------|-------------|
| `S3_ENDPOINT` | e.g. `https://storage.railway.app` |
| `S3_BUCKET_NAME` | Bucket identifier (use `.BUCKET` reference, not `.RAILWAY_BUCKET_NAME`) |
| `S3_ACCESS_KEY_ID` | Bucket access key |
| `S3_SECRET_ACCESS_KEY` | Bucket secret key |
| `S3_REGION` | Usually `auto` |

**Generic S3-compatible** (storageapi.dev, MinIO, etc.):

| Variable | Description |
|----------|-------------|
| `ENDPOINT` | e.g. `https://t3.storageapi.dev` |
| `BUCKET` | Bucket name |
| `ACCESS_KEY_ID` | Access key |
| `SECRET_ACCESS_KEY` | Secret key |
| `REGION` | e.g. `auto` |
| `BUCKET_FORCE_PATH_STYLE` | `true` for non-Railway providers |

**DigitalOcean Spaces** (legacy):

| Variable | Description |
|----------|-------------|
| `DO_SPACES_KEY` | Spaces access key |
| `DO_SPACES_SECRET` | Spaces secret |
| `DO_SPACES_ENDPOINT` | e.g. `fra1.digitaloceanspaces.com` |
| `DO_SPACES_BUCKET` | Bucket name |
| `DO_SPACES_REGION` | e.g. `fra1` |

### Client (build-time, `client/.env.production`)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE` | Railway server URL e.g. `https://your-server.up.railway.app` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID (same value as server) |

---

## Project Structure

```
reminder/
├── server/src/
│   ├── index.ts                  # Express bootstrap, middleware, route registration
│   ├── settings.ts               # Pure env-var config (no file I/O)
│   ├── auth/
│   │   ├── middleware.ts         # requireAuth, requireRole, HTTPException
│   │   ├── session.ts            # MongoDB session create/verify/revoke
│   │   ├── emailAuth.ts          # Email/password register, login, reset, verify
│   │   └── google.ts             # Google OAuth 2.0 flow
│   ├── db/
│   │   └── db.ts                 # connectDb, col(), ensureCollections, applyIndexes
│   ├── pipeline/
│   │   ├── importer.ts           # importFile → processDocument → saveEntities
│   │   ├── extractor.ts          # OpenAI / Ollama field extraction
│   │   ├── pdfParser.ts          # pdf-parse + OCR fallback
│   │   ├── ocrParser.ts          # Tesseract.js (heb+eng)
│   │   ├── docxParser.ts         # Mammoth DOCX → plain text
│   │   ├── xlsxParser.ts         # SheetJS XLSX → plain text
│   │   └── keyScanner.ts         # Scans watch folder for credential files
│   ├── reminders/
│   │   ├── scheduler.ts          # Background timer, generateContractReminders
│   │   └── emailSender.ts        # Nodemailer + HTML template rendering
│   ├── routes/                   # One file per resource (see API Reference)
│   ├── storage/spaces.ts         # S3-compatible upload, delete, presigned URLs
│   ├── templates/                # Doc templates, email templates, prompt builder
│   └── __tests__/                # Vitest unit tests
│
└── client/src/
    ├── main.ts                   # App entry, background session validation
    ├── App.vue                   # Shell: appbar, RTL config, theme, nav
    ├── router/index.ts           # Vue Router — auth guard, role check → /403
    ├── stores/                   # Pinia: auth, documents, clients, contracts, …
    ├── services/apiService.ts    # Typed fetch wrapper for every endpoint
    ├── views/                    # Page components (one per route)
    ├── components/               # Reusable: UserDropdown, WsConnector, …
    └── shared/types.ts           # TypeScript interfaces shared with server
```

---

## API Reference

All protected routes require a valid session cookie (`sid`). Unauthenticated requests return `401`. Insufficient role returns `403`.

### Authentication

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| `POST` | `/api/auth/register` | — | Email/password registration |
| `GET` | `/auth/verify-email` | — | Email verification link handler |
| `POST` | `/api/auth/login` | — | Email/password login |
| `POST` | `/api/auth/logout` | ✓ | Revoke session |
| `GET` | `/api/auth/me` | — | Current user (null if not logged in) |
| `POST` | `/api/auth/forgot-password` | — | Send password reset email |
| `POST` | `/api/auth/reset-password` | — | Complete password reset |
| `POST` | `/api/auth/change-password` | ✓ | Change password (requires current password) |
| `GET` | `/auth/google` | — | Start Google OAuth redirect |
| `GET` | `/auth/google/callback` | — | OAuth callback |
| `POST` | `/api/auth/google` | — | GIS one-tap credential sign-in |

### Documents

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/documents` | List documents; returns `rows`, `total`, `totalAll` (scanned_count), `documentLimit` |
| `GET` | `/api/documents/:id` | Single document detail |
| `GET` | `/api/documents/:id/download` | Redirect to presigned S3 URL or stream local file |
| `POST` | `/api/documents/upload` | Upload files (multipart); `?ocrOnly=true` skips AI and quota |
| `POST` | `/api/documents/import` | Import by server-side file path |
| `POST` | `/api/documents/:id/reprocess` | Re-run AI extraction |
| `POST` | `/api/documents/rescan` | Re-queue all error-status documents |
| `DELETE` | `/api/documents/:id` | Delete document |
| `DELETE` | `/api/documents/corrupt` | Delete all error-status documents for user |

### Clients

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/clients` | List (`?q=` search, paginated) |
| `POST` | `/api/clients` | Create client |
| `GET` | `/api/clients/:id` | Detail + doc/contract/reminder counts |
| `PUT` | `/api/clients/:id` | Update client |
| `DELETE` | `/api/clients/:id` | Delete client |
| `GET` | `/api/clients/:id/documents` | Documents linked to client |
| `GET` | `/api/clients/:id/timeline` | Event timeline |

### Contracts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/contracts` | List (`?clientId=`, `?status=`, `?kind=contract\|inspection`) |
| `POST` | `/api/contracts` | Create contract |
| `GET` | `/api/contracts/expiring` | Contracts expiring within `?days=30` |
| `GET` | `/api/contracts/:id` | Detail |
| `PUT` | `/api/contracts/:id` | Update (regenerates reminders if expiry changed) |
| `DELETE` | `/api/contracts/:id` | Delete |

### Reminders

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/reminders` | List (`?status=`, `?days=`) |
| `POST` | `/api/reminders` | Create manual reminder |
| `PUT` | `/api/reminders/:id` | Update |
| `POST` | `/api/reminders/:id/dismiss` | Mark dismissed |
| `POST` | `/api/reminders/:id/snooze` | Snooze until date |
| `POST` | `/api/reminders/:id/send-now` | Force-send email immediately |

### Equipment

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/equipment` | List (`?category=`, `?q=`, `?client_id=`) |
| `GET` | `/api/equipment/stats` | Count per category |
| `GET` | `/api/equipment/:id` | Detail |
| `POST` | `/api/equipment` | Create |
| `PUT` | `/api/equipment/:id` | Update |
| `DELETE` | `/api/equipment/:id` | Delete |

### Profile & User Settings

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| `GET` | `/api/profile/stats` | ✓ | Reminder/inspection counts |
| `GET` | `/api/profile/engineer` | ✓ | Engineer profile fields |
| `PUT` | `/api/profile/engineer` | ✓ | Save engineer profile |
| `PUT` | `/api/profile` | ✓ | Update name/phone |
| `POST` | `/api/profile/avatar` | ✓ | Upload avatar image |
| `GET` | `/api/profile/certificates` | ✓ | List certificates |
| `POST` | `/api/profile/certificates` | ✓ | Create certificate manually |
| `POST` | `/api/profile/certificates/from-document` | ✓ | Extract cert fields from OCR'd document and save |
| `DELETE` | `/api/profile/certificates/:id` | ✓ | Delete certificate |
| `GET` | `/api/user-settings` | ✓ | Per-user preferences (`theme`, `reminder_advance_days`, etc.) |
| `PUT` | `/api/user-settings` | ✓ | Save preferences |

### Admin

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| `GET` | `/api/admin/users` | admin | List all users with `scanned_count` and `document_limit` |
| `PUT` | `/api/admin/users/:id` | admin | Update role / active status |
| `PUT` | `/api/admin/users/:id/document-limit` | admin | Override per-user document quota |
| `GET` | `/api/settings` | admin | Current app settings (read-only) |
| `POST` | `/api/settings` | admin | No-op — settings are env-only |

### Other

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| `GET` | `/api/dashboard/stats` | ✓ | Home page aggregates (user-scoped) |
| `GET` | `/api/search?q=` | ✓ | Cross-collection full-text search |
| `GET` | `/api/config` | ✓ | Public config (`userDocumentLimit`) |
| `GET` | `/api/tasks` | ✓ | Task list |
| `PUT` | `/api/tasks/:id` | ✓ | Update task |

---

## Document Processing Flow

```
POST /api/documents/upload  (or /import)
  │
  ├─ SHA-256 dedup (file_hash, scoped to user)
  │
  ├─ File storage  [skipped if PROCESS_ONLY=true or ocrOnly=true]
  │   ├─ Copy to data/documents/<hash>.<ext>
  │   └─ Upload to S3-compatible storage (if configured)
  │
  ├─ Text extraction
  │   ├─ PDF   → pdf-parse → Tesseract OCR fallback if no text layer
  │   ├─ Image → Tesseract.js (heb+eng)
  │   ├─ DOCX  → Mammoth
  │   └─ XLSX  → SheetJS
  │
  ├─ AI extraction  [skipped if ocrOnly=true or AUTO_EXTRACT=false]
  │   ├─ Template matching (pickTemplate on raw text)
  │   │   ├─ Match  → extractWithTemplate (structured per-template prompt)
  │   │   └─ No match → extractDocument (generic extraction prompt)
  │   └─ saveEntities (user-scoped)
  │       ├─ findOrCreateClient (dedup: id_number → phone → name)
  │       ├─ upsert contract (keyed on document_id)
  │       ├─ insert tasks
  │       ├─ upsert equipment (keyed on serial_number)
  │       └─ generateContractReminders
  │
  └─ On status=done → $inc user_settings.scanned_count
```

### ocrOnly mode

Triggered by `?ocrOnly=true` on the upload endpoint (used by the certificates section):

- Skips quota check — does not count against `scanned_count`
- Skips local file copy and S3 upload
- Runs OCR only — no AI extraction, no entity saving
- After processing completes, client calls `POST /api/profile/certificates/from-document` which uses regex patterns to extract certificate fields (`name`, `type`, `issuer`, `issued_date`, `expiry_date`) from the raw OCR text and saves a record to the `certificates` collection

---

## Document Quota System

```
user_settings collection per user:
  scanned_count   — persistent counter, $inc on processing_status=done, never decremented
  document_limit  — per-user override; falls back to USER_DOCUMENT_LIMIT env var

Upload flow (non-ocrOnly):
  remaining = document_limit - scanned_count
  if files.length > remaining → 403 document_limit_reached

GET /api/documents returns:
  totalAll      = scanned_count  (not live countDocuments)
  documentLimit = user's document_limit
```

Admins can override per-user limits via `PUT /api/admin/users/:id/document-limit`.

---

## Reminder Scheduling

```
generateContractReminders(contractId, clientId, documentId, expiryDate, userId)
  → reads reminder_advance_days from user_settings (default [30])
  → for each day N:
      triggerDate = expiryDate − N days
      skip if triggerDate ≤ today
      skip if reminder already exists (source_type + source_id + advance_days)
      insert reminder with status=pending

Background scheduler (every REMINDER_CHECK_INTERVAL_MS, default 60s)
  → find reminders: status=pending AND trigger_date ≤ today
  → skip if already in email_log (success=1)
  → enrich with client + document context
  → sendReminderEmail() via Nodemailer
  → log to email_log
  → mark status=sent  (or status=error on failure)
```

`reminder_advance_days` is stored per-user in `user_settings` as a JSON array string (e.g. `"[30]"`). Users can configure it from the Profile → Settings section. The global `reminderAdvanceDays` in settings is a fallback only.

---

## S3 Storage

The server supports three S3 variable sets in priority order:

1. **`S3_*`** — Railway Bucket (virtual-hosted style, `forcePathStyle: false`)
2. **`ENDPOINT` / `BUCKET` / `ACCESS_KEY_ID` / `SECRET_ACCESS_KEY`** — generic providers like storageapi.dev (path-style auto-detected)
3. **`DO_SPACES_*`** — legacy DigitalOcean Spaces

When `spacesEnabled()` returns true and `PROCESS_ONLY=false` and `ocrOnly=false`, documents are uploaded after local copy. Download links use presigned URLs (1-hour expiry) via `GET /api/documents/:id/download`.

Test S3 connectivity:
```bash
node --env-file=.env test_s3.mjs
```

---

## Settings Architecture

All configuration is read from environment variables at startup — **no `settings.json` file**. `loadSettings()` is called once in `main()` and cached. `saveSettings()` is a no-op kept for API compatibility.

Key env var priority rules:
- `OPENAI_LOCAL_API_KEY` wins over `OPENAI_API_KEY` (prevents Windows system env var collision)
- S3 config: `S3_*` > `ENDPOINT/*` > `DO_SPACES_*`
- Per-user `user_settings.document_limit` overrides `USER_DOCUMENT_LIMIT` env var
- Per-user `user_settings.reminder_advance_days` overrides global `reminderAdvanceDays`

---

## Roles

| Role | Access |
|------|--------|
| `user` | Own documents, clients, contracts, reminders, equipment, tasks; subject to `document_limit` quota |
| `pro` | Same as `user` (reserved for future plan features) |
| `admin` | Everything + `/settings` page + User Management table in Profile; no quota limit |

Enforced server-side by `requireRole(ctx, minRole)` in `auth/middleware.ts`.
Enforced client-side by router guard (`meta.requireRole`) and nav filtering.

---

## MongoDB Collections

| Collection | Purpose | Key unique indexes |
|-----------|---------|-------------------|
| `users` | Auth accounts | `email`, `google_sub` |
| `sessions` | Active sessions (TTL) | `expires_at` (TTL index) |
| `oauth_states` | PKCE state (10-min TTL) | `expires_at` (TTL index) |
| `user_settings` | Per-user preferences + quota counters | `user_id` |
| `documents` | File records | `(user_id, file_hash)` compound unique |
| `document_clients` | Document ↔ Client join | `(document_id, client_id)` |
| `clients` | Contact records | — |
| `contracts` | Contract/inspection records | `document_id` (sparse) |
| `reminders` | Scheduled email alerts | — |
| `tasks` | Action items | — |
| `extractions` | Raw AI output (audit log) | — |
| `timeline_events` | Per-client event history | — |
| `email_log` | Sent email audit log | — |
| `equipment` | Equipment catalog | `serial_number` (sparse) |
| `doc_templates` | AI extraction templates | `name` |
| `email_templates` | HTML email designs | `name` |
| `engineer_profiles` | Per-user engineer details | `user_id` |
| `certificates` | Engineer certificates (with optional `document_id`) | — |
| `notifications` | In-app notifications | — |

---

## Tests

```bash
cd server && npm test       # vitest run
```

| File | Coverage |
|------|---------|
| `roles.test.ts` | `requireRole`, `requireAdmin`, role hierarchy |
| `profile.test.ts` | User-settings upsert, stats query shapes |
| `renderEmail.test.ts` | HTML template `{{var}}` substitution |
| `keyScanner.test.ts` | Credential key detection in extracted text |
| `emailAuth.test.ts` | bcrypt hashing and verification |

Test S3 end-to-end:
```bash
node --env-file=.env test_s3.mjs           # S3 connectivity (upload/get/delete/presign)
node --env-file=.env test_upload_s3.mjs    # Full pipeline: upload → OCR → S3 verify
```

---

## Deployment

See [`deploy/README.md`](deploy/README.md) for the full step-by-step guide. Summary:

1. Deploy `server/` to **Railway** → link a Railway Bucket → set env vars via Variable References (`${{Bucket.ENDPOINT}}` etc.) → copy the generated domain
2. Set `VITE_API_BASE=<railway-domain>` in `client/.env.production`
3. Deploy `client/` to **Vercel** → set `VITE_API_BASE` and `VITE_GOOGLE_CLIENT_ID` in Vercel dashboard
4. In Google Cloud Console → OAuth client → add the production domains to Authorized Origins and Redirect URIs

---

## Development Scripts

```bash
# Server
cd server
npm run dev          # tsx watch — hot reload
npm run build        # tsc --noEmit (type check only)
npm test             # vitest run
npm run test:watch   # vitest watch

# Client
cd client
npm run dev          # Vite dev server on :5173
npm run build        # Production bundle → client/dist/
```

---

## License

Private — all rights reserved.
