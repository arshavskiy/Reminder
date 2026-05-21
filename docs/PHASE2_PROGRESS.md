# Phase 2: Multi-User Auth — Status

**Updated**: 2026-05-22
**Status**: ✅ **COMPLETE**

---

## What Was Built

### Server

| File | Status | Description |
|------|--------|-------------|
| `server/src/auth/google.ts` | ✅ | OAuth 2.0 + PKCE: generate state/verifier, build Google URL, exchange code, verify ID token |
| `server/src/auth/session.ts` | ✅ | Issue/parse/revoke HTTP-only session cookies, store in SQLite `sessions` table |
| `server/src/auth/middleware.ts` | ✅ | `requireAuth` → `{ userId, user }` or 401; `requireAdmin` for admin-only routes |
| `server/src/routes/auth.ts` | ✅ | `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/logout`, `GET /auth/me` |
| `server/src/db/migrate.ts` | ✅ | One-time backfill: creates user_id=1 from allowlist, updates all existing rows |
| `server/src/db/schema.ts` | ✅ | `users`, `sessions`, `user_settings` tables + `user_id` on all 8 existing tables |
| `server/src/routes/userSettings.ts` | ✅ | `GET/POST /api/user-settings` |
| All 8 route files | ✅ | All SELECTs/INSERTs/UPDATEs/DELETEs scoped to `user_id` from session |

### Frontend

| File | Status | Description |
|------|--------|-------------|
| `client/src/views/LoginPage.vue` | ✅ | Sign-in page with Google button, error display |
| `client/src/components/GoogleSignIn.vue` | ✅ | GIS button + fallback redirect |
| `client/src/stores/auth.ts` | ✅ | Pinia store: `fetchMe()`, `loginWithGoogle()`, `logout()` |
| `client/src/router/index.ts` | ✅ | Auth guard: `beforeEach` → `fetchMe()` → redirect to `/login` if no user |
| `client/src/components/UserDropdown.vue` | ✅ | Top-bar user menu with avatar, profile link, logout |
| `client/src/components/UserCard.vue` | ✅ | User info display |
| `client/src/views/ProfilePage.vue` | ✅ | Account management page |

---

## Auth Flow

```
1. User visits any protected route
2. Router guard calls auth.fetchMe() → GET /auth/me
3. If no session → redirect to /login
4. User clicks "Sign in with Google"
5. loginWithGoogle() → window.location.href = /auth/google
6. Server generates PKCE state+verifier, stores in oauth_states, redirects to Google
7. Google redirects to /auth/google/callback?code=...&state=...
8. Server: verify state, exchange code for ID token, verify token
9. Server: lookup or create users row, check allowedEmails
10. Server: create sessions row, set HTTP-only session cookie
11. Server: redirect to client app (/ or /#/)
12. Router guard runs fetchMe() again → user now present → render app
```

---

## Pending (not blocking deployment)

- [ ] Per-user WebSocket filtering (`broadcastTo(userId, event)`)
- [ ] Settings page split (admin vs user sections)
- [ ] Per-user reminder advance days wired to scheduler
- [ ] Test suite
