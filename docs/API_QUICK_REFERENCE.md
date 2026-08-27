# API Quick Reference

Base URL: `http://localhost:3737` (dev) | `https://reminderocr-api.railway.app` (prod)

All endpoints require `sid` cookie (set by login) except where noted with 🔓.

---

## Authentication 🔓

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/logout` | Logout |
| GET | `/auth/verify-email?token=...` | Verify email link |
| POST | `/api/auth/google/callback` | Google OAuth callback |

---

## Clients

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/clients` | List all clients (paginated) |
| GET | `/api/clients?q=...` | Search clients |
| POST | `/api/clients` | Create client |
| GET | `/api/clients/{id}` | Get client by ID |
| PUT | `/api/clients/{id}` | Update client |
| DELETE | `/api/clients/{id}` | Delete client |
| GET | `/api/clients/{id}/timeline` | Get client activity timeline |

---

## Contracts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contracts` | List contracts |
| GET | `/api/contracts?clientId={id}` | Filter by client |
| GET | `/api/contracts?kind=inspection` | Filter by type (contract/inspection/all) |
| GET | `/api/contracts/expiring?days=30` | Get contracts expiring in N days |
| GET | `/api/contracts/by-document/{docId}` | Get contracts linked to document |
| POST | `/api/contracts` | Create contract |
| GET | `/api/contracts/{id}` | Get contract |
| PUT | `/api/contracts/{id}` | Update contract |
| DELETE | `/api/contracts/{id}` | Delete contract |

---

## Reminders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reminders` | List reminders |
| GET | `/api/reminders?status=pending` | Filter by status |
| GET | `/api/reminders?days=30` | Get reminders in next N days |
| POST | `/api/reminders` | Create reminder |
| GET | `/api/reminders/{id}` | Get reminder |
| PUT | `/api/reminders/{id}` | Update reminder |
| DELETE | `/api/reminders/{id}` | Delete reminder |
| POST | `/api/reminders/{id}/send-now` | Send reminder immediately |
| POST | `/api/reminders/{id}/dismiss` | Dismiss reminder |
| POST | `/api/reminders/{id}/snooze` | Snooze reminder to date |
| POST | `/api/reminders/hydraulic-check` | Create hydraulic inspection reminder |

### Reminder Creation (POST /api/reminders)

**Minimum required fields:**
```json
{
  "client_id": 1,
  "title": "Inspection Reminder",
  "trigger_date": "2026-08-22",
  "email_to": ["client@example.com"]
}
```

**Optional fields:**
```json
{
  "source_type": "manual|contract_expiry|equipment_inspection|task",
  "source_id": 123,  // contract/equipment ID if linked
  "body": "Reminder details",
  "advance_days": 30,
  "email_template_id": "template-id",
  "equipment_type": "lift",
  "manufacturer": "OTIS",
  "model": "X-2000",
  "serial_number": "ABC123"
}
```

---

## Equipment

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/equipment` | List all equipment |
| GET | `/api/equipment?category=lift` | Filter by category |
| GET | `/api/equipment?client_id={id}` | Filter by client |
| GET | `/api/equipment?q=...` | Search equipment |
| GET | `/api/equipment/stats` | Get equipment statistics |
| GET | `/api/equipment/expiry-calendar` | Get expiry calendar |
| POST | `/api/equipment` | Create equipment |
| GET | `/api/equipment/{id}` | Get equipment |
| PUT | `/api/equipment/{id}` | Update equipment |
| DELETE | `/api/equipment/{id}` | Delete equipment |
| GET | `/api/equipment/{id}/history` | Get inspection history |
| GET | `/api/equipment/{id}/report.pdf` | Download equipment report |
| POST | `/api/equipment/{id}/photos` | Upload equipment photo |
| GET | `/api/equipment/{id}/photos/signed` | Get signed photo URLs |

## Print Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/print-templates` | List print templates |
| POST | `/api/print-templates` | Create print template |
| PUT | `/api/print-templates/{id}` | Update print template |
| DELETE | `/api/print-templates/{id}` | Delete print template |
| GET | `/api/print-templates/{id}/draft` | Get saved fill draft with `data`, `meta`, `client_id`, `contract_id` |
| PUT | `/api/print-templates/{id}/draft` | Save fill draft data and linkage metadata |
| POST | `/api/print-templates/{id}/pdf` | Render filled template as PDF |

