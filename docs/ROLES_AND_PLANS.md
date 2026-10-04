# Roles, Plans & Features

Canonical matrix for who can use what in RemindOCR.  
**Updated:** 2026-08-28

Related code:

| Area | Path |
|------|------|
| Roles (nav / router) | `client/src/App.vue`, `client/src/router/index.ts` |
| Page feature flags | `server/src/features.ts`, `client/src/shared/features.ts` |
| Plan entitlements | `server/src/plans/tierFeatures.ts`, `server/src/plans/planEntitlements.ts`, `client/src/shared/pricingPlans.ts` |
| Quotas | `server/src/quotas/documentImportQuota.ts`, `server/src/quotas/reminderQuota.ts` |
| Stored on | `users.plan` / `users.role`; snapshot on `user_settings.plan_entitlements` |

Two independent axes:

1. **Role** (`user` | `pro` | `admin`) — staff privilege / UI surface
2. **Plan** (`free` | `basic` | `business`) — paid product tier / quotas & gated capabilities

New signups always get `plan: "free"` and free `plan_entitlements` until a paid plan is assigned (Visa payment links TBD).

---

## Roles

Rank used by `minRole` / `requireRole`: `user=0`, `pro=1`, `admin=2`.

| Role | Purpose |
|------|---------|
| `user` | Standard account. Own data only. |
| `pro` | Legacy / reserved. Maps to **basic** plan when `users.plan` is missing. |
| `admin` | Platform operator. Admin UI, impersonation (“צפה כ”), Gmail inbox, **invoices**. |

### Role → default plan mapping

Used only when `users.plan` is empty:

| Role | Resolved plan |
|------|----------------|
| `user` | `free` |
| `pro` | `basic` |
| `admin` | `business` (entitlements also uncapped Gmail history) |

Admin role **does not** change the product plan field by itself if `users.plan` is already set; entitlement helpers still treat `role === "admin"` as full business flags.

---

## Plans

| Plan | Price (marketing) | Seats | Email accounts | Documents | Reminders |
|------|-------------------|-------|----------------|-----------|-----------|
| `free` | ₪0 | 1 | 0 | **10 lifetime, shared** across manual + email | **0** |
| `basic` | ₪69 / month | 2 | 2 | 50/mo (50 contracts/mo) | Unlimited |
| `business` | ₪179 / month | Unlimited | Unlimited | Unlimited | Unlimited |

Seat / extra-mailbox product is not built yet; limits are stored on `plan_entitlements` and shown as locked UI.

---

## Plan-gated capabilities

Enforced in server code (+ matching disabled UI). Source: `TIER_FEATURE_FLAGS`.

| Capability | Free | Basic | Business | Notes |
|------------|------|-------|----------|-------|
| OCR / preview / extraction | ✓ | ✓ | ✓ | All plans |
| Google Drive sync / export | — | ✓ | ✓ | `googleDriveSync` |
| Google Calendar sync | ✓ | ✓ | ✓ | Every plan except a lapsed trial (`googleCalendarSync`; changed 2026-10-05, was Business only) |
| ICS calendar feed (Apple / Outlook) | ✓ | ✓ | ✓ | Same entitlement as Google Calendar sync |
| Email-in (personal forwarding address) | — | — | ✓ | `emailIn` flag: **business only** (and admin); also needs document import |
| Cloud storage (S3) of files | — | ✓ | ✓ | `s3_store_invoices` / `s3_store_inspection_reports` default **off** on free; toggles disabled in UI |
| Templates menu (print / email / doc) | — | ✓ | ✓ | Account dropdown submenu hidden on free |
| Automatic email reminders (scheduler) | — | ✓ | ✓ | Free cannot create reminders at all (quota 0) |
| Automatic monthly reports | — | ✓ | ✓ | Free can still download DOCX |
| Excel export (invoices / reports / contracts) | — | ✓ | ✓ | |
| Gmail invoice history window | — | 12 months | 48 months | Free blocked for invoice Gmail import |
| Max users (seats) | 1 | 2 | ∞ | UI only until invite model exists |
| Max email accounts | **0** | 2 | ∞ | Free cannot connect Gmail — connect button shows an upgrade link |

`user_settings.plan_entitlements` is written/refreshed on:

- New registration / Google signup / magic-link user create
- Google / magic-link login
- `GET` / `PUT /api/user-settings`
- Magic-link user create (`POST /api/admin/users/magic-link`) — email and/or username; see [ADMIN_MAGIC_LINKS.md](./ADMIN_MAGIC_LINKS.md)
- Admin plan/role change (`PUT /api/admin/users/:id`)

---

## Page / nav visibility by role

Primary nav + router. Feature flags in `user_settings.features` can still hide a page even when the role allows it (except hard role-only items).

| Page / nav | `user` | `pro` | `admin` | Feature key | Notes |
|------------|--------|-------|---------|-------------|-------|
| ראשי (Dashboard) | ✓ | ✓ | ✓ | `pages.dashboard` | |
| מסמכים | ✓ | ✓ | ✓ | `pages.documents` | |
| תסקירים | ✓ | ✓ | ✓ | `pages.contracts` | |
| תזכורות | ✓ | ✓ | ✓ | `pages.reminders` | |
| דוחות | ✓ | ✓ | ✓ | `pages.reports` | Auto-send plan-gated |
| לקוחות | ✓ | ✓ | ✓ | `pages.clients` | |
| שטח | ✓ | ✓ | ✓ | `pages.field` | |
| ציוד | ✓ | ✓ | ✓ | `pages.equipment` | |
| פרופיל | ✓ | ✓ | ✓ | `pages.profile` | Via avatar, not primary nav |
| חיפוש | ✓ | ✓ | ✓ | `pages.search` | |
| תבניות מסמכים / אימייל / הדפסה | ✓* | ✓* | ✓* | `pages.doc_templates`, `pages.email_templates`, `pages.print_templates` | Often via contracts / settings |
| הגדרות מערכת | — | — | ✓ | `pages.settings` | Admin |
| **חשבוניות** | — | — | ✓ | `pages.invoices` (default **on**) | **Business plan** (nav + router); no server-side guard yet |
| **Gmail** | — | — | ✓* | `pages.gmail` (default **on**) | **Business plan** (nav + `/gmail`); admin role maps to business |
| Admin console | — | — | ✓ | (admin routes) | `/admin` |

