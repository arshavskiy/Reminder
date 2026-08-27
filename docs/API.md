# API Reference

Base URL in production: `https://<your-railway-domain>`  
Base URL in development: `http://localhost:3737`

All protected endpoints require the session cookie `sid` set by `/api/auth/login` or the Google OAuth callback. Unauthenticated requests return `401 { "error": "..." }`. Insufficient role returns `403`.

All request and response bodies are JSON unless noted.

---

## Authentication

### `POST /api/auth/register`

Register with email and password.

**Body**
```json
{ "email": "user@example.com", "name": "Your Name", "password": "secret" }
```

**Response** `201`
```json
{ "message": "Verification email sent. Please check your inbox." }
```

---

### `GET /auth/verify-email?token=<token>`

Verify email address from the link sent during registration. Redirects to `/login` on success.

---

### `POST /api/auth/login`

**Body**
```json
{ "email": "user@example.com", "password": "secret" }
```

**Response** `200` — sets `sid` cookie
```json
{ "id": "...", "email": "user@example.com", "name": "...", "role": "user" }
```

---

### `POST /api/auth/logout`

Revokes the current session. Clears `sid` cookie.

**Response** `200` `{ "ok": true }`

---

### `GET /api/auth/me`

Returns the currently authenticated user, or `{ "user": null }` if no session.

**Response** `200`
```json
{
  "user": {
    "id": "...", "email": "...", "name": "...",
    "picture_url": "...", "role": "user", "is_active": 1,
    "created_at": "2026-01-01T00:00:00.000Z", "last_login_at": "..."
  }
}
```

---

### `POST /api/auth/forgot-password`

**Body** `{ "email": "user@example.com" }`

Sends a password reset email if the address exists. Always returns `200` to prevent enumeration.

---

### `POST /api/auth/reset-password`

**Body** `{ "token": "<reset-token>", "password": "newpassword" }`

**Response** `200` `{ "ok": true }`

---

### `GET /auth/google`

Redirects the browser to Google OAuth consent screen.

---

### `GET /auth/google/callback`

OAuth callback — exchanges code for tokens, creates or updates user record, sets session cookie, redirects to `/`.

---

### `POST /api/auth/google`

Google Identity Services (GIS) one-tap sign-in.

**Body** `{ "credential": "<id-token-jwt>" }`

**Response** `200` — sets `sid` cookie, returns user object

---

## Google Calendar

Calendar endpoints require the authenticated `sid` cookie.

### `GET /api/calendar/auth-url`

Starts the Google Calendar OAuth consent flow.

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `returnTo` | string | Optional frontend path to return to after consent |

**Response** `200`

