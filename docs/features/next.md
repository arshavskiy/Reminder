# Roadmap & Next Steps

**Updated**: 2026-08-28

---

## Current State

Production deployment live. All core phases complete.

```
Phase 1 ✅  Document pipeline, contracts, reminders, email, settings
Phase 2 ✅  Google OAuth, sessions, per-user data isolation, frontend auth
Deploy  ✅  Railway (server, Node.js 22) + Vercel (client)
Print   ✅  Excel + section-based template editors, copy-on-write sharing
Reports ✅  Monthly report auto-delivery, per-client mode, DOCX/XLSX/CSV
Email   ✅  Same-day grouping, items_table injection, Resend integration
```

---

## Near Term

### WebSocket per-user filtering
Currently the server broadcasts WS events to all connected clients. Should filter by `userId` so user A doesn't receive user B's `document:done` events.
- `server/src/index.ts`: attach `userId` to `ws.data` from session cookie on upgrade
- Replace `broadcast()` with `broadcastTo(userId, event)`

### Per-user file storage
Currently all uploads share `data/documents/`. Should isolate to `data/users/{userId}/documents/` to prevent accidental cross-user file path collisions.

### Expand test coverage
Some tests exist (XLSX extraction fallback, print template access). Priority areas:
- Auth flow (OAuth callback, session expiry, allowlist check)
- User isolation (user A cannot access user B's rows)
- Document pipeline (import → extract → reminder generation)
- Email sending (mock Resend)
- Print template copy-on-write

---

## Medium Term

### Reminder advance days per-user
`user_settings.reminder_advance_days` exists but isn't fully wired to the scheduler yet. The scheduler currently reads global `settings.reminderAdvanceDays`.

### Multi-client pipeline config
DB-backed extraction config with per-template prompt/schema overrides and AI prompt editor. Branch: `feature/multi-client-pipeline-config`.

---

## Recently Shipped (2026-08)

| Feature | Notes |
|---------|-------|
| Client mobile/fax/city fields | `mobile`, `fax`, `city` added to client type; phone migration script |
| Expiry date -1 day display | Reports and contracts show expiry_date minus one day |
| Report last-sent datetime | `monthly_report_last_sent` stores period key + ISO timestamp |
| Admin page spacing | Roomier nav, cards, and table columns for admin pages |
| Node.js 22 engine | Railway compat; removed `--disable-warning` flag for Node <21 |
| Pricing rollout follow-up fixes | Clients table sort labels + document totals; removed document-detail AI trigger; manual extraction edits survive reprocessing; invoice category editor simplified; receipts hide client/company extraction; Hebrew category default |

## Recently Shipped (2026-07)

| Feature | Notes |
|---------|-------|
| Copy-on-write shared templates | Non-admin edits to shared templates create personal clones; `source_template_id` linkage |
| Hydraulic check modal | Multi-step wizard with draft persistence, inspector prefix, template selection |
| Upload results table redesign | Quota bar, drag-drop strip, pipeline settings popover, bulk actions |
| Multi-value equipment fields | `load_capacity_work`, `load_capacity_test`, `load_radius` as string arrays |
| Server-side status counts | MongoDB `$group` aggregation for contract status tallies |
| Remembered UI filters | `sessionStorage`-backed filter tab persistence per page |
| Missing fields detection | Red highlights for missing expiry, duplicate report numbers, missing reminders |
| Document issue tags | `tag--bad` (red) and `tag--warn` (yellow) for row-level problems |
| Draft contract status | "draft" added to contract status enum with counts |
| License number handling | Preserve user-edited values, accept 7-digit license numbers |
| PDF margins and fonts | Smaller preview fonts, corrected margins for print output |

## Recently Shipped (2026-06)

| Feature | Notes |
|---------|-------|
| Section-based print template editor | `SimplePrintTemplatesPage.vue`; typed sections (header, fields, equipment_table, findings, signature, image, footer); global styles |
| Excel-style print template editor | Grid cells with merge, clone, borders, rich text, images; `PrintTemplatesPage.vue` |
| Print template hub | `/print-templates` landing page choosing between layout and Excel editors |
| Draft-to-contract flow | Save draft → preview → render PDF → persist as document → link to contract → delete draft |
| Email grouping | Same-day reminders to same client grouped into single email with items table |
| Items table in email templates | `{{items_table}}` placeholder; auto-injection if missing |
| Backfill client email to documents | Script + source hint in UI |
| Expiry date aliasing | `next_inspection_date` falls back to `expiry_date` |
| Email normalization | Lowercase + trim at reminder creation; Resend bounce handling |
| Print layout controls | Title/subtitle size+weight, field size+bold, image support in sections |
| Engineer profile sharing | Persist layout editor type and share profile across templates |

## Previously Shipped (2026-05)

| Feature | Notes |
|---------|-------|
| OCR Regex Baseline (Stage A) | `ocrExtractor.ts` — always runs before AI; Hebrew bidi-aware regex |
| Upload Modal with Pipeline Toggles | Per-upload switches for AI, entities, reminders |
| AI-only Document Quota | Quota of 25 AI-extracted docs; OCR-only unlimited |
| Certificate Expiry Calendar | Color-coded urgency pills on reminder calendar |
| Reminder Escalation | `checkEscalations()` in scheduler; configurable threshold |
| Equipment Service History | "היסטוריה" tab; `GET /api/equipment/:id/history` |
| Bulk XLSX Equipment Import | Preview + column-mapping + confirm flow |
| PDF Inspection Report | pdfkit + NotoSansHebrew per equipment row |
| PWA + Field Inspection Mode | `FieldPage.vue` at `/field`; mobile search, camera, offline |

---

## Deferred

| Feature | Notes |
|---------|-------|
| Teams / shared workspaces | Allow multiple users to see the same client data |
| Per-user OpenAI/SMTP keys | Would need encrypted storage; currently global |
| Self-serve signup | Currently allowlist only; open signup adds abuse risk |
| 2FA | Google already handles MFA |
| Audit log UI | `email_log` table exists; no admin UI yet |
| Push notifications (mobile) | Web Push API — nice to have for reminders |
| Document versioning | Re-import same file → keep history |
| QR/Barcode on Equipment | Print QR sticker → scan on-site to open record |
| Inspection Protocol Checklists | Structured digital checklists per equipment type |
