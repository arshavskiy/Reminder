# Reminder Flow — How & When Emails Are Sent

This document explains exactly how future reminders are scheduled, polled, and delivered.

---

## TL;DR

There is **no real cron job**. The trigger is a simple **`setInterval` loop inside the Bun server process**. Every minute it asks SQLite: *"any reminders with `trigger_date <= today` and `status = 'pending'`?"* — if yes, it sends them via SMTP.

```
Bun server starts
       │
       ▼
   startScheduler(broadcast)
       │
       ▼
   setInterval(checkReminders, 60_000)  ◄── the trigger
       │
       ▼ every 60 s
   SELECT … FROM reminders WHERE trigger_date <= date('now')
       │
       ▼ for each due row
   nodemailer → SMTP → recipient
       │
       ▼
   reminders.status = 'sent'
   email_log row inserted
   WebSocket push "reminder:fired" → UI toast
```

---

## 1. Where the timer is created

[`src/server/index.ts`](../src/server/index.ts) calls `startScheduler(broadcast)` once at boot:

```typescript
startScheduler(broadcast);
console.log(`[server] Running at http://localhost:${settings.port}`);
```

That function lives in [`src/server/reminders/scheduler.ts:11`](../src/server/reminders/scheduler.ts):

```typescript
export function startScheduler(push: PushFn) {
  const settings = getSettings();
  if (!settings.reminderEnabled) return;          // killswitch

  checkReminders().catch(console.error);          // run once immediately
  _timer = setInterval(() => {
    checkReminders().catch(console.error);
  }, settings.reminderCheckIntervalMs);           // default: 60_000 ms (1 min)
}
```

**Notes:**
- Only one scheduler runs per Bun process. If the server restarts, the interval starts over (no missed runs because the DB is the source of truth).
- The interval is configurable in **Settings → Reminders → check interval** (`reminderCheckIntervalMs`).
- The scheduler does **not** persist across restarts — it always queries the DB fresh, so reboots are safe.

---

## 2. The SELECT query — what counts as "due"

[`scheduler.ts:34`](../src/server/reminders/scheduler.ts) `checkReminders()`:

```sql
SELECT r.*, c.display_name AS client_name, d.file_name AS document_name
FROM reminders r
LEFT JOIN clients   c ON c.id = r.client_id
LEFT JOIN documents d ON d.id = r.document_id
WHERE r.status = 'pending'
  AND r.trigger_date <= date('now')
  AND r.id NOT IN (
    SELECT reminder_id FROM email_log
    WHERE success = 1 AND reminder_id IS NOT NULL
  );
```

A reminder fires when **all three** are true:
1. `status = 'pending'` — not yet sent, not dismissed, not snoozed past, not in error state
2. `trigger_date <= date('now')` — today or earlier (uses SQLite's date function, server's local timezone)
3. Has no successful entry in `email_log` yet — defensive dedup so a row can't be sent twice even if status update fails

Statuses that are **excluded**:
| Status | Why excluded |
|---|---|
| `sent` | Already done |
| `snoozed` | User pushed it forward (with a new `snoozed_until` date) |
| `dismissed` | User cancelled |
| `error` | Failed 3+ times; needs manual action |

---

## 3. How "future" reminders become "due"

Reminders are created **in the future** with `trigger_date = some date months/years ahead`. The scheduler ignores them every minute until the calendar catches up.

### Where reminders are created

**A. Auto from contract expiry** — [`generateContractReminders()`](../src/server/reminders/scheduler.ts) is called by the document importer right after a contract row is saved.

```
contract.expiry_date = "2027-07-16"
settings.reminderAdvanceDays = [90, 60, 30]
        │
        ▼
