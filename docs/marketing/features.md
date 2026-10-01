# RemindOCR marketing feature inventory

Product snapshot: 25 September 2026. Audience: general businesses tracking documents and renewal dates. This is the content source for the separate marketing PDF; specialist and administrator capabilities are identified explicitly. Availability depends on the account plan, enabled modules and connected services.

## Positioning

**Know what expires next. Have time to act.**

Bring business documents, important dates and email reminders into one workflow. Start with contracts, certificates and permits; expand into client records, reporting and specialist inspection workflows when relevant.

## Full feature inventory

### Document intake and extraction

- Upload documents from the browser; import supported attachments through connected Gmail accounts.
- PDF, scanned documents and images; pipeline parsers also support Word, Excel and text sources.
- OCR and AI-assisted extraction of document details, parties and dates, with Hebrew and English OCR support.
- Review and correct extracted information before relying on a renewal date.
- Background processing, progress/status visibility, retry handling and duplicate detection.
- Original-file access, document search, filters and links to related records.
- Source storage through configured object storage; Google Drive export for eligible plans and connected accounts.

### Dates, contracts and reminders

- Create, edit and clone contract records; associate records with source documents and clients.
- Track expiry dates, upcoming renewals and reminder schedules.
- Configure advance reminders; send client email reminders and use reusable email templates.
- Review reminder records and delivery state; use dashboard summaries and an expiry calendar.
- In-app notifications with read/unread controls; browser push requires configuration and permission.
- Google Calendar integration on Business with a connected Google account, plus a subscribable calendar feed (ICS) for Apple and Outlook.
- Email-in on Business: a personal address that imported documents are forwarded to.
- Camera capture and share-to-app from a phone.

### Clients and everyday operations

- Maintain client records, contact details and relationships to contracts and documents.
- Search across business records; filter operational lists and review recent activity.
- Dashboard summaries for documents, clients, pending work and upcoming expiries.
- User profile, business settings, feature visibility and notification preferences.
- Google and email authentication, email verification and account recovery flows.
- Task creation, listing and updates for follow-up work.
- Reusable document templates and AI-assisted template generation from text.
- Email-template editing, variable previews, reminder previews and test-email workflows.
- Business logo and template asset uploads; structured reminder-table import.

### Reports and business visibility

- Excel exports and monthly report download/email workflows on eligible plans.
- Monthly contract PDF reports and document-linked records for follow-up.
- Invoice and receipt records with editable extracted fields.
- Monthly expense analysis, vendor category management, vendor merge and six-month report email.
- Invoice-history import through Gmail is a Business capability; it is not included in Basic.

### Specialist inspection workflows

- Equipment register, categories, inspection history and linked reports.
- Equipment-category classification in document lists, distinct from the specific machine name.
- Manual inspection records and generated report PDFs with configurable print templates.
- Equipment spreadsheet import with preview/confirmation and duplicate report-number review.
- Field checklists and equipment photos on Business.
- Digital is a manual-workflow plan: no document imports, Gmail imports or AI extraction.

### Integrations and administration

- Gmail account connection, history search and background imports; plan-specific account/history limits.
- Google Drive export, Google Calendar sync and email delivery through configured providers.
- Administrator user/plan controls, feature settings, processing controls and operational diagnostics.
- WhatsApp queue/integration exists as a configured module; do not promise universal customer availability.
- SEED lead management, campaigns and unsubscribe scanning are administrator outreach tools, not the core customer document-tracking offer.

## Plans for new English-market subscriptions

| Capability | Trial | Digital | Basic | Business |
| --- | --- | --- | --- | --- |
| Listed price | $0 / 30 days | $45 / month | $75 / month | $119 / month |
| Document imports | 20 total | None | 50 / month | Unlimited |
| OCR / AI extraction | Yes | No | Yes | Yes |
| Client reminders, Excel, monthly reports | Yes | Yes | Yes | Yes |
| File storage / Drive | Yes | No | Yes | Yes |
| Users / connected email accounts | 2 / 2 | 2 / 0 | 2 / 2 | Unlimited / unlimited |
| Inspection Gmail history | 16 months | None | 16 months | 24 months |
| Invoice Gmail history | 1 month (runtime trial allowance) | None | None | 36 months |
| Google Calendar / calendar feed / field work | No | No | No | Yes |
| Email-in (forward documents to a personal address) | No | No | No | Yes |
| Camera capture, share-to-app | Yes | No | Yes | Yes |

Upload and Gmail imports share the quota. Trial quota is total across the trial, not monthly. No credit card is required for the trial. Prices and subscription terms are confirmed before payment; existing customers retain agreed terms. Unlimited describes the catalog entitlement, not a processing-speed or service-level guarantee.

## Demonstration narrative

1. Upload a sample service agreement or certificate, or import an eligible Gmail attachment.
2. Review the extracted customer and expiry date; correct any uncertain value.
3. Open the linked record and configure a reminder schedule.
4. Show the upcoming-expiry dashboard and the reminder email preview.
5. Export a report; optionally demonstrate Drive or Business Calendar integration.

Use demonstration data. Do not claim guaranteed extraction accuracy, regulatory certification, legal advice, native electronic signatures, full accounting/ERP functionality or features outside the selected plan.

## Source map and maintenance

Pricing: `client/src/shared/pricingCatalog.json` (version 2026-09-23). Runtime entitlements: `server/src/plans/tierFeatures.ts`. Modules: `client/src/shared/features.ts`. Capabilities: `server/src/routes/{documents,contracts,reminders,clients,equipment,invoices,reports,gmail,gdrive,calendar,notifications,printTemplates,admin,adminCampaigns}.ts`, `server/src/pipeline/importer.ts`, `server/src/reminders/scheduler.ts`, `server/src/whatsapp/`, `server/src/db/seedDb.ts`.

Regenerate the presentation with `python scripts/build-marketing-pdf.py`. The generator contains the slide copy; update it alongside this inventory when product scope changes. Review both the pricing catalog and runtime gates before republishing. PDF output: `output/pdf/remindocr-marketing-features.pdf`.
