# Phase 2 Implementation — Multi-user Authentication (Google OAuth)

> **Status**: Starting implementation
> **Date**: 2026-05-20
> **Goal**: Add Google OAuth authentication + data isolation by user_id

---

## Implementation Checklist

### Stage 1: Database Schema & Migrations ✅ COMPLETE
- [x] Add `users` table to schema.ts
- [x] Add `sessions` table to schema.ts
- [x] Add `user_settings` table to schema.ts
- [x] Add `user_id` columns to: documents, clients, contracts, reminders, tasks, extractions, email_log, timeline_events
- [x] Create migration file to backfill existing data with `user_id=1`
- [x] Add covering indexes on all 8 tables for `user_id`
- [x] Add User, Session, UserSettings types to shared/types.ts
- [x] Update settings.ts with Phase 2 defaults (Google OAuth, allowlist)
- [ ] Test: boot server, verify schema in SQLite

### Stage 2: Auth Infrastructure ✅ PARTIAL (4/9)
- [x] Create `src/server/auth/google.ts` — OAuth handshake logic
- [x] Create `src/server/auth/session.ts` — Session cookie management
- [x] Create `src/server/auth/middleware.ts` — `requireAuth()` helper
- [ ] Create `src/server/routes/auth.ts` — `/auth/google`, `/auth/google/callback`, `/auth/logout`, `/auth/me`
- [ ] Update `src/server/index.ts` — Wire auth routes, add cookie parsing, middleware support
- [x] Update `src/server/settings.ts` — Add Google OAuth + allowlist settings
- [ ] Install dependencies: `bun add jose cookie`
- [ ] Test: manual curl test of auth flow

### Stage 3: Route Scoping by User
- [ ] Update `src/server/routes/documents.ts` — Add `user_id` filters
- [ ] Update `src/server/routes/clients.ts` — Add `user_id` filters
- [ ] Update `src/server/routes/contracts.ts` — Add `user_id` filters
- [ ] Update `src/server/routes/reminders.ts` — Add `user_id` filters
- [ ] Update `src/server/routes/tasks.ts` — Add `user_id` filters
- [ ] Update `src/server/routes/search.ts` — Add `user_id` filters
- [ ] Update `src/server/routes/email.ts` — Add `user_id` filters
- [ ] Update `src/server/routes/dashboard.ts` — Add `user_id` filters
- [ ] Update `src/server/routes/settings.ts` — Split admin vs per-user settings
- [ ] Test: verify two sessions can't see each other's data

### Stage 4: Pipeline & Scheduler Updates
- [ ] Update `src/server/pipeline/importer.ts` — Accept userId, save to user folders
- [ ] Update `src/server/reminders/scheduler.ts` — Filter by userId, skip inactive users
- [ ] Update WebSocket broadcast in `src/server/index.ts` — Per-user events
- [ ] Test: import document as user A, verify user B can't see it

### Stage 5: Frontend Auth
- [ ] Create `src/client/views/LoginPage.vue` — "Sign in with Google" button
- [ ] Create `src/client/stores/auth.ts` — Auth store (user, loading, methods)
- [ ] Create `src/client/composables/useAuthGuard.ts` — Route guard
- [ ] Update `src/client/router/index.ts` — Add `/login` route, wire guard
- [ ] Update `src/client/App.vue` — Top bar with user info, logout
- [ ] Update `src/client/services/apiService.ts` — Add credentials + handle 401
- [ ] Test: login → dashboard → logout flow

### Stage 6: Settings Page Split
- [ ] Update `src/client/views/SettingsPage.vue` — Personal vs Admin sections
- [ ] Update `src/client/stores/settings.ts` — Split into user + admin stores
- [ ] Test: verify non-admins can't see SMTP/OpenAI settings

### Stage 7: Polish & Testing
- [ ] Verify all endpoints require authentication
- [ ] Test 404 on attempts to access other user's data
- [ ] Verify reminder scheduler still works across users
- [ ] Test email sending with per-user settings
- [ ] End-to-end: two users, two browsers, full workflow

---

## Current Progress

**Last Updated**: 2026-05-20

### Completed ✅
- [x] Email template dropdown in settings
- [x] Project structure
- [x] Schema: users, sessions, user_settings tables
- [x] Schema: user_id columns on 8 existing tables + indexes
- [x] Types: User, Session, UserSettings interfaces
- [x] Settings: Phase 2 defaults (OAuth, allowlist)
- [x] Migration: runPhase2Migration() for backfill
- [x] Auth module: google.ts (OAuth flow)
- [x] Auth module: session.ts (session management)
- [x] Auth module: middleware.ts (requireAuth, requireAdmin)

### In Progress
- [ ] Auth routes: `/auth/google`, `/auth/google/callback`, etc.
- [ ] Server index: wire auth routes, middleware injection

### Next
- [ ] Auth routes implementation
- [ ] Server integration
- [ ] Route scoping by user_id

---

## Key Files to Reference

| File | Purpose |
|---|---|
| `src/server/index.ts` | Router setup, middleware injection |
| `src/server/db/schema.ts` | Schema + `addColumnIfMissing()` helper |
| `src/server/settings.ts` | Settings shape |
| `src/server/routes/*.ts` | All 8 route files need scoping |
| `src/server/pipeline/importer.ts` | Document processing |
| `src/server/reminders/scheduler.ts` | Reminder engine |

---

## Google OAuth Setup (Local Dev)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project
3. Enable Google+ API
4. Create OAuth 2.0 Client ID (Web application)
5. Add callback: `http://localhost:3737/auth/google/callback`
6. Copy `Client ID` and `Client Secret` into `data/settings.json`:
   ```json
   {
     "googleClientId": "YOUR_CLIENT_ID",
     "googleClientSecret": "YOUR_CLIENT_SECRET",
     "allowedEmails": ["your-email@gmail.com"]
   }
   ```

---

## Notes

- Use existing `addColumnIfMissing()` helper for safe migrations
- Session cookies: httpOnly, sameSite=lax, 7-day expiry
- Allowlist enforcement on OAuth callback (not in Google)
- First user to log in becomes `role='admin'`
- Every route handler receives `context: { userId: number; user: User }`