```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

### `GET /api/calendar/status`

Returns Calendar connection state for the current user.

**Response** `200`

```json
{
  "connected": true,
  "calendar_id": "...",
  "calendar_url": "https://calendar.google.com/calendar/u/0/r?cid=...",
  "email": "user@example.com",
  "synced_count": 12,
  "last_synced_at": "2026-08-27T06:00:00.000Z"
}
```

### `POST /api/calendar/sync`

Pushes pending/snoozed reminders to the app-owned Google calendar, then pulls remote date changes and deleted events back into reminders.

**Response** `200`

```json
{ "pushed": 12, "updated": 1, "cancelled": 0 }
```

Calendar behavior:

- Dedicated calendar name: `תסקירים`
- Event title: `תסקיר לא בתוקף - <company name>`
- Event details include reminder snapshot data: company/client, contact person, email, phone, contract number/type, equipment, and original reminder text
- Events are matched through private extended properties, not by title

### `POST /api/calendar/disconnect`

Removes Calendar tokens and local event links. Existing Google Calendar events are left in the user's Google account.

**Response** `200` `{ "ok": true }`

---

## Documents

All document endpoints are user-scoped. One user cannot access another user's documents.

### `GET /api/documents`

**Query params**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by `processing_status` |
| `limit` | number | Default `50` |
| `offset` | number | Default `0` |

**Response** `200`
```json
{ "rows": [ { "id": "...", "file_name": "...", "processing_status": "done", ... } ], "total": 42 }
```

---

### `GET /api/documents/:id`

**Response** `200` — full document record including `extracted_fields`, `raw_text`, `spaces_url`

---

### `POST /api/documents/import`

Upload a file for processing. `Content-Type: multipart/form-data`

**Form fields**
| Field | Type | Description |
|-------|------|-------------|
| `file` | File | The document to import |
| `assignClientId` | string | (optional) Pre-assign to an existing client |

Processing is asynchronous. The endpoint returns immediately with the document ID; use polling or WebSocket events (`document:progress`, `document:done`) to track progress.

**Response** `201`
```json
{ "documentId": "...", "status": "queued" }
```

---

### `POST /api/documents/:id/reprocess`

Re-run OCR + AI extraction on an existing document.

**Response** `200` `{ "ok": true }`

---

### `DELETE /api/documents/:id`

**Response** `200` `{ "ok": true }`

---

## Clients

### `GET /api/clients`

**Query params** `q` (search), `limit`, `offset`

**Response** `200` `{ "rows": [...], "total": N }`

---

### `POST /api/clients`

**Body**
```json
{
  "display_name": "חברה בע\"מ",
  "entity_type": "company",
  "id_number": "51-234567-8",
  "email": "contact@example.com",
  "phone": "050-1234567",
  "address": "...",
  "notes": "...",
  "tags": ["vip"]
}
```

**Response** `201` — created client

---

### `GET /api/clients/:id`

**Response** `200` — client record plus computed counts:
```json
{ "id": "...", "display_name": "...", "doc_count": 3, "contract_count": 2, "open_reminder_count": 1 }
```

---

### `PUT /api/clients/:id`

Partial update — only provided fields are changed.

---

### `DELETE /api/clients/:id`

**Response** `200` `{ "ok": true }`

---

### `GET /api/clients/:id/documents`

Documents linked to this client via `document_clients`.

**Response** `200` — array of document records

---

### `GET /api/clients/:id/timeline`

**Response** `200` — array of `timeline_events` sorted by `event_date` desc

---

## Contracts

### `GET /api/contracts`

**Query params**
| Param | Values | Description |
|-------|--------|-------------|
| `clientId` | string | Filter by client |
| `status` | `active` \| `expired` \| `cancelled` \| `renewed` | |
| `kind` | `contract` \| `inspection` | Contract type filter |
| `limit` | number | Default `50` |
| `offset` | number | Default `0` |

**Response** `200` — rows include `client_name` and `document_name`

---

### `POST /api/contracts`

**Body**
```json
{
  "document_id": "...", "client_id": "...",
  "contract_number": "C-001", "contract_type": "חוזה שירות",
  "start_date": "2026-01-01", "expiry_date": "2027-01-01",
  "amount": 50000, "currency": "ILS",
  "counterparty": "...", "summary": "..."
}
```

Creates reminders automatically if `expiry_date` is provided.

---

### `GET /api/contracts/expiring`

**Query params** `days` (default `30`)

Returns contracts with `status=active` and `expiry_date` within the next N days.

---

### `GET /api/contracts/:id`

---

### `PUT /api/contracts/:id`

If `expiry_date` is updated, existing `pending` reminders are regenerated.

---

### `DELETE /api/contracts/:id`

---

## Reminders

### `GET /api/reminders`

**Query params**
| Param | Description |
|-------|-------------|
| `status` | `pending` \| `sent` \| `snoozed` \| `dismissed` \| `error` |
| `days` | Only reminders triggering within N days |
| `limit` / `offset` | Pagination |

**Response** rows include `client_name` and `document_name`

---

### `POST /api/reminders`

**Body**
```json
{
  "title": "חידוש רישיון", "trigger_date": "2026-06-01",
  "client_id": "...", "document_id": "...",
  "email_to": "[\"user@example.com\"]",
  "email_template_id": "..."
}
```

---

### `PUT /api/reminders/:id`

Fields: `title`, `body`, `trigger_date`, `email_to`, `status`, `email_template_id`

---

### `POST /api/reminders/:id/dismiss`

Sets `status=dismissed`.

---

### `POST /api/reminders/:id/snooze`

**Body** `{ "until": "2026-07-01" }` — sets `status=snoozed` and advances `trigger_date`

---

### `POST /api/reminders/:id/send-now`

Force-sends the reminder email immediately, logs to `email_log`, sets `status=sent`.

**Response** `200`
```json
{ "success": true }
```
or
```json
{ "success": false, "error": "SMTP connection refused" }
```

---

## Equipment

### `GET /api/equipment`

**Query params** `category`, `q` (name/manufacturer/model search), `client_id`

When `client_id` is provided, returns equipment linked directly to that client **or** linked via a document associated with the client.

Response rows include `client_name` and `document_name`.

---

### `GET /api/equipment/stats`

**Response** `200`
```json
{ "all": 42, "lift": 18, "scaffold": 12, "crane": 8, "other": 4 }
```

---

### `POST /api/equipment`

**Body**
```json
{
  "name": "מנוף גבוה",
  "category": "crane",
  "manufacturer": "Liebherr",
  "model": "LTM 1100",
  "serial_number": "SN-12345",
  "capacity": "100 טון",
  "client_id": "..."
}
```

---

### `PUT /api/equipment/:id`

Fields: `name`, `category`, `manufacturer`, `model`, `serial_number`, `capacity`, `load_capacity_test`, `load_radius`, `description`, `notes`, `is_active`, `client_id`

---

### `DELETE /api/equipment/:id`

---

### `POST /api/equipment/backfill`

Scans all `extractions` and patches equipment records that are missing `document_id` or `client_id`. Safe to call repeatedly.

**Response** `200` `{ "ok": true, "patched": 7 }`

---

## Tasks

### `GET /api/tasks`

**Query params** `status`, `clientId`

---

### `PUT /api/tasks/:id`

Fields: `description`, `due_date`, `status`

---

## Search

### `GET /api/search?q=<query>`

Searches documents (`file_name`, `raw_text`, `document_type`, `document_number`), clients (`display_name`, `email`, `id_number`), and contracts (`contract_number`, `contract_type`, `counterparty`).

**Query params** `q` (required), `limit` (default `20`)

**Response** `200`
```json
{
  "documents": [...],
  "clients": [...],
  "contracts": [...]
}
```

---

## Dashboard

### `GET /api/dashboard/stats`

All counts scoped to the authenticated user.

**Response** `200`
```json
{
  "total_documents": 50,
  "total_clients": 30,
  "total_contracts": 20,
  "active_contracts": 15,
  "total_inspections": 12,
  "pending_reminders": 5,
  "expiring_soon": 3,
  "recent_documents": [...],
  "upcoming_reminders": [...]
}
```

---

## Profile

### `GET /api/profile/stats`

**Response** `200`
```json
{ "active": 5, "snoozed": 2, "completed": 18 }
```

---

## User Settings

### `GET /api/user-settings`

**Response** `200`
```json
{
  "theme": "light",
  "email_from_name": "ReminderOCR",
  "reminder_advance_days": "[30]",
  "ocr_language": "heb+eng"
}
```

---

### `PUT /api/user-settings`

Partial update — upserts on `user_id`.

---

## Settings (admin only)

### `GET /api/settings`

Returns the full `AppSettings` object.

---

### `POST /api/settings`

Updates the settings file. Changes take effect immediately.

---

## Admin (admin only)

### `GET /api/admin/users`

Returns all users. Password hashes and session tokens are stripped from the response.

---

### `PUT /api/admin/users/:id`

**Body** — provide one or both fields:
```json
{ "role": "pro", "is_active": 1 }
```

- `role` must be `"user"`, `"pro"`, or `"admin"`
- Admins cannot demote themselves

---

## WebSocket Events

Connect to `ws://<host>/ws` (or `wss://` in production). The server pushes progress events during document processing.

