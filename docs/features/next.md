# Plan: Hebrew Document Intelligence + Client Reminder Platform

> **Phase 2 — Multi-user with Google OAuth (added 2026-05-18)**
> See section **"Phase 2 — Multi-user Authentication"** at the bottom for the new plan.
> Original Phase 1 plan is preserved below for context.

## Context

Building a brand-new local-first app at `E:\Projects\Reminder` that scans Hebrew-language documents (PDFs, images, Office docs), extracts structured data (client names, contract dates, expiry dates, tasks) using OCR + AI, stores everything in SQLite, and sends scheduled reminder emails before contract/document expiry dates. The app is a **Bun HTTP server + browser UI** (not Electrobun) — simpler to build and debug. Architecture patterns (RPC, SQLite, settings, Pinia stores) are borrowed directly from the proven TraceM project at `E:\Projects\TraceM`.

Phase 1 goal: **full working core** — project scaffold, document import pipeline (PDF + OCR), AI extraction, SQLite storage, reminder scheduler, and SMTP email sending. UI is a minimal Vue 3 web app served by Bun.

---

## Stack

| Layer | Choice |
|---|---|
| Runtime | Bun.js |
| Backend | Bun HTTP server (`Bun.serve`) + WebSocket for push events |
| Frontend | Vue 3 + Pinia + Naive UI, served statically by Bun |
| Database | SQLite via `bun:sqlite` |
| PDF text | `pdf-parse` |
| OCR (images / scanned PDFs) | `tesseract.js` with `heb+eng` traineddata |
| DOCX | `mammoth` |
| XLSX | `xlsx` (SheetJS) |
| AI extraction | OpenAI API (`openai` npm) — default `gpt-4o-mini`; Ollama as fallback |
| Hebrew calendar | `@hebcal/core` |
| Email | `nodemailer` (SMTP) |
| Date formatting | `date-fns` + `date-fns/locale/he` |
| Build / dev | Vite (frontend) + `bun run` (backend) |

---

## Folder Structure

```
E:\Projects\Reminder\
├── package.json
├── bunfig.toml
├── vite.config.ts
├── tsconfig.json
├── .env.example
│
├── src/
│   ├── shared/
│   │   ├── types.ts             ← Document, Client, Contract, Reminder, Task, etc.
│   │   └── api-schema.ts        ← REST endpoint + WebSocket message type contracts
│   │
│   ├── server/                  ← Bun backend
│   │   ├── index.ts             ← Bun.serve, route registration, DB init, scheduler start
│   │   ├── db/
│   │   │   ├── schema.ts        ← CREATE TABLE statements
│   │   │   └── db.ts            ← singleton getDb(), WAL pragma
│   │   ├── pipeline/
│   │   │   ├── importer.ts      ← orchestrates full import for one file
│   │   │   ├── pdfParser.ts     ← pdf-parse wrapper, Hebrew text detection
│   │   │   ├── ocrParser.ts     ← tesseract.js wrapper (heb+eng)
│   │   │   ├── docxParser.ts    ← mammoth wrapper
│   │   │   ├── xlsxParser.ts    ← SheetJS wrapper
│   │   │   ├── extractor.ts     ← AI structured extraction (OpenAI / Ollama)
│   │   │   ├── chunker.ts       ← text chunking for FTS indexing
│   │   │   └── dateNormalizer.ts← Hebrew date → ISO8601 via @hebcal/core
│   │   ├── reminders/
│   │   │   ├── scheduler.ts     ← setInterval checkReminders(), generateContractReminders()
│   │   │   └── emailSender.ts   ← nodemailer, RTL HTML template
│   │   ├── routes/
│   │   │   ├── documents.ts     ← GET/POST /api/documents, POST /api/documents/import
│   │   │   ├── clients.ts       ← CRUD /api/clients
│   │   │   ├── contracts.ts     ← CRUD /api/contracts
│   │   │   ├── reminders.ts     ← CRUD + /send-now /snooze /dismiss
│   │   │   ├── tasks.ts         ← CRUD /api/tasks
│   │   │   ├── search.ts        ← GET /api/search?q=
│   │   │   ├── email.ts         ← GET /api/email-log, POST /api/email/test
│   │   │   ├── settings.ts      ← GET/POST /api/settings
│   │   │   └── dashboard.ts     ← GET /api/dashboard/stats
│   │   └── search/
│   │       └── ftsSearch.ts     ← FTS5 query builder, snippet extraction
│   │
│   └── client/                  ← Vue 3 frontend
│       ├── main.ts
│       ├── App.vue              ← sidebar nav + <router-view>
│       ├── router/index.ts
│       ├── api/
│       │   └── apiService.ts    ← fetch() wrappers for all REST endpoints + WS client
│       ├── stores/
│       │   ├── settings.ts
│       │   ├── documents.ts
│       │   ├── clients.ts
│       │   ├── contracts.ts
│       │   ├── reminders.ts
│       │   ├── tasks.ts
│       │   └── dashboard.ts
│       ├── composables/
│       │   ├── useRtl.ts        ← dir="rtl" helpers for Hebrew text
│       │   └── useFileImport.ts ← drag-drop + file picker
│       ├── views/
│       │   ├── DashboardPage.vue
│       │   ├── DocumentsPage.vue
│       │   ├── DocumentDetailPage.vue
│       │   ├── ClientsPage.vue
│       │   ├── ClientDetailPage.vue
│       │   ├── ContractsPage.vue
│       │   ├── RemindersPage.vue
│       │   ├── SearchPage.vue
│       │   └── SettingsPage.vue
│       └── components/
│           ├── HebrewText.vue   ← dir="rtl" wrapper
│           ├── ExpiryBadge.vue  ← colored countdown badge
│           ├── StatusBadge.vue
│           └── DocumentCard.vue
│
└── data/                        ← created at runtime, gitignored
    ├── reminder.db
    ├── settings.json
    └── documents/               ← managed copies of imported files
```

