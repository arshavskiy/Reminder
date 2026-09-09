# Payment requests

The new-inspection dialog can optionally create a quote from a per-user inspection pricebook. The generated PDF is linked to the new report and stored in the existing document system. Access uses the existing `pages.contracts` feature.

In the last step of a new inspection, enable a quote and define or reuse inspection-specific service rows, quantities, VAT and validity date. Saving the report stores the pricebook and issues the PDF under a per-user sequential number beginning at `001`. Quote numbering does not reset each year. Pricebook updates do not change existing documents. Monetary calculations use integer agorot.

PDFs are stored in the existing document collection and local data directory. The existing private S3/Spaces configuration and enabled Google Drive integration are reused. Cloud status is shown separately for each destination; retrying archival reuses the existing PDF. No new storage credentials are required. Google Drive synchronization remains subject to its existing configuration and plan rules.

The current product UI does not expose email delivery, receipt generation, settlement recording or card charging for these documents.

Quotes, payment requests and service-payment specifications are explicitly marked as non-invoice, non-receipt documents. Official receipt functionality is hidden until an approved accounting-provider integration is introduced.

Validation: `cd server` then `npm run build`, `npm test`; `cd client` then `npm run build`. Focused coverage is in `server/src/__tests__/paymentRequests.test.ts`. Live email delivery and cloud upload require a configured environment and were not exercised by the isolated UI fixture.
