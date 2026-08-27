# Roles, Plans & Features

Canonical matrix for who can use what in RemindOCR.  
**Updated:** 2026-08-27

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
| `free` | ₪0 | 1 | 1 | 30 lifetime (all kinds) | 25 lifetime |
| `basic` | ₪69 / month | 2 | 2 | 50 invoices/mo + 40 contracts/mo | Unlimited |
| `business` | ₪179 / month | Unlimited | Unlimited | Unlimited | Unlimited |

Seat / extra-mailbox product is not built yet; limits are stored on `plan_entitlements` and shown as locked UI.

---

## Plan-gated capabilities

Enforced in server code (+ matching disabled UI). Source: `TIER_FEATURE_FLAGS`.

| Capability | Free | Basic | Business | Notes |
|------------|------|-------|----------|-------|
| OCR / preview / extraction | ✓ | ✓ | ✓ | All plans |
| Google Drive sync / export | — | ✓ | ✓ | `googleDriveSync` |
| Google Calendar sync | — | — | ✓ | Marketing + flags: **business only** |
| Automatic email reminders (scheduler) | — | ✓ | ✓ | Manual send still allowed on free (quota) |
| Automatic monthly reports | — | ✓ | ✓ | Free can still download DOCX |
| Excel export (invoices / reports / contracts) | — | ✓ | ✓ | |
| Gmail invoice history window | — | 12 months | 48 months | Free blocked for invoice Gmail import |
| Max users (seats) | 1 | 2 | ∞ | UI only until invite model exists |
| Max email accounts | 1 | 2 | ∞ | One Gmail connect today; extras locked |

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
| **חשבוניות** | — | — | ✓ | `pages.invoices` (default **off**) | **Admin role only** (nav + router + `/api/invoices`) |
| **Gmail** | — | — | ✓ | `pages.gmail` (default **off**) | **Admin role only** |
| Admin console | — | — | ✓ | (admin routes) | `/admin` |

\* Defaults enabled in feature catalog; can be disabled per user in admin feature toggles.

### Invoices (admin-only)

As of 2026-08-27:

- Nav: `minRole: "admin"` (same pattern as Gmail)
- Router: `requireRole: "admin"` on `/invoices`, `/invoices/expenses`, `/invoices/:id`
- API: `requireMinRole("admin")` on `/api/invoices`
- Catalog default: `pages.invoices` = `false` (optional toggle later; role is the hard gate)

Non-admins are redirected to `/403` if they open invoice URLs directly.

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

## Server API feature mounts

High-level (`server/src/index.ts`): most `/api/*` trees use `requireAnyFeature([...])`. Exceptions:

| Mount | Gate |
|-------|------|
| `/api/invoices` | **Admin role** only |
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
| Show invoices | User must be `role: admin` |
| Show Gmail inbox | User must be `role: admin` (+ typically enable `pages.gmail`) |

---

## Quick check (local)

```js
// users
db.users.find({}, { email: 1, role: 1, plan: 1 })

// entitlements snapshot
db.user_settings.find({}, { user_id: 1, plan_entitlements: 1 })
```

Expect new users: `plan: "free"` and `plan_entitlements.plan: "free"`.
