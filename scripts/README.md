# Scripts

All scripts run from **repo root** unless noted otherwise.

Server scripts (`server/scripts/`) require MongoDB deps — run them from the `server/` directory.

---

## Reminder / Contract maintenance

### `server/scripts/backfill-reminders.mjs`
Creates reminders for contracts that have an `expiry_date` but no pending reminders — without re-scanning documents.

Reads `MONGODB_LOCAL_URI` / `MONGODB_URI`, `MONGODB_DB`, and `REMINDER_ADVANCE_DAYS` from `server/.env`.

```bash
cd server

# Preview only — no writes
node scripts/backfill-reminders.mjs --dry-run

# Create missing reminders
node scripts/backfill-reminders.mjs

# Regenerate ALL, including contracts that already have reminders
node scripts/backfill-reminders.mjs --all

# Limit to one user
node scripts/backfill-reminders.mjs --user <userId>
```

### `scripts/migrate_advance_days.mjs`
One-time migration: resets `user_settings.reminder_advance_days` from the old multi-value format (`"[90,60,30]"`) to `"[30]"`. Requires `MONGODB_URI` and `MONGODB_DB` in env.

```bash
MONGODB_URI=... MONGODB_DB=reminder-app node scripts/migrate_advance_days.mjs
```

---

## Deduplication (legacy SQLite)

These scripts operate on the old SQLite database (`data/reminder.db`). They are **not needed for MongoDB** deployments but kept for reference.

### `scripts/dedupe-equipment.ts`
Removes duplicate rows from the `equipment` table (grouped by `name` + `category`). Creates a backup at `data/reminder.db.auto_dedupe.bak` before making changes.

```bash
bun scripts/dedupe-equipment.ts
```

### `scripts/dedupe-reminders.ts`
Removes duplicate rows from the `reminders` table (grouped by `source_type`, `source_id`, `advance_days`, `status`). Creates a backup at `data/reminder.db.auto_dedupe_reminders.bak`.

```bash
bun scripts/dedupe-reminders.ts
```

### `scripts/inspect-reminders.ts`
Read-only diagnostic: prints total reminder count, duplicate groups, and a full listing of all rows. Useful for debugging the SQLite reminder table.

```bash
bun scripts/inspect-reminders.ts
```

---

## S3 / Storage testing

All S3 scripts read credentials from env vars. The simplest way is to pass `--env-file`:

```bash
node --env-file=server/.env scripts/test_s3.mjs
```

Required env vars: `ENDPOINT`, `BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Optional: `REGION` (default `auto`).

### `scripts/test_s3.mjs`
Full connectivity test: PUT a small object, GET it, generate a presigned URL, then DELETE it. Prints pass/fail for each step.

### `scripts/test_s3_debug.mjs`
Prints raw credential values (lengths, first/last chars, hex bytes) to diagnose authentication failures — e.g. hidden whitespace or encoding issues in `AWS_SECRET_ACCESS_KEY`.

### `scripts/test_s3_pathstyle.mjs`
Same as `test_s3.mjs` but forces path-style URLs (`endpoint/bucket/key`) instead of virtual-hosted style. Use when the S3 provider doesn't support virtual hosting.

### `scripts/test_s3_regions.mjs`
Tries uploading to several common region endpoints to identify which one accepts the credentials.

### `scripts/test_upload_s3.mjs`
End-to-end test: uploads a file through the app's `/api/documents/upload` HTTP endpoint and then verifies the object landed in S3 via `HeadObject`. Requires the server to be running.

```bash
node --env-file=server/.env scripts/test_upload_s3.mjs
```

---

## Certificate / OCR testing

### `scripts/make_test_cert.mjs`
Generates a minimal test document (UTF-8 text file) that the import pipeline can process without a real PDF. Used for OCR pipeline unit testing.

```bash
node scripts/make_test_cert.mjs
```

### `scripts/make_test_cert.py`
Generates a proper Hebrew-text PDF using `fpdf2` and the bundled `NotoSansHebrew.ttf` font. The resulting PDF renders Hebrew correctly for Tesseract OCR tests.

```bash
pip install fpdf2
python scripts/make_test_cert.py
```

Output: `scripts/test_certificate_hebrew.pdf`

---

## Invoice downloader

### `scripts/download-invoices/index.js`
Downloads PDF invoice attachments from Gmail (phone, internet, digital-service payment emails) using the Gmail API. Saves PDFs locally.

Requires a Google OAuth2 client configured for the Gmail API. On first run it opens a browser for authorization and saves the token to `token.json`.

```bash
cd scripts/download-invoices
npm install
node index.js
```