| Event type | Payload | Description |
|-----------|---------|-------------|
| `document:queued` | `{ documentId, fileName }` | File accepted, queued for processing |
| `document:progress` | `{ documentId, stage, progress }` | Processing milestone (10–75%) |
| `document:done` | `{ documentId, status, error? }` | Processing complete or failed |

`stage` values: `extracting_text`, `ocr`, `ai_extraction`, `saving_entities`

---

## Error Format

All errors return JSON:

```json
{ "error": "Human-readable message" }
```

Common status codes:

| Code | Meaning |
|------|---------|
| `400` | Bad request (missing required field, invalid value) |
| `401` | Not authenticated (no session or expired session) |
| `403` | Forbidden (role too low, or inactive account) |
| `404` | Resource not found (or belongs to a different user) |
| `409` | Conflict (duplicate email on registration) |
| `500` | Internal server error |

## Contract and Inspection Reports

## Print Templates

Print templates power the Excel-style תסקיר designer and compose flow.

### `GET /api/print-templates/:id/draft`

Returns the authenticated user's saved fill draft for a template.

Response fields:

| Field | Type | Description |
| --- | --- | --- |
| `data` | object | Template bind/value map rendered into field cells |
| `meta` | object | Non-render metadata such as source, client id, equipment ids |
| `client_id` | string \| null | Selected client linked to this draft |
| `contract_id` | string \| null | Contract created from this draft, when available |
| `updated_at` | string \| null | Last save timestamp |