---

## Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents` | List documents |
| GET | `/api/documents?status=processing` | Filter by status |
| GET | `/api/documents?clientId={id}` | Filter by client |
| POST | `/api/documents/upload` | Upload files for OCR |
| GET | `/api/documents/{id}` | Get document details |
| GET | `/api/documents/{id}/download` | Download original file |
| DELETE | `/api/documents/{id}` | Delete document |
| POST | `/api/documents/{id}/extract` | Re-run OCR extraction |
| POST | `/api/documents/{id}/reprocess` | Reprocess document |
| PUT | `/api/documents/{id}/fields` | Update extracted fields |

### Document Upload (POST /api/documents/upload)

**Query parameters:**
- `skipAi=true` — Skip AI extraction, OCR only
- `skipEntities=true` — Skip entity extraction
- `skipReminders=true` — Don't auto-create reminders
- `templateId={id}` — Use specific extraction template

**Body:** multipart/form-data with `files` array

---

## Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/email-templates` | List email templates |
| POST | `/api/email-templates` | Create template |
| GET | `/api/email-templates/{id}` | Get template |
| PUT | `/api/email-templates/{id}` | Update template |
| DELETE | `/api/email-templates/{id}` | Delete template |
| POST | `/api/email-templates/vars` | Detect variables in HTML |
| POST | `/api/email-templates/preview` | Preview rendered template |
| GET | `/api/email-templates/defaults/{name}` | Get default template |

### Default Template Names
- `default` — General reminder
- `inspection` — Inspection/test reminder
- `contract` — Contract renewal
- `invoice` — Payment/invoice
- `verify-email` — Email verification
- `reset-password` — Password reset

---

## Dashboard & Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Get dashboard statistics |
| GET | `/api/user-settings` | Get user preferences |
| PUT | `/api/user-settings` | Update user preferences |
| GET | `/api/settings` | Get system settings (admin) |
| POST | `/api/settings` | Update settings (admin) |
| GET | `/api/config` | Get public config |

---

## Google Calendar

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/calendar/auth-url?returnTo=/profile?section=settings` | Start Google Calendar OAuth consent |
| GET | `/api/calendar/status` | Get connection state, account email, synced count, and calendar link |
| POST | `/api/calendar/sync` | Push pending reminders to Google Calendar and pull remote date/deletion changes |
| POST | `/api/calendar/disconnect` | Disconnect Calendar tokens and forget event links |
| GET | `/auth/calendar/callback` | OAuth callback used by Google |

Calendar sync creates a dedicated Google calendar named `תסקירים`. Reminder events use the title `תסקיר לא בתוקף - <company name>` and keep client/contact/equipment data in the event details.

---

## Email & Reporting

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/email-log` | Get email delivery log |
| POST | `/api/email/test` | Send test email |
| GET | `/api/reports/clients?month=2026-07` | Get monthly client report |

---

## Common Query Parameters

| Parameter | Values | Example |
|-----------|--------|---------|
| `limit` | 1-100 | `?limit=50` |
| `offset` | >= 0 | `?offset=100` |
| `sort` | field name | `?sort=created_at` |
| `q` | search string | `?q=inspection` |

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Bad request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not found |
| 409 | Conflict (duplicate) |
| 500 | Server error |

---

## Error Response Format

```json
{
  "error": "Error message",
  "status": 400,
  "path": "/api/endpoint"
}
```

---

## Example: Create Reminder with Contract

```bash
curl -X POST http://localhost:3737/api/reminders \
  -H "Content-Type: application/json" \
  -b "sid=<session-cookie>" \
  -d '{
    "client_id": 1,
    "source_type": "contract_expiry",
    "source_id": 42,
    "title": "Contract Renewal - Contract #2026-001",
    "trigger_date": "2026-08-22",
    "advance_days": 30,
    "email_to": ["client@example.com"],
    "email_template_id": "contract-template",
    "equipment_type": "lift",
    "manufacturer": "Schindler",
    "model": "3300",
    "serial_number": "SN-123456"
  }'
```

---

## Webhooks & Events

**Coming Soon:**
- POST hook on reminder sent
- POST hook on document processing complete
- POST hook on contract expiry milestone

---

Last updated: 2026-07-24
