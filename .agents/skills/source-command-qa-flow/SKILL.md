---
name: "source-command-qa-flow"
description: "End-to-end QA for the Reminder app — login, upload document, create contract, send reminder email"
---

# source-command-qa-flow

Use this skill when the user asks to run the migrated source command `qa-flow`.

## Command Template

Run an end-to-end QA flow against the running dev server.

## Prerequisites
- `npm run dev` must be running (client on http://localhost:5173, server on :3000)
- Use test credentials from `.env` (or ask the user)

## Flow

### 1. Login
- Navigate to http://localhost:5173
- Fill in email + password, submit
- Assert: redirected to /dashboard, greeting visible

### 2. Upload a document
- Navigate to /documents
- Click "העלה מסמך"
- Upload a PDF file from the local machine
- Assert: file appears in list with status "processing" → wait → "done"

### 3. Verify contract was created
- Navigate to /contracts
- Assert: a new card appears with the uploaded document linked

### 4. Create a reminder on that contract
- Find the new contract card
- Click "+ תזכורת חדשה"
- Assert: modal opens, email pre-filled from client, template pre-selected
- Set trigger date, click "צור תזכורת"
- Assert: reminder row appears on the card with status "ממתין"

### 5. Send the reminder email
- Click "📤 שלח" on the new reminder
- Assert: status changes to "נשלח"

## Reporting
After each step, report PASS or FAIL with a screenshot description. Summarize all steps at the end.
