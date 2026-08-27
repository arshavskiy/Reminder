# Admin magic links & username identity

**Updated:** 2026-08-27

Admins can create and edit users that sign in with a **magic link**, including accounts that have a **username** and no email. Public login stays **email/password + Google only** — there is no username/password login.

## Identity rules

| Field | Required? | Notes |
|-------|-----------|--------|
| `email` | One of email **or** username | Sparse unique index; nullable for username-only users |
| `username` | One of email **or** username | 2–32 chars: `a-z0-9._-`, no `@`; sparse unique |
| Password | Optional | Only useful for email login when an email exists |

Magic-link redemption is by token → `user_id`. Username-only users must use the link (or Google if they later add an email).

## Admin UI

**Admin → Magic Links** (`AdminMagicLinkPanel`):

- Email and/or username
- Display name, plan (`free` / `basic` / `business`), role, company, phone, picture URL
- Active / email-verified flags
- **Load by email / username**, **Create / upsert user**, **Create magic link** (15 minutes, single-use)

**Admin → Users** profile edit supports the same identity fields.

## API

### `POST /api/admin/users/magic-link`

Body (JSON):

```json
{
  "email": "user@example.com",
  "username": "demo",
  "name": "Demo User",
  "role": "user",
  "plan": "basic",
  "issue_link": true
}
```

- Requires `email` **or** `username` (or both)
- Upserts matching user, applies plan entitlements, optionally returns `magicLink`
- Errors: `email_or_username_required`, `invalid_username`, `email_already_in_use`, `username_already_in_use`, …

### `PUT /api/admin/users/:id`

Can set `email` / `username` to `null`, but the user must keep at least one identity.

## CLI

```bash
cd server
npm run auth:magic-link -- --email=someone@example.com --plan=basic --role=user
npm run auth:magic-link -- --username=demo --name="Demo" --plan=free
```

## Admin DB target

Admins can switch Mongo target with header `X-Admin-Db-Target: local|production` (sidebar switcher). Auth always uses the primary DB; admin data reads/writes follow the selected target.

## Related

- Plan entitlements on create/login: `server/src/plans/planEntitlements.ts`
- Roles / plans matrix: [ROLES_AND_PLANS.md](./ROLES_AND_PLANS.md)
- Feature inventory: [FEATURES.md](./FEATURES.md)
