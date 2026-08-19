# Project Status Report

**Updated**: 2026-08-19
**Overall Status**: 🟢 **PRODUCTION** — deployed on Railway (server) + Vercel (client)

---

## Project Overview

| Area | Status | Progress |
|------|--------|----------|
| **Core Document Management (Phase 1)** | ✅ Complete | 100% |
| **Google OAuth + Sessions (Phase 2)** | ✅ Complete | 100% |
| **Route Scoping by user_id** | ✅ Complete | 100% |
| **Frontend Auth UI** | ✅ Complete | 100% |
| **Print Templates (Excel + Section editors)** | ✅ Complete | 100% |
| **Monthly Reports** | ✅ Complete | 100% |
| **Email Grouping + Items Table** | ✅ Complete | 100% |
| **Copy-on-Write Shared Templates** | ✅ Complete | 100% |
| **Hydraulic Check Modal** | ✅ Complete | 100% |
| **Production Deployment** | ✅ Live | 100% |
| **Testing** | ⏳ Partial | 20% |

---

## Repository Structure

```
E:\Projects\Reminder\
├── server/                    ← Node.js 22 + Express backend (port 3737, Railway)
│   ├── src/
│   │   ├── index.ts           ← Express server, route registration, WS, scheduler
│   │   ├── settings.ts        ← App settings loader
│   │   ├── auth/
│   │   │   ├── google.ts      ← OAuth 2.0 + PKCE flow
│   │   │   ├── session.ts     ← Cookie-based session management (MongoDB)
│   │   │   └── middleware.ts  ← requireAuth / requireAdmin
│   │   ├── db/
│   │   │   └── db.ts          ← MongoDB connection
│   │   ├── routes/            ← 22 REST route files (all scoped by user_id)
│   │   ├── pipeline/          ← Document import, parsing, AI extraction
│   │   ├── reminders/         ← Scheduler + email sender (Resend + SMTP)
│   │   ├── templates/         ← Doc, email, & print template generation
│   │   ├── search/            ← Regex-based full-text search
│   │   ├── scripts/           ← Migration and backfill scripts
│   │   └── shared/types.ts    ← Shared TypeScript interfaces
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── client/                    ← Vue 3 + Vite + Naive UI + Tailwind v4 (Vercel)
│   ├── src/
│   │   ├── App.vue            ← Root component, top bar, RTL Naive UI
│   │   ├── main.ts
│   │   ├── index.html
│   │   ├── components/        ← Reusable components (contracts, print, upload)
│   │   ├── views/             ← 24 page components
│   │   ├── stores/            ← Pinia stores (auth, documents, clients, ...)
│   │   ├── router/index.ts    ← Routes + auth guard
│   │   ├── services/
│   │   │   └── apiService.ts  ← Centralized fetch wrappers + WS client
│   │   ├── shared/            ← types.ts, rowIssues.ts, rememberedUi.ts
│   │   └── styles/global.css  ← CSS variables, RTL, dark/light theme
│   ├── vite.config.ts         ← Dev proxy to :3737, build → dist/client
│   └── package.json
│
├── docs/                      ← Project documentation
├── scripts/                   ← Utility scripts (dedupe, inspect)
├── landing/                   ← Static landing page (own git repo)
└── spects/                    ← Screenshots (gitignored)
```

