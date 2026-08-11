# Scripts

All scripts run from **repo root** unless noted. Server scripts need deps from `server/node_modules` — run them from the `server/` dir.

---

## Maintenance

### `server/scripts/backfill-reminders.mjs`
Creates reminders for contracts that have an `expiry_date` but no pending reminders — without re-scanning any documents.

```bash
cd server

# Dry run — shows what would be created
node scripts/backfill-reminders.mjs --dry-run

# Create missing reminders
node scripts/backfill-reminders.mjs

# Regenerate ALL reminders (including contracts that already have them)
node scripts/backfill-reminders.mjs --all

# Limit to one user
node scripts/backfill-reminders.mjs --user <userId>
```

### `scripts/migrate_advance_days.mjs`
One-time migration: updates reminder `trigger_date` values after changing `REMINDER_ADVANCE_DAYS`.

```bash
node scripts/migrate_advance_days.mjs
```

### `scripts/dedupe-reminders.ts` / `scripts/dedupe-equipment.ts`
Remove duplicate reminder / equipment rows (legacy Bun/SQLite scripts — only relevant for old SQLite data).

### `scripts/inspect-reminders.ts`
Print reminder rows for debugging (legacy Bun/SQLite).

---

## Testing / S3

### `scripts/test_s3.mjs` / `test_s3_debug.mjs` / `test_s3_pathstyle.mjs` / `test_s3_regions.mjs`
Connectivity and upload tests for the S3-compatible bucket. Set env vars `ENDPOINT`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `BUCKET` before running.

```bash
node scripts/test_s3.mjs
```

### `scripts/test_upload_s3.mjs`
Upload a test file to S3 and verify the public URL.

---

## Certificates / OCR

### `scripts/make_test_cert.mjs` / `make_test_cert.py`
Generate a test PDF certificate for OCR pipeline testing.

```bash
node scripts/make_test_cert.mjs
# or
python scripts/make_test_cert.py
```

### `scripts/test_certificate_hebrew.pdf`
Sample Hebrew certificate used in OCR tests.

---

## Invoices

### `scripts/download-invoices/`
Node script to download invoices from an external source. See `download-invoices/index.js` for configuration.

```bash
cd scripts/download-invoices
npm install
node index.js
```
