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