---

## SQLite Schema (src/server/db/schema.ts)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name         TEXT NOT NULL,
  file_path         TEXT NOT NULL,
  original_path     TEXT,
  file_hash         TEXT NOT NULL UNIQUE,     -- SHA-256, dedup key
  mime_type         TEXT NOT NULL,
  file_size_bytes   INTEGER NOT NULL,
  import_date       TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'queued', -- queued|processing|done|error
  error_message     TEXT,
  raw_text          TEXT,
  language          TEXT DEFAULT 'he',
  page_count        INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name  TEXT NOT NULL,
  entity_type   TEXT NOT NULL DEFAULT 'person', -- person|company
  id_number     TEXT,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  notes         TEXT,
  tags          TEXT,    -- JSON array
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_clients (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role        TEXT,
  PRIMARY KEY (document_id, client_id)
);

CREATE TABLE IF NOT EXISTS contracts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  client_id       INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  contract_number TEXT,
  contract_type   TEXT,
  start_date      TEXT,
  expiry_date     TEXT,      -- ISO8601 — drives reminders
  amount          REAL,
  currency        TEXT DEFAULT 'ILS',
  counterparty    TEXT,
  summary         TEXT,      -- Hebrew one-line AI summary
  confidence      TEXT DEFAULT 'medium',
  status          TEXT DEFAULT 'active', -- active|expired|cancelled|renewed
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type   TEXT NOT NULL,  -- contract_expiry|task|manual
  source_id     INTEGER,
  client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  document_id   INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  trigger_date  TEXT NOT NULL,  -- ISO8601 date when email fires
  advance_days  INTEGER DEFAULT 30,
  title         TEXT NOT NULL,
  body          TEXT,
  email_to      TEXT,           -- JSON array of addresses
  status        TEXT NOT NULL DEFAULT 'pending', -- pending|sent|snoozed|dismissed|error
  snoozed_until TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  client_id   INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  due_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'open', -- open|done|cancelled
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS extractions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  backend     TEXT NOT NULL,
  model       TEXT NOT NULL,
  result_json TEXT NOT NULL,
  parsed_ok   INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  exec_ms     INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reminder_id INTEGER REFERENCES reminders(id) ON DELETE SET NULL,
  to_address  TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body_html   TEXT,
  sent_at     TEXT NOT NULL,
  success     INTEGER NOT NULL DEFAULT 1,
  error       TEXT,
  smtp_host   TEXT
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL, -- document_added|contract_signed|email_sent|reminder_fired|note
  title       TEXT NOT NULL,
  description TEXT,
  event_date  TEXT NOT NULL,
  source_id   INTEGER,
  source_type TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- FTS5 for full-text search over Hebrew document text
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  raw_text,
  content='documents',
  content_rowid='id',
  tokenize='unicode61'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_doc_status       ON documents (processing_status);
