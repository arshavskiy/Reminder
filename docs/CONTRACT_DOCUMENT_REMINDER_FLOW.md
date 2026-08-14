# Contract → Document → Reminder Flow

Covers the current (2026-08-14) flow: creating a contract draft, filling a print template, generating a document (PDF), and creating reminders. Supersedes the old `/compose` single-page flow. See also [INSPECTION_TEMPLATE_FLOW.md](./INSPECTION_TEMPLATE_FLOW.md) (template designer + bind names, still accurate) and [FEATURES.md](./FEATURES.md).

> `docs/REMINDER_FLOW.md` is stale (describes a Bun/SQLite prototype). This project runs Node.js + MongoDB. Use [FEATURES.md § Reminders](./FEATURES.md#reminders) and § 5 below for the current reminder mechanics.

---

## 1. Storage model

MongoDB, no ORM. Collections in `server/src/db/db.ts:33-57`.

| Collection | Purpose | Key type |
|---|---|---|
| `contracts` | The contract/inspection record | `Contract` — `server/src/shared/types.ts:172-189` |
| `print_template_drafts` | In-progress "fill the template" state — doubles as the contract draft | `server/src/shared/types.ts` (`data`, `meta`, `client_id`, `contract_id`) |
| `print_templates` | Template designer definition (grid/cells) | `PrintTemplate` — `types.ts:461-472` |
| `documents` | Both scanned uploads and generated PDFs, distinguished by `document_source` | `Document` — `types.ts:122-147` |
| `reminders` | Expiry/task/manual reminders | `Reminder` — `types.ts:212-233` |

There is **no dedicated `contract_draft` collection** — a draft is a `print_template_drafts` row, optionally linked to a contract via `contract_id`.

Uniqueness on `print_template_drafts`:
- `(user_id, contract_id)` when a contract exists
- `(user_id, template_id)` when there's no contract yet (template-only draft)

`documents.document_source: "generated"` + `document_kind: "generated_print_template_pdf"` marks a PDF produced by this flow (as opposed to `"scanned"` uploads).

---

## 2. Routes (client)

`client/src/router/index.ts`:

| Path | Component | Notes |
|---|---|---|
| `/contracts` | `ContractsPage.vue` | List, manual create, entry point ("תסקיר חדש") |
| `/contracts/:contractId/draft` | `ContractDraftPage.vue` (new, 905 lines) | Compose page **for an existing contract** |
| `/print-templates/:templateId/draft` | `PrintTemplatesPage.vue` (compose mode) | Compose page **for a template with no contract yet** |
| `/settings/print-templates` | `PrintTemplatesPage.vue` (designer mode) | Template designer |
| `/reminders` | `RemindersPage.vue` | List/manual create/dismiss/snooze/send-now |
| `/documents`, `/documents/:id` | `DocumentsPage.vue` / `DocumentDetailPage.vue` | Shows scanned + generated docs |

Moved this commit: `/doc-templates`, `/email-templates`, `/print-templates` → redirect to `/settings/doc-templates`, `/settings/email-templates`, `/settings/print-templates`. `/compose` still redirects to `/settings/print-templates`.

Two compose components exist because a draft can be created either from a contract (`ContractDraftPage.vue`) or from the template list directly (`PrintTemplatesPage.vue` compose mode) — same underlying draft/PDF API, different entry context.

---

## 3. End-to-end flow

```
ContractsPage.vue                 ContractDraftPage.vue                  server
─────────────────                 ──────────────────────                ──────
"תסקיר חדש" modal
  pick/create client
  pick equipment
  pick template
        │
        ▼
saveHydraulicDraftAndPreview()
openContractInTemplate()  ───────────────────────────────────────►  PUT /api/print-templates/:id/draft
   (saves draft, meta.client_id,                                     upsert print_template_drafts
    meta.equipment_ids, source)
        │
        ▼
navigate to
/contracts/:contractId/draft  ──►  loads template + draft  ───────►  GET /api/print-templates/:id/draft?contractId=
                                    (ContractDraftPage.vue)
                                         │
                                    edit cells / side panel
                                    (composeData)
                                         │
                        ┌────────────────┼─────────────────┬──────────────────┐
                        ▼                ▼                 ▼                  ▼
                  שמור טיוטה       הדפס PDF          שמור PDF            צור חוזה + תזכורת
                  saveComposeDraft  printPdf()        savePdf()          (creates/updates contract,
                        │                │                │               calls reminder generation)
                        ▼                ▼                ▼
             PUT .../draft      POST .../pdf      POST .../pdf/save
             (persist data/meta) (preview render)  (renders PDF, inserts
                                                     `documents` row with
                                                     document_source=
                                                     "generated", returns
                                                     X-Document-Id header)
```

### Step detail

1. **Draft creation** — `ContractsPage.vue:1858` `saveHydraulicDraftAndPreview` / `:1894` `openContractInTemplate` write the initial draft via `api.printTemplates.saveDraft` (`PUT /api/print-templates/:id/draft`, `server/src/routes/printTemplates.ts:131`), then route to the compose page.
2. **Compose** — `ContractDraftPage.vue` loads via `GET /api/print-templates/:id/draft?contractId=` (`printTemplates.ts:112`). Passing `contractId` scopes the draft lookup/save to `(user_id, contract_id)` instead of `(user_id, template_id)` — this is what lets the same template be reused for multiple contracts without draft collisions.
3. **Save draft** — `PUT /api/print-templates/:id/draft` upserts `print_template_drafts`, filtered by `contract_id` when present (`printTemplates.ts:138-150`).
4. **Preview PDF** — `POST /api/print-templates/:id/pdf` (`printTemplates.ts:173`) renders via `renderTemplatePdf()` (Puppeteer/Chromium), returns the PDF inline. No DB write.
5. **Generate document** — `POST /api/print-templates/:id/pdf/save` (`printTemplates.ts:189`, added this commit) renders the same PDF, then calls `saveGeneratedPdfDocument()`:
   - Hashes the PDF (SHA-256), writes to `data/documents/<hash>.pdf` (dedup by hash, same convention as uploads).
   - Uploads to DigitalOcean Spaces if configured, with a 7-day signed URL.
   - Inserts a `documents` row (`document_source: "generated"`, `document_kind: "generated_print_template_pdf"`), linked to `contract_id`/`client_id` from draft meta.
   - Returns the PDF as an attachment with header `X-Document-Id: <new document id>`.
   - This document now shows up in `DocumentsPage.vue` / `DocumentDetailPage.vue` alongside scanned uploads.
6. **Contract + reminders** — `צור חוזה + תזכורת` creates/updates the `contracts` row (`POST`/`PUT /api/contracts`) using the draft's `client_id` and filled fields, writes the resulting `contract_id` back onto the draft, and triggers `generateContractReminders()` when `expiry_date` is in the future (one `reminders` row per configured advance-day, e.g. 90/60/30 days out).

---

## 4. Reminder creation paths

- **Auto, from contract expiry** — any contract create/update with a future `expiry_date` calls `generateContractReminders()` (`server/src/reminders/scheduler.ts`), deduped on `(source_id, advance_days)`.
- **Manual** — `POST /api/reminders` (`server/src/routes/reminders.ts:181`), `source_type: "manual"`, not tied to a contract.
- **Bulk/quick-entry** — `POST /api/reminders/hydraulic-check` (`reminders.ts:225`) creates client + equipment + contract + reminders in one call.
- **Auto-renewal** — when the last pending reminder for a contract is sent, `advanceContractAfterSentReminder()` (`scheduler.ts:381`) pushes `expiry_date`/`start_date` forward by the inspection interval and regenerates the next cycle's reminders.

---

## 5. Sending

- Delivery: `sendReminderEmail()` in `server/src/reminders/emailSender.ts:406`. Template resolution: `reminder.email_template_id` → user's `default_email_template_id` → fallback (`renderReminderEmail`, `emailSender.ts:312`). Transport: Resend (`RESEND_API_KEY`) or SMTP via nodemailer.
- Scheduler (`scheduler.ts:44`) only runs when `APP_ENV=production`; polls `pending` reminders with `trigger_date <= today`.
- Manual fire: `POST /api/reminders/:id/send-now` (`reminders.ts:648`) — same send path, synchronous.
- Escalation: `checkEscalations()` — see [FEATURES.md § Reminder Escalation](./FEATURES.md#reminder-escalation).

---

## 6. Status fields

| Field | Values | Notes |
|---|---|---|
| `Contract.status` | `active` \| `expired` \| `cancelled` \| `renewed` | No `draft` status server-side — `"draft"` input is coerced to `"active"` (`contracts.ts:56,547`). "Draft" only exists as the `print_template_drafts` row prior to contract creation. |
| `Document.processing_status` | `queued` \| `processing` \| `done` \| `error` | Generated PDFs insert directly as `"done"` (`printTemplates.ts:281`). |
| `Reminder.status` | `pending` → `sent` \| `snoozed` \| `dismissed` \| `error` | |

`print_template_drafts` has no status field — existence of the row models "has a draft"; generating a PDF does not delete it, so the draft can be revisited/regenerated.
