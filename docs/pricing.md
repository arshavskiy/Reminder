# Pricing catalog

Edit **`client/src/shared/pricingCatalog.json`** for plan prices, names, descriptions,
features, currency, and purchase copy. Vue imports that file directly.

Run from the Reminder repository root:

```sh
npm run pricing:sync
npm run pricing:check
```

The sync command publishes the catalog into `landing/assets/pricing-catalog.json`
and refreshes the marked sections in both `index.html` and `pricing.html`, in
Hebrew and English. Those HTML snapshots remain readable without JavaScript
or a catalog request. All four pages share `landing/assets/pricing.css` and import `landing/assets/pricing.mjs`, which
renders the published catalog at runtime. Other landing HTML pages can reuse that
module by adding a `data-pricing-catalog` container; the document's `lang` selects
Hebrew/ILS or English/USD.

`landing` is a separate Git submodule. Initialize it before syncing or checking
published snapshots (`git submodule update --init landing` on a fresh checkout).
Commit the landing assets/pages in its repository, then record its new commit in
the parent repository along with the Vue catalog. Deploy both sites together.
The app build does not require the landing submodule or a runtime network request.
Do not hand-edit published JSON or pricing snapshots. `pricing:check` detects drift.

## List prices for new subscriptions

| Plan | ILS monthly billing | ILS/month billed annually | ILS annual total | USD monthly billing | USD annual total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Digital | 49 | 39 | 468 | 15 | 144 |
| Starter (id `basic`) | 97 | 78 | 936 | 29 | 276 |
| Pro (id `business`) | 249 | 199 | 2,388 | 75 | 720 |

Updated 2026-10-05. The annual rate is 80% of the monthly price, rounded to a whole amount per month.
USD prices are separate list prices, not live currency conversions.
No percentage discount or crossed-out former price is advertised.

Display names: `basic` is shown as Starter (סטארטר) and `business` as Pro (פרו) in Hebrew, English and Russian.
Internal plan ids, database values and API fields keep the old names.

New-plan buttons prepare a WhatsApp inquiry containing the selected plan, currency,
annual total and monthly alternative. They do not send a message automatically.
The old Morning links have not been verified against these new amounts, billing
terms or USD pricing. Re-enable checkout only after those details are verified.
Existing server-side renewal links, billing records, customer agreements, plan
permissions and quotas are unchanged by this catalog update. Catalog prices are
explicitly labeled as new-subscription list prices in the current-plan UI.

## Basis for the pricing change

On 23 September 2026, the rendered [Autoskir pricing section](https://autoskir.vercel.app/#pricing)
listed Basic at ILS 420/month (5,040/year), Premium at 550/month (6,600/year),
and an organization plan priced by inquiry. Its published features include report
creation and archives, duplication, PDF/Word export, email delivery, Calendar,
renewal reminders and linked invoices. These are vendor claims, not a hands-on
verification of their product.

Reminder's previous annual monthly equivalents were ILS 79 and 128. Its code
supports a stronger offer: OCR/AI extraction, Gmail document imports, customer and
equipment records, recurring email reminders, monthly reporting, Drive integration,
inspection generation, and Business Calendar/field tools. The new monthly prices
remain below Autoskir's published entry and premium prices; this is a positioning
recommendation, not measured willingness to pay or a margin forecast.

Feature copy was checked against `server/src/plans/tierFeatures.ts`,
`server/src/quotas/documentImportQuota.ts`, the Vue router, the field-work view,
and print/payment routes. The trial allows 20 imported documents total, Basic
50/month, and Business has no import cap by default. Runtime environment quota
overrides still exist; keep them consistent with advertised limits. Digital has
no file imports/storage. Pro adds 24 months of Gmail inspection history,
36 months of invoice history, Calendar, field checklists/photos, and uncapped
users/mailboxes. Do not promise full offline inspection authoring, certified
electronic signatures, automated WhatsApp distribution or tax-invoice issuance
based only on this audit; those were not established as equivalent capabilities.

Track conversion, support time and OCR/storage cost before increasing limits or
promising new service levels. The existing unlimited Business entitlement was
preserved; this change does not establish that unlimited usage is profitable.

## Validation

- Client production build and focused TypeScript check for pricing helpers passed.
- Four pricing tests passed (annual arithmetic, currency/quote details and expired-account display).
- Hebrew and English landing pages checked in the browser; no page errors observed.
- `npm run pricing:check` and whitespace checks passed.
- Full backend run: 761 passed, 6 failed. Three email-template failures and two
  extraction-date failures also reproduced in isolation in unchanged files; the
  remaining failure was a document-test timeout; all 32 document tests passed on
  an isolated rerun alongside the four pricing tests. These are outside this change.