**Vercel Client Repo** (separate): `E:\Projects\Reminder-client\`
- Standalone Vue 3 + Vite project for Vercel deployment
- Uses `VITE_API_BASE` env var to point at the backend
- Own git repo, own `vercel.json` (SPA rewrite)

---

## Phase 2: What Was Delivered

### Auth Infrastructure
- ✅ Google OAuth 2.0 + PKCE flow (`server/src/auth/google.ts`)
- ✅ HTTP-only session cookies (`server/src/auth/session.ts`)
- ✅ `requireAuth` / `requireAdmin` middleware (`server/src/auth/middleware.ts`)
- ✅ Auth routes: `GET /auth/google`, `/auth/google/callback`, `POST /auth/logout`, `GET /auth/me`

### Database (Phase 2 Schema)
- ✅ `users` table (google_sub, email, name, picture_url, role, is_active)
- ✅ `sessions` table (id, user_id, expires_at, user_agent, ip)
- ✅ `user_settings` table (theme, email_from_name, reminder_advance_days, ocr_language)
- ✅ `user_id` column on all 8 existing tables (documents, clients, contracts, reminders, tasks, extractions, email_log, timeline_events)
- ✅ One-time backfill migration (`server/src/db/migrate.ts`)
- ✅ All covering indexes

### Route Scoping
- ✅ All 8 route files filter by `user_id` from session
- ✅ Per-user data isolation enforced at DB query level
- ✅ User settings route (`/api/user-settings`)
- ✅ Assets route (`/api/assets/*`) for logo upload

### Frontend Auth
- ✅ `LoginPage.vue` — Google Sign-In button with error handling
- ✅ `GoogleSignIn.vue` — GIS button component + fallback redirect
- ✅ `auth.ts` store — `fetchMe()`, `loginWithGoogle()`, `logout()`
- ✅ Router guard — redirects to `/login` if unauthenticated
- ✅ `UserDropdown.vue`, `UserCard.vue`, `ProfilePage.vue`
- ✅ `WsConnector.vue` — WebSocket push notifications

---

## API Routes Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/google` | Redirect to Google OAuth |
| GET | `/auth/google/callback` | OAuth callback, issue session cookie |
| POST | `/auth/logout` | Revoke session |
| GET | `/auth/me` | Current user info |

### Documents
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/documents` | List with pagination & status filter |
| POST | `/api/documents/upload` | Multipart file upload |
| POST | `/api/documents/import` | Import from file path |
| GET | `/api/documents/:id` | Single document detail |
| DELETE | `/api/documents/:id` | Delete document |
| POST | `/api/documents/:id/reprocess` | Re-run AI extraction |

### Clients
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clients` | List with search |
| POST | `/api/clients` | Create |
| GET | `/api/clients/:id` | Detail + stats |
| PUT | `/api/clients/:id` | Update |
| DELETE | `/api/clients/:id` | Delete |
| GET | `/api/clients/:id/timeline` | Activity log |
| GET | `/api/clients/:id/documents` | Related docs |

### Contracts, Reminders, Tasks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/contracts` | List with filters (status, kind, clientId) |
| GET | `/api/contracts/expiring` | Expiring within N days |
| PUT | `/api/contracts/:id` | Update |
| DELETE | `/api/contracts/:id` | Delete |
| GET | `/api/reminders` | List |
| POST | `/api/reminders` | Create manual reminder |
| PUT | `/api/reminders/:id` | Update |
| POST | `/api/reminders/:id/send-now` | Fire immediately |
| POST | `/api/reminders/:id/dismiss` | Dismiss |
| POST | `/api/reminders/:id/snooze` | Snooze to date |
| GET | `/api/tasks` | List |
| PUT | `/api/tasks/:id` | Update |

### Templates & Settings
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/settings` | Global app settings (admin) |
| GET/POST | `/api/user-settings` | Per-user settings |
| GET/POST/PUT/DELETE | `/api/doc-templates` | Doc extraction templates |
| POST | `/api/doc-templates/generate-from-text` | AI-generate template |
| POST | `/api/doc-templates/generate-from-file` | AI-generate from file |
| GET/POST/PUT/DELETE | `/api/email-templates` | Email HTML templates |
| GET/POST/PUT/DELETE | `/api/equipment` | Equipment catalog |
| GET | `/api/equipment/stats` | Equipment stats by category |
| GET | `/api/dashboard/stats` | Dashboard overview |
| GET | `/api/search` | Global FTS search |
| GET | `/api/email-log` | Sent email history |
| POST | `/api/email/test` | Send test email |
| POST | `/api/assets/logo` | Upload logo |
| GET | `/api/assets/:name` | Serve asset |

### Print Templates
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/print-templates` | List visible templates (owned + shared) |
| GET/POST | `/api/print-templates/:id` | Get / create template |
| PUT | `/api/print-templates/:id` | Update (copy-on-write for shared) |
| DELETE | `/api/print-templates/:id` | Delete (admin-only for shared) |
| GET/PUT/DELETE | `/api/print-templates/:id/draft` | Draft CRUD |
| GET | `/api/print-templates/drafts` | List all user drafts |
| POST | `/api/print-templates/:id/pdf` | Render PDF inline |
| POST | `/api/print-templates/:id/pdf/save` | Render + persist PDF as document |

### Reports
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reports/monthly/download` | Download report (docx/xlsx/csv) |
| POST | `/api/reports/monthly/send` | Manual send (combined or per-client) |

---

## Client Pages & Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | LoginPage.vue | Google sign-in + email/password |
| `/reset-password` | ResetPasswordPage.vue | Password reset flow |
| `/` | DashboardPage.vue | Stats overview |
| `/documents` | DocumentsPage.vue | Document list + upload + quota bar |
| `/documents/:id` | DocumentDetailPage.vue | Document detail + extraction |
| `/clients` | ClientsPage.vue | Client list + create |
| `/clients/:id` | ClientDetailPage.vue | Client profile + timeline |
| `/contracts` | ContractsPage.vue | Contracts & inspections + status counts |
| `/reminders` | RemindersPage.vue | Reminder management |
| `/reports` | ReportsPage.vue | Monthly report settings + manual send |
| `/print-templates` | PrintTemplatesHubPage.vue | Template editor hub (layout vs Excel) |
| `/print-templates/layout` | SimplePrintTemplatesPage.vue | Section-based template editor |
| `/print-templates/excel` | PrintTemplatesPage.vue | Grid/table template editor |
| `/contracts/:contractId/draft` | ContractDraftPage.vue | Draft preview + PDF + contract actions |
| `/search` | SearchPage.vue | Global search |
| `/profile` | ProfilePage.vue | User account |
| `/settings` | SettingsPage.vue | App configuration |
| `/admin` | AdminPage.vue | User management (admin-only) |
| `/doc-templates` | DocTemplatesPage.vue | Extraction template editor |
| `/email-templates` | EmailTemplatesPage.vue | Email HTML designer |
| `/equipment` | EquipmentPage.vue | Equipment catalog |
| `/field` | FieldPage.vue | Mobile field inspection mode |
| `/403` | ForbiddenPage.vue | Access denied |

---

## Running the Project

```bash
# Backend (from server/)
npm run dev        # tsx watch mode, port 3737

# Frontend dev server (from client/)
npm run dev        # Vite + proxy to :3737, port 4173

# Build client
npm run build      # output → dist/client

# Production (Railway)
npm start          # node --import tsx/esm src/index.ts
```

### Environment Variables

**server/.env**
```
PORT=3737
MONGODB_URI=mongodb+srv://...
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3737/auth/google/callback
SESSION_SECRET=
ALLOWED_EMAILS=
RESEND_API_KEY=
OPENAI_API_KEY=
DO_SPACES_KEY=
DO_SPACES_SECRET=
DO_SPACES_BUCKET=
DO_SPACES_REGION=
DO_SPACES_ENDPOINT=
FRONTEND_URL=
ESCALATION_EMAIL=
```

**client/.env** — not needed in dev (proxy handles API routing)

---

## Vercel Deployment (client only)

Separate repo at `E:\Projects\Reminder-client`:
1. Push to GitHub
2. Import in Vercel
3. Set env vars: `VITE_API_BASE=https://your-backend.com`, `VITE_GOOGLE_CLIENT_ID=`
4. Build command: `vite build`, output: `dist`

---

## Next Steps

| Priority | Task | Notes |
|----------|------|-------|
| Medium | End-to-end multi-user testing | Two accounts, verify isolation |
| Medium | Per-user WebSocket filtering | `broadcastTo(userId, event)` |
| Medium | Expand test suite | Some tests exist, coverage still low |
| Low | Per-user file storage isolation | Currently shared `data/documents/` |
| Low | Teams / shared workspaces | Allow multiple users to see same data |
