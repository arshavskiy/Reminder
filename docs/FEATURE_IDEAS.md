# Feature Ideas

Scanned from the current RemindOCR app structure and documentation.

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