CREATE INDEX IF NOT EXISTS idx_doc_hash         ON documents (file_hash);
CREATE INDEX IF NOT EXISTS idx_contract_expiry  ON contracts (expiry_date);
CREATE INDEX IF NOT EXISTS idx_contract_status  ON contracts (status);
CREATE INDEX IF NOT EXISTS idx_reminder_trigger ON reminders (trigger_date);
CREATE INDEX IF NOT EXISTS idx_reminder_status  ON reminders (status);
CREATE INDEX IF NOT EXISTS idx_task_due         ON tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_timeline_client  ON timeline_events (client_id, event_date DESC);
```

---

## Settings Schema (data/settings.json)

```typescript
interface AppSettings {
  theme: "dark" | "light";
  port: number;                    // default: 3737

  // AI
  aiBackend: "openai" | "ollama";
  openAiKey: string;
  openAiModel: string;             // default: "gpt-4o-mini"
  ollamaUrl: string;               // default: "http://localhost:11434"
  ollamaModel: string;             // default: "llama3.1"

  // OCR
  ocrLanguage: string;             // default: "heb+eng"
  autoExtract: boolean;            // default: true
  extractionMaxChars: number;      // default: 8000

  // SMTP
  smtpHost: string;
  smtpPort: number;                // default: 587
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  emailFrom: string;
  emailFromName: string;

  // Reminders
  reminderEnabled: boolean;        // default: true
  reminderAdvanceDays: number[];   // default: [90, 60, 30]
  reminderCheckIntervalMs: number; // default: 60000

  // Watch folder (optional)
  watchFolderEnabled: boolean;
  watchFolder: string;
}
```

---

## Document Processing Pipeline

```
User drops file / picks file / watch folder detects file
        ↓
importer.ts: importFile(filePath)
  1. Compute SHA-256 hash → check documents table for duplicate → skip if exists
  2. Copy file to data/documents/{hash}.{ext}
  3. INSERT INTO documents (status='queued')
  4. Detect MIME type by extension
  5. Extract raw text:
       PDF       → pdfParser.ts (pdf-parse)
                   If text contains <10% Hebrew chars → fallback to ocrParser.ts
       JPG/PNG   → ocrParser.ts (tesseract.js, heb+eng)
       DOCX      → docxParser.ts (mammoth)
       XLSX      → xlsxParser.ts (SheetJS)
       TXT/MD    → Bun.file().text()
  6. UPDATE documents SET raw_text, processing_status='processing'
  7. Push WS event: { type: 'document:progress', documentId, stage: 'extracted' }
  8. extractor.ts: send raw_text to AI → parse JSON result
  9. INSERT INTO extractions
 10. Denormalize AI result:
       → INSERT/UPSERT INTO clients (if new client detected)
       → INSERT INTO document_clients
       → INSERT INTO contracts (with expiry_date)
       → INSERT INTO tasks (for each extracted task)
       → generateContractReminders(contractId) ← auto-create reminder rows
11. INSERT INTO documents_fts (FTS index)
12. UPDATE documents SET processing_status='done'
13. Push WS event: { type: 'document:done', documentId }
```

---

## Reminder Engine (src/server/reminders/scheduler.ts)

```
On startup:
  setInterval(checkReminders, settings.reminderCheckIntervalMs)  // default 60s

checkReminders():
  SELECT * FROM reminders
  WHERE status = 'pending'
    AND trigger_date <= date('now')
    AND id NOT IN (SELECT reminder_id FROM email_log WHERE success = 1)

  For each reminder:
    - Load client + contract context
    - Build RTL HTML email (dir="rtl", lang="he")
    - Send via nodemailer
    - SUCCESS → UPDATE status='sent', INSERT email_log, INSERT timeline_events
    - FAILURE → INSERT email_log (success=0)
               After 3 fails → UPDATE status='error', push WS error event

