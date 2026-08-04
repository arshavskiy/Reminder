# Reminder Scheduler Status Flow

## Overview
The system uses a **scheduled task** approach to manage reminders and reports. Status tracking happens at multiple levels:

1. **Scheduler Health** - tracks if cron jobs run successfully
2. **Reminder Status** - tracks individual reminder lifecycles  
3. **Email Log** - tracks email delivery attempts and results

---

## Architecture

### 1. Scheduler Initialization (`index.ts`)

```
Server Start
    ↓
main()
    ├─ connectDb()
    ├─ seedTemplates()
    └─ startScheduler()        ← Core scheduler starts
        ├─ Check: IS PRODUCTION?
        │  (dev: skipped, prod: runs)
        │
        └─ setInterval(tick, reminderCheckIntervalMs)
           (Default: 60,000ms / 1 minute)
```

**Health Check Endpoint:**
```
GET /health → { status: "ok", ts: Date.now() }
```
Called by Railway infrastructure to verify the app is alive.

---

### 2. Scheduler Tick Cycle (`scheduler.ts`)

Every interval (default: 1 minute), the `tick()` function runs 3 tasks:

```typescript
async function tick() {
  if (settings.reminderEnabled) 
    await runWithHealth("checkReminders", checkReminders);
  
  await runWithHealth("checkMonthlyReports", checkMonthlyReports);
  
  if (settings.reminderEnabled) 
    await runWithHealth("checkEscalations", checkEscalations);
  
  // Update overall tick status
  await col("scheduler_health").updateOne(
    { name: "tick" },
    { $set: { name: "tick", last_run_at: new Date(), last_error: null, consecutive_failures: 0 } },
    { upsert: true }
  );
}
```

---

## 3. Status Tracking with `runWithHealth()`

**Pattern: Success Case**
```
runWithHealth("checkReminders", checkReminders)
    ↓
    checkReminders() executes successfully
    ↓
    WRITES TO: scheduler_health collection
    {
      name: "checkReminders",
      last_run_at: new Date(),          ← Updated
      last_success_at: new Date(),      ← Set on success only
      last_error: null,                 ← Cleared
      consecutive_failures: 0           ← Reset
    }
    ↓
    STATUS: ✅ PASS
```

**Pattern: Failure Case**
```
runWithHealth("checkReminders", checkReminders)
    ↓
    checkReminders() throws error
    ↓
    WRITES TO: scheduler_health collection
    {
      name: "checkReminders",
      last_run_at: new Date(),          ← Updated
      last_error: "Error message",      ← Set on failure
      consecutive_failures: 1           ← Incremented
      // last_success_at: NOT updated
    }
    ↓
    STATUS: ❌ FAIL (with retry tracking)
```

---

## 4. Reminder Lifecycle

### Phase 1: Check Reminders (`checkReminders()`)

```
checkReminders()
    ↓
    Find all reminders:
    {
      status: "pending",
      trigger_date: { $lte: today }
    }
    ↓
    For each due reminder:
    └─ processReminder(reminder)
```

### Phase 2: Process Single Reminder

```
processReminder(reminder)
    ↓
    1. Resolve recipients:
       - From reminder.email_to
       - OR from client.email
       - Otherwise: SKIP with status = skipped
    ↓
    2. Log attempt to email_log:
       {
         reminder_id: remId,
         log_type: "send",
         to_address: recipients.join(", "),
         subject: "תזכורת - " + title,
         sent_at: new Date(),
         success: ?,
         error: ?
       }
    ↓
    3. Send email:
       sendReminderEmail(reminder, recipients)
    ↓
    4. Based on result:
       ├─ SUCCESS:
       │  ├─ mark status = "sent" on reminder
       │  ├─ create timeline_event
       │  └─ advance contract cycle (if contract_expiry)
       │
       ├─ FAILURE (attempt 1-2):
       │  └─ log error, try again next cycle
       │
       └─ FAILURE (attempt 3+):
          └─ mark status = "error" on reminder
```

### Phase 3: Update Reminder Status in DB

```
REMINDER STATUS TRANSITIONS:

"pending"
    ↓ (trigger_date reached + email sent successfully)
"sent"
    ↓ (if applicable: advance contract cycle)
    └─ Generate new pending reminders for next inspection cycle

"error"
    ↓ (3 failed send attempts)
    (stays in error state)

"snoozed"
    └─ (user-initiated snooze, manual action)

"dismissed"
    └─ (user-initiated dismiss, manual action)
```

---

## 5. Status Storage

### `scheduler_health` Collection
```typescript
{
  name: string;                  // "checkReminders", "checkMonthlyReports", "tick"
  last_run_at: Date;            // When did we last try?
  last_success_at: Date;        // When did it last work?
  last_error: string | null;    // What went wrong?
  consecutive_failures: number; // How many times in a row failed?
}
```

