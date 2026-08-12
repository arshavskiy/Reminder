# ReminderOCR Project Overview

**Status:** Production-ready with active feature development  
**Last Updated:** 2026-07-24  
**Repository:** Internal  
**License:** Proprietary

---

## Table of Contents

1. [Project Summary](#project-summary)
2. [Core Features](#core-features)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Deployment](#deployment)
6. [Getting Started](#getting-started)
7. [Key Workflows](#key-workflows)

---

## Project Summary

**ReminderOCR** is a comprehensive reminder and document management system designed for inspection and equipment tracking businesses. The platform combines:

- **OCR-powered document extraction** — automatically extract contract details from scanned/PDF documents
- **Smart reminders** — automated email reminders for equipment inspections, contract renewals, and certifications
- **Equipment tracking** — manage equipment inventory with inspection scheduling and compliance tracking
- **Multi-user support** — role-based access control with personal dashboards and admin tools
- **Email templates** — customizable reminder email templates with dynamic variables

### Primary Use Case

A business receives PDF inspection reports and contracts. The system:
1. **Uploads** the PDF → **OCR extraction** pulls contract dates, equipment details, client info
2. **Creates reminders** for upcoming inspections based on extraction or manual input
3. **Sends automated emails** to the client at the configured advance notice (30/60/90 days early)
4. **Tracks compliance** with inspection schedules and generates reports

---

## Core Features

### 1. Document Management
- **Upload documents** (PDF, scanned images, Excel)
- **OCR extraction** via AI model (extracts contract type, dates, equipment, client)
- **Document tracking** with processing status (pending → processing → completed/failed)
- **Linked extraction** — automatically associate extracted data to clients/contracts

### 2. Contract & Inspection Management
- **Create contracts** manually or auto-populate from extracted documents
- **Track contract status** (active, expired, cancelled, renewed)
- **Equipment association** — link specific equipment to contracts for inspection tracking
- **Expiry alerts** — identify contracts expiring within 30/60/90 days

### 3. Reminder System
- **Scheduled reminders** — fire on configurable dates (e.g., 30 days before expiry)
- **Multiple reminder types**:
  - Manual reminders for one-time notifications
  - Contract-expiry reminders (auto-generated from contract end dates)
  - Equipment-inspection reminders (based on inspection schedules)
  - Task reminders (standalone to-do items)
- **Email delivery** with customizable templates and dynamic variables
- **Reminder status tracking** (pending, sent, dismissed, snoozed, error)
- **Manual send** — send any reminder immediately
- **Snooze** — defer a reminder to a later date

### 4. Equipment Tracking
- **Equipment categories**: Lift, Scaffold, Ladder, Accessory, Balloon, Air Intake, Extractor, Other
- **Equipment inventory** — catalog all equipment with manufacturer, model, serial number
- **Inspection history** — track past inspections and maintenance
- **Next inspection calculation** — automatically suggest next inspection date based on category
- **Equipment-to-contract linking** — associate equipment with contracts for unified tracking
- **Hydraulic lift checks** — specialized workflow for hydraulic equipment inspections

### 5. Client Management
- **Client profiles** with contact details, business info, entity type, ID number
- **Client-specific equipment** — organize equipment by owning client
- **Client reminders** — view all reminders associated with a client
- **Timeline** — see activity history for each client

### 6. Dashboard & Reporting
- **Dashboard stats** — total clients, documents, inspections, pending reminders, expiring soon
- **Reminder calendar** — visual calendar view of upcoming reminders and expirations
- **Monthly reports** — generate client reports with inspection/equipment status
- **Email log** — track all sent reminder emails for compliance/audit

### 7. User Management
- **Authentication** — email/password registration + magic-link login + Google OAuth
- **Role-based access** — user vs. admin roles with different permissions
- **User settings** — theme preference, email sender name, OCR language, reminder advance days
- **Admin tools** — settings, template management, email log review

---

## Technology Stack

### Backend
- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: MongoDB
- **Email**: SMTP (configurable)
- **OCR**: Python-based pipeline (plumber) with Tesseract/Claude AI extraction
- **Authentication**: Session-based + Google OAuth
- **Hosting**: Railway.app (production)

### Frontend
- **Framework**: Vue 3 (Composition API)
- **UI Library**: Naive UI (component library)
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **State Management**: Pinia
- **Deployment**: Vercel (separate frontend repo)

### DevOps
- **Version Control**: Git (GitHub)
- **CI/CD**: GitHub Actions
- **Database Hosting**: MongoDB Atlas
- **Email Queue**: Node.js built-in task scheduler
- **File Storage**: S3 compatible (for documents, equipment photos)

---

## System Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend (Vue 3 + Vite)                                         │
│ - Dashboard                                                     │
│ - Client & Contract Management                                  │
│ - Document Upload & Review                                      │
│ - Reminder Management & Scheduling                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTP/REST API
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│ Backend (Express.js)                                            │
│ - /api/clients           (CRUD)                                 │
│ - /api/contracts         (CRUD, expiring, by-document)          │
│ - /api/reminders         (CRUD, send-now, dismiss, snooze)      │
│ - /api/equipment         (CRUD, history, expiry-calendar)       │
│ - /api/documents         (upload, extract, download)            │
│ - /api/email-templates   (CRUD, preview)                        │
│ - /api/auth              (register, login, logout, verify)      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┬────────────────┐
        │              │              │                │
        ▼              ▼              ▼                ▼
    ┌────────┐    ┌─────────┐  ┌──────────┐  ┌─────────────┐
    │ MongoDB│    │ OCR     │  │ Email    │  │ Task        │
    │ (data) │    │ Pipeline│  │ Queue    │  │ Scheduler   │
    └────────┘    └─────────┘  └──────────┘  └─────────────┘
```

### Data Model

**Core Collections:**
- `users` — authentication + user settings
- `clients` — business entities, contact info
- `contracts` — agreements with expiry tracking, equipment links
- `equipment` — inspectable items (lifts, scaffolding, etc.)
- `reminders` — scheduled notifications with email templates
- `documents` — uploaded files awaiting/completed OCR
- `email_logs` — audit trail of sent reminders
- `email_templates` — customizable reminder email templates

### Key Design Patterns

1. **Equipment Linking** — Contracts reference equipment via `_equipment` array; Equipment can be extracted from OCR or linked manually
2. **Reminder Factories** — `generateContractReminders()` creates reminders automatically when contracts are created
3. **OCR Integration** — Documents → extracted fields → contract/equipment/client upserts
4. **Email Templating** — Dynamic variables ({{client_name}}, {{equipment}}, etc.) rendered at send time
5. **Partial Indexes** — MongoDB unique indexes on `document_id` allow unlimited manual contracts (no document_id)

---

## Deployment

### Production Environment
- **Client**: Hosted on Vercel (separate repo, auto-deployed on push)
- **Server**: Hosted on Railway (auto-deployed on push to main)
- **Database**: MongoDB Atlas (shared cluster)
- **Email**: SMTP configured via environment variables

### Environment Variables

**Server (.env)**
```
MONGODB_URI=mongodb+srv://...
MONGODB_DB=reminderocr
NODE_ENV=production

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

OCR_ENABLED=true
OCR_LANGUAGE=he

SESSION_SECRET=...
```

**Client (.env)**
```
VITE_API_BASE=https://reminderocr-api.railway.app
```

### Deployment Steps

1. **Push to main branch** → GitHub Actions triggers
2. **Backend**: Railway auto-pulls main, runs tests, deploys
3. **Frontend**: Vercel auto-pulls separate client repo, builds, deploys to CDN
4. **Database**: MongoDB Atlas auto-scales as needed

---

## Getting Started

### Local Development

**Prerequisites:**
- Node.js 18+
- MongoDB (local or Atlas URI)
- Git

**Setup:**
```bash
# Clone repository
git clone <repo>
cd Reminder

# Install dependencies
cd server && npm install
cd ../client && npm install

# Create .env files
# server/.env (see above)
# client/.env (see above)

# Start development servers
cd server && npm run dev           # Runs on http://localhost:3737
cd client && npm run dev           # Runs on http://localhost:4173
```

**First Time:**
1. Register at http://localhost:4173/register
2. Verify email (check console in dev mode)
3. Login and create a test client
4. Upload a sample PDF contract
5. Monitor OCR extraction in browser console

### Running Tests

```bash
# Server tests
cd server && npm test

# Client tests
cd client && npm run test
```

### Building for Production

```bash
# Server
cd server && npm run build

# Client
cd client && npm run build
```

---

## Key Workflows

### Workflow 1: Upload Contract → Auto-Create Reminders

1. **User uploads PDF** via Documents page
2. **OCR extraction** runs automatically
3. **System detects**: contract_type, expiry_date, equipment, client_name
4. **Contract is auto-created** (or linked if already exists)
5. **Reminders are auto-generated** for 30/60/90 days before expiry
6. **Email sent** when trigger_date arrives

**Key Files:**
- `server/src/routes/documents.ts` — upload handler
- `server/src/reminders/scheduler.ts` — generateContractReminders()
- `server/src/reminders/emailSender.ts` — render + send email

### Workflow 2: Create New Reminder Manually

1. **User clicks "+ תזכורת חדשה"**
2. **Selects client** → contracts dropdown populates
3. **Optionally selects contract** → auto-fills:
   - Title (from contract type + number)
   - Trigger date (from contract expiry)
   - Email (from contract contact_email)
   - Body (full contract details)
   - Equipment fields (from contract._equipment)
4. **Clicks "צור תזכורת"** → reminder created
5. **Manual send** or wait for trigger_date

**Key Files:**
- `client/src/views/RemindersPage.vue` — create modal
- `server/src/routes/reminders.ts` — POST /api/reminders

### Workflow 3: Hydraulic Lift Inspection

1. **User navigates to hydraulic-check page** (or presses "בדיקת כותרת תזכורת")
2. **Fills in**: business info, equipment details, inspection date, interval
3. **System creates**: client, equipment, contract, reminders
4. **Reminders fire** at configured advance days (30/60/90)
5. **Email includes** equipment details + inspection schedule

**Key Files:**
- `server/src/routes/reminders.ts` — POST /api/reminders/hydraulic-check
- `server/src/reminders/scheduler.ts` — generateContractReminders with interval

### Workflow 4: Track Equipment Expiry

1. **User navigates to Equipment page**
2. **Filters by client** (dropdown)
3. **Sees equipment with next_inspection date**
4. **Can generate inspection reminder** from equipment detail
5. **Calendar shows** all equipment due for inspection

**Key Files:**
- `client/src/views/EquipmentPage.vue` — equipment listing
- `server/src/routes/equipment.ts` — expiry-calendar endpoint

---

## Support & Maintenance

### Common Issues

| Issue | Solution |
|-------|----------|
| Reminders not sending | Check SMTP config in .env; check email_logs for errors |
| OCR not extracting | Enable OCR_ENABLED=true; check TESSERACT_DATA path |
| Dashboard showing stale stats | Refresh with cache: "reload" parameter |
| Document linking failed | Check document status in /documents; retry extraction |

### Monitoring

- **Email logs**: `/api/email-log` — audit all sent reminders
- **Server logs**: Railway dashboard or `npm run logs`
- **MongoDB**: Atlas dashboard — query collection sizes, index status
- **Client errors**: Browser DevTools Console, or Vercel Analytics

### Backup & Recovery

- **MongoDB**: Atlas automated daily backups
- **Documents**: S3 with versioning enabled
- **Code**: Git history + GitHub backup

---

## Future Roadmap

- [ ] SMS reminders (in addition to email)
- [ ] WhatsApp notifications
- [ ] Slack integration
- [ ] Calendar sync (Google/Outlook)
- [ ] Bulk reminders via CSV import
- [ ] Compliance reporting (SOX, GDPR)
- [ ] Mobile app (React Native)
- [ ] AI-powered suggestions (next inspection date, equipment matching)

---

## Contact & Support

For questions, issues, or feature requests:
- **Email**: support@reminderocr.local
- **Issues**: GitHub issues tracker
- **Docs**: This directory (docs/)

---

**Document Version:** 1.0  
**Last Reviewed:** 2026-07-24  
**Next Review:** 2026-08-24
