# Inspection Template Flow

This document describes the manual `תסקיר חדש` flow, print-template drafts, Excel-style template designer, PDF generation, and the DB records that connect drafts, contracts, clients, equipment, and reminders.

## User Flow

1. Open `/contracts`.
2. Click `תסקיר חדש`.
3. Select an existing client, or type client/business fields manually.
4. Select a print template in the modal.
5. In `ציוד נבדק`, either type equipment fields or select existing equipment for the chosen client.
6. Click `שמור טיוטה ופתח תצוגה`.
7. The app saves a template draft and opens `/print-templates/:templateId/draft`.
8. Edit fields directly in the table cells or in the side panel.
9. Click `שמור טיוטה`, `שמור PDF`, `הדפס PDF`, or `צור חוזה + תזכורת`.

## Contracts Page Entry Points

The print-template route remains available, but it is no longer shown as a primary top-nav item. It is shown on the Contracts page after `תסקיר חדש` as `תבניות הדפסה`.

`תסקיר חדש` saves draft data for the selected template. The draft includes:

- Filled template field values.
- Selected `client_id`.
- Selected equipment ids from the client equipment selector.
- The source marker `hydraulic_check`.

## Template Draft Data

Drafts are stored per user and per template in `print_template_drafts`.

Important fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `user_id` | string | Owner of the draft |
| `template_id` | string | Print template id |
| `data` | object | Field bind/value map used by the template |
| `meta` | object | Non-render metadata such as source, client, equipment ids |
| `client_id` | string \| null | Direct link to the selected client |
| `contract_id` | string \| null | Created contract id after compose creates a contract |
| `created_at` | ISO string | First save time |
| `updated_at` | ISO string | Last save time |

`data` is rendered into template cells. `meta` is not rendered; it is used to keep entity relationships.

Example:

```json
{
  "user_id": "user-123",
  "template_id": "6a7cfbee5e95a7b2e1e4b606",
  "client_id": "66bd...",
  "contract_id": "66be...",
  "data": {
    "document_number": "13456",
    "start_date": "2026-08-13",
    "expiry_date": "2027-10-29",
    "client_company": "מאפיית הצבי בע\"מ",
    "client_address": "רחוב הדוגמה 1",
    "license_number": "12345",
    "serial_number": "98765"
  },
  "meta": {
    "source": "hydraulic_check",
    "client_id": "66bd...",
    "template_id": "6a7cfbee5e95a7b2e1e4b606",
    "equipment_ids": ["66bf..."],
    "equipment_count": 1
  }
}
```

## Compose Page Behavior

`/print-templates/:templateId/draft` loads the saved draft and normalizes editable field values.

Field behavior:

- Fields can be edited directly inside table cells.
- The side panel shows the same values and validation state.
- Changing a cell updates the side panel, and changing the side panel updates the cell.
- Date fields accept ISO dates and common slash formats, then normalize to `YYYY-MM-DD`.
- Numeric identifiers such as `license_number` and `serial_number` keep digits only.

Actions:

| Button | Behavior |
| --- | --- |
| `שמור טיוטה` | Saves the current `data` and existing `meta` back to `print_template_drafts` |
| `שמור PDF` | Downloads a PDF generated from the current field values |
| `הדפס PDF` | Opens the browser print flow for the generated PDF |
| `צור חוזה + תזכורת` | Creates a contract using the draft `client_id`, then stores the created `contract_id` back on the draft |

## Contract And Reminder Linkage

When `צור חוזה + תזכורת` is clicked:

1. The compose page reads `client_id` from draft metadata.
2. It creates a row in `contracts` using `POST /api/contracts`.
3. The contract is saved with `client_id`, `manual_fields`, `contract_number`, `contract_type`, `start_date`, and `expiry_date`.
4. The contract create route calls `generateContractReminders` when `expiry_date` is in the future.
5. The created contract id is written back to `print_template_drafts.contract_id`.

This is what makes the new contract visible in client-specific contract views and reminder views.

## Equipment Flow

When a client is selected in `תסקיר חדש`, the modal queries:

```text
GET /api/equipment?client_id=:clientId
```

Each equipment row has a `ציוד קיים ללקוח` selector. Selecting an item fills:

- `category`
- `name`
- `manufacturer`
- `model`
- `serial_number`
- `license_number`
- `load_capacity_work`
- `load_capacity_test`
- `load_radius`
- `description`

