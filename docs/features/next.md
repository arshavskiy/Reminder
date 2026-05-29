# Roadmap & Next Steps

**Updated**: 2026-05-22

---

## Current State

Phase 1 (core document management) and Phase 2 (Google OAuth multi-user) are both **complete**.

```
Phase 1 ✅  Document pipeline, contracts, reminders, email, settings
Phase 2 ✅  Google OAuth, sessions, per-user data isolation, frontend auth
Vercel  ✅  Standalone client repo ready for deployment
```

---

## Immediate: Deployment

| Task | Detail |
|------|--------|
| Deploy backend | Fly.io / Railway / Hetzner — Bun server, SQLite on persistent volume |
| Push client to GitHub | `E:\Projects\Reminder-client` → new GitHub repo |
| Connect Vercel | Import repo, set `VITE_API_BASE_URL` + `VITE_GOOGLE_CLIENT_ID` |
| Update Google OAuth redirect URI | Add production URL to Google Cloud Console |
| Smoke test in prod | Login → upload PDF → verify extraction → check reminder |

---

## Near Term

### WebSocket per-user filtering
Currently the server broadcasts WS events to all connected clients. Should filter by `userId` so user A doesn't receive user B's `document:done` events.
- `server/src/index.ts`: attach `userId` to `ws.data` from session cookie on upgrade
- Replace `broadcast()` with `broadcastTo(userId, event)`

### Admin user management panel
- List all users (admin only)
- Deactivate / reactivate users (`is_active` flag)
- Change user roles
- View per-user usage stats

### Per-user file storage
Currently all uploads share `data/documents/`. Should isolate to `data/users/{userId}/documents/` to prevent accidental cross-user file path collisions.

---

## Medium Term

### Test suite
No tests written yet. Priority areas:
- Auth flow (OAuth callback, session expiry, allowlist check)
- User isolation (user A cannot access user B's rows)
- Document pipeline (import → extract → reminder generation)
- Email sending (mock SMTP)

### Settings page split
Currently `SettingsPage.vue` shows all settings to all users. Should:
- Show only personal settings (theme, reminder defaults) to regular users
- Show system settings (SMTP, OpenAI key, watch folder) to admins only

### Reminder advance days per-user
`user_settings.reminder_advance_days` column exists but isn't wired to the scheduler yet. The scheduler currently reads global `settings.reminderAdvanceDays`.

---

## Recently Shipped (2026-05-29)

| Feature | Notes |
|---------|-------|
| Certificate Expiry Calendar | Color-coded expiry pills on the reminder calendar; `GET /api/equipment/expiry-calendar` |
| Reminder Escalation | `checkEscalations()` in scheduler; `escalationEmail` + `escalationThresholdDays` settings |
| Equipment Service History | "היסטוריה" tab in equipment drawer; `GET /api/equipment/:id/history` |
| Bulk XLSX Equipment Import | `XlsxImportModal.vue`; preview + column-mapping + confirm; `import-xlsx/preview` + `confirm` endpoints |
| PDF Inspection Report | `GET /api/equipment/:id/report.pdf`; pdfkit + NotoSansHebrew; "PDF" button on each equipment row |
| PWA + Field Inspection Mode | `vite-plugin-pwa`; `FieldPage.vue` at `/field`; mobile search, history view, camera capture, offline support |
| UI visibility fixes | "היסטוריה" direct button on equipment rows; legend CSS in ReminderCalendar |

---

## Deferred

| Feature | Notes |
|---------|-------|
| Teams / shared workspaces | Allow multiple users to see the same client data |
| Per-user OpenAI/SMTP keys | Would need encrypted storage; currently global |
| Electrobun desktop wrapper | Thin wrapper pointing at hosted URL — 1 day if needed |
| Self-serve signup | Currently allowlist only; open signup adds abuse risk |
| 2FA | Google already handles MFA |
| Audit log UI | `email_log` table exists; no admin UI yet |
| Push notifications (mobile) | Web Push API — nice to have for reminders |
| Document versioning | Re-import same file → keep history |
| Bulk operations | Delete / re-process multiple documents at once |
| Inspection Certificate Lifecycle Board | Kanban/table view of all equipment cert statuses |
| Inspection Protocol Checklists | Structured digital checklists per equipment type |
| Field Inspection PWA | Mobile-friendly offline mode with camera attach |
| Inspection Report PDF Generator | One-click PDF with pdfkit + NotoSansHebrew |
| QR/Barcode on Equipment | Print QR sticker → scan on-site to open record |
