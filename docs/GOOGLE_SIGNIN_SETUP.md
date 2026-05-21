# Google Sign-In Setup Guide

## Overview

This app uses Google OAuth 2.0 with PKCE for authentication. No passwords are stored — users sign in with their Google account and access is restricted to a whitelist of allowed emails.

---

## Step 1 — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown (top left) → **New Project**
3. Name it (e.g. `reminder-app`) → **Create**
4. Make sure the new project is selected

---

## Step 2 — Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** → **Create**
3. Fill in:
   - **App name**: `תזכורת לקוח`
   - **User support email**: your Gmail
   - **Developer contact email**: your Gmail
4. Click **Save and Continue** through all steps (no scopes needed beyond the defaults)
5. On the **Test users** step — add `pavelspersonalhelper@gmail.com`
6. Click **Back to Dashboard**

> While the app is in "Testing" mode only added test users can sign in. This is fine for personal use — you never need to publish it.

---

## Step 3 — Create OAuth Credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: `reminder-app-web`
5. Under **Authorized redirect URIs** click **+ Add URI** and enter:
   ```
   http://localhost:3737/auth/google/callback
   ```
6. Click **Create**
7. A dialog shows your credentials — copy both values:
   - **Client ID** — looks like `123456789-abc...apps.googleusercontent.com`
   - **Client Secret** — looks like `GOCSPX-...`

---

## Step 4 — Configure the App

Open `.env` in the project root and fill in your credentials:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3737/auth/google/callback
SESSION_SECRET=any-long-random-string-here
ALLOWED_EMAILS=pavelspersonalhelper@gmail.com
```

For `SESSION_SECRET` use any long random string, for example:
```
openssl rand -hex 32
```
Or just type any long random string manually.

---

## Step 5 — Start the App

```bash
bun run dev
```

Open [http://localhost:3737](http://localhost:3737) — you will be redirected to the login page. Click **כניסה עם Google**, sign in with `pavelspersonalhelper@gmail.com`, and you're in.

---

## How the Flow Works

```
Browser                     Server                        Google
  │                            │                              │
  │── clicks "Sign in" ───────▶│                              │
  │                            │── generates state + PKCE ──▶│
  │◀── redirect 302 ───────────│                              │
  │                            │                              │
  │──────────────────────────────────────────────────────────▶│
  │          user logs in at accounts.google.com              │
  │◀──────────────────────────────────────────────────────────│
  │  redirect to /auth/google/callback?code=...               │
  │                            │                              │
  │── GET /auth/google/callback▶│                              │
  │                            │── POST /token (code+PKCE) ──▶│
  │                            │◀── id_token ─────────────────│
  │                            │                              │
  │                            │  decode JWT → get email      │
  │                            │  check ALLOWED_EMAILS        │
  │                            │  upsert user in DB           │
  │                            │  create session cookie       │
  │◀── redirect / + Set-Cookie─│                              │
  │                            │                              │
  │── all future requests ─────▶ session cookie validates user│
```

---

## Adding More Allowed Users

Add emails comma-separated in `.env`:

```env
ALLOWED_EMAILS=pavelspersonalhelper@gmail.com,another@gmail.com
```

Restart the server after changing `.env`.

---

## Troubleshooting

| Error on login page | Cause | Fix |
|---|---|---|
| `not_allowed` | Email not in `ALLOWED_EMAILS` | Add the email to `.env` |
| `auth_failed` | Bad Client ID/Secret or redirect URI mismatch | Double-check `.env` values and Google Console URI |
| `invalid_state` | PKCE state expired (>10 min) | Just try again |
| `error=access_denied` | User cancelled or not a test user | Add user in Google Console → OAuth consent screen → Test users |

---

## Production Deployment

If you deploy to a real domain, update the redirect URI in both places:

1. **Google Console** → Credentials → your OAuth client → add `https://yourdomain.com/auth/google/callback`
2. **`.env`**:
   ```env
   GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/google/callback
   ```
