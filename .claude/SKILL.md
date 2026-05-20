---
name: client-reminder-patterns
description: Coding patterns extracted from the client-reminder Vue+Bun+SQLite project
version: 1.0.0
source: local-git-analysis
analyzed_commits: 3
---

# Client Reminder — Project Patterns

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Bun (server) + Vite (client HMR) |
| Frontend | Vue 3 Composition API + Naive UI + Pinia |
| Backend | Bun HTTP (custom router, no Express) + SQLite via `bun:sqlite` |
| Language | TypeScript throughout |
| Email | Nodemailer + HTML templates with `{{var}}` placeholders |
| AI | OpenAI or Ollama (configurable in settings) |
| Locale | Hebrew primary UI; RTL support required everywhere |

## Commit Conventions

Commits use **descriptive sentence-style** messages (no conventional-commit prefixes):

```
add RTL support for email templates and enhance reminder form with client selection
add global styles, implement document and email templates, and enhance reminder functionality
init reminder
```

No `feat:` / `fix:` / `chore:` prefixes — just a concise sentence describing what changed.

## Code Architecture

```
src/
├── client/
│   ├── App.vue                 # Root; router-view + NaiveUI theme
│   ├── index.html
│   ├── main.ts
│   ├── router/index.ts         # Vue Router (hash or history)
│   ├── services/
│   │   └── apiService.ts       # Single `api` object, all HTTP in one place
│   ├── stores/                 # Pinia stores (one per entity)
│   │   ├── reminders.ts
│   │   ├── clients.ts
│   │   └── ...
│   ├── components/
│   │   ├── StatusBadge.vue     # Reusable display helpers
│   │   └── ExpiryBadge.vue
│   ├── views/                  # One page component per route
│   │   ├── RemindersPage.vue
│   │   └── ...
│   └── styles/global.css
├── server/
│   ├── index.ts                # Entry: registers routes, starts HTTP + WS
│   ├── db/
│   │   ├── db.ts               # `getDb()` singleton
│   │   └── schema.ts           # `applySchema(db)` — DDL + migrations
│   ├── routes/                 # One file per resource
│   │   ├── reminders.ts
│   │   ├── clients.ts
│   │   └── ...
│   ├── reminders/
│   │   ├── emailSender.ts
│   │   └── scheduler.ts
│   ├── pipeline/               # Document ingestion stages
│   │   ├── importer.ts
│   │   ├── pdfParser.ts
│   │   └── ...
│   ├── templates/
│   │   ├── buildPrompt.ts
│   │   ├── generateTemplate.ts
│   │   ├── renderEmail.ts      # {{var}} template renderer
│   │   └── seedEmailTemplates.ts
│   └── settings.ts             # `getSettings()` / `saveSettings()`
└── shared/
    └── types.ts                # ALL shared TS types (interfaces + enums)
```

## Database Patterns

### Schema style (`src/server/db/schema.ts`)
- Single `applySchema(db)` function — idempotent, called at startup.
- `CREATE TABLE IF NOT EXISTS` for every table.
- Migrations via `addColumnIfMissing(db, table, column, type)` — never destructive.
- All timestamps stored as TEXT in SQLite `datetime('now')` format (ISO-ish).
- FTS5 virtual table for full-text search on documents, kept in sync by `AFTER INSERT/UPDATE/DELETE` triggers.
- Foreign keys always include `ON DELETE CASCADE` or `ON DELETE SET NULL` — never bare FK.
- Indexes created with `CREATE INDEX IF NOT EXISTS`.

### Query style (`src/server/routes/*.ts`)
- Raw SQL via `db.prepare(...).all(...)` / `.get(...)` / `.run(...)` — no ORM.
- Parameterised queries — always `?` placeholders, never string interpolation.
- Dynamic `WHERE` clauses built as `conditions: string[]` + `params: (string|number)[]`.
- JOIN for enriched responses (e.g., `LEFT JOIN clients c ON c.id = r.client_id`).
- Pagination with `LIMIT ? OFFSET ?` parameters.

## Server Route Patterns

Routes are registered as plain strings in a `Map<string, handler>`:

```typescript
export function registerXxxRoutes(
  router: Map<string, (req: Request, push: (e: WsEvent) => void) => Promise<Response>>,
  push: (e: WsEvent) => void
) {
  router.set("GET /api/resource", async (req) => { ... return json(...); });
  router.set("POST /api/resource", async (req) => { ... return json(..., 201); });
  router.set("PUT /api/resource/:id", async (req) => { ... });
  router.set("DELETE /api/resource/:id", async (req) => { ... });
}
```