generateContractReminders(contractId):
  For each days in settings.reminderAdvanceDays [90, 60, 30]:
    triggerDate = contract.expiry_date - days
    If triggerDate > today AND no existing (source_id, advance_days) reminder:
      INSERT INTO reminders (source_type='contract_expiry', ...)
```

---

## WebSocket Push Events (server → browser)

| Event type | Payload | Trigger |
|---|---|---|
| `document:queued` | `{ documentId, fileName }` | File accepted for processing |
| `document:progress` | `{ documentId, stage, progress }` | Each pipeline stage |
| `document:done` | `{ documentId, status }` | Processing complete or errored |
| `reminder:fired` | `{ reminderId, clientId, title }` | Email sent successfully |
| `reminder:error` | `{ reminderId, error }` | Email sending failed 3× |

---

## REST API Routes (src/server/routes/)

```
GET    /api/dashboard/stats
GET    /api/documents?status=&limit=&offset=
POST   /api/documents/import           body: { filePath }
GET    /api/documents/:id
DELETE /api/documents/:id
POST   /api/documents/:id/reprocess
GET    /api/search?q=

GET    /api/clients?q=&limit=&offset=
POST   /api/clients
GET    /api/clients/:id
PUT    /api/clients/:id
DELETE /api/clients/:id

GET    /api/contracts?clientId=&status=
PUT    /api/contracts/:id
DELETE /api/contracts/:id

GET    /api/reminders?status=&days=
POST   /api/reminders
PUT    /api/reminders/:id
POST   /api/reminders/:id/dismiss
POST   /api/reminders/:id/snooze      body: { until }
POST   /api/reminders/:id/send-now

GET    /api/tasks?status=&clientId=
PUT    /api/tasks/:id

GET    /api/email-log
POST   /api/email/test                body: { to }

GET    /api/settings
POST   /api/settings                  body: Partial<AppSettings>
```

---

## Key Libraries to Install

```bash
bun add pdf-parse tesseract.js mammoth xlsx openai nodemailer @hebcal/core date-fns
bun add -d typescript @types/node @types/nodemailer vite vue @vitejs/plugin-vue pinia naive-ui vue-router
```

---

## Phase 1 Implementation Order

1. **Project init**: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `.env.example`
2. **DB layer**: `src/server/db/schema.ts` + `src/server/db/db.ts`
3. **Settings**: load/save `data/settings.json` with defaults
4. **Bun server**: `src/server/index.ts` — `Bun.serve()`, static file serving, WebSocket, route registration
5. **Pipeline**: `pdfParser` → `ocrParser` → `docxParser` → `xlsxParser` → `extractor` → `importer`
6. **Reminders**: `scheduler.ts` + `emailSender.ts`
7. **Routes**: all REST handlers
8. **Vue frontend**: scaffold → stores → views (Dashboard, Documents, Clients, Reminders, Settings)
9. **Verification**: import a Hebrew PDF, confirm extraction, confirm reminder rows created, send test email

---

## Verification

1. `bun run dev` — starts Vite + Bun server concurrently
2. Open `http://localhost:3737` in browser
3. Import a Hebrew PDF → document appears with `processing` → `done` status
4. Check Extractions tab on document detail → AI result JSON visible
5. Check Contracts page → expiry date populated
6. Check Reminders page → 3 reminder rows created (90/60/30 days before expiry)
7. Settings → SMTP → click "Send test email" → confirm receipt
8. Manually set a reminder's `trigger_date` to today → wait 60s → check email + email_log table


---
---

# Phase 2 — Multi-user Authentication (Google OAuth)

## Context

Phase 1 is shipped as a single-tenant app — every page is wide open, all data sits in one SQLite DB, the SMTP credentials and OpenAI key are global. We now want to:

1. Allow **multiple users** to log in independently with **Google OAuth**.
2. Isolate each user's data — documents, clients, contracts, reminders.
3. Decide whether to ship this as a **hosted web app** or as an **Electrobun desktop app** (with the same code).