\* Defaults enabled in feature catalog; can be disabled per user in admin feature toggles.

### Nav plan gates (`allNav` in `client/src/App.vue`)

The table above is by **role**. Primary nav is additionally gated by **plan** via `minPlan`.
`minPlan` *locks* an item (visible, greyed, "זמין במסלול … ומעלה"); `minRole` *hides* it.

| Nav item | `minPlan` |
|----------|-----------|
| ראשי / מסמכים / תסקירים / דוחות | `free` |
| תזכורות / לקוחות | `basic` |
| שטח / ציוד / חשבוניות | `business` |
| Gmail | `minRole: "admin"` |

Router `meta.requirePlan` mirrors these; mismatches send the user to `/403` after the nav
already showed the item, so keep the two in sync.

### Invoices (business plan)

As of 2026-08-28 invoices are gated by **plan**, not by admin role:

- Nav: `minPlan: "business"` — sub-business users see the item locked with an upgrade hint
  rather than hidden (`minPlan` locks; `minRole` would remove it)
- Router: `requirePlan: "business"` on `/invoices`, `/invoices/expenses`, `/invoices/:id`
- Catalog default: `pages.invoices` = `true` (the plan gate is the hard gate)
- API: **no role or plan guard** on `/api/invoices` — only `requireAuth`. The routes are
  scoped per `user_id`, so a sub-business user cannot read another account's invoices, but
  they can still reach their own via direct API calls. Server-side enforcement is a known gap.

Sub-business users are redirected to `/403` if they open invoice URLs directly.

---

## Dashboard widget flags

Stored under `user_settings.features.dashboard.*` (all default **on**):

| Key | UI |
|-----|-----|
| `dashboard.stat_documents` | Documents count |
| `dashboard.stat_clients` | Clients count |
| `dashboard.stat_inspections` | Inspections count |
| `dashboard.stat_pending_reminders` | Pending reminders |
| `dashboard.stat_expiring_soon` | Expiring soon |
| `dashboard.drop_strip` | Upload strip |
| `dashboard.calendar` | Reminder / expiry calendar |
| `dashboard.modules` | Module cards |
| `dashboard.recent_documents` | Recent documents |
| `dashboard.upcoming_reminders` | Upcoming reminders |
| `dashboard.calendar_filters` | Calendar filter chips |

---

## Quotas

Source: `server/src/quotas/documentImportQuota.ts`, `server/src/quotas/reminderQuota.ts`.

| Quota | Free | Basic | Business |
|-------|------|-------|----------|
| Documents | 10 lifetime, **shared** across manual upload + Gmail import | 50 / month | ∞ |
| Contracts (תסקירים) | draws from the same 10 | 50 / month | ∞ |
| Reminders | **0** | ∞ | ∞ |

Key behaviours:

- **Free collapses every category** into `manualDocuments` / `emailDocuments`
  (`effectiveQuotaCategory`), and both read one shared counter
  (`scannedDocuments + gmailDocuments + gmailInvoices`). Gmail import therefore cannot
  hand out a second allowance on top of the manual cap.
- Anything that only *reports* a quota must call `effectiveQuotaCategory` too, or the UI
  shows a limit different from the one that blocks the upload.
- Free usage is **lifetime** and stored on the user; deleting documents does not free it.
- Enforcement points: `POST /api/documents/upload`, `POST /api/contracts`,
  `POST /api/reminders`.

Env overrides: `FREE_LIFETIME_MANUAL_DOCUMENT_LIMIT` (10), `FREE_LIFETIME_REMINDER_LIMIT`
(0), `BASIC_MONTHLY_DOCUMENT_LIMIT` / `BASIC_MONTHLY_CONTRACT_DOCUMENT_LIMIT` (50).
`FREE_LIFETIME_DOCUMENT_LIMIT` (20) applies only to the `documents` category, which free
users never hit — effectively dead config.

---

## Server API feature mounts

High-level (`server/src/index.ts`): most `/api/*` trees use `requireAnyFeature([...])`. Exceptions:

| Mount | Gate |
|-------|------|
| `/api/invoices` | Auth only — **no role/plan guard** (client-side gate only; known gap) |
| `/api/gmail` | `pages.gmail` |
| `/api/admin` | `pages.settings` (+ admin handlers) |
| Calendar / Drive | Auth + **plan** flags (not page features) |

---

## Changing access

| Goal | How |
|------|-----|
| Upgrade plan (after Visa) | Set `users.plan` to `basic` / `business` (admin UI or payment webhook later) → entitlements refresh |
| Downgrade to free | Set `users.plan` = `free` |
| Hide a page for one user | Admin feature toggles on `user_settings.features` |
| Show invoices | User must be on **business** plan |
| Show Gmail inbox | User must be on **business** plan (or `role: admin`) + `pages.gmail` |

---

## Quick check (local)

```js
// users
db.users.find({}, { email: 1, role: 1, plan: 1 })

// entitlements snapshot
db.user_settings.find({}, { user_id: 1, plan_entitlements: 1 })
```

Expect new users: `plan: "free"` and `plan_entitlements.plan: "free"`.
