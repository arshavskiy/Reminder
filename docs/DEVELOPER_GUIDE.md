# Developer Guide

Complete guide for contributing to ReminderOCR development.

---

## Table of Contents

1. [Development Setup](#development-setup)
2. [Project Structure](#project-structure)
3. [Running Services](#running-services)
4. [Testing](#testing)
5. [Code Style](#code-style)
6. [Common Workflows](#common-workflows)
7. [Debugging](#debugging)
8. [Troubleshooting](#troubleshooting)

---

## Development Setup

### Prerequisites

- **Node.js** 18+ (check with `node --version`)
- **MongoDB** running locally OR MongoDB Atlas URI
- **Git** for version control
- **npm** package manager (included with Node.js)

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd Reminder
```

### Step 2: Install Dependencies

```bash
# Backend dependencies
cd server
npm install

# Frontend dependencies
cd ../client
npm install
```

### Step 3: Configure Environment Variables

**Server configuration (server/.env):**

```bash
cd server
cp .env.example .env   # Copy template
# Edit .env with your values
```

**Minimum required variables:**

```env
# Database
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=reminderocr_dev

# Authentication
SESSION_SECRET=your-random-32-character-secret-here
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3737/auth/google/callback

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# API Keys
OPENAI_LOCAL_API_KEY=sk-your-openai-key
# OR for local Ollama:
# OLLAMA_API_BASE=http://localhost:11434

# Features
OCR_ENABLED=true
OCR_LANGUAGE=he
NODE_ENV=development
```

**Client configuration (client/.env):**

```env
# In development, Vite proxies /api to http://localhost:3737
# No VITE_API_BASE needed locally

# For production:
# VITE_API_BASE=https://reminderocr-api.railway.app
```

### Step 4: Start Development Servers

Open **3 terminal windows**:

**Terminal 1 — Backend (http://localhost:3737)**
```bash
cd server
npm run dev
```

**Terminal 2 — Frontend (http://localhost:5173)**
```bash
cd client
npm run dev
```

**Terminal 3 — (optional) MongoDB**
```bash
# If running MongoDB locally:
mongod

# Or use MongoDB Atlas (URI in .env)
```

### Step 5: Verify Setup

1. Open http://localhost:5173
2. Should see the login page
3. Register a new account
4. Verify email (check terminal for magic link)
5. Login and test upload a PDF

---

## Project Structure

### Git Repositories

There are two Git repositories in this workspace:

- `E:\Projects\Reminder` → `https://github.com/arshavskiy/Reminder.git`
- `E:\Projects\Reminder\server` → `https://github.com/arshavskiy/reminder-server.git`

Railway watches the nested server repo, `arshavskiy/reminder-server`, branch `master`. When a backend change must deploy to Railway, commit and push from `server/`, not only from the parent repo:

```bash
cd server
git status
git add <server files>
git commit -m "..."
git push origin master
```

The parent repo is still useful for full-project history and docs, but pushing it alone does not trigger the Railway `reminder-server` service.

```
Reminder/
├── server/                      # Backend (Express.js)
│   ├── src/
│   │   ├── routes/             # API endpoint handlers
│   │   │   ├── auth.ts
│   │   │   ├── clients.ts
│   │   │   ├── contracts.ts
│   │   │   ├── reminders.ts
│   │   │   ├── equipment.ts
│   │   │   ├── documents.ts
│   │   │   ├── templates.ts
│   │   │   └── email.ts
│   │   ├── db/                 # Database connection & utilities
│   │   │   ├── db.ts          # MongoDB connection
│   │   │   └── indexing.ts    # Index definitions
│   │   ├── reminders/          # Reminder business logic
│   │   │   ├── scheduler.ts    # generateContractReminders()
│   │   │   ├── emailSender.ts  # Email rendering & sending
│   │   │   └── equipmentUpsert.ts
│   │   ├── auth/               # Authentication logic
│   │   │   ├── session.ts
│   │   │   └── google-auth.ts
│   │   ├── ocr/                # OCR & extraction
│   │   │   ├── plumber.ts     # Python OCR pipeline
│   │   │   └── extractor.ts   # Field extraction
│   │   ├── email-templates/    # Default HTML email templates
│   │   ├── shared/
│   │   │   └── types.ts       # Shared TypeScript types
│   │   ├── middleware/         # Express middleware
│   │   └── index.ts           # Express app setup
│   ├── .env.example            # Environment template
│   ├── package.json
│   ├── tsconfig.json
│   └── __tests__/              # Test files (Vitest)
│
├── client/                      # Frontend (Vue 3)
│   ├── src/
│   │   ├── views/             # Page components
│   │   │   ├── DashboardPage.vue
│   │   │   ├── DocumentsPage.vue
│   │   │   ├── ContractsPage.vue
│   │   │   ├── RemindersPage.vue
│   │   │   ├── EquipmentPage.vue
│   │   │   ├── ClientsPage.vue
│   │   │   └── SettingsPage.vue
│   │   ├── components/        # Reusable components
│   │   │   ├── contracts/
│   │   │   ├── documents/
│   │   │   └── shared/
│   │   ├── stores/            # Pinia state management
│   │   │   ├── auth.ts
│   │   │   ├── clients.ts
│   │   │   ├── contracts.ts
│   │   │   ├── reminders.ts
│   │   │   └── equipment.ts
│   │   ├── services/          # API service layer
│   │   │   ├── apiService.ts  # All API calls
│   │   │   └── authService.ts
│   │   ├── composables/       # Reusable logic (Vue)
│   │   ├── shared/
│   │   │   └── types.ts       # Shared TypeScript types
│   │   ├── App.vue            # Root component
│   │   └── main.ts            # Entry point
│   ├── public/                # Static assets
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── playwright-report/     # E2E test reports
│
├── docs/                       # Documentation
│   ├── openapi.yaml          # OpenAPI specification
│   ├── PROJECT_OVERVIEW.md
│   ├── API_QUICK_REFERENCE.md
│   ├── DEVELOPER_GUIDE.md     # This file
│   ├── API.md                 # Legacy API docs
│   └── ARCHITECTURE.md
│
├── .claude/                    # Claude Code configuration
│   └── launch.json            # Dev server configs
│
└── README.md
```

---

## Running Services

### Backend Server

**Development mode (with hot reload):**
```bash
cd server
npm run dev
```

**Production build:**
```bash
cd server
npm run build
npm run start
```

**Run tests:**
```bash
cd server
npm test           # Run all tests once
npm run test:watch # Watch mode for TDD
```

**Type checking:**
```bash
cd server
npx tsc --noEmit
```

### Frontend Application

**Development mode (with hot reload):**
```bash
cd client
npm run dev
```

**Production build:**
```bash
cd client
npm run build     # Creates dist/ folder
npm run preview   # Preview production build locally
```

**Run tests:**
```bash
cd client
npm run test      # Vitest
npm run e2e       # Playwright E2E tests
```

### Database

**Local MongoDB:**
```bash
# Start MongoDB daemon
mongod

# In another terminal, connect to MongoDB CLI
mongosh
```

**MongoDB Atlas (cloud):**
- Set `MONGODB_URI` in server/.env
- No local MongoDB needed

---

## Testing

### Backend Tests

Tests are located in `server/src/__tests__/` using **Vitest**.

**Run all tests:**
```bash
cd server
npm test
```

**Watch mode (for TDD):**
```bash
cd server
npm run test:watch
```

**Run specific test file:**
```bash
cd server
npm test -- generateContractReminders.test.ts
```

**Test coverage:**
```bash
cd server
npm run test:coverage
```

### Frontend Tests

E2E tests use **Playwright**.

**Run E2E tests:**
```bash
cd client
npm run e2e
```

**Run tests in headed mode (see browser):**
```bash
cd client
npm run e2e -- --headed
```

**Generate coverage report:**
```bash
cd client
npm run test:coverage
```

---

## Code Style

### TypeScript

- **Strict mode**: Always use `"strict": true` in tsconfig.json
- **No implicit any**: Enable `"noImplicitAny"`
- **Explicit return types**: Always annotate function return types

**Example:**
```typescript
// ✅ Good
function calculateDueDate(contractDate: string, advanceDays: number): string {
  const d = new Date(contractDate);
  d.setDate(d.getDate() - advanceDays);
  return d.toISOString().slice(0, 10);
}

// ❌ Avoid
function calculateDueDate(contractDate, advanceDays) {
  return new Date(contractDate).toISOString();
}
```

### Vue Components

**Composition API (recommended):**
```vue
<script setup lang="ts">
import { ref, computed } from 'vue';

const count = ref(0);
const doubled = computed(() => count.value * 2);
</script>
```

**Naming conventions:**
- Component files: `PascalCase.vue`
- Event handlers: `on{Action}` (e.g., `onSave`, `onDelete`)
- Computed properties: `camelCase`
- Refs: `camelCase` with `ref` suffix (e.g., `dialogRef`)

### CSS/Tailwind

- Use **Tailwind CSS** for all styling
- Avoid hardcoded colors — use CSS variables (`var(--brand-color)`)
- Support dark mode with `@media (prefers-color-scheme: dark)`
- Use semantic HTML for accessibility

### Comments

- Prefer **self-documenting code** over comments
- Add comments only for **non-obvious logic** or **workarounds**
- Link to issue/PR in comments when fixing bugs

**Example:**
```typescript
// Correct: Explains the WHY, not the WHAT
// PostgreSQL doesn't support NULL in UNIQUE constraints,
// so we use a partial index to allow multiple nulls
const partialFilter = { document_id: { $type: "string" } };

// Bad: States what the code already says
const x = date.getDate() - days;  // Subtract days from date
```

---

## Common Workflows

### Adding a New API Endpoint

1. **Create route handler** in `server/src/routes/{resource}.ts`
2. **Define types** in `server/src/shared/types.ts`
3. **Add tests** in `server/src/__tests__/{resource}.test.ts`
4. **Register route** in `server/src/index.ts` (app.use())
5. **Update OpenAPI spec** in `docs/openapi.yaml`

**Example: POST /api/clients**
```typescript
// routes/clients.ts
app.post("/api/clients", async (req, res) => {
  try {
    const { display_name, email } = req.body;
    
    const client = await col("clients").insertOne({
      display_name,
      email,
      created_at: new Date(),
      updated_at: new Date(),
    });
    
    res.status(201).json(client);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
```

### Adding a Vue Component

1. **Create component** in `client/src/components/{Type}/{Name}.vue`
2. **Use Composition API** with TypeScript
3. **Import in parent** component or view
4. **Add to Storybook** (if applicable)

**Example:**
```vue
<!-- components/contracts/ContractCard.vue -->
<template>
  <article class="card">
    <h3>{{ contract.contract_number }}</h3>
    <p>{{ contract.contract_type }}</p>
    <button @click="onEdit">Edit</button>
  </article>
</template>

<script setup lang="ts">
import type { Contract } from "@shared/types";

defineProps<{ contract: Contract }>();
defineEmits<{ edit: [contract: Contract] }>();

const onEdit = () => {
  // Handle edit
};
</script>
```

### Modifying the Database Schema

1. **Update types** in `server/src/shared/types.ts`
2. **Create migration** (if needed) in `server/src/migrations/`
3. **Update indexes** in `server/src/db/indexing.ts`
4. **Test with real data**
5. **Update tests** and documentation

### Making an API Call from Frontend

1. **Add method** to `client/src/services/apiService.ts`
2. **Use in component** or Pinia store
3. **Handle errors** with try/catch
4. **Show user feedback** (toast/message)

**Example:**
```typescript
// apiService.ts
export const api = {
  contracts: {
    list: (params?: { clientId?: string }) =>
      get<{ rows: Contract[] }>(`/contracts${qs(params)}`),
  },
};

// In component
const contracts = ref<Contract[]>([]);
onMounted(async () => {
  try {
    const result = await api.contracts.list({ clientId: "123" });
    contracts.value = result.rows;
  } catch (e) {
    message.error("Failed to load contracts");
  }
});
```

---

## Debugging

### Backend Debugging

### Production Logging

Server runtime logs go through `server/src/logger.ts`.

- In `NODE_ENV=production`, logs are emitted as one JSON object per line.
- In development, logs are human-readable so local debugging stays comfortable.
- Set `LOG_LEVEL=debug|info|warn|error` to control verbosity. Production defaults to `info`; development defaults to `debug`.
- Request logs are emitted as `http_request` with method, path, status, duration, IP, and user agent. `/health` is skipped to avoid heartbeat noise.
- Auth audit events include `login_success`, `login_failed`, `logout`, `user_registered`, `email_verified`, `password_reset_requested`, and `password_reset_completed`.
- Operational events include `document_import_queued`, `document_processing_completed`, `document_processing_failed`, `reminder_sent`, `reminder_send_failed`, `reminder_escalation_sent`, `monthly_reports_sent`, and `monthly_reports_failed`.

Do not log secrets, cookies, OAuth codes, password reset tokens, raw extracted document text, or full AI extraction JSON. Detailed extraction audit files are still written under the configured data directory; production stdout should only contain summaries, IDs, timings, counts, status, and error messages.

**Using VS Code debugger:**

1. Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/server/src/index.ts",
      "runtimeArgs": ["--loader", "ts-node/esm"],
      "args": ["--inspect"]
    }
  ]
}
```

2. Press F5 to start debugging
3. Set breakpoints with click on line number

**Console logging:**
```typescript
console.log("Contract:", contract);
console.error("Error creating reminder:", error);
```

**MongoDB inspection:**
```javascript
// In mongosh
db.contracts.find({ client_id: 123 }).pretty();
db.reminders.find({ status: "error" });
```

### Frontend Debugging

**Browser DevTools:**
- F12 to open DevTools
- Console tab for errors/logs
- Network tab to inspect API calls
- Vue DevTools extension for component inspection

**Vite debugging:**
```typescript
// Add in component
console.log("State:", store.$state);
debugger;  // Pauses execution
```

### Email Debugging

**View email logs:**
```bash
# Check all sent emails
curl http://localhost:3737/api/email-log -b "sid=<cookie>"
```

**Test email sending:**
```bash
curl -X POST http://localhost:3737/api/email/test \
  -H "Content-Type: application/json" \
  -b "sid=<cookie>" \
  -d '{ "to": "test@example.com" }'
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Port 3737 already in use | Change `PORT` in server/.env or kill process using `lsof -i :3737` |
| MongoDB connection refused | Start MongoDB with `mongod` or check MONGODB_URI in .env |
| "Cannot find module" error | Run `npm install` in affected directory |
| CORS errors | Make sure Vite is running; it proxies /api to backend |
| Email not sending | Check SMTP credentials in .env; verify firewall allows port 587 |
| OCR extraction failing | Enable OCR_ENABLED=true; check file format (PDF/image) |
| Hot reload not working | Restart dev server; check file is saved with correct extension |

### Reset Development Environment

```bash
# Clear node_modules and reinstall
cd server && rm -rf node_modules && npm install
cd ../client && rm -rf node_modules && npm install

# Clear MongoDB (WARNING: deletes all data)
# In mongosh:
# db.dropDatabase()

# Clear browser cache/cookies
# DevTools → Application → Clear site data
```

### Getting Help

1. Check existing GitHub issues: https://github.com/...
2. Search documentation: `docs/*.md`
3. Check code comments and git log: `git log -p`
4. Ask team lead or post in Slack channel

---

## Performance Tips

### Backend

- **Batch queries** when processing many records
- **Use indexes** for frequently filtered fields
- **Cache** expensive computations (e.g., equipment expiry calendar)
- **Lazy load** related documents (don't join unnecessarily)

### Frontend

- **Lazy load routes**: Use Vue Router route-level code splitting
- **Virtual scroll** for large lists (Naive UI provides `n-virtual-list`)
- **Debounce search input** (300-500ms)
- **Memoize expensive computed properties**

### Database

- **Create indexes** for sort/filter fields:
  ```javascript
  db.reminders.createIndex({ trigger_date: 1, status: 1 });
  ```
- **Archive old data** (delete reminders > 1 year old)
- **Analyze query performance** with `explain()`:
  ```javascript
  db.contracts.find({ expiry_date: { $gt: "2026-08-01" } }).explain("executionStats");
  ```

---

Last updated: 2026-07-24  
See also: [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md), [API_QUICK_REFERENCE.md](./API_QUICK_REFERENCE.md)