Selected equipment ids are saved in draft metadata as `equipment_ids`.

## Excel-Style Template Designer

The template designer supports:

- Editing cells through inline edit and the top formula line.
- Field cells with `bind` names such as `client_company`, `expiry_date`, `license_number`.
- Rich text in label cells: partial text selection can be bold or colored.
- Image cells from uploaded files or image URLs.
- Row cloning: adding a row clones the currently selected row and gives cloned field binds a suffix such as `_2`.
- PDF preview from the template editor.

Template cell extensions:

| Property | Meaning |
| --- | --- |
| `type: "label"` | Fixed text / rich text |
| `type: "field"` | Render value from `data[bind]` |
| `type: "image"` | Render image from `src` |
| `html` | Sanitized rich text for label cells |
| `color` | Whole-cell text color |
| `src` | Image URL or safe data URL |
| `alt` | Image alt text |

## API Endpoints

### `GET /api/print-templates/:id/draft`

Returns the saved fill draft for the authenticated user and template.

Response:

```json
{
  "data": {},
  "meta": {},
  "client_id": null,
  "contract_id": null,
  "updated_at": null
}
```

### `PUT /api/print-templates/:id/draft`

Saves the fill draft for the authenticated user and template.

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

Response:

```json
{
  "ok": true,
  "data": {},
  "meta": {},
  "client_id": "66bd...",
  "contract_id": null,
  "updated_at": "2026-08-13T12:00:00.000Z"
}
```

## DB Notes

### `extractions.result_json`

New extraction rows store `result_json` as a JSON object, not a stringified JSON object. Existing legacy rows may still contain strings. Readers that use extraction data should tolerate both shapes until a migration is run.

### `clients`

Client rows now preserve address-related fields used by the template flow:

- `address`
- `po_box`
- `client_zipcode`

### `equipment`

Equipment rows support:

- `license_number`
- `serial_number`
- `load_capacity_test`
- `load_radius`

### `contracts`

Manual contracts created from template drafts store:

- `client_id`
- `manual_fields`
- `contract_number`
- `contract_type`
- `start_date`
- `expiry_date`
- `counterparty`
- `summary`

`manual_fields` keeps the filled template values for audit and future rendering.

## Important Bind Names

Common binds used by the תסקיר template:

| Bind | Meaning |
| --- | --- |
| `document_number` | Current report/document number |
| `prev_report_number` | Previous report number |
| `start_date`, `inspection_date`, `check_date` | Inspection date |
| `expiry_date`, `next_inspection_date`, `valid_until` | Next inspection / validity date |
| `client_company` | Client/company display name |
| `client_name`, `contact_person` | Contact person |
| `client_phone` | Phone |
| `client_email` | Email |
| `client_address` | Address / city |
| `client_id` | Client company id / ID number |
| `license_number` | Equipment license number |
| `serial_number` | Equipment serial number |
| `manufacturer` | Manufacturer |
| `model` | Model |
| `load_capacity_work` | Safe working load |
| `load_capacity_test` | Test load |
| `load_radius` | Radius / range |
| `equipment_description` | Equipment description |

`license_number` is the correct bind for `מספר רישוי`. Do not use `client_id` for equipment license numbers.

## Pressure-Equipment Layout (air_receiver / steam_receiver / steam_boiler / pressure_vessel)

Unlike the other 7 preset types, these 4 report on one vessel with many attributes rather than a list of equipment items, so Parts 1 and 2 use vertical `columns: 2` `fields` sections (label:value pairs) instead of the 3-column grid + `equipment_table`. `air_receiver` additionally carries Parts 3/4/6 (last hydraulic test, test results, permitted working pressure) and a 14-field attribute list; the other 3 keep the shared 7-field list.

Branch logic: `PRESSURE_TYPE_KEYS` / `isPressureType` inside `createInspectionPrintTemplateLayout()` in `server/src/shared/printTemplateLayout.ts`, mirrored byte-for-byte in `client/src/shared/printTemplateLayout.ts` (no build-time sync — edit both).

Changing this file requires reseeding the shared `print_templates` DB rows (`npm run print-templates:seed-inspections:apply`) for the change to reach existing templates — new template docs don't get created automatically, existing ones are upserted by `system_key`.

## Per-Type Inspector License Numbers

