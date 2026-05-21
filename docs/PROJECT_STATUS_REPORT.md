# Project Status Report

**Updated**: 2026-05-22
**Overall Status**: 🟢 **ON TRACK** — Phase 1 complete, Phase 2 auth complete, Vercel client deployment ready

---

## Project Overview

| Area | Status | Progress |
|------|--------|----------|
| **Core Document Management (Phase 1)** | ✅ Complete | 100% |
| **Google OAuth + Sessions (Phase 2)** | ✅ Complete | 100% |
| **Route Scoping by user_id** | ✅ Complete | 100% |
| **Frontend Auth UI** | ✅ Complete | 100% |
| **Vercel Client Deployment** | ✅ Ready | 100% |
| **Testing** | ⏳ Pending | 0% |

---

## Repository Structure

```
E:\Projects\Reminder\
├── server/                    ← Bun backend (port 3737)
│   ├── src/
│   │   ├── index.ts           ← Bun.serve, route registration, WS, scheduler
│   │   ├── settings.ts        ← App settings loader
│   │   ├── auth/
│   │   │   ├── google.ts      ← OAuth 2.0 + PKCE flow
│   │   │   ├── session.ts     ← Cookie-based session management
│   │   │   └── middleware.ts  ← requireAuth / requireAdmin
│   │   ├── db/
│   │   │   ├── db.ts          ← SQLite singleton
│   │   │   ├── schema.ts      ← Full Phase 2 schema (users, sessions, user_settings + all tables)
│   │   │   └── migrate.ts     ← One-time backfill migration
│   │   ├── routes/            ← 13 REST route files (all scoped by user_id)
│   │   ├── pipeline/          ← Document import, parsing, AI extraction
│   │   ├── reminders/         ← Scheduler + email sender
│   │   ├── templates/         ← Doc & email template generation
│   │   ├── search/            ← FTS5 full-text search
│   │   └── shared/types.ts    ← Shared TypeScript interfaces
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── client/                    ← Vue 3 + Vite frontend (port 5173 dev)
│   ├── src/
│   │   ├── App.vue            ← Root component, top bar, RTL Naive UI
│   │   ├── main.ts
│   │   ├── index.html
│   │   ├── components/        ← 8 reusable components
│   │   ├── views/             ← 14 page components
│   │   ├── stores/            ← 8 Pinia stores (auth, documents, clients, ...)
│   │   ├── router/index.ts    ← 14 routes + auth guard
│   │   ├── services/
│   │   │   └── apiService.ts  ← Centralized fetch wrappers + WS client
│   │   ├── shared/types.ts    ← Copy of server types
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
- Uses `VITE_API_BASE_URL` env var to point at the Bun backend
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

---

## Client Pages & Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | LoginPage.vue | Google sign-in |
| `/` | DashboardPage.vue | Stats overview |
| `/documents` | DocumentsPage.vue | Document list + upload |
| `/documents/:id` | DocumentDetailPage.vue | Document detail + extraction |
| `/clients` | ClientsPage.vue | Client list + create |
| `/clients/:id` | ClientDetailPage.vue | Client profile + timeline |
| `/contracts` | ContractsPage.vue | Contracts & inspections |
| `/reminders` | RemindersPage.vue | Reminder management |
| `/search` | SearchPage.vue | Global search |
| `/profile` | ProfilePage.vue | User account |
| `/settings` | SettingsPage.vue | App configuration |
| `/doc-templates` | DocTemplatesPage.vue | Extraction template editor |
| `/email-templates` | EmailTemplatesPage.vue | Email HTML designer |
| `/equipment` | EquipmentPage.vue | Equipment catalog |

---

## Running the Project

```bash
# Backend (from server/)
bun run dev        # watch mode, port 3737

# Frontend dev server (from client/)
npm run dev        # Vite + proxy to :3737, port 5173

# Build client
npm run build      # output → dist/client
```

### Environment Variables

**server/.env**
```
PORT=3737
DATA_DIR=./data
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3737/auth/google/callback
SESSION_SECRET=
ALLOWED_EMAILS=
```

**client/.env** — not needed in dev (proxy handles API routing)

---

## Vercel Deployment (client only)

Separate repo at `E:\Projects\Reminder-client`:
1. Push to GitHub
2. Import in Vercel
3. Set env vars: `VITE_API_BASE_URL=https://your-backend.com`, `VITE_GOOGLE_CLIENT_ID=`
4. Build command: `vite build`, output: `dist`

---

## Next Steps

| Priority | Task | Notes |
|----------|------|-------|
| High | Deploy backend to VPS | Fly.io / Railway / Hetzner |
| High | Push Reminder-client to GitHub + Vercel | Separate repo ready |
| Medium | End-to-end multi-user testing | Two accounts, verify isolation |
| Medium | Per-user WebSocket filtering | `broadcastTo(userId, event)` |
| Low | Tests | No test suite yet |
| Low | Admin UI | User management panel |
