# תזכורת לקוח — Client Reminder

A Hebrew-first document intelligence and contract reminder platform. Upload PDFs, Word docs, and images — the app extracts client details, contract dates, and expiry information using OCR + AI, then sends scheduled reminder emails before contracts expire.

---

## Features

- **Document pipeline** — import PDF, DOCX, XLSX, PNG/JPG; OCR for scanned Hebrew documents
- **AI extraction** — extracts client names, contract numbers, expiry dates, tasks via OpenAI or Ollama
- **Contract tracking** — active / expired / cancelled status, expiry countdown
- **Scheduled reminders** — automatic email alerts 90 / 60 / 30 days before expiry
- **Client management** — contacts with timeline of all related documents and events
- **Equipment catalog** — reusable equipment definitions linked to clients and contracts
- **Email templates** — custom HTML email designs with Hebrew variable placeholders
- **Full-text search** — SQLite FTS5 search across all document content
- **Google OAuth** — multi-user with per-user data isolation
- **Dark / light theme** — RTL-first Hebrew UI (Naive UI)
- **WebSocket push** — real-time document processing and reminder status updates

---

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | [Bun](https://bun.sh) |
| Backend | Bun HTTP server + WebSocket |
| Frontend | Vue 3 + Pinia + Naive UI + Vite |
| Database | SQLite (`bun:sqlite`) |
| Auth | Google OAuth 2.0 + PKCE, HTTP-only session cookies |
| PDF | `pdf-parse` |
| OCR | `tesseract.js` (Hebrew + English) |
| DOCX | `mammoth` |
| XLSX | `xlsx` (SheetJS) |
| AI extraction | OpenAI API (`gpt-4o-mini`) / Ollama |
| Email | `nodemailer` (SMTP) |
| Hebrew calendar | `@hebcal/core` |

---

## Project Structure

```
Reminder/
├── server/               # Bun backend (port 3737)
│   ├── src/
│   │   ├── index.ts      # Server entry, routing, WebSocket
│   │   ├── auth/         # Google OAuth, sessions, middleware
│   │   ├── db/           # SQLite schema + migrations
│   │   ├── pipeline/     # Document import, OCR, AI extraction
│   │   ├── reminders/    # Scheduler + email sender
│   │   ├── routes/       # REST API handlers (13 route files)
│   │   ├── templates/    # Doc & email template generation
│   │   ├── search/       # FTS5 full-text search
│   │   └── shared/       # Shared TypeScript types
│   ├── package.json
│   └── .env.example
│
├── client/               # Vue 3 frontend (port 5173 dev)
│   ├── src/
│   │   ├── views/        # 14 page components
│   │   ├── components/   # 8 reusable components
│   │   ├── stores/       # Pinia state (auth, documents, clients…)
│   │   ├── router/       # Vue Router + auth guard
│   │   ├── services/     # API fetch wrappers + WebSocket client
│   │   └── styles/       # CSS variables, RTL, dark/light theme
│   ├── vite.config.ts
│   └── package.json
│
├── deploy/               # Deployment scripts
│   ├── nginx.conf        # nginx reverse proxy config
│   ├── reminder.ecosystem.config.cjs  # PM2 process config
│   ├── setup-server.sh   # One-time server bootstrap
│   ├── deploy.sh         # Build + rsync + restart
│   └── README.md         # Deployment guide
│
├── docs/                 # Project documentation
├── scripts/              # Utility scripts (dedupe, inspect)
└── landing/              # Static landing page (own git repo)
```

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) — backend runtime
- Node.js + npm — client build
- Google Cloud project with OAuth 2.0 credentials (for auth)
- OpenAI API key (for AI extraction) — or Ollama running locally

### 1. Clone and install

```bash
git clone https://github.com/arshavskiy/Reminder.git
cd Reminder

# Install server deps
cd server && bun install && cd ..

# Install client deps
cd client && npm install && cd ..
```

### 2. Configure the server

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
PORT=3737
DATA_DIR=./data

# AI extraction
OPENAI_API_KEY=sk-...

# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3737/auth/google/callback

# Session signing secret — generate a random 64-char string
SESSION_SECRET=

# Comma-separated list of allowed Google account emails
ALLOWED_EMAILS=your@email.com
```

### 3. Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add `http://localhost:3737/auth/google/callback` to Authorized redirect URIs
4. Copy the Client ID and Secret into `server/.env`

### 4. Run in development

```bash
# Terminal 1 — backend
cd server && bun run dev

# Terminal 2 — frontend
cd client && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — the Vite dev server proxies `/api`, `/auth`, and `/ws` to the Bun backend on port 3737.

---

## Building for Production

```bash
cd client && npm run build
# Output → client/dist/
```

The Bun server serves `client/dist/` as static files in production (`NODE_ENV=production`).

---

## Deployment (DigitalOcean)

See [`deploy/README.md`](deploy/README.md) for the full guide. Quick summary:

```bash
# 1. Bootstrap the server once
ssh root@YOUR_IP "mkdir -p /var/www/reminder/deploy"
rsync -az deploy/ root@YOUR_IP:/var/www/reminder/deploy/
ssh root@YOUR_IP "bash /var/www/reminder/deploy/setup-server.sh"

# 2. Set server/.env on the droplet
ssh root@YOUR_IP "nano /var/www/reminder/server/.env"

# 3. Deploy (run this every time you update)
./deploy/deploy.sh root@YOUR_IP
```

nginx sits in front, serving static client files and reverse-proxying the API. PM2 keeps the Bun server alive across restarts.

---

## Environment Variables

### Server (`server/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3737` | Bun server port |
| `DATA_DIR` | `./data` | SQLite DB + uploaded documents |
| `OPENAI_API_KEY` | — | OpenAI key for document extraction |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3737/auth/google/callback` | OAuth callback URL |
| `SESSION_SECRET` | — | Secret for signing session cookies |
| `ALLOWED_EMAILS` | — | Comma-separated allowed email addresses |

### Client (Vercel / build-time)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend URL when client is deployed separately (e.g. Vercel) |
| `VITE_GOOGLE_CLIENT_ID` | Google Client ID for the GIS sign-in button |

---

## API Overview

| Group | Base path | Description |
|-------|-----------|-------------|
| Auth | `/auth/*` | Google OAuth flow, session, current user |
| Documents | `/api/documents` | Upload, import, list, reprocess |
| Clients | `/api/clients` | CRUD, timeline, related docs |
| Contracts | `/api/contracts` | CRUD, expiring filter |
| Reminders | `/api/reminders` | CRUD, send-now, snooze, dismiss |
| Tasks | `/api/tasks` | CRUD |
| Templates | `/api/doc-templates`, `/api/email-templates` | Extraction + email templates |
| Equipment | `/api/equipment` | Equipment catalog |
| Settings | `/api/settings`, `/api/user-settings` | Global + per-user settings |
| Search | `/api/search` | Full-text search |
| Dashboard | `/api/dashboard/stats` | Overview stats |
| Email log | `/api/email-log` | Sent email history |

---

## Data Directory

All runtime data is stored in `DATA_DIR` (default `./data/`, gitignored):

```
data/
├── reminder.db       # SQLite database
├── settings.json     # App settings (SMTP, OCR, AI config)
└── documents/        # Managed copies of imported files
```

---

## License

Private project.