- Use `extractId(req.url, "/api/resource/")` to parse path params.
- Return `json(data)` helper for all JSON responses.
- WebSocket events pushed via `push({ type: "...", ... })` after mutations.

## Client API Service Pattern (`src/client/services/apiService.ts`)

One exported `api` object with namespaced methods:

```typescript
export const api = {
  resource: {
    list: (params?) => get<{ rows: T[]; total: number }>("/resource"),
    get:  (id)      => get<T>(`/resource/${id}`),
    create: (body)  => post<T>("/resource", body),
    update: (id, b) => put<T>(`/resource/${id}`, b),
    delete: (id)    => del(`/resource/${id}`),
  },
};
```

Private `get`, `post`, `put`, `del` helpers — throw on non-ok status.

## Pinia Store Pattern

Each entity has its own store file:

```typescript
export const useXxxStore = defineStore("xxx", () => {
  const rows  = ref<T[]>([]);
  const total = ref(0);
  const loading = ref(false);

  async function fetch(params?) {
    loading.value = true;
    try {
      const r = await api.xxx.list(params);
      rows.value = r.rows;
      total.value = r.total;
    } finally {
      loading.value = false;
    }
  }

  return { rows, total, loading, fetch };
});
```

## Vue Component Patterns

### Page views (`src/client/views/`)
- Import Naive UI components destructured from `"naive-ui"`.
- Use `onMounted` to call the store's `fetch()`.
- Modals use `n-modal` with `preset="dialog"` and a `ref<boolean>` for visibility.
- `n-data-table` for tabular data with typed `columns` array built with `h()`.
- Status/badge display via `<StatusBadge :status="row.status" />`.

### Reusable components (`src/client/components/`)
- Tiny, single-purpose: accept a prop, return a `n-tag` or badge.
- Status map as a `Record<string, { type, label }>` object — no big switch.

### RTL / Hebrew support
- All UI text is Hebrew.
- Email HTML templates include `dir="rtl"` on container elements.
- Naive UI tabs / navigation styled to indicate direction from right to left.

## Email Template System

### Variables
Templates use `{{varName}}` placeholders. Variable resolution order:
1. Reminder fields (`title`, `trigger_date`, `advance_days`, `body`)
2. Client row (`client_company`, `contact_email`, `contact_phone`)
3. Document row (`document_type`, `document_number`)
4. Contract row (`start_date`, `expiry_date`)
5. `documents.extracted_fields` JSON (all dynamic doc-template fields)

### Template selection (scheduler)
1. `reminder.email_template_id` (per-reminder override)
2. Template matching `doc_template_id` of the linked document's template
3. Any `is_default = 1` template
4. Hardcoded fallback in `emailSender.ts`

### HTML email rules
- Always include `dir="rtl"` on the outer `<div>` for Hebrew content.
- Logo embedded as `cid:` attachment from `data/assets/`.
- Subject line also supports `{{vars}}`.

## Document Template System

- `doc_templates` table defines "what to extract" recipes with `fields: TemplateField[]`.
- `match_keywords` (JSON array) auto-picks a template when a document is imported.
- `expiry_field` key drives automatic reminder generation.
- Dynamic fields stored as flat JSON in `documents.extracted_fields`.

## Settings Pattern

- Single `AppSettings` interface in `src/shared/types.ts`.
- `getSettings()` / `saveSettings()` in `src/server/settings.ts` — loaded from a JSON file in the data directory.
- Settings available on the client via `GET /api/settings` → `useSettingsStore`.

## Shared Types (`src/shared/types.ts`)

Single source of truth for all types used by both client and server:
- Plain TS interfaces — no Zod schemas in this project.
- Status enums as union string types (e.g. `"pending" | "sent" | "snoozed"`).
- "Enriched" variants named `XxxWithContext` or `XxxWithClient` for JOIN results.
- `WsEvent` is a tagged union for WebSocket push events.

## Adding a New Feature — Checklist

1. **Schema** — add `CREATE TABLE IF NOT EXISTS` + `addColumnIfMissing` migrations in `schema.ts`.
2. **Types** — add interface + status unions to `shared/types.ts`.
3. **Route** — create `src/server/routes/new-resource.ts`, call `registerXxxRoutes` from `index.ts`.
4. **API service** — add namespace to `api` in `apiService.ts`.
5. **Store** — add `src/client/stores/new-resource.ts` following the `defineStore` pattern.
6. **View** — add `src/client/views/NewResourcePage.vue`, register in `router/index.ts`.
7. **Hebrew labels** — all user-visible text in Hebrew; email HTML with `dir="rtl"`.