`engineer_profiles` stores `inspector_number` (single, legacy default) plus an optional `inspector_numbers_by_type` map keyed by preset key (`air_receiver`, `lifting_machine`, ...). Resolution (`resolveInspectorNumber`, mirrored client/server): per-type value if present for the report's category, else `inspector_number`, else empty.

Consumers:

- `allocateReportNumber(userId, category)` in `server/src/routes/reminders.ts` — prefixes allocated report numbers
- `getEngineerData(userId, reportTypeKey)` in `server/src/routes/printTemplates.ts` — resolves the signature number baked into generated PDFs
- `HydraulicCheckModal.vue`'s `currentInspectorNumber()` and the `previewData` computed — client-side preview must independently mirror the same resolution order; historically these have gone out of sync when only one was updated

## Pressure-Type Reports (air_receiver, steam_receiver, steam_boiler, pressure_vessel)

The 4 pressure-equipment types report on ONE vessel with many physical attributes, so their layout differs from lifting_machine/elevator/etc:

- Section 1 (`פרטי הלקוח/תופש`) and section 2 (equipment description) render as label:value `fields` sections instead of a 3-column grid / `equipment_table` — there's no multi-row equipment table since only one vessel is described per report.
- Both sections use `columns: 2`, so fields lay out two label:value pairs per row (side by side) instead of one per row.
- `air_receiver` additionally gets extra sections not present on other types: `3. פרטי ניסוי הידראולי אחרון` (last hydraulic test), `4. תוצאות הבדיקה` (test results incl. safety-valve opening pressure), and `6. לחץ עבודה מותר...` (permitted working pressure) — findings/notes section numbering shifts to 5/הערות accordingly.
- `air_receiver`'s equipment columns (`AIR_RECEIVER_EQUIPMENT_COLUMNS` in `printTemplateLayout.ts`) have no `license_number` field — pressure vessels are identified by internal serial number, not a license number. `license_number` only appears on the generic (non-pressure) client-details section and on `PRESSURE_EQUIPMENT_COLUMNS`/`ELEVATOR_EQUIPMENT_COLUMNS`.
- Layout changes to `printTemplateLayout.ts` only affect the shared preset source. Existing DB-seeded templates (`print_templates` collection, `system_key: inspection:<type>`) must be reseeded to pick up changes:
  ```bash
  npx tsx src/scripts/seedInspectionPrintTemplates.ts --apply
  ```
  A personal copy-on-write clone of a shared template (created when a non-admin edits it) is NOT touched by reseeding and keeps its own layout.

## Inspection Type Classification (`inspection_type`)

Documents get an `inspection_type` field (one of the `INSPECTION_PRINT_TEMPLATE_PRESETS` keys, e.g. `air_receiver`, `elevator`, `lifting_machine`) so they can be filtered/classified by report type on the Documents page.

- Set by the AI extractor going forward (`extractDocument`'s `SYSTEM_PROMPT`, rule 6b) — matched against the document's own title/subtitle/equipment description, not just the word "תסקיר".
- For documents imported before this field existed, `src/scripts/backfillInspectionType.ts` does a cheap deterministic regex pass (phrase list in `MATCH_PHRASES`) instead of a paid re-extraction. Dry run by default; `--apply` to write. Never overwrites an already-set `inspection_type`.

## Report Number Extraction (`document_number` / `contract_number`)

`extractCurrentReportNumber` (in `importer.ts`) is a regex fallback used when a template declares a `report_number` field — real inspector reports often render "מספר תסקיר:" and its value (`<inspector-id>/<sequence>`, e.g. `153/765097`) on separate lines once the PDF is flattened to plain text, which the LLM sometimes drops.

- Rejects a punctuation-only capture (a lone `:` is truthy in JS and used to slip past the old `if (value)` guard) and, when that happens, scans forward for a line matching the registry's `<id>/<sequence>` shape rather than just the next line with a digit (a nearby date would otherwise be picked up instead).
- Trust the document's own raw text over its filename — filenames are often typo'd/renamed by the inspector and don't reliably match the report number printed in the document.
- `src/scripts/backfillAirReceiverReportNumbers.ts` re-derives `document_number`/`contract_number` for existing documents/contracts whose raw_text was already stored but predates this fix, patching only those two fields (no AI call, no contract recreation, no client/reminder side effects). Dry run by default; `--apply` to write.