### `PUT /api/print-templates/:id/draft`

Saves a fill draft for a template.

Request:

```json
{
  "data": {
    "client_company": "Example Ltd",
    "expiry_date": "2027-10-29"
  },
  "meta": {
    "source": "hydraulic_check",
    "client_id": "66bd...",
    "equipment_ids": ["66bf..."]
  }
}
```

The server stores sanitized `data`, sanitized `meta`, and copies `meta.client_id` / `meta.contract_id` to top-level `client_id` / `contract_id`.

### `POST /api/print-templates/:id/pdf`

Renders a filled template as PDF from request `data`.

See [INSPECTION_TEMPLATE_FLOW.md](./INSPECTION_TEMPLATE_FLOW.md) for the full תסקיר draft, PDF, contract, client, and equipment flow.

### `GET /api/contracts/monthly-report.pdf`

Downloads an authenticated PDF report for contracts and inspections whose `start_date` falls within the selected month.

**Query parameters**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `year` | no | Four-digit year. Defaults to the current year. |
| `month` | no | Month number `1`-`12`. Defaults to the current month. |
| `kind` | no | `all`, `contract`, or `inspection`. The UI uses `all` for the monthly report. |

The response is `application/pdf` with a downloadable filename such as `contracts-report-2026-07.pdf`. The report includes client details, contract fields, merged extracted/manual fields, equipment rows, source document name, and reminders linked to each contract.

### Client export generator

The Contracts page export wizard applies client-side filters and selected columns, then generates one of these formats:

- CSV download: `contracts-YYYY-MM-DD.csv`
- Excel download: `contracts-YYYY-MM-DD.xlsx`
- PDF print view: opens a print-ready RTL document for browser printing or Save as PDF
## Monthly Report Delivery

### `GET /api/reports/monthly/download`

Generates a downloadable report for the authenticated user. Query parameters are `year`, `month`, `format` (`pdf` or `csv`), and optional comma-separated `fields`. The response contains the generated file with a month-specific filename. CSV files use Hebrew headers, UTF-8 BOM, and RTL marks for Excel-compatible Hebrew display.

Example: `/api/reports/monthly/download?year=2026&month=7&format=csv`


### `POST /api/reports/monthly/send`

Generates separate monthly reports per client and sends each report to that client's email plus the authenticated user and configured recipients. The optional `clientId` limits delivery to one client.

**Optional body**

```json
{
  "year": 2026,
  "month": 7,
  "formats": ["pdf", "csv"],
  "recipients": ["reports@example.com"],
  "clientId": "optional-client-id"
}
```

When omitted, the current month, saved formats, and saved recipients are used. If no recipients are configured, the authenticated user's account email is used.

Automatic delivery is controlled by these `/api/user-settings` fields:

| Field | Description |
|-------|-------------|
| `monthly_report_enabled` | Enables the monthly scheduler job |
| `monthly_report_recipients` | Comma/semicolon/space-separated recipient emails |
| `monthly_report_day` | Day of month, clamped to `1`-`28` |
| `monthly_report_hour` | Hour of day, `0`-`23` |
| `monthly_report_formats` | JSON string containing `pdf`, `csv`, or both |
| `monthly_report_last_sent` | `YYYY-MM` marker preventing duplicate monthly sends |
| `monthly_report_last_error` | Most recent delivery error, if any |
