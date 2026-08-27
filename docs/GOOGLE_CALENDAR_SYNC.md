# Google Calendar Sync

ReminderOCR can sync pending inspection reminders into the signed-in user's Google Calendar.

## Purpose

The integration gives users a live work calendar for upcoming inspection reminders without writing into their primary Google calendar. ReminderOCR creates and owns a dedicated secondary calendar named `תסקירים`.

## OAuth and Scope

- Calendar connect starts from `GET /api/calendar/auth-url`.
- Callback is `GET /auth/calendar/callback`.
- The app requests `https://www.googleapis.com/auth/calendar.app.created`, plus `openid profile email` for account verification.
- The OAuth account is checked against the logged-in ReminderOCR user. If the selected Google account is different, the callback returns `calendar_account_mismatch`.
- Required production env: `CALENDAR_REDIRECT_URI=https://app.remindocr.com/auth/calendar/callback`.
- Google Cloud must include the same URI under Authorized redirect URIs.

## Calendar Naming

- Calendar resource summary: `תסקירים`.
- Google calendar-list visible label: `תסקירים`.
- Existing calendars created with an older name are renamed during the next sync.

## Event Format

Each pending or snoozed reminder is mirrored as an all-day Google Calendar event.

Event title:

```text
תסקיר לא בתוקף - <company name>
```

If no company/client value exists, the fallback title is:

```text
תסקיר לא בתוקף
```

Event details are built from the reminder snapshot:

- `לקוח`
- `איש קשר`
- `אימייל`
- `טלפון`
- `מספר חוזה`
- `סוג`
- `יצרן`
- `דגם`
- `מספר סידורי`
- `מספר רישוי`
- Original reminder title/body

For older reminders missing the snapshot fields, sync attempts to repair the reminder from its linked contract, document, and client, saves the missing fields back onto the reminder, then pushes the event.

## Sync Rules

- `POST /api/calendar/sync` pushes app reminders first, then pulls Google changes.
- Existing Google events are patched when title, details, or date changes.
- Reminders with `sent`, `dismissed`, or deleted status are removed from the app-owned calendar.
- Google date moves are pulled back only when the Google event was updated after the last app push.
- Google event deletions mark the reminder as dismissed during pull.
- Events are matched by private extended properties, not by title.

## UI

- Profile settings show Gmail, Drive, and Calendar connection rows.
- Calendar status includes connected account email, sync count, last sync, and a direct link to the Google calendar.
- App reminder calendar shows a small Google Calendar indication for reminders already synced.

## Main Files

- `server/src/routes/calendar.ts`
- `server/src/calendar/googleCalendar.ts`
- `server/src/calendar/sync.ts`
- `server/src/__tests__/calendarSync.test.ts`
- `client/src/views/ProfilePage.vue`
- `client/src/components/ReminderCalendar.vue`
- `client/src/components/ReminderQuickView.vue`