The data isolation work is the same in both deployment targets; the auth flow and where SMTP/AI credentials live differ. This plan covers both, with a recommended path.

---

## Deployment decision — Web vs Electrobun

### Hosted web app (client + Bun server on a VPS)

**Pros:**
- One install — users just visit a URL; no per-machine setup
- Server-side scheduler runs 24/7 — reminder emails fire even if no user is logged in
- Auto updates: ship a new version once
- Cross-device: same data on phone, laptop, browser
- Centralised cost control for OpenAI/SMTP (one key, one bill)
- Easy backups (one SQLite file or migrate to Postgres on the server)
- Google OAuth redirect URIs are well-understood (registered HTTPS callback)
- Multi-user is **natural** — that's what servers are for

**Cons:**
- Need a host with HTTPS + a domain (Fly.io, Railway, Hetzner ≈ $5–10/mo)
- You become responsible for uptime, security patches, backups
- Documents leave the user's machine — confidentiality concern for sensitive PDFs
- More attack surface (need rate limiting, abuse prevention, secret rotation)
- WebSocket scheduler in Bun is single-process — vertical scaling only until you add a queue

### Electrobun desktop (single-user wrapper around the same code)

**Pros:**
- Files never leave the user's machine — strong privacy
- Zero hosting cost
- Trivial install — users get a `.msi` / `.dmg`
- Bun server runs locally — same code as today, just wrapped
- Per-user AI/SMTP keys (each install has its own `settings.json`)

**Cons:**
- **Multi-user inside one install makes no sense** — Electrobun is per-machine. Google login would just be an identity label, not real multi-tenancy.
- Reminder emails only fire while the app is running. If user closes the laptop, no email sends.
- Updates require rebuilding and re-shipping installers
- OAuth flow is harder — Google doesn't allow `http://localhost` redirects for installed apps without extra dance (PKCE + loopback redirect)
- Cross-device sync is impossible without a backend
- You'd still need a small "auth server" somewhere for the OAuth callback unless you use Google's installed-app flow (PKCE)

### Hybrid — server + optional Electrobun wrapper

Run the **same Bun server in the cloud** (multi-user, the real story) **plus** ship an Electrobun build whose window is just a wrapper around `https://yourapp.com`. Users who want a "desktop app" feel get it; the backend is shared. Cost: one extra build target. Most projects don't bother — a PWA install is usually enough.

### Recommendation

**Go hosted web app** for Phase 2. Multi-user is only meaningful with a shared backend, and the scheduler MUST run when users aren't around. If desktop look-and-feel becomes important later, add a thin Electrobun wrapper that points at the hosted URL — that's a 1-day job, not a redesign.

---

## High-level architecture

```
                    Google
                       ▲
                       │ OAuth 2.0 (Authorization Code + PKCE)
                       │
        ┌──────────────┼───────────────┐
        │              │               │
   Browser /        Bun server      SQLite
   Electrobun     (Bun.serve)        ↓
   (Vue 3)       ┌─────────┐    ┌──────────┐
   ───────────►  │ /auth/* │    │  users   │
   Authenticated │ +middl. │    │ sessions │
   API calls     │ + ws    │    │ everything
                 └─────────┘    │  ↳ user_id FK
                                └──────────┘
```

**Auth flow** (Authorization Code with PKCE — works for both web and Electrobun later):

1. User clicks "Sign in with Google" in the Vue app
2. Frontend redirects to `GET /auth/google` (server)
3. Server generates `state` + `code_verifier`, stashes in a short-lived cookie, redirects to Google
4. Google redirects to `GET /auth/google/callback?code=...&state=...`
5. Server exchanges code for ID token, verifies it, looks up or creates a row in `users`, then issues an **HTTP-only signed session cookie**
6. Subsequent API calls read the cookie, middleware looks up the user, attaches `userId` to the request, every DB query filters by it
7. Logout: `POST /auth/logout` clears the cookie, server deletes the session row

