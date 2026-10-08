# Digital Plan Features

This document covers the two features added for Digital-tier users: **Shared Household Invite** (Feature #3) and **Annual Expense PDF** (Feature #8).

---

## Feature #3 — Shared Household Invite

Digital-plan accounts support up to **2 users** (the account owner + 1 invited household member). The invite flow sends a magic-link email; the invited user creates their own account and becomes linked to the household.

### Where to find it

**Profile → Settings → Plan Features section**

The "Plan Features" card shows the seat counter ("1 מתוך 2 משתמשים") and an **"הוסף משתמש"** (Add User) button. Non-digital plans see the same button but it is disabled.

### How it works — user flow

1. Account owner opens **Profile → Settings**.
2. In the Plan Features section, clicks **הוסף משתמש**.
3. A modal appears asking for the invitee's email address.
4. After clicking **שלח הזמנה**, the server:
   - Checks the seat limit (`maxUsers` from `plan_entitlements` — value `2` for digital).
   - Creates a record in `account_invites` (TTL 7 days).
   - Sends a trilingual invitation email (Hebrew by default; locale resolved from the inviting user's `locale` field).
5. Success toast: "ההזמנה נשלחה בהצלחה".
6. The invited user receives an email with a magic-link. On first sign-in they are linked (`linked_to_user_id`) to the inviting account.

### API endpoint

```
POST /api/account/invite
Body: { email: string }
Auth: session cookie required
Plan gate: requires maxUsers >= 2 (digital or business)
```

Response `200`:
```json
{ "ok": true }
```

Response `403` (seat full or wrong plan):
```json
{ "error": "מגבלת מושבים הגיעה למקסימום" }
```

### Seat limits by plan

| Plan     | maxUsers | Can invite |
|----------|----------|-----------|
| digital  | 2        | Yes (1 extra) |
| basic    | 2        | Yes (1 extra) |
| business | null     | Yes (unlimited) |
| trial    | 1        | No |
| expired  | 1        | No |

### Locale support

Invite emails are sent in the inviting user's locale (`he` / `en` / `ru`). Unknown locales fall back to `he`.

---

## Feature #8 — Annual Expense PDF

Digital-plan users can download a one-page PDF summary of all their imported invoices for a given calendar year, grouped by category.

### Where to find it

**Invoices page → ⋮ more-options menu → "דוח שנתי PDF"**

The ⋮ button is in the top-right of the Invoices page header. Clicking it opens a Naive UI dropdown. "דוח שנתי PDF" is the last item in the menu.

### How it works — user flow

1. Open the **Invoices** page (`/invoices`).
2. Click the **⋮** (ellipsis-vertical) button in the page header.
3. Select **דוח שנתי PDF** from the dropdown.
4. The browser downloads `annual-expenses-{year}.pdf` for the current calendar year.
5. The PDF is generated server-side: invoices fetched from MongoDB, grouped by category, formatted with PDFKit, and streamed back.

### API endpoint

```
GET /api/invoices/annual-summary.pdf?year=2026&locale=he
Auth: session cookie required
Plan gate: requires pages.invoices feature flag (digital, basic, business)
```

Response: `application/pdf` binary stream with `Content-Disposition: attachment; filename="annual-expenses-2026.pdf"`.

**Note:** This route lives under `/api/invoices/` (not `/api/reports/`) because the Digital plan's family feature overlay blocks `pages.reports` but allows `pages.invoices`.

### Parameters

| Parameter | Default | Values |
|-----------|---------|--------|
| `year`    | current year | 2000–2100 |
| `locale`  | `he` | `he`, `en`, `ru` |

### Locale support

The PDF renders the currency symbol, column headers, and footer text in the requested locale:
- `he` — Hebrew (RTL layout)
- `en` — English (LTR layout)
- `ru` — Russian (LTR layout)

---

## Implementation Notes

### Route registration order (server/src/index.ts)

`registerReportRoutes(app)` must be called **before** `registerInvoiceRoutes(app)`. The invoice router registers a wildcard `GET /api/invoices/:id` handler that would otherwise catch `annual-summary.pdf` as an invoice ID.

```typescript
registerReportRoutes(app);   // annual PDF lives here
registerInvoiceRoutes(app);  // /:id wildcard registered after
```

### Feature flag overlay (Digital plan)

`applyFamilyFeatureOverlay` blocks `pages.reports`, `pages.contracts`, `pages.clients`, and several others for Digital users. The annual PDF was moved to `/api/invoices/` specifically to bypass this restriction.

### Test users

A Digital test user is available for local testing:

```
email: digital-test@remindocr.local
plan:  digital
```

Generate a fresh magic link:

```bash
node server/scripts/create-digital-test-user.mjs
```

### Tests

| File | Coverage |
|------|----------|
| `server/src/__tests__/accountInvite.test.ts` | Plan gating, seat limit logic, email validation, locale resolution |
| `server/src/__tests__/annualPdfRoute.test.ts` | Digital plan flags, year/locale param parsing, route path assertion |

Run with:
```bash
cd server && npm test
```
