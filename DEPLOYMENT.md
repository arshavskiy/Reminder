# Production Deployment Guide

## Architecture

```
Browser → Vercel (client SPA)
              ↓ VITE_API_BASE
Railway → Express server (API)
              ↓ @aws-sdk/client-s3
DigitalOcean Spaces → file storage
              ↓ connection string
MongoDB Atlas → database
```

---

## 1. DigitalOcean Spaces (file storage)

### One-time setup
1. Log in to DigitalOcean → **Spaces** → **Create Space**
   - Region: `fra1` (Frankfurt) or closest to your users
   - Name: `reminder-files`
   - File listing: **Restricted**
2. **API Keys** → Spaces Access Keys → **Generate New Key**
   - Save the Access Key and Secret (shown once)
3. **CORS** on the Space → Add rule:
   - Origin: `https://your-client.vercel.app`
   - Allowed methods: `GET`
   - Headers: `*`

---

## 2. Railway (server)

### Git source

This project has two Git repositories:

- The parent repo at `E:\Projects\Reminder` pushes to `arshavskiy/Reminder`.
- The nested server repo at `E:\Projects\Reminder\server` pushes to `arshavskiy/reminder-server`.

Railway production is connected to `arshavskiy/reminder-server` on branch `master`. Backend changes only trigger Railway after they are committed and pushed from inside `server/`:

```bash
cd server
git status
git add <server files>
git commit -m "..."
git push origin master
```

Pushing only the parent repo (`arshavskiy/Reminder`) will not trigger the `reminder-server` Railway service.

### Deploy
1. Create new Railway project → **Deploy from GitHub repo**
2. Connect `arshavskiy/reminder-server`
3. Use branch `master`
4. Railway auto-detects Nixpacks and runs `npm start`

### Environment variables (set in Railway dashboard)
```
NODE_ENV=production
PORT=3737

# MongoDB Atlas
MONGODB_URI=mongodb+srv://arshavskypasha_db_user:<password>@cluster10.zyzi9bi.mongodb.net/
MONGODB_DB=reminder-app

# Google OAuth
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
GOOGLE_REDIRECT_URI=https://<your-railway-domain>/auth/google/callback

# Session
SESSION_SECRET=<generate: openssl rand -hex 32>

# SMTP (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
EMAIL_FROM=<verified-sender-email>
EMAIL_FROM_NAME= ReminderOCR

# OpenAI
OPENAI_API_KEY=sk-proj-...

# DigitalOcean Spaces
DO_SPACES_KEY=<access key from step 1>
DO_SPACES_SECRET=<secret key from step 1>
DO_SPACES_ENDPOINT=fra1.digitaloceanspaces.com
DO_SPACES_BUCKET=reminder-files
DO_SPACES_REGION=fra1

# CORS — comma-separated list of allowed frontend origins
ALLOWED_ORIGINS=https://your-client.vercel.app

# Used in email verification links
SERVER_URL=https://<your-railway-domain>
```

### Verify deployment
```
curl https://<your-railway-domain>/auth/me
# Expected: {"user":null}
```

---

## 3. Vercel (client)

### Deploy
1. Import the **client/** folder (or full repo with `client/` as root) to Vercel
2. Framework preset: **Vite**
3. Build command: `npm install && npm run build`
4. Output directory: `dist`

### Environment variables (set in Vercel dashboard)
```
VITE_API_BASE=https://<your-railway-domain>
VITE_GOOGLE_CLIENT_ID=<google-oauth-client-id>
```

> These are baked into the JS bundle at build time — redeploy after changing them.

---

## 4. Google Cloud Console updates

In [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services** → **OAuth 2.0 Client IDs**:

**Authorized JavaScript origins** — add:
```
https://your-client.vercel.app
```

**Authorized redirect URIs** — add:
```
https://<your-railway-domain>/auth/google/callback
```

---

## 5. Local development

No changes needed — Vite proxy in `vite.config.ts` forwards `/api` and `/auth` to `localhost:3737`.

```bash
# Terminal 1 — server
cd server && npm run dev

# Terminal 2 — client
cd client && npm run dev
```

`VITE_API_BASE` is empty in `.env` (local), so all requests go to the Vite proxy → server.

---

## 6. File storage behaviour

| Environment | DO_SPACES_KEY set? | Files stored in |
|-------------|-------------------|-----------------|
| Local dev   | No                | `server/data/documents/` (local disk) |
| Production  | Yes               | DigitalOcean Spaces (`reminder-files` bucket) |

Files uploaded in production get a `spaces_key` and `spaces_url` stored on the document record in MongoDB. Signed URLs (1-hour expiry) are generated on demand for downloads.
