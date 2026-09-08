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
WHATSAPP_ENABLED=false
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

## References

- [Meta WhatsApp examples](https://github.com/fbsamples/whatsapp-api-examples)
- [Meta Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/overview)
- [WhatsApp Business messaging policy](https://business.whatsapp.com/policy)
