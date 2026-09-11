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

Railway production is connected to `arshavskiy/Reminder` on branch `master`. Both client and server live in this single repo; there is no separate `reminder-server` repo.

```bash
git status
git add <files>
git commit -m "..."
git push origin master
```

### Deploy
1. Create new Railway project → **Deploy from GitHub repo**
2. Connect `arshavskiy/Reminder`
3. Use branch `master`
4. Set the service **root directory** to `server`
5. The builder is pinned to Railpack in `server/railway.json`; the start command is `npm start`

### System packages (Poppler / Tesseract)

PDF OCR shells out to `pdftoppm` (Poppler) and `tesseract`. These are **not** npm packages — they must be installed into the image by the builder, or invoice import fails with:

```
Error: Could not render PDF for OCR. Install Poppler/pdftoppm or set PDF_THUMBNAIL_PDFTOPPM. Details: Error: spawn pdftoppm ENOENT
```

The service builds with **Railpack** (`"builder": "RAILPACK"` in `railway.json`), configured by `server/railpack.json`:

```json
{
  "$schema": "https://schema.railpack.com",
  "provider": "node",
  "packages": { "node": "22", "python": "3.12" },
  "deploy": {
    "aptPackages": ["poppler-utils", "tesseract-ocr", "tesseract-ocr-heb"],
    "variables": { "PYTHONPATH": "/app/.python-packages" }
  }
}
```

Notes:
- The packages go under **`deploy.aptPackages`**, not the root `buildAptPackages`. Railpack's own schema describes `deploy.aptPackages` as packages "to include at runtime", while `buildAptPackages` installs "during the build step" only. OCR shells out at request time, so build-only packages would not be there when it runs.
- `pdfplumber` is a pip package, not an apt package. The Node provider only copies `/app` from the build step into the runtime image (Mise Python comes from the earlier `packages:mise` layer). Install into `/app/.python-packages` and set `PYTHONPATH` so `import pdfplumber` works at runtime. A plain `pip install` into site-packages is discarded.
- Railpack has no config-path setting, so `railpack.json` must sit in the Railway service's **root directory**, which is set to `server`.
- Railway's schema marks the Railpack builder **EXPERIMENTAL**. To fall back, set `"builder": "NIXPACKS"` in `railway.json` and restore a `server/nixpacks.toml` declaring the same packages under `aptPkgs` (see git history for the previous file).
- The start command comes from `railway.json`. Railpack's node provider would otherwise infer `npm start` from `package.json` anyway.
- Verify after deploy — either from the Railway shell, or over HTTP against the running service:

```bash
curl -s https://<your-railway-domain>/health/deps
```

  `ok: true` means both binaries resolved; the response names the exact missing one otherwise. Boot logs carry the same result as `system_dep_ok` / `system_dep_missing`.

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