We use **session cookies** rather than JWT-in-localStorage because:
- httpOnly cookies aren't readable by JS → XSS-safe
- We can revoke server-side instantly (delete the `sessions` row)
- No refresh-token dance needed
- Same-origin from `/api/*` → no CORS pain

---

## Access policy (recommended default)

**Allowlist** of email addresses or domains. Open signup is risky for a personal/small-team tool and exposes you to abuse + OpenAI/SMTP cost runaway.

Implementation: a simple `allowed_emails` array in settings.json (or a DB table). After Google verifies the user, the server checks the email against the allowlist before issuing a session.

The other modes (open signup, invitation-only) are easy upgrades from the same foundation.

---

## What is per-user vs shared

| Resource | Per-user / Shared | Rationale |
|---|---|---|
| `documents` rows + the `data/documents/*.pdf` files | **Per-user** | Confidentiality. File path becomes `data/users/{userId}/documents/{hash}.pdf` |
| `clients`, `contracts`, `reminders`, `tasks`, `extractions`, `email_log`, `timeline_events` | **Per-user** | All scoped via `user_id` FK + indexed |
| `documents_fts` (FTS5 virtual table) | **Per-user via parent filter** | FTS doesn't get a user_id column directly — we join via `documents.user_id` in the search query |
| OpenAI API key | **Shared (admin-set)** | Cost control. One key, one bill. Lives in `settings.json` |
| SMTP creds | **Shared (admin-set)** | Same reasoning. All reminder emails go through one sender |
| `emailFromName`, reminder interval, reminder advance days, theme | **Per-user** | UX preference. New table `user_settings(user_id PK, ...)`  |
| `watchFolder` | **Removed (web has no filesystem)** | Web users upload via browser. Electrobun wrapper can re-enable it later |
| Theme | **Per-user** | Already in settings — move to `user_settings` |

---

## Database changes

Use the existing `addColumnIfMissing()` migration helper in [src/server/db/schema.ts](src/server/db/schema.ts:190) — it's idempotent.

### New tables

```sql
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub      TEXT NOT NULL UNIQUE,    -- Google's stable user id (the "sub" claim)
  email           TEXT NOT NULL UNIQUE,
  name            TEXT,
  picture_url     TEXT,                    -- Google avatar
  role            TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,        -- random 32-byte hex, stored in cookie
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at      TEXT NOT NULL,
  user_agent      TEXT,
  ip              TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp  ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme                TEXT DEFAULT 'light',
  email_from_name      TEXT,
  reminder_advance_days TEXT DEFAULT '[90,60,30]',  -- JSON array
  ocr_language         TEXT DEFAULT 'heb+eng'
);
```

### Backfill existing tables with `user_id`

Use `addColumnIfMissing(db, table, 'user_id', 'INTEGER REFERENCES users(id) ON DELETE CASCADE')` on:
`documents`, `clients`, `contracts`, `reminders`, `tasks`, `extractions`, `email_log`, `timeline_events`

Then a **one-time migration** on first boot:
- If `users` is empty, create user `id=1` from the email in `settings.json` (admin allowlist must contain this email)
- `UPDATE documents SET user_id = 1 WHERE user_id IS NULL` — same for every table

Add covering indexes: `CREATE INDEX IF NOT EXISTS idx_<table>_user ON <table>(user_id)` for the 6 high-traffic tables.

---

## Server-side changes

### New files

| Path | Purpose |
|---|---|
| `src/server/auth/google.ts` | OAuth handshake: generate state+verifier, build Google URL, exchange code, verify ID token |
| `src/server/auth/session.ts` | Issue/parse/revoke session cookies; in-memory + DB session store |
| `src/server/auth/middleware.ts` | `requireAuth(req)` → returns `{ userId, user }` or throws 401 |
| `src/server/routes/auth.ts` | Routes: `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/logout`, `GET /auth/me` |
| `src/server/db/migrate.ts` | One-time backfill migration described above |

### Modified files

