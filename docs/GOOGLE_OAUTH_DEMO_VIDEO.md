# Google OAuth Demo Video Script

Purpose: use this script for Google OAuth verification when demonstrating RemindOCR's Gmail and Google Drive integrations.

Recommended length: 3-5 minutes.

Recording account: use a dedicated test Google account with non-sensitive sample emails and sample PDF attachments. Do not record private customer documents, production secrets, browser password managers, admin panels, or unrelated Gmail messages.

## What The Reviewer Must See

- The app name: RemindOCR.
- The public homepage, Privacy Policy, and Terms links.
- The user intentionally starts the Gmail connection flow.
- The Google OAuth consent screen and requested permissions.
- Gmail data is used only to list emails with attachments and import selected attachments.
- Imported files appear inside RemindOCR as user documents.
- Google Drive sync is user controlled and creates/uses a RemindOCR folder.
- The user can disconnect Gmail.
- The user can revoke access from Google Account permissions.

## Scope Story

Current app scopes used by the Gmail connection flow:

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/drive.file`

Explain them plainly in the video:

- Gmail read-only access lets RemindOCR list matching emails and download attachments the user chooses to import.
- Drive file access lets RemindOCR create and manage files/folders created by RemindOCR in the user's Google Drive.
- RemindOCR does not request full mailbox write access.
- RemindOCR does not send, modify, or delete Gmail messages.
- RemindOCR does not use Google user data for ads or model training.

## Recording Setup

1. Open a clean browser profile or incognito window.
2. Sign in to the dedicated test Google account.
3. Make sure the test Gmail inbox has 2-3 messages with safe sample PDF attachments.
4. Make sure the test account has no sensitive Drive files visible.
5. Open `https://remindocr.com/`.
6. Zoom the browser to 100%.
7. Record the full browser window, not the entire desktop.

## Script

### 1. Public App Identity

Show: `https://remindocr.com/`

Narration:

> This is RemindOCR, a document management and reminder application for inspection reports, invoices, clients, and expiration reminders. The app uses Google sign-in for authentication and optional Gmail and Drive integrations for user-requested document import and sync.

Show:

- Homepage headline.
- Footer or navigation links to Privacy Policy and Terms.
- Open Privacy Policy in a new tab and briefly show the Google API Services User Data Policy / Limited Use section.

Narration:

> The Privacy Policy explains how Google user data is used. Gmail access is optional, read-only, and used only to list emails with attachments and import attachments selected by the user.

### 2. Sign In To RemindOCR

Show: login form or Google sign-in.

Narration:

> I will sign in as a test user. This is a dedicated demo account with sample emails and sample documents only.

Action:

- Sign in to RemindOCR.
- Land on the dashboard.

### 3. Start Gmail Connection From Inside The App

Show: app navigation to Gmail page.

Action:

- Open the Gmail page.
- Show the disconnected state.
- Click `חבר Gmail` / Connect Gmail.

Narration:

> Gmail is not connected by default. The user explicitly starts the connection from the Gmail page.

### 4. Google OAuth Consent Screen

Show: Google consent screen.

Narration:

> Google shows the permissions requested by RemindOCR. The app requests read-only Gmail access for listing and downloading selected attachments, and Drive file access for files created or managed by RemindOCR.

Action:

- Select or confirm the test Google account.
- Approve the requested permissions.

Important:

- Pause long enough for the reviewer to see the app name and scopes.
- Do not skip the consent screen if Google shows it.

### 5. Gmail Inbox Search And Attachment Import

Show: return to RemindOCR Gmail page.

Action:

- Show connected Gmail email address.
- Choose a guided flow if shown, such as invoice import or inspection import.
- Run search.
- Show messages with attachments.
- Preview one attachment if safe.
- Import one selected attachment.
- Optionally click `ייבא הכל` if the inbox contains only safe test emails.

Narration:

> After consent, RemindOCR lists matching emails with attachments. It shows email metadata like sender, subject, date, and attachment file names. The user chooses which attachment to import. The app downloads the selected attachment and processes it as a RemindOCR document.

### 6. Show Imported Document In RemindOCR

Action:

- Open the imported document from the Gmail imported documents section or the Documents page.
- Show document status, extracted fields, or linked invoice/inspection record.

Narration:

> The imported attachment is now stored as a document in RemindOCR and processed for OCR and structured extraction. This data is used to help the user manage documents, clients, invoices, inspection reports, and reminders.

### 7. Show Google Drive Sync Controls

Show: Profile page, Google Drive sync section.

Action:

- Open Profile.
- Scroll to Google Drive sync.
- Show whether sync is off/on.
- If off and available for the test account plan, click enable sync.
- Show the RemindOCR folder name and the link to open it in Drive.
- Open the Drive folder in a new tab if safe.

Narration:

> Drive sync is controlled by the user. When enabled, RemindOCR stores exported or synced documents in a RemindOCR folder in My Drive, with separate folders for invoices and inspection reports.

### 8. Disconnect And User Control

Action:

- Return to the Gmail page.
- Click `נתק Gmail` / Disconnect Gmail.
- Show disconnected state.
- Optionally open `https://myaccount.google.com/permissions` and show where users can revoke RemindOCR access from their Google Account.

Narration:

> The user can disconnect Gmail inside RemindOCR at any time. The user can also revoke RemindOCR access from Google Account permissions.

### 9. Closing Statement

Narration:

> This demo shows the complete user-controlled flow: sign in, connect Gmail through Google OAuth, import selected attachments, optionally sync RemindOCR-created files to Google Drive, and disconnect access. Google data is used only to provide these user-facing document import and sync features.

## Editing Checklist

- Keep the video continuous enough that the flow is clear.
- Blur or avoid personal emails, unrelated inbox subjects, tokens, and private documents.
- Do not show browser dev tools, `.env` files, admin-only secrets, or database screens.
- Keep captions optional; Google reviewers usually prefer the actual UI flow plus clear narration.
- Export as MP4.
- Filename suggestion: `remindocr-google-oauth-demo.mp4`.

## Submission Notes

In Google Cloud Console, use a short note like:

> This video demonstrates RemindOCR's user-initiated Google OAuth flow. It shows Google sign-in, optional Gmail connection, Gmail attachment listing and import, Google Drive sync controls, and user disconnect/revocation controls. RemindOCR uses `gmail.readonly` only to list email metadata and download user-selected attachments. RemindOCR uses `drive.file` only for files and folders created or managed by RemindOCR.

## Post-Recording Verification

Before submitting:

- Confirm the OAuth consent screen app name matches `RemindOCR`.
- Confirm the homepage URL is `https://remindocr.com/`.
- Confirm Privacy Policy URL is `https://remindocr.com/privacy`.
- Confirm Terms URL is `https://remindocr.com/terms`.
- Confirm authorized domain includes `remindocr.com`.
- Confirm the scopes shown in the video match the scopes declared in Google Cloud Console.
