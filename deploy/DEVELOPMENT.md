# Hosted development environment

Inventory verified on 2026-09-22.

| Component | Development target | Status |
| --- | --- | --- |
| Client | Vercel `reminder`, branch `dev`, `https://dev.remindocr.com` | Existing verified domain |
| API | Railway `pacific-tranquility` / `development` / `reminder-dev` | Created; not deployed |
| API domain | `https://reminder-dev-development.up.railway.app` | Created, port 3737 |
| Database | Atlas project `reminder`, cluster `Cluster0-dev` | Existing cluster; connection verified |
| App database | `reminder-dev` on `Cluster0-dev` | Selected in Railway; initialized on first successful app startup |
| Uploads | Railway `reminder-dev-files`, Amsterdam | Created |

Railway development environment ID: `c88d1218-c7b6-4635-abdd-f1eb297ae436`.
API service ID: `886920ae-13d7-410b-9d8a-0c2e9ba716f3`.

Production uses Vercel branch `master`, `app.remindocr.com`, Railway's
`production` environment, and Atlas `Cluster10`. The current `dev` branch
still has API/auth rewrites pointing at production. The existing dev domain
must not be treated as an isolated environment until routing is deployed.

## Prepared configuration

`deploy/vercel.dev.json` is a client deployment configuration with `/api/*`
and `/auth/*` routed to the new Railway development service. It is not active
yet. Apply it as `client/vercel.json` only on the dev branch, or use it as the
explicit config for a dev deployment. Do not replace production routing.

The API has `/server` as its build root, `npm start` as its start command,
and `/health` as its health check. Non-secret environment variables are set:

- Frontend, server links, and OAuth callbacks use `https://dev.remindocr.com`.
- Cookies use `Domain=dev.remindocr.com`, Secure, SameSite=Lax.
- CORS allows the dev frontend and `http://localhost:4173`.
- Mongo database name is `reminder-dev`.
- Automatic reminders, watched-folder ingestion, and WhatsApp are disabled.

## Remaining activation steps

1. Approve reuse of existing Atlas, Google OAuth, OpenAI, and Resend credentials,
   or provide development-specific credentials through the platform settings.
   Automatic approval review blocked the credential-copy operation; no secrets
   were copied into the new service.
2. Configure `MONGODB_URI` for `cluster0-dev.7ga8v0c.mongodb.net`, a new session
   secret, and credentials for the new development bucket. Keep production
   Mongo URI aliases and production bucket credentials absent.
3. Connect Railway `reminder-dev` to `arshavskiy/Reminder`, branch `dev`, and
   deploy after all required variables are present.
4. Verify Google permits the dev Google, Gmail, and Calendar callback URLs.
5. Apply the prepared client routing on branch `dev`. Ensure both
   `VITE_API_BASE` and `VITE_ADMIN_API_BASE` use the same-origin proxy rather
   than production. Redeploy Vercel's dev branch.
6. Verify API health and OCR dependencies, sign-in, upload/extraction, storage,
   and database isolation through the dev domain. No end-to-end checks have
   been performed yet.

Existing database credentials are shared at the Atlas project level. Reusing
them does not provide credential-level isolation from production; a restricted
dev database user would provide stronger isolation. The existing `reminder`
database on Cluster0-dev is left unchanged.