| Path | Change |
|---|---|
| [src/server/index.ts](src/server/index.ts:33) | Add cookie-parsing helper. The route Handler signature gains a `context: { userId: number }` param. Public routes (`/auth/*`, health) are listed in an `OPEN_ROUTES` set; everything else goes through `requireAuth()`. |
| [src/server/db/schema.ts](src/server/db/schema.ts) | Add the 3 new tables. Add `addColumnIfMissing` calls for `user_id` on the 8 existing tables. New indexes. |
| [src/server/settings.ts](src/server/settings.ts) | Add `googleClientId`, `googleClientSecret`, `googleRedirectUri`, `sessionSecret`, `allowedEmails: string[]`. Keep `openAiKey` and `smtpPass` global. |
| All 8 route files under [src/server/routes/](src/server/routes/) | Every SELECT gains `WHERE user_id = ?`. Every INSERT sets `user_id = context.userId`. Every UPDATE/DELETE adds `AND user_id = ?` so user A can't touch user B's rows even by guessing IDs. |
| [src/server/routes/settings.ts](src/server/routes/settings.ts) | Split into "global admin settings" (admin role only) and "user settings" (per-user from `user_settings` table) |
| [src/server/pipeline/importer.ts](src/server/pipeline/importer.ts) | Take `userId` param. Save uploads under `data/users/{userId}/uploads/`. Stamp `user_id` on every INSERT. Pass `userId` into `saveExtractionEntities()`. |
| [src/server/reminders/scheduler.ts](src/server/reminders/scheduler.ts) | The 60-second tick still runs once globally. `generateContractReminders()` takes `userId` (passed through from importer). The SELECT for due reminders joins to `users` to skip rows where `users.is_active = 0`. |
| [src/server/reminders/emailSender.ts](src/server/reminders/emailSender.ts) | No SMTP change needed — still global creds. The `From` name comes from per-user `user_settings.email_from_name` falling back to global `emailFromName`. |
| [src/server/index.ts](src/server/index.ts:22) WebSocket | On `open`, parse the session cookie from the upgrade request, attach `userId` to `ws.data`. `broadcast()` becomes `broadcastTo(userId, event)` and only sends to sockets matching that user. |

### Hardening

- Session cookie: `httpOnly`, `secure` (in production), `sameSite=lax`, `maxAge=7d`, signed with `sessionSecret` (HMAC-SHA256)
- Sessions in DB so server-side revocation is possible (e.g. password reset, admin disables a user)
- CSRF: `sameSite=lax` covers most cases. For state-changing POSTs from cross-origin, add a double-submit cookie token.
- Rate limit `/auth/*` (e.g. 10 attempts/min/IP) — simple in-memory leaky bucket is enough at this scale
- Audit log: every login writes to `users.last_login_at`; failed allowlist checks log a warning

---

## Frontend-side changes

### New files

| Path | Purpose |
|---|---|
| `src/client/views/LoginPage.vue` | Centered "Sign in with Google" button. If `?error=not_allowed` show a friendly message |
| `src/client/stores/auth.ts` | Pinia store: `user`, `loading`, `loginWithGoogle()`, `logout()`, `fetchMe()` |
| `src/client/composables/useAuthGuard.ts` | Router beforeEach guard — calls `auth.fetchMe()` once, redirects to `/login` if 401 |

### Modified files

| Path | Change |
|---|---|
| [src/client/router/index.ts](src/client/router/index.ts) | Add `/login` route (public), wire the auth guard for everything else |
| [src/client/App.vue](src/client/App.vue) | Top bar shows logged-in user avatar + name + logout. Sidebar only renders when authenticated |
| [src/client/services/apiService.ts](src/client/services/apiService.ts) | All `fetch()` calls add `credentials: "include"` so the session cookie is sent. On 401, push the router to `/login` |
| [src/client/stores/settings.ts](src/client/stores/settings.ts) | Split into `useUserSettingsStore` (per-user) and `useAdminSettingsStore` (admin-only — shown only when `auth.user.role === 'admin'`) |
| [src/client/views/SettingsPage.vue](src/client/views/SettingsPage.vue) | Two sections: "Personal" (theme, reminder defaults) and "System (admin)" (SMTP, OpenAI key). Hide the system section for non-admins. |

---

## Dependencies to add

```bash
bun add jose                 # JWT/JWS for verifying Google ID tokens (or use google-auth-library)
bun add cookie               # parse/serialize the Set-Cookie header
```

