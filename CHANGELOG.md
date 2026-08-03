# Change Log

## 2026-08-03

### Document Extraction

- Fixed `equipment_description` extraction so the Hebrew label/value split is handled correctly: `תיאור` is the field name and `מכונת הרמה` is the equipment description value.
- Added Hebrew display support for `checked_equipment` as `ציוד שנבדק`.
- Added `license_number` extraction from `מספר רישוי`, including short numeric values such as 4-6 digits.
- Removed fallback behavior that confused `מספר רישוי` with `מיקוד`.
- Added contact email extraction from document headers.
- Improved `client_company` handling so company names can include numbers without moving the number to the wrong side of the name.
- Improved `contact_person` extraction from `איש קשר`.
- Removed address fields from extraction/client-facing payloads where they are not needed.

### Clients

- Updated client table to use the UI framework table components.
- Added RTL-friendly table alignment and spacing for Hebrew client data.
- Added `contact_person` to the clients table.
- Changed row click behavior to open the client page directly instead of opening a modal.
- Updated the client details page with the correct data object fields.
- Added document check date and next inspection date to the client page.
- Fixed display-name spacing for Hebrew names with numbers, preserving names such as `מולטיפק פלסטיק 1990`.

### Calendar

- Added a user setting feature flag for showing only upcoming scheduled tests.
- Updated calendar event titles to show company name and contact name.
- Updated the event popup title to match the calendar event title.
- Removed noisy technical document fields from the popup.
- Added contact name, phone number, and email to the popup when available.

### Reports

- Added a year selector to the reports page.
- Added field selection for all report fields.
- Preselected the tracking report fields:
  - `תאריך`
  - `מה נבדק`
  - `תופש/איש קשר`
  - `טלפון`
  - `רלוונטי`
  - `מספר רישוי`
  - `הערות`
- Changed internal monthly reports to aggregate by `expiry_date`, so selecting month `08` includes only contracts whose next check date is in August.
- Replaced PDF output with DOCX and XLSX report files.
- Added RTL report formatting:
  - Centered report title.
  - Right-aligned table cell text.
  - RTL-aware column order for Hebrew reports.
- Added monthly internal report flow:
  - Sent on the 1st of each month.
  - Sent to the user email or configured report recipients.
  - Uses the tracking format `מעקב בדיקות לחודש 01.MM`.
- Added client future-test report flow:
  - Sends owner/internal email with client report attachments.
  - Sends client email with document links and file names.
- Added npm scripts for sending reports:
  - `npm run report:send-all`
  - `npm run report:send-client`
  - `npm run report:send-both`
  - `npm run report:send-client-future-owner`
  - `npm run report:send-client-future`
  - `npm run report:send-client-links`
  - `npm run report:send-client-future-links`

### Email Flows

- Sent the internal monthly report email to `arshavsky.pasha@gmail.com` for the selected month.
- Sent owner-facing client future reports with attached generated files.
- Added client-facing emails that include document links with file names instead of attaching generated reports.
