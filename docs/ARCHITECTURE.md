# Architecture

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser                                                            │
│  Vue 3 SPA (Vercel)                                                 │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌────────────────────┐  │
│  │ Auth     │ │ Documents │ │ Clients /  │ │ Settings /         │  │
│  │ Login    │ │ Upload    │ │ Contracts  │ │ Profile (admin)    │  │
│  │ Profile  │ │ Detail    │ │ Reminders  │ │ Admin users table  │  │
│  └──────────┘ └───────────┘ └────────────┘ └────────────────────┘  │
│                  Pinia stores · Vue Router (hash history)           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS  (VITE_API_BASE)
                               │ HTTP-only session cookie (sid)
                               │ WebSocket (/ws)
┌──────────────────────────────▼──────────────────────────────────────┐
│  Express server (Railway — Node.js 23+)                             │
│                                                                     │
│  Middleware stack                                                   │
│  cors → express.json → cookie-parser → routes                      │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Auth layer (auth/middleware.ts)                            │   │
│  │  requireAuth(cookie) → session lookup → AuthContext         │   │
│  │  requireRole(ctx, minRole) → 403 if rank insufficient       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Routes (13 files, all user-scoped)                                 │
│  /api/documents  /api/clients   /api/contracts  /api/reminders      │
│  /api/tasks      /api/equipment /api/search     /api/templates      │
│  /api/dashboard  /api/settings  /api/user-settings                  │
│  /api/profile    /api/admin     /api/email                          │
│  /auth/google*   /api/auth/*                                        │
│                                                                     │
│  ┌─────────────────────┐   ┌────────────────────────────────────┐  │
│  │  Document pipeline  │   │  Reminder scheduler                │  │
│  │  importFile()       │   │  setInterval(60 s)                 │  │
│  │  processDocument()  │   │  find pending reminders            │  │
│  │  OCR / parse        │   │  sendReminderEmail()               │  │
│  │  AI extraction      │   │  log → email_log                   │  │
│  │  saveEntities()     │   │  mark sent / error                 │  │
│  └──────────┬──────────┘   └────────────────────────────────────┘  │
└─────────────┼───────────────────────────────────────────────────────┘
              │
   ┌──────────▼──────────┐   ┌─────────────────────────────────────┐
   │  MongoDB Atlas      │   │  DigitalOcean Spaces (optional)     │
   │  16 collections     │   │  documents/<hash>.<ext>             │
   │  TTL indexes for    │   │  presigned URLs (1-hour expiry)     │
   │  sessions, states   │   │  fallback: local disk data/docs/    │
   └─────────────────────┘   └─────────────────────────────────────┘
```

---

## Authentication Flow

### Google OAuth

```
User clicks "Sign in with Google"
  │
  ├─ GIS one-tap (POST /api/auth/google)
  │   └─ verify ID token → upsert user → create session → set sid cookie
  │
  └─ OAuth redirect flow (GET /auth/google)
      ├─ generate PKCE state → store in oauth_states (10-min TTL)
      ├─ redirect to Google consent screen
      └─ GET /auth/google/callback
          ├─ verify state (PKCE)
          ├─ exchange code for tokens
          ├─ fetch Google profile
          ├─ upsert user (google_sub, email, name, picture_url)
          ├─ create session → set sid cookie
          └─ redirect to /
```

### Email/Password

```
Register → hash password (bcrypt 12 rounds) → send verification email
  └─ GET /auth/verify-email?token=... → mark email_verified=true

Login → verify password → create session → set sid cookie

Forgot password → generate reset token → send email
  └─ POST /api/auth/reset-password { token, password } → update hash, expire token
```

### Session

Sessions are stored in the `sessions` MongoDB collection with a TTL index on `expires_at`. Each session record stores `user_id`, `user_agent`, and `ip`. The `sid` cookie is `httpOnly`, `sameSite: lax`, `secure: true` in production.

`requireAuth(cookieHeader)` extracts the session ID from the cookie, verifies it exists and hasn't expired, checks `is_active` on the user, and returns `AuthContext { userId, user }`.

---

## Document Pipeline

### Pipeline options (`PipelineOptions`)

Every entry point into the pipeline (`importFile`, `processDocument`, `POST /documents/:id/extract`) accepts a `PipelineOptions` object:

```typescript
interface PipelineOptions {
  ocr?: boolean;       // default true — run text extraction
  ai?: boolean;        // default true — run AI extraction
  s3?: boolean;        // default true — upload to object storage
  entities?: boolean;  // default true — save client/contract/reminder entities
  templateId?: number; // force a specific doc_template instead of auto-matching
}
```

Per-user defaults are read from `user_settings` (`pipeline_ocr`, `pipeline_ai`, `pipeline_s3`, `pipeline_entities`) at the start of each upload request.

### Ingestion (`importFile`)

1. Compute SHA-256 of the file — skip if hash already exists in `documents` for this user
2. Copy file to `data/documents/<hash>.<ext>` (managed path); delete the staging `uploads/` file immediately after copy
3. Upload to DigitalOcean Spaces / S3-compatible storage if `AWS_ACCESS_KEY_ID` is set and `opts.s3` is true; store `spaces_key` and `spaces_url`
4. Insert document record with `processing_status: "queued"`
5. Call `processDocument()` asynchronously (does not block the HTTP response)

### Processing (`processDocument`)

1. **Text extraction** (gated by `opts.ocr`) — select parser based on MIME type. Each path logs `[format] N chars: <preview>`:
   - PDF: `pdf-parse` → if fewer than 50 chars extracted, fall back to Tesseract OCR
   - Image: Tesseract OCR (language from `user_settings.ocr_language`, default `heb+eng`)
   - DOCX: Mammoth with embedded-image capture → if fewer than 50 chars, Tesseract OCR on each embedded page image (handles scanned DOCX)
   - XLSX: SheetJS → joined cell values
2. **Template matching** (`pickTemplate`) — check `doc_templates` for keyword matches in the raw text; overridden by `opts.templateId`
3. **AI extraction** (gated by `opts.ai && settings.autoExtract`):
   - Template match → `extractWithTemplate` — structured prompt with per-template field list
   - No match → `extractDocument` — generic extraction prompt returning `ExtractionResult`
4. **Save extraction** record to `extractions` (raw JSON for audit)
5. **Save entities** (gated by `opts.entities`) (`saveTemplateEntities` / `saveExtractionEntities`):
   - `findOrCreateClient` — 4-level dedup (see below)
   - Upsert contract (keyed on `document_id`)
   - Insert tasks
   - Upsert equipment (keyed on `serial_number` or `name`)
   - `generateContractReminders` — one reminder per advance day
6. **Quota increment** — `scanned_count` in `user_settings` is incremented only when AI extraction ran successfully (not on OCR-only or entity-save-only paths)

### On-demand extraction (`POST /api/documents/:id/extract`)

Wipes previous extraction data (extractions, tasks, contracts, reminders, document_clients, timeline_events), then runs:
- `fields[]` supplied → build transient `DocTemplate` inline, call `extractWithTemplate`
- `templateId` supplied → look up saved template, call `extractWithTemplate`
- Neither → call `extractDocument` (generic)

`scanned_count` is incremented after successful extraction.

### Client Deduplication (`findOrCreateClient`)

Four checks in priority order, all scoped to `user_id`:

| Priority | Match strategy |
|----------|---------------|
| 1 | Exact `id_number` match |
| 2 | Phone number after stripping spaces and dashes |
| 3 | Case-insensitive exact `display_name` match |
| 4 | Normalised name: lower-case, strip `בע"מ`/`ltd`/`inc`/punctuation |

On match: merge any new fields (email, phone, address) into the existing record.  
On miss: insert new client.

---

## Data Isolation

Every user's data is completely isolated:

- All write operations stamp `user_id: ctx.userId` on the new document
- All read operations include `user_id: userId` in the MongoDB filter
- `findOrCreateClient` dedup searches are scoped to the caller's `user_id`
- The document pipeline receives `userId` through the call chain and stamps it on clients, contracts, equipment, reminders, and tasks
- Legacy documents without `user_id` are claimed by the first authenticated user who lists documents (`updateMany` on `user_id: { $exists: false }`)

---

## Role System

Roles form a numeric rank: `user=0`, `pro=1`, `admin=2`.

```typescript
// server/src/auth/middleware.ts
requireRole(ctx, "admin")   // throws 403 if rank < 2
requireRole(ctx, "pro")     // throws 403 if rank < 1
requireRole(ctx, "user")    // always passes (any logged-in user)
```

Server-side: `requireRole` called at the top of admin and settings route handlers.

Client-side:
- Router guard reads `meta.requireRole` and redirects to `/403` if rank is insufficient
- `primaryNav` in `App.vue` is a computed property that filters nav items by `item.minRole`

---

## Reminder Scheduler

`startScheduler()` is called once at server startup. It runs `checkReminders()` immediately and then on a configurable interval (default 60 seconds, stored in `AppSettings.reminderCheckIntervalMs`).

`checkReminders()`:
1. Loads IDs of reminders that already have a successful `email_log` entry (idempotency check)
2. Queries `reminders` where `status=pending AND trigger_date ≤ today`
3. Skips already-sent IDs
4. Enriches with client and document context
5. Calls `sendReminderEmail()` → Nodemailer → SMTP

Failure handling:
- On success: `status=sent`, insert `email_log { success: 1 }`
- On failure: insert `email_log { success: 0 }`, log warning
- After 3 consecutive failures: `status=error`

`generateContractReminders(contractId, clientId, documentId, expiryDate, userId)`:
- Reads `settings.reminderAdvanceDays` (default `[90, 60, 30]`)
- For each N: compute `triggerDate = expiryDate − N days`
- Skips if `triggerDate ≤ today` (already past)
- Skips if a non-dismissed reminder for `(source_type=contract_expiry, source_id=contractId, advance_days=N)` already exists
- Inserts reminder with `user_id`, `status=pending`

---

## Email Templates

Templates are stored in the `email_templates` collection as HTML with `{{variable}}` placeholders.

## Print Templates

Print templates are stored in `print_templates`; filled drafts are stored in `print_template_drafts`.

`print_template_drafts` connects the manual תסקיר flow to real entities:

- `data` stores renderable field values.
- `meta` stores non-render linkage data such as `source`, `client_id`, and `equipment_ids`.
- `client_id` is copied to a top-level field for efficient lookup and contract creation.
- `contract_id` is written after the compose page creates a contract from the draft.

The compose flow creates contracts through `POST /api/contracts` with `client_id` from the draft metadata, so generated reminders and client views remain linked to the selected client.

See [INSPECTION_TEMPLATE_FLOW.md](./INSPECTION_TEMPLATE_FLOW.md) for the full user flow, API contract, and DB notes.

Built-in templates (seeded on first run):
- `inspection-reminder` — תסקיר expiry reminder
- `contract-reminder` — contract expiry reminder
- `invoice-reminder` — invoice due reminder

`renderEmail(template, context)` substitutes all `{{key}}` occurrences with values from the context object. Context is built from the reminder + client + document records.

---

## File Storage

| Mode | Condition | Behaviour |
|------|-----------|-----------|
| Local | `AWS_ACCESS_KEY_ID` not set | Files stored at `data/documents/<hash>.<ext>` |
| Spaces | `AWS_ACCESS_KEY_ID` set | Files uploaded to `<bucket>/documents/<hash>.<ext>` via `@aws-sdk/client-s3`; `spaces_url` stored on document record |

Spaces URLs are public or pre-signed (1-hour expiry) depending on bucket ACL. The `spaces_key` is used to regenerate URLs without re-uploading.

---

## MongoDB Index Strategy

Key indexes that drive query performance:

| Collection | Index | Reason |
|-----------|-------|--------|
| `documents` | `{ user_id: 1 }` | Every list query filters by user |
| `documents` | `{ file_hash: 1 }` unique | Dedup check on upload |
| `clients` | `{ user_id: 1 }` | All client reads scoped to user |
| `contracts` | `{ document_id: 1 }` unique+sparse | `findOneAndUpdate` upsert in pipeline |
| `contracts` | `{ expiry_date: 1 }` | Expiry-sorted list and expiring-soon filter |
| `reminders` | `{ source_type: 1, source_id: 1, advance_days: 1 }` | Dedup check in `generateContractReminders` |
| `reminders` | `{ trigger_date: 1 }` | Scheduler `trigger_date ≤ today` query |
| `sessions` | `{ expires_at: 1 }` TTL | Automatic session cleanup |
| `oauth_states` | `{ expires_at: 1 }` TTL | Automatic PKCE state cleanup |
| `equipment` | `{ serial_number: 1 }` unique+sparse | Upsert dedup in pipeline |
| `email_log` | `{ reminder_id: 1 }` | Idempotency check in scheduler |

---

## Frontend Architecture

### State Management (Pinia)

Each domain has its own store that mirrors the server resource:

```
authStore       — current user, fetchMe(), login/logout
documentsStore  — list, upload progress, detail cache
clientsStore    — list, search, current client
contractsStore  — list, expiry filter
remindersStore  — list, status updates
tasksStore      — list, completion
dashboardStore  — stats aggregates
settingsStore   — global + per-user settings
```

`authStore` persists to `localStorage` so the app shows the user immediately on reload while the background `fetchMe()` validates the session against the server.

### Router Guards

`router.beforeEach`:
1. If route is public (`meta.public`), allow immediately
2. If `authStore.user` is cached, allow immediately (optimistic)
3. If not initialized, `await authStore.fetchMe()`
4. If still no user, redirect to `/login`
5. If route has `meta.requireRole`, check rank — redirect to `/403` if insufficient

### RTL / Internationalisation

- `dir="rtl"` set on `<html>` in `index.html`
- Naive UI RTL peer components registered in `App.vue` (`unstable*Rtl` exports)
- Theme CSS variables in `src/styles/global.css` cover both `[data-theme="light"]` and `[data-theme="dark"]`
- Hebrew text throughout UI; dates formatted with `he-IL` locale