No need for `passport`, `next-auth`, or `oauth2-server` — the Google authorization-code flow is ~80 lines of fetch + crypto, and Bun has `crypto.randomBytes` and Web Crypto built in.

---

## Critical files to read before implementing

- [src/server/index.ts](src/server/index.ts) lines 23–146 — router, WebSocket, request dispatch (this is where middleware injection happens)
- [src/server/db/schema.ts](src/server/db/schema.ts) lines 7–195 — full schema + the existing `addColumnIfMissing()` helper (lines 190–195) that we'll reuse for `user_id` migrations
- [src/server/settings.ts](src/server/settings.ts) — the current global settings shape; we'll split it
- All 8 files in [src/server/routes/](src/server/routes/) — every SELECT/INSERT/UPDATE/DELETE needs `user_id` injection. The repetitive scope-injection is the bulk of the work
- [src/server/pipeline/importer.ts](src/server/pipeline/importer.ts) lines 174–317 — `saveExtractionEntities()` writes to 6 tables; all need `userId`
- [src/server/reminders/scheduler.ts](src/server/reminders/scheduler.ts) — the 60s scheduler doesn't need a session, but the due-reminders SELECT must skip inactive users

---

## Implementation order

1. **Day 1 — DB & migrations**: Add `users`, `sessions`, `user_settings` tables. Add `user_id` columns to all 8 tables with `addColumnIfMissing`. Write the backfill migration. Add covering indexes. Boot the server → verify schema in SQLite browser.
2. **Day 2 — Auth handshake**: Google Cloud project, OAuth client (Web app), set redirect URI to `http://localhost:3737/auth/google/callback`. Implement `routes/auth.ts` + `auth/google.ts` + `auth/session.ts`. Add allowlist check. Test the flow manually with curl.
3. **Day 3 — Middleware + route scope**: Add `requireAuth` middleware to the router. Update every route handler under `routes/` to filter by `userId` from context. Verify with two browser sessions that user A can't see user B's data.
4. **Day 4 — Frontend**: Login page, auth store, guard, top bar update. Verify login → dashboard → logout works.
5. **Day 5 — Per-user settings, WebSocket, polish**: Split settings UI. Filter WS by user. Add admin role gate. Manual end-to-end test.
6. **Day 6 — Deploy** (when ready): Fly.io or Railway. Set HTTPS callback. Move SQLite to a volume. Smoke test.

---

## Verification

### Local (single-developer)

1. Create a Google Cloud project, OAuth 2.0 Client ID (Web), add `http://localhost:3737/auth/google/callback` to redirect URIs, drop `clientId/clientSecret` into `data/settings.json`.
2. Add your email to `allowedEmails`. First user logged in becomes `role = 'admin'` automatically.
3. `bun run dev` → visit `http://localhost:5173` → redirected to `/login` → "Sign in with Google" → consent → land on dashboard.
4. Sign out → see login page again.
5. Open an incognito window, log in with a second allowlisted Gmail → verify it sees zero documents/clients/reminders. Upload a PDF. Switch back to first browser — still zero docs in user A's view.
6. Delete user B's document via API call to `/api/documents/{userA_doc_id}` while logged in as B → expect 404 (not 403, to avoid leaking IDs).
7. Reminder scheduler: create a `trigger_date = today` reminder for user A. Wait 60s. Confirm email lands and `email_log` row has correct `user_id`.
8. Try logging in with a non-allowlisted Gmail → redirected to `/login?error=not_allowed`.

### Hosted

9. Deploy to Fly.io/Railway with HTTPS. Update Google OAuth redirect URI to the production URL.
10. Two real users sign in from different devices, confirm isolation.
11. Stop watching the app for 24 hours. Verify a reminder due tomorrow fires next day (server scheduler runs without user activity).

---

## Out of scope (deferred)

- Teams/workspaces (shared data between users)
- Per-user OpenAI/SMTP credentials (would need encrypted storage)
- Self-serve signup with email verification (we have allowlist)
- 2FA on top of Google (Google already handles MFA)
- Audit log UI (admin sees all `email_log` rows but no failed-login UI)
- Electrobun build (recommended only after the web flow is proven)