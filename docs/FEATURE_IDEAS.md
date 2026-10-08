# Feature Ideas

Scanned from the current RemindOCR app structure and documentation.

## Next up (planned 2026-10-07)

Built on the expense and household features shipped 2026-10-06/07 (recurring payments, missing receipts, budgets, annual PDF, household invite). Suggested order: 1, 2, 4, 5, then 8 and 9.

### Quick wins

1. **Recurring payments → reminders**
   A "remind me before the next charge" button on each recurring-payments row, with the date predicted from past charges. Alert when a usually stable amount goes up.

2. **Missing receipts: find and import automatically**
   Run the Gmail search on the server and import the matching receipt, instead of only opening a search link. Weekly email listing receipts that are still missing.

3. **Budget pace alert**
   Warn mid-month when a category is on track to exceed its budget. Today's spending alert only fires after the month ends.

4. **Trial can open the expense pages**
   Trial is excluded from the invoice, expenses, recurring and missing-receipts routes (`requirePlan: ["digital", "basic", "business"]`), so trial users never see what Digital sells. Allow it, limited by the trial's one month of invoice history.

5. **Review queue for Digital**
   Digital imports from Gmail and email-in unattended, but `/review` sits behind `pages.documents`, which the family overlay hides. Gate it on `pages.invoices` as well.

6. **Import history for customers**
   `/gmail/import-history` is admin-only in the sidebar. Open it to Digital and Pro users, who also run Gmail imports, so they can see failures and retry.

7. **Saved filter views on the server**
   `SavedFilterViews` stores presets in localStorage. Store them per user so they follow across devices and household members.

### Medium

8. **Accountant export**
   Monthly bundle of invoice files plus an Excel sheet, optionally emailed to the accountant on a schedule. Include the SHAAM allocation number.

9. **Cash-flow forecast**
   Upcoming unpaid invoices plus predicted recurring charges, month by month.

10. **Warranty vault**
    One page per purchase: receipt, warranty end date and return deadline. Ties together discovery, invoices and the return-date reminder.

11. **Bank / credit-card statement import (CSV)**
    Match card charges against receipts to find missing receipts from the other direction.

12. **Household sharing**
    Assign a reminder to a household member and send notifications per person. Builds on the household invite.

### Larger (existing roadmap)

13. **WhatsApp reminders** — still the most requested channel in Israel.
14. **Split Google permissions** — basic sign-in at login; ask for Gmail and Drive access only when used. Helps Google app verification.
15. **Customer portal and monthly client packets** (Pro).
16. **Equipment QR codes and offline field mode** (Pro).

## What תסקל 2.0 sells that we don’t — build these first

Full write-up: [TASKAL_FEATURE_GAPS.md](./TASKAL_FEATURE_GAPS.md) (scanned 2026-08-27).

1. WhatsApp + SMS reminders
2. Google Calendar + inspection scheduling
3. Invoice from the inspection (bill the client)
4. Send the PDF to all stakeholders in one click
5. Field app: renew an inspection in seconds
6. Sub-inspectors / office team
7. Statutory template pack (Ministry of Labor forms)
8. Defects table + combined Excel export

## Best Feature Ideas

1. **Real Google OAuth verification mode**  
   A guided demo mode that walks through login, Gmail connect, import, Drive sync, disconnect, and records clean status for Google review.

2. **Split Google permissions**  
   Normal Google sign-in should request only profile/email. Gmail and Drive permissions should be requested later only when the user clicks import/sync.

3. **Audit log UI**  
   Show a readable activity log: Gmail connected, file imported, document processed, Drive export done, reminder sent, failed email, and user changes.

4. **Bulk issue fixer**  
   One screen for missing expiry dates, missing emails, duplicate report numbers, missing reminders, and unsynced Drive files, with quick actions.

5. **Drive sync dashboard**  
   Show synced/not synced/failed counts, last sync time, folder link, retry failed exports, and per-document sync status.

6. **Gmail import preview**  
   Before "import all," show matching emails and attachments with checkboxes, filters, and duplicate warnings.

7. **Client merge assistant**  
   The server already has merge logic. Add a UI that suggests duplicate clients and lets the user merge safely.

8. **Equipment QR codes**  
   Generate QR stickers for equipment. Scanning opens the equipment record, service history, and next inspection status.

9. **Digital inspection checklists**  
   Per equipment type: checklist, findings, photos, signature, then generate the final inspection PDF.

10. **Mobile field mode upgrade**  
    Offline-first field inspections: take photos, fill checklist, save draft locally, sync when online.

11. **Reminder health center**  
    Show which reminders will send soon, which have no email, which failed, and which need escalation.

12. **Customer portal**  
    Let clients open a secure link to see their reports, upcoming expirations, and download documents.

13. **WhatsApp reminders**  
    Optional reminder channel alongside email, especially useful in Israel.

14. **Document versioning**  
    When the same document or updated report is imported, keep version history instead of only deduping.

15. **Smarter extraction review**  
    After OCR/AI import, show confidence and highlight fields that probably need human review.

16. **Template marketplace/library**  
    Shared inspection templates by equipment type, with admin-approved templates and user copies.

17. **Automatic monthly client packets**  
    Generate and email each client a monthly bundle of reports/invoices relevant only to them.

18. **Admin usage and billing dashboard**  
    Per user: imported docs, AI usage, Gmail imports, Drive exports, plan status, and quota usage.

19. **Push notifications**  
    Browser/mobile push for upcoming inspections, failed exports, and email failures.

20. **Stronger automated tests**  
    Especially for OAuth, user isolation, Gmail import, Drive export, reminders, and template rendering.

## Recommended Top 5

1. Split Google permissions
2. Gmail import preview
3. Drive sync dashboard
4. Bulk issue fixer
5. Equipment QR/checklists
