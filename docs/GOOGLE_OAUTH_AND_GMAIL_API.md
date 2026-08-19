# Google OAuth & Gmail API — Developer Guide

## Overview

The app uses two separate Google OAuth flows:

1. **Google Sign-In** — user authentication via OAuth 2.0 Authorization Code + PKCE
2. **Gmail API** — read-only inbox access for importing PDF attachments into the pipeline

Both share the same Google Cloud OAuth client but use different scopes, redirect URIs, and token storage.

---

## Google Cloud Console Setup

### 1. OAuth Consent Screen

- Go to [APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
- Type: **External** (in Testing mode — only added test users can sign in)
- App name: `ReminderOCR`
- Scopes: `openid`, `profile`, `email`, `gmail.readonly` (added automatically by the flows)
- Add test users manually while in Testing mode

### 2. OAuth 2.0 Client (Web Application)

- Go to [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
- Create **OAuth 2.0 Client ID** → type **Web application**

#### Authorized Redirect URIs

Add one redirect URI per environment, per flow:

| Environment | Google Sign-In | Gmail API |
|---|---|---|
| Local dev | `http://localhost:3737/auth/google/callback` | `http://localhost:3737/auth/gmail/callback` |
| Production | `https://reminder.handcoded.tech/auth/google/callback` | `https://reminder.handcoded.tech/auth/gmail/callback` |
| Dev server | `https://reminder.dev.handcoded.tech/auth/google/callback` | `https://reminder.dev.handcoded.tech/auth/gmail/callback` |
| Railway (direct) | `https://reminder-production.up.railway.app/auth/google/callback` | `https://reminder-production.up.railway.app/auth/gmail/callback` |

**Important:** Every redirect URI must match **exactly** — protocol, domain, port, path. Google returns `redirect_uri_mismatch` (400) on any discrepancy. Changes in Console can take up to 5 minutes to propagate.

### 3. Required APIs

Enable in [APIs & Services → Library](https://console.cloud.google.com/apis/library):
- **Gmail API** (for inbox import)

OpenID/profile/email work without enabling extra APIs.

---

## Environment Variables

### Server (Railway / local `.env`)

```env
# Google OAuth client
GOOGLE_CLIENT_ID=123456789-abc...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# Sign-in redirect (auto-derived from request if unset)
GOOGLE_REDIRECT_URI=http://localhost:3737/auth/google/callback

# Gmail redirect (auto-derived from request if unset)
GMAIL_REDIRECT_URI=http://localhost:3737/auth/gmail/callback

# Session signing key (generate with: openssl rand -hex 32)
SESSION_SECRET=<random-hex-string>

# Comma-separated email allowlist
ALLOWED_EMAILS=user1@gmail.com,user2@gmail.com

# Frontend URL for post-auth redirects (production only)
FRONTEND_URL=https://reminder.handcoded.tech

# APP_ENV or NODE_ENV = "production" to activate production mode
APP_ENV=production
```

**Redirect URI auto-derivation:** If `GOOGLE_REDIRECT_URI` / `GMAIL_REDIRECT_URI` are **not set**, the server builds the redirect URI from the incoming request's `x-forwarded-host` and `x-forwarded-proto` headers (set by Railway/reverse proxy). This works when custom domains are configured correctly. Set the env var explicitly if auto-derivation produces wrong values.

### Client (Vercel / `.env` for Vite)

No Google-related env vars needed on the client. The client redirects to the server which handles all OAuth.

---

## Flow 1: Google Sign-In (Authentication)

### Sequence

```
Browser                          Server                              Google
  │                                │                                    │
  │── GET /auth/google ───────────▶│                                    │
  │                                │── generate state + PKCE verifier   │
  │                                │── store in DB (oauth_states)       │
  │                                │── build Google auth URL            │
  │◀── 302 redirect ──────────────│                                    │
  │                                │                                    │
  │────────────────────────────────────────────────────────────────────▶│
  │         user signs in at accounts.google.com                        │
  │◀────────────────────────────────────────────────────────────────────│
  │  302 → /auth/google/callback?code=...&state=...                     │
  │                                │                                    │
  │── GET /auth/google/callback──▶│                                    │
  │                                │── lookup state in DB               │
  │                                │── POST /token (code + PKCE) ──────▶│
  │                                │◀── id_token + access_token ────────│
  │                                │                                    │
  │                                │── verify JWT signature (RS256)     │
  │                                │── check email in ALLOWED_EMAILS    │
  │                                │── upsert user in MongoDB           │
  │                                │── create session (DB + cookie)     │
  │                                │── store gmail tokens if present    │
  │◀── 302 → frontend + Set-Cookie│                                    │
```

### Key Files

| File | Purpose |
|---|---|
| `server/src/auth/google.ts` | PKCE helpers, Google auth URL builder, token exchange, JWT verification |
| `server/src/auth/session.ts` | Session create/verify/revoke, cookie handling (httpOnly, signed) |
| `server/src/auth/middleware.ts` | `requireAuth()` middleware, role checks |
| `server/src/routes/auth.ts` | Routes: `GET /auth/google`, `GET /auth/google/callback`, `POST /api/auth/google` (GIS), `GET /api/auth/me`, `POST /api/auth/logout` |
| `client/src/views/LoginPage.vue` | Login page with Google button |

### OAuth Scopes (Sign-In)

```
openid profile email https://www.googleapis.com/auth/gmail.readonly
```

The sign-in flow requests Gmail read scope upfront so users don't need a second consent screen for Gmail import.

### Token Storage

On successful sign-in, the server stores on the `users` MongoDB document:
- `google_sub` — Google's stable user ID
- `gmail_access_token` — for Gmail API calls
- `gmail_refresh_token` — for refreshing expired access tokens
- `gmail_token_expires_at` — token expiry timestamp

### Session Management

- Sessions stored in `sessions` MongoDB collection
- Cookie: `session_id`, httpOnly, secure (production), sameSite=lax, 7-day expiry
- Cookie signature: HMAC-SHA256 with `SESSION_SECRET`
- Server-side revocation: delete session row on logout or admin action
- Dual cookie: `session_id` (signed) + `session_id.sig` (signature)

### Security

- PKCE (S256) prevents authorization code interception
- JWT signature verified against Google's public keys (RS256), cached with `Cache-Control` TTL
- ID token claims validated: `sub`, `email`, `exp`, `iss`, `aud`
- Email allowlist check before user creation
- Dev mode: signature verification failures are logged but bypassed (production throws)

---

## Flow 2: Gmail API (Inbox Import)

### Sequence

```
Browser                          Server                              Gmail API
  │                                │                                    │
  │── GET /api/gmail/auth-url ───▶│                                    │
  │                                │── generate state + PKCE            │
  │                                │── store in DB (type: "gmail")      │
  │◀── { url: "https://..." } ────│                                    │
  │                                │                                    │
  │── user clicks URL ────────────────────────────────────────────────▶│
  │         user grants gmail.readonly access                           │
  │◀────────────────────────────────────────────────────────────────────│
  │  302 → /auth/gmail/callback?code=...&state=...                      │
  │                                │                                    │
  │── GET /auth/gmail/callback ──▶│                                    │
  │                                │── exchange code for tokens         │
  │                                │── store access+refresh on user doc │
  │◀── 302 → /gmail-inbox ────────│                                    │
  │                                │                                    │
  │── GET /api/gmail/inbox ──────▶│                                    │
  │                                │── resolve token (user or env)      │
  │                                │── GET gmail/v1/.../messages ──────▶│
  │                                │◀── message list ───────────────────│
  │◀── { emails: [...] } ─────────│                                    │
```

### Key Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/gmail/auth-url` | GET | Generate Gmail OAuth URL (returns JSON, no redirect) |
| `/auth/gmail/callback` | GET | Handle Google redirect, exchange code, store tokens |
| `/api/gmail/status` | GET | Check if Gmail is connected (returns `{ connected, source, email }`) |
| `/api/gmail/inbox` | GET | List emails with PDF attachments. Query params: `q` (Gmail search), `limit`, `pageToken` |
| `/api/gmail/attachment/:messageId/:attachmentId` | GET | Download specific attachment. Query: `filename`, `preview=1` for inline |
| `/api/gmail/import-attachment` | POST | Import single attachment into pipeline. Body: `{ messageId, attachmentId, filename }` |
| `/api/gmail/import-all` | POST | Bulk import all new PDF attachments. Body: `{ q, limit }` |
| `/api/gmail/import-history` | GET | List previously imported messages |
| `/api/gmail/disconnect` | DELETE | Remove Gmail tokens from user doc |

### Token Resolution Priority

`resolveGmailToken(userId)` checks in order:

1. **User's OAuth token** (`users.gmail_access_token`) — if expired, attempt refresh via `gmail_refresh_token`
2. **Environment token** (`GMAIL_ACCESS_TOKEN` / `GMAIL_REFRESH_TOKEN` env vars) — fallback for service-level access

### Auto-Refresh

- Expired user tokens: refresh via Google's `/token` endpoint using stored `gmail_refresh_token`
- Expired env tokens: same mechanism, cached in memory with `cachedEnvToken` / `envTokenExpiry`
- 401 responses from Gmail API trigger one automatic retry with a fresh token

### Non-Admin Restrictions

Non-admin users' bulk import (`/api/gmail/import-all`) automatically scopes the Gmail search query to include their `inspector_number` from `engineer_profiles`, preventing them from importing files that aren't theirs.

### MongoDB Collections

| Collection | Purpose |
|---|---|
| `users` | Stores `gmail_access_token`, `gmail_refresh_token`, `gmail_token_expires_at` |
| `oauth_states` | Temporary PKCE state storage (auto-pruned on expiry, 10 min TTL) |
| `gmail_imports` | Tracks which messages have been imported (prevents duplicates). Fields: `user_id`, `message_id`, `subject`, `imported_at`, `files[]` |

---

## Redirect URI Resolution

Both flows auto-derive redirect URIs from the request if env vars are unset:

```typescript
// Google Sign-In (auth.ts)
function googleCallbackUri(req): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  return `${serverBaseUrl(req)}/auth/google/callback`;
}

// Gmail (gmail.ts)
function gmailRedirectUri(req): string {
  if (process.env.GMAIL_REDIRECT_URI) return process.env.GMAIL_REDIRECT_URI;
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}/auth/gmail/callback`;
}
```

`serverBaseUrl` reads `x-forwarded-proto` and `x-forwarded-host` headers (set by Railway/reverse proxy).

**If `SERVER_URL` env var is set**, `serverBaseUrl` returns that instead.

---

## Frontend URL Resolution

After OAuth callback, server redirects user to the frontend:

```typescript
const isProd = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
const base = isProd
  ? (process.env.FRONTEND_URL ?? "")     // e.g. https://reminder.handcoded.tech
  : (process.env.DEV_FRONTEND_URL ?? "http://localhost:4173");
```

**Production:** Set `FRONTEND_URL` in Railway env. If empty, redirects to relative path (same origin).
**Dev:** Defaults to `http://localhost:4173` (Vite dev server).

---

## Cookie & Session Architecture

### Cookie Settings

Sessions use a single `session` cookie set by the server:

```
session=<64-char-hex>; Path=/; HttpOnly; Secure; SameSite=None; Domain=.handcoded.tech; Max-Age=604800
```

| Attribute | Production | Local dev |
|---|---|---|
| `Secure` | `true` (HTTPS) | `false` (HTTP) |
| `SameSite` | `None` | `Lax` |
| `Domain` | `.handcoded.tech` | not set (defaults to request host) |
| `Max-Age` | 604800 (7 days) | 604800 (7 days) |

These are auto-derived in `server/src/auth/session.ts` — functions `shouldUseSecureCookie()`, `cookieSameSite()`, `cookieDomain()`.

### Vercel API Proxy (Critical)

The client on Vercel (`reminder.handcoded.tech`) proxies all API requests to the server (`api.handcoded.tech`) via Vercel rewrites in `client/vercel.json`:

```json
{ "source": "/api/:path*", "destination": "https://api.handcoded.tech/api/:path*" },
{ "source": "/auth/:path*", "destination": "https://api.handcoded.tech/auth/:path*" }
```

**Why this is required:** Chrome (especially Android, v127+) blocks third-party cookies with `SameSite=None`. Without the proxy, `reminder.handcoded.tech` makes cross-origin requests to `api.handcoded.tech` — the `Set-Cookie` from the server is treated as a third-party cookie and silently dropped by the browser. The Vercel rewrite makes all requests same-origin from the browser's perspective.

**Symptoms when proxy is missing:** Login succeeds (200), `/api/auth/me` returns cached 304, but all other API calls return 401. Refreshing the page logs the user out. Desktop Chrome may still work (less aggressive cookie blocking), while Android Chrome fails.

**`VITE_API_BASE` must be unset (empty)** on Vercel so the client makes relative requests (`/api/...`) that hit the Vercel rewrite. If `VITE_API_BASE` is set to `https://api.handcoded.tech`, requests bypass the proxy and third-party cookie issues return.

### Local Development

Vite dev server proxies `/api/*` and `/auth/*` to `http://127.0.0.1:3737` via `vite.config.ts` — same-origin by default, no cookie issues. `VITE_API_BASE` is not needed locally either.

### Cookie Flow Diagram

```
Production (via Vercel proxy):
  Browser → reminder.handcoded.tech/api/auth/login
         → Vercel rewrite → api.handcoded.tech/api/auth/login
         ← Set-Cookie: session=...; Domain=.handcoded.tech
         ← Cookie stored as first-party on reminder.handcoded.tech ✓

  Browser → reminder.handcoded.tech/api/dashboard/stats
         → Vercel rewrite → api.handcoded.tech/api/dashboard/stats
         → Cookie: session=... (sent as first-party) ✓

Local dev (via Vite proxy):
  Browser → localhost:4173/api/auth/login
         → Vite proxy → 127.0.0.1:3737/api/auth/login
         ← Set-Cookie: session=...; (no Domain, SameSite=Lax)
         ← Cookie stored on localhost:4173 ✓
```

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` (400) | Redirect URI in request doesn't match Google Console | Add exact URI to Console. Check env var or auto-derived value. Wait 5 min for propagation |
| `not_allowed` on login page | Email not in `ALLOWED_EMAILS` | Add email to env var, restart server |
| `auth_failed` | Bad client ID/secret, or JWT verification failed | Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars |
| `invalid_state` | PKCE state expired (10 min TTL) or server restarted between redirect and callback | Try again. States are DB-persisted so server restarts are OK |
| `access_denied` | User cancelled consent, or not a test user | Add user in Google Console → OAuth consent screen → Test users |
| `gmail_not_connected` | No Gmail token on user doc and no env fallback | User needs to connect Gmail via `/api/gmail/auth-url` |
| `token_exchange_failed` | Code exchange with Google failed | Check client secret, redirect URI match |
| Gmail 401 after token refresh | Refresh token revoked or expired | User needs to re-authorize Gmail (disconnect + reconnect) |
| Login 200 but all API 401 (Android) | Third-party cookies blocked by Chrome | Ensure Vercel proxy rewrites are in `vercel.json` and `VITE_API_BASE` is unset on Vercel |
| Works on desktop, fails on mobile | Same cookie issue — mobile Chrome stricter | Same fix: Vercel proxy + unset `VITE_API_BASE` |

### Debugging Redirect URIs

To see what redirect URI the server is sending to Google:

1. Click "Sign in with Google" or "Connect Gmail"
2. Look at the Google error page → "Request details" section → `redirect_uri=...`
3. Compare exactly with what's registered in Google Console
4. Common mismatches: `http` vs `https`, trailing slash, wrong subdomain, Railway URL vs custom domain

---

## Adding a New Environment

1. Deploy server to new domain/subdomain
2. Set env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_EMAILS`, `FRONTEND_URL`, `APP_ENV=production`
3. Optionally set `GOOGLE_REDIRECT_URI` and `GMAIL_REDIRECT_URI` (or let auto-derive work)
4. Add redirect URIs to Google Cloud Console:
   - `https://new-domain.com/auth/google/callback`
   - `https://new-domain.com/auth/gmail/callback`
5. If app is in Testing mode, add test users in OAuth consent screen
6. Wait 5 minutes for Console changes to propagate
7. Test sign-in and Gmail connect