INSERT INTO reminders (trigger_date='2027-06-16', advance_days=30, ...)
```

Each row gets a title derived from `contract_type`:
- "תסקיר/בדיקה" → `בדיקה הבאה בעוד 90 יום (2027-07-16)`
- "ביטוח" → `חידוש ביטוח בעוד 90 יום ...`
- "תעודה/אישור" → `חידוש תעודה בעוד 90 יום ...`
- "חשבונית" → `תשלום בעוד 90 יום ...`
- default → `פקיעת תוקף בעוד 90 יום ...`

**Dedup**: before inserting, the function checks for an existing `(source_id, advance_days)` pair with `status != 'dismissed'`. So reprocessing a document doesn't double up reminders.

**B. Manual** — `POST /api/reminders` (the **+ תזכורת חדשה** button on the Reminders page). User picks a date and recipient.

**C. Quick test** — **🧪 תזכורת בדיקה** button. Creates a row with `trigger_date = today` and immediately calls `POST /api/reminders/:id/send-now` (which fires it synchronously, bypassing the wait for the next interval tick).

---

## 4. Sending — what happens when one is due

[`processReminder()`](../src/server/reminders/scheduler.ts:56):

```
1. Build recipient list
   - Use reminder.email_to if set (JSON array)
   - Else fall back to client.email (the linked client's address)
   - If neither, mark "sent" with no SMTP attempt (in-app only)

2. transport.sendMail() via nodemailer
   - SMTP host/port/auth from settings.json
   - RTL HTML template built in emailSender.ts
   - Subject: "[תזכורת] {title}"

3. ALWAYS write email_log row
   - success=1 with no error → continue to step 4
   - success=0 with error    → see step 5

4. On success:
   - UPDATE reminders SET status='sent'
   - INSERT INTO timeline_events (event_type='email_sent') for the client
   - WebSocket broadcast: { type: 'reminder:fired', reminderId, clientId, title }
   - Browser shows toast "תזכורת נשלחה"

5. On failure:
   - Count prior failed email_log rows for this reminder
   - If failCount + 1 >= 3 → UPDATE reminders SET status='error'
                          + WS broadcast 'reminder:error'
   - Else → leave status='pending'; next interval tick retries
```

---

## 5. Manual trigger (skip the wait)

You can fire a reminder *right now* without waiting for the next 60-second tick:

| Where | What it does |
|---|---|
| Reminders page → **"שלח עכשיו"** button on a row | `POST /api/reminders/:id/send-now` → runs the same email-sending code path synchronously, marks `sent`, broadcasts `reminder:fired` |
| Reminders page → **🧪 תזכורת בדיקה** | Creates `trigger_date = today` + calls send-now |
| Settings → SMTP → **"שלח אימייל בדיקה"** | `POST /api/email/test` — bypasses reminders entirely; just verifies SMTP works |

These three endpoints share the same `nodemailer` transport from [`emailSender.ts`](../src/server/reminders/emailSender.ts).

---

## 6. Lifecycle diagram

```
                ┌─────────────────────────────────┐
                │   DOCUMENT IMPORTED              │
                │   (PDF, image, etc.)             │
                └────────────────┬────────────────┘
                                 │
                                 ▼
                ┌─────────────────────────────────┐
                │   AI extraction → expiry_date   │
                │   importer.ts                   │
                └────────────────┬────────────────┘
                                 │
                                 ▼
                ┌─────────────────────────────────┐
                │   generateContractReminders()   │
                │   for each advance_days:        │
                │   INSERT reminder (pending,     │
                │       trigger=expiry - N days)  │
                └────────────────┬────────────────┘
                                 │
                                 ▼
                ┌─────────────────────────────────┐
                │   (months/years pass)            │
                │   Server may restart any time   │
                └────────────────┬────────────────┘
                                 │
                                 ▼  every 60 s
                ┌─────────────────────────────────┐
                │   checkReminders()              │
                │   trigger_date <= today?        │
                └────────────────┬────────────────┘
                                 │ yes
                                 ▼
                ┌─────────────────────────────────┐
                │   sendReminderEmail()           │
                │   via nodemailer + SMTP         │
                └────────────────┬────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
                ▼ success                         ▼ failure
   ┌─────────────────────┐           ┌──────────────────────┐
   │ status='sent'       │           │ failCount + 1 >= 3?   │
   │ email_log INSERT    │           │   yes → 'error'       │
   │ timeline_events     │           │   no  → retry next    │
   │ WS reminder:fired   │           │       tick            │
   └─────────────────────┘           └──────────────────────┘
```

---

## 7. Operational notes

**Timezone**: the SQLite `date('now')` uses UTC by default. If reminders consistently fire a day late/early, see [SQLite date modifiers](https://www.sqlite.org/lang_datefunc.html) — adding `'localtime'` to the query may be needed for users far from UTC.

**Server downtime**: if the server is off when a reminder is due, no email is sent during that window. When the server next starts, the scheduler immediately calls `checkReminders()` once (before the interval kicks in), so it'll catch up any missed reminders — they fire on the next boot.

**Killswitch**: set `reminderEnabled: false` in `data/settings.json` (or Settings → Reminders) to disable the scheduler entirely. The interval won't be created at all.

**Polling cost**: `checkReminders()` is one indexed SQLite query against `reminders.trigger_date` + `reminders.status` (both indexed). Negligible cost even with tens of thousands of pending rows.

**Per-reminder retry**: a failed send leaves `status='pending'`, so the next 60-second tick retries automatically. After 3 failed `email_log` rows the reminder is moved to `status='error'` and won't be retried.

---

## 8. Key files

| File | Role |
|---|---|
| [`src/server/index.ts`](../src/server/index.ts) | Starts the scheduler at boot |
| [`src/server/reminders/scheduler.ts`](../src/server/reminders/scheduler.ts) | `setInterval` loop, due-row SELECT, `generateContractReminders()` |
| [`src/server/reminders/emailSender.ts`](../src/server/reminders/emailSender.ts) | nodemailer transport, RTL HTML template, `sendTestEmail()` |
| [`src/server/routes/reminders.ts`](../src/server/routes/reminders.ts) | REST: create / send-now / dismiss / snooze |
| [`src/server/pipeline/importer.ts`](../src/server/pipeline/importer.ts) | Calls `generateContractReminders()` after AI extraction |
| [`src/client/views/RemindersPage.vue`](../src/client/views/RemindersPage.vue) | UI to create, list, dismiss, fire-now |
