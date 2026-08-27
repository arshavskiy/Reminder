# ReminderOCR Documentation

Complete documentation for the ReminderOCR platform.

---

## Quick Navigation

### 📖 For Everyone

- **[PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)** — Start here! High-level overview of features, architecture, use cases
- **[API_QUICK_REFERENCE.md](./API_QUICK_REFERENCE.md)** — API endpoints cheat sheet with examples
- **[FEATURES.md](./FEATURES.md)** — Feature inventory
- **[ADMIN_MAGIC_LINKS.md](./ADMIN_MAGIC_LINKS.md)** — Admin magic links, username identity, DB target
- **[ROLES_AND_PLANS.md](./ROLES_AND_PLANS.md)** — Roles, subscription plans, page access, and entitlements matrix
- **[TASKAL_FEATURE_GAPS.md](./TASKAL_FEATURE_GAPS.md)** — תסקל 2.0 competitive gaps; build-first list
- **[FEATURE_IDEAS.md](./FEATURE_IDEAS.md)** — Product ideas, including the Taskal build-first list

### 👨‍💻 For Developers

- **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)** — Setup, testing, code style, debugging, troubleshooting
- **[openapi.yaml](./openapi.yaml)** — Complete OpenAPI 3.0 specification (viewable in [Swagger UI](https://editor.swagger.io/))

### 🔧 Technical Reference

- **[API.md](./API.md)** — Detailed API documentation (authentication, endpoints)
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — System design and component relationships
- **[REMINDER_FLOW.md](./REMINDER_FLOW.md)** — How reminders are created, scheduled, and sent
- **[ocr-and-ai-extraction.md](./ocr-and-ai-extraction.md)** — OCR, regex extraction, AI extraction, and rebuild flow
- **[INSPECTION_TEMPLATE_FLOW.md](./INSPECTION_TEMPLATE_FLOW.md)** — תסקיר template drafts, PDF, contract/client/equipment linkage, and DB shape
- **[GOOGLE_CALENDAR_SYNC.md](./GOOGLE_CALENDAR_SYNC.md)** — Google Calendar OAuth, event naming, sync rules, and UI indicators
- **[WORKFLOW_NOTES_2026-08-09.md](./WORKFLOW_NOTES_2026-08-09.md)** — Latest document processing, rescan, calendar, and reminder logic notes
- **[GOOGLE_OAUTH_DEMO_VIDEO.md](./GOOGLE_OAUTH_DEMO_VIDEO.md)** — Script and checklist for Google OAuth Gmail/Drive verification video

### 🚀 Operations

- **[DEPLOYMENT.md](../DEPLOYMENT.md)** — Deployment procedures for Railway + Vercel
- **[PROJECT_STATUS_REPORT.md](./PROJECT_STATUS_REPORT.md)** — Current status, roadmap, completed features

---

## Document Overview

| Document | Purpose | Audience |
|----------|---------|----------|
| **PROJECT_OVERVIEW.md** | Feature overview, tech stack, workflows | Everyone |
| **DEVELOPER_GUIDE.md** | Local setup, testing, debugging | Developers |
| **API_QUICK_REFERENCE.md** | API endpoint cheat sheet | Developers, integrators |
| **openapi.yaml** | Complete REST API specification | API consumers, integrators |
| **API.md** | Detailed endpoint documentation | API users |
| **ARCHITECTURE.md** | System design and patterns | Architects, senior developers |
| **REMINDER_FLOW.md** | Reminder scheduling logic | Feature developers |
| **ocr-and-ai-extraction.md** | OCR, AI extraction, retry behavior, entity rebuild flow | Feature developers |
| **INSPECTION_TEMPLATE_FLOW.md** | Manual תסקיר, print-template drafts, PDF, and client/contract/equipment linkage | Feature developers |
| **GOOGLE_CALENDAR_SYNC.md** | Calendar OAuth, reminder event format, and two-way sync rules | Feature developers, product |
| **WORKFLOW_NOTES_2026-08-09.md** | Dated summary of today's processing and UI flow changes | Developers |
| **DEPLOYMENT.md** | Production deployment steps | DevOps, release managers |
| **PROJECT_STATUS_REPORT.md** | Progress, roadmap, milestones | Project managers, stakeholders |
| **FEATURES.md** | Feature list and descriptions | Product managers, clients |
| **ADMIN_MAGIC_LINKS.md** | Magic links, username identity, admin DB target | Admins, developers |
| **TASKAL_FEATURE_GAPS.md** | תסקל 2.0 gaps and build-first list | Product |
| **USE_CASES.md** | Real-world usage scenarios | Product, sales |

---

## Getting Started

### 1. **Understanding the Project**
   - Read: [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)
   - 15 minutes to understand what ReminderOCR does

### 2. **Setting Up Development**
   - Read: [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) → Development Setup
   - 30 minutes to have a working local environment

### 3. **Making Your First Change**
   - Read: [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) → Common Workflows
   - Read relevant code in `server/src/` or `client/src/`
   - Make change, test locally, commit

### 4. **Integrating with the API**
   - Read: [API_QUICK_REFERENCE.md](./API_QUICK_REFERENCE.md)
   - Or: [openapi.yaml](./openapi.yaml) in Swagger UI
   - Try sample cURL requests from the quick reference

### 5. **Understanding Production**
   - Read: [DEPLOYMENT.md](../DEPLOYMENT.md)
   - Read: [PROJECT_STATUS_REPORT.md](./PROJECT_STATUS_REPORT.md)

---

## Key Concepts

### Documents
- PDF/image files uploaded for OCR extraction
- Automatically extract contract dates, equipment, client info
- Status: pending → processing → completed/failed

### Contracts
- Agreements with expiry dates
- Can be linked to extracted documents
- Trigger automatic reminder generation

### Reminders
- Scheduled notifications sent via email
- Can be tied to contracts, equipment, or created manually
- Support multiple advance-notice intervals (30/60/90 days)

### Equipment
- Inspectable items (lifts, scaffolding, ladders, etc.)
- Track inspection dates and maintenance history
- Linked to clients and contracts

### Print Templates
- Excel-style תסקיר designer and compose flow
- Drafts can be linked to clients, equipment, and created contracts
- Generate saved PDFs, print PDFs, contracts, and reminders from filled template data

### Email Templates
- Customizable HTML templates with dynamic variables
- Variables: `{{client_name}}`, `{{equipment}}`, `{{contract_number}}`, etc.
- Rendered at send time with actual data

---

## API Usage Examples

### List Reminders
```bash
curl http://localhost:3737/api/reminders?status=pending \
  -b "sid=<session-cookie>"
```

### Create Reminder
```bash
curl -X POST http://localhost:3737/api/reminders \
  -H "Content-Type: application/json" \
  -b "sid=<session-cookie>" \
  -d '{
    "client_id": 1,
    "title": "Inspection Reminder",
    "trigger_date": "2026-08-22",
    "email_to": ["client@example.com"]
  }'
```

### Upload Document
```bash
curl -X POST http://localhost:3737/api/documents/upload \
  -F "files=@contract.pdf" \
  -b "sid=<session-cookie>"
```

See [API_QUICK_REFERENCE.md](./API_QUICK_REFERENCE.md) for more examples.

---

## File Organization

```
docs/
├── README.md                           ← You are here
├── PROJECT_OVERVIEW.md                 ← Start here
├── DEVELOPER_GUIDE.md
├── API_QUICK_REFERENCE.md
├── openapi.yaml
├── API.md
├── ARCHITECTURE.md
├── REMINDER_FLOW.md
├── ocr-and-ai-extraction.md
├── GOOGLE_CALENDAR_SYNC.md
├── WORKFLOW_NOTES_2026-08-09.md
├── PROJECT_STATUS_REPORT.md
├── FEATURES.md
├── FEATURE_IDEAS.md
├── TASKAL_FEATURE_GAPS.md
├── USE_CASES.md
├── DEPLOYMENT.md
└── features/
    ├── multi-user-google-auth.md
    ├── next.md
    └── ...
```

---

## Common Tasks

### "I want to understand what ReminderOCR does"
→ Read [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)

### "I want to set up a local development environment"
→ Follow [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) → Development Setup

### "I want to know what API endpoints are available"
→ Check [API_QUICK_REFERENCE.md](./API_QUICK_REFERENCE.md) or import [openapi.yaml](./openapi.yaml) into Swagger UI

### "I want to add a new feature"
→ Read [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) → Common Workflows

### "I want to understand the system architecture"
→ Read [ARCHITECTURE.md](./ARCHITECTURE.md) and [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) → System Architecture

### "I want to deploy to production"
→ Read [DEPLOYMENT.md](../DEPLOYMENT.md)

### "I want to know what's been built and what's planned"
→ Read [PROJECT_STATUS_REPORT.md](./PROJECT_STATUS_REPORT.md)

---

## Contributing

Before contributing, ensure you've read:
1. [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) — Code style, testing requirements
2. Relevant documentation for the feature you're working on
3. Check existing tests for examples of the code style

### Commit Message Format
```
<type>: <subject>

<body>

Co-Authored-By: Name <email>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

Example:
```
feat: add equipment filter to reminder creation modal

When creating a reminder for a contract with equipment, users can now
filter equipment by category to autofill reminder data. Implements
equipment selection UI and auto-population logic.

Co-Authored-By: Claude Haiku <noreply@anthropic.com>
```

---

## FAQ

### Q: How do reminders work?
A: See [REMINDER_FLOW.md](./REMINDER_FLOW.md) for detailed flow diagram and explanation.

### Q: What database does ReminderOCR use?
A: MongoDB (Atlas in production, local instance for development). See [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) → Technology Stack.

### Q: How are email reminders sent?
A: SMTP configured in `.env`. See [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) → Email Debugging.

### Q: Can I integrate ReminderOCR with my own app?
A: Yes! Use the REST API documented in [openapi.yaml](./openapi.yaml) or [API_QUICK_REFERENCE.md](./API_QUICK_REFERENCE.md).

### Q: How is OCR extraction done?
A: The server parses PDFs with `pdf-parse`, falls back to Tesseract OCR when needed, runs a regex baseline, then optionally runs OpenAI/Ollama AI extraction. See [ocr-and-ai-extraction.md](./ocr-and-ai-extraction.md).

### Q: Is there a mobile app?
A: Not yet, but the responsive web app works on mobile browsers. See roadmap in [PROJECT_STATUS_REPORT.md](./PROJECT_STATUS_REPORT.md).

---

## Updates

Documentation is kept in sync with code. When adding features:
1. Update relevant `.md` files
2. Update `openapi.yaml` if adding/changing API endpoints
3. Include doc updates in the same commit/PR

Last updated: **2026-08-09**  
API version: **1.0.0**
