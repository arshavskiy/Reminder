# WhatsApp Cloud API

The Inspector Leads admin page supports approved text-template campaigns, per-phone consent records, recipient previews, a durable MongoDB queue, cancellation of pending sends, and delivery details. Sending is disabled by default. This integration does not automate WhatsApp Web or change the existing email reminder scheduler.

## Meta setup

1. Create a Meta Business portfolio and a Meta developer app with the WhatsApp product. Start with Meta's test phone number and permitted test recipients.
2. Register the sending business number. To use `+972554605328`, complete Meta's number onboarding; setting the display label alone does not connect that number. If it is already in the WhatsApp Business app, check the account's eligibility for coexistence before migrating it.
3. Create a production system-user access token with access to the WhatsApp assets and `whatsapp_business_messaging` / `whatsapp_business_management` permissions.
4. Set the environment variables below on the backend. Never put credentials in the Vue client.
5. Configure the callback URL as `https://<server-host>/api/webhooks/whatsapp`, enter the verification token, and subscribe the app to the WABA's `messages` webhook field. The app secret verifies POST signatures against the raw body.
6. Create an approved template in WhatsApp Manager. This version lists approved templates with a text BODY, optional FOOTER, and numbered positional variables. Headers, buttons and named variables are not yet supported.
7. Record actual recipient opt-in with its evidence/source, preview a small test campaign, then set `WHATSAPP_ENABLED=true` to enable sends. An existing database record does not imply consent.

## Environment

```
WHATSAPP_ENABLED=true
WHATSAPP_ACCESS_TOKEN=<system-user-token>
WHATSAPP_PHONE_NUMBER_ID=<Meta-phone-number-id>
WHATSAPP_BUSINESS_ACCOUNT_ID=<WABA-id>
WHATSAPP_API_VERSION=<supported-version-from-Meta-app>
WHATSAPP_APP_SECRET=<Meta-app-secret>
WHATSAPP_VERIFY_TOKEN=<random-verification-secret>
WHATSAPP_DISPLAY_PHONE=+972554605328
```

Choose an API version supported by your Meta app; the server deliberately does not guess one. `WHATSAPP_DISPLAY_PHONE` is informational; `WHATSAPP_PHONE_NUMBER_ID` is the actual sender.

Example template body (`remindocr_introduction`, Hebrew, marketing category):

> היי {{1}}, נעים מאוד, אני פבל מ־RemindOCR.
> המערכת מרכזת דוחות, לקוחות ומועדי בדיקות, ועוזרת לנהל תזכורות לקראת הבדיקה הבאה.
> אשמח להראות לך בקצרה איך זה עובד: https://remindocr.com
> להפסקת הודעות אפשר להשיב הסר.

Use `{{name}}` as Variable 1 in the admin composer. `{{company}}`, `{{phone}}`, and literal text are also supported as variable values. Template approval is managed in Meta, not inferred from local configuration.

## Storage and delivery

WhatsApp contacts, campaigns, messages and the sender lease live in the server's **primary database**, independent of the admin DB selector. Lead lookup reuses the existing Inspector Leads data source. The worker and webhook always use the same primary collections; run local tests with a test sender and database rather than pointing a second environment at the same account.

Campaigns only become sendable after all message jobs have been persisted. Request UUIDs prevent repeated campaign submissions; recipients are deduplicated by normalized international phone. Consent is checked both while preparing and immediately before sending. Revocation and inbound `STOP`, `UNSUBSCRIBE`, `הסר`, `הסרה`, or `הפסק` cancel pending jobs. Other replies record the last inbound time without granting marketing consent.

The MongoDB worker serializes sends across replicas with a shared lease and at least one second between requests. HTTP 429 responses receive exponential backoff, up to five attempts. Permanent rejections fail. Network failures, server errors and interrupted sends become **unknown**, because Meta may have accepted the message; inspect Meta delivery records before creating a replacement campaign. There is no automatic retry for ambiguous outcomes.

`accepted` is not delivery confirmation. Signed webhook events advance `sent → delivered → read` without letting delayed older statuses overwrite newer ones. Failed delivery remains visible. Cancelling only stops pending jobs; a request already in flight can still be delivered. A finished campaign means queue processing ended, not that every message was delivered.

Redis/BullMQ is not required. The queue uses the existing MongoDB connection and indexed atomic claims. This release provides admin lead campaigns and the reusable template sender; automatic contract-reminder scheduling and a WhatsApp inbox are separate integrations.

## Incoming documents

Signed document/image webhooks are persisted in `whatsapp_inbox` before returning success. The sender number and incoming message ID identify a job, so webhook replays do not create another job. Database failures return 503 for provider retry. The worker claims jobs atomically, renews its processing lease, and recovers expired leases after a restart. Transient processing failures retry up to five attempts; unsupported or oversized media fails immediately.

Routing requires exactly one active user with WhatsApp intake enabled and a matching profile phone. Local Israeli and international phone formatting are accepted; ambiguous matches are ignored. The worker checks the account again before importing. Profile phone matching is not proof of phone ownership: verified account-to-phone binding remains a prerequisite for offering intake broadly.

Supported files are PDF, JPEG, PNG, WebP, and TIFF, limited to 25 MiB. Downloads enforce the limit against both metadata and streamed bytes. Media lookup includes Meta's `phone_number_id` ownership check. Files use isolated temporary directories and enter the existing quota-checked processing pipeline. Low-confidence or incomplete WhatsApp imports participate in the review queue. Confirmation text only says that processing is queued; it does not promise that a reminder was created. A failed confirmation does not retry an already imported document.

The existing WhatsApp process pause and enabled flag control both workers. Intake status and error codes are currently stored in `whatsapp_inbox`; a customer-facing intake history screen is not implemented.

## Remaining reminder-channel work

- Connect scheduled reminders to approved utility templates, with per-user/per-recipient channel preferences and consent.
- Track WhatsApp delivery separately from email delivery so one channel's success does not hide another's failure.
- Define cancellation, snooze, and retry behavior for queued reminder messages.
- Add verified phone binding before broader inbound intake rollout.
- Choose and integrate an SMS provider. There is no SMS sender or fallback in this implementation.

Local validation uses mocked provider requests (`whatsapp.test.ts`, `whatsappIntake.test.ts`) and the full server test suite. No live messages are needed for these tests.

## References

- [Meta WhatsApp examples](https://github.com/fbsamples/whatsapp-api-examples)
- [Meta Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/overview)
- [WhatsApp Business messaging policy](https://business.whatsapp.com/policy)