**Use Case:** Admin dashboard can query this to see scheduler health.

### `reminders` Collection
```typescript
{
  _id: ObjectId;
  status: "pending" | "sent" | "snoozed" | "dismissed" | "error";
  trigger_date: string;       // ISO date
  email_to: string | null;    // JSON array
  // ... other fields
}
```

### `email_log` Collection
```typescript
{
  reminder_id: string | null;
  log_type: "send" | "skipped";
  to_address: string;
  subject: string;
  sent_at: Date;
  success: number;            // 1 = success, 0 = failure
  error: string | null;
  smtp_host: string;
}
```

---

## 6. Monthly Reports Cron

```
checkMonthlyReports()
    ↓
    Find all users with monthly_report_enabled: true
    ↓
    For each user:
    └─ Check if:
       ├─ Today is >= day 1 of month
       ├─ Current hour >= configured hour (default 8 AM)
       ├─ NOT already sent this month
       │
       └─ If all true:
          ├─ Generate report
          ├─ Send to recipients
          ├─ Update user_settings:
          │  {
          │    monthly_report_last_sent: "2026-08",
          │    monthly_report_last_error: null
          │  }
          │
          └─ Log result
```

---

## 7. Escalation Check

```
checkEscalations()
    ↓
    Find reminders still "pending" older than threshold days
    (Default: 3 days)
    ↓
    For each overdue reminder:
    └─ Send escalation email to admin
       └─ escalation_email setting
```

---

## Key Flow Diagram

```
┌────────────────────────────────────────────────────────────┐
│            SERVER START (index.ts)                         │
│ ├─ connectDb()                                             │
│ ├─ seedTemplates()                                         │
│ └─ startScheduler()                                        │
│    └─ APP_ENV = production? YES                            │
│       └─ setInterval(tick, 1 minute)                       │
└────────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────────┐
│            TICK (Every 1 minute)                           │
│ ├─ runWithHealth("checkReminders")                         │
│ │  └─ Find due reminders, send emails                     │
│ │     └─ UPDATE reminders { status: "sent" | "error" }    │
│ │     └─ INSERT email_log { success: 1 | 0 }              │
│ │                                                          │
│ ├─ runWithHealth("checkMonthlyReports")                    │
│ │  └─ Send if conditions met (once per month)             │
│ │     └─ UPDATE user_settings { last_sent: monthKey }     │
│ │                                                          │
│ ├─ runWithHealth("checkEscalations")                       │
│ │  └─ Find overdue reminders, email admin                 │
│ │                                                          │
│ └─ UPDATE scheduler_health { last_run_at, last_error }    │
└────────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────────┐
│     STATUS WRITTEN TO DATABASE                             │
│ ├─ scheduler_health (task health tracking)                │
│ ├─ reminders (reminder lifecycle: pending→sent→error)     │
│ ├─ email_log (individual send attempts)                   │
│ ├─ user_settings (monthly report last sent)               │
│ ├─ timeline_events (audit trail for clients)              │
│ └─ contracts (auto-advance to next cycle)                 │
└────────────────────────────────────────────────────────────┘
```

---

## Status "OK" Responses

### 1. **HTTP /health Endpoint**
```
Response: { status: "ok", ts: Date.now() }
Purpose: Railway health check (no DB involved)
```

### 2. **Scheduler Health Records**
```
Query: col("scheduler_health").findOne({ name: "tick" })
Success: last_error === null AND consecutive_failures === 0
Purpose: Admin can see that scheduler is working
```

### 3. **Reminder Status in DB**
```
Query: col("reminders").findOne({ _id })
Status "sent": Email was delivered successfully
Status "error": Failed 3+ times
Status "pending": Waiting for trigger date
Purpose: Track individual reminder progress
```

---

## Environment Control

```typescript
// Only runs in production:
const isProd = (process.env.APP_ENV ?? "development") === "production";

if (!isProd) {
  logger.info("scheduler_skipped", { 
    reason: "APP_ENV is not 'production'" 
  });
  return; // No emails, no DB writes in dev!
}
```

**Important:** Development environments skip the scheduler entirely.

---

## Key Code References

- **Scheduler entry:** `src/reminders/scheduler.ts` (line 12: `runWithHealth()`)
- **Initialization:** `src/index.ts` (line 181: `startScheduler()`)
- **Health check:** `src/index.ts` (line 72-74: `/health` endpoint)
- **Reminder processing:** `src/reminders/scheduler.ts` (line 237: `processReminder()`)
- **Email sending:** `src/reminders/emailSender.ts`
- **Contract advancement:** `src/reminders/scheduler.ts` (line 372: `advanceContractAfterSentReminder()`)
