# Client Entry Point & Boot Flow

This document describes how the Vue 3 frontend (`src/client/`) boots, from the first HTML byte to the rendered dashboard.

---

## TL;DR

```
index.html
   └─→ main.ts (createApp + Pinia + Router)
          └─→ App.vue (sidebar shell + <router-view>)
                 └─→ views/*Page.vue (per route)
```

The Vite dev server serves [client/src/index.html](../client/src/index.html) on `http://localhost:4173`, which loads [main.ts](../client/src/main.ts), which mounts the Vue app into `<div id="app">`.

---

## 1. HTML Entry: `src/client/index.html`

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <title>Client Reminder — מערכת תזכורות לקוחות</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

Key points:
- `dir="rtl"` + `lang="he"` set Hebrew right-to-left layout globally
- Single root element `#app` is the Vue mount target
- The `<script type="module">` tag is what Vite picks up to start the JS pipeline

---

## 2. JS Entry: `src/client/main.ts`

```typescript
import { createApp } from "vue";
import { createPinia } from "pinia";
import { router } from "./router/index.js";
import App from "./App.vue";
import "vfonts/Lato.css";

const app = createApp(App);
app.use(createPinia());   // global state container
app.use(router);          // hash-based router
app.mount("#app");
```

Order matters:
1. **`createPinia()`** registered first — stores can be used inside route components
2. **`router`** registered second — `<router-view>` in `App.vue` will work
3. **`mount("#app")`** is the last call — Vue takes over the `<div id="app">`

---

## 3. Root Component: `src/client/App.vue`

`App.vue` is the application shell. It provides:

- **`<n-config-provider>`** — Naive UI dark theme + Hebrew locale (`heIL`, `dateHeIL`)
- **`<n-layout-sider>`** — collapsible right-side navigation menu with 7 items (Dashboard, Documents, Clients, Contracts, Reminders, Search, Settings)
- **`<n-layout-content>`** — wraps `<router-view>` which renders the active page
- **`<n-message-provider>`** + `<WsConnector />` — toast notifications and WebSocket connection bootstrap

The active menu item is computed from `route.path.split("/")[1]`, so navigating to `/clients/5` keeps the "Clients" menu item highlighted.

---

## 4. Router: `src/client/router/index.ts`

Uses `createWebHashHistory()` (hash-based URLs like `#/clients/5`) — no server-side rewrite rules needed.

| Path | Component |
|---|---|
| `/` | [DashboardPage.vue](../src/client/views/DashboardPage.vue) |
| `/documents` | [DocumentsPage.vue](../src/client/views/DocumentsPage.vue) |
| `/documents/:id` | [DocumentDetailPage.vue](../src/client/views/DocumentDetailPage.vue) |
| `/clients` | [ClientsPage.vue](../src/client/views/ClientsPage.vue) |
| `/clients/:id` | [ClientDetailPage.vue](../src/client/views/ClientDetailPage.vue) |
| `/contracts` | [ContractsPage.vue](../src/client/views/ContractsPage.vue) |
| `/reminders` | [RemindersPage.vue](../src/client/views/RemindersPage.vue) |
| `/search` | [SearchPage.vue](../src/client/views/SearchPage.vue) |
| `/settings` | [SettingsPage.vue](../src/client/views/SettingsPage.vue) |

---

## 5. WebSocket Bootstrap: `components/WsConnector.vue`

Mounted once inside `App.vue`. On `onMounted()` it calls:

```typescript
connectWs(); // from apiService.ts — opens ws://localhost:3737/ws
```

It subscribes to all WebSocket events and surfaces them as Naive UI toast messages:
- `document:done` → success toast + refresh documents store
- `reminder:fired` → success toast
- `reminder:error` → error toast

The connection auto-reconnects every 3s on disconnect (see [apiService.ts](../src/client/api/apiService.ts)).

---

## 6. API Layer: `src/client/api/apiService.ts`

Single export `api` provides typed wrappers for every REST endpoint, grouped by domain:

```typescript
api.dashboard.stats()
api.documents.list({ status, limit, offset })
api.documents.upload(files)        // multipart browser upload
api.documents.import(filePath)     // server-side path
api.clients.list({ q, limit })
api.contracts.expiring(30)
api.reminders.sendNow(id)
api.email.test(to)
api.settings.save({...})
```

Plus WebSocket helpers:
- `connectWs()` — open connection (called once from `WsConnector.vue`)
- `onWsEvent(cb)` — subscribe to push events, returns unsubscribe fn

In dev mode, Vite proxies `/api/*` and `/ws` to the Bun server on `:3737` (see [vite.config.ts](../vite.config.ts)).

---

## 7. State (Pinia stores) — `src/client/stores/`

| Store | Purpose |
|---|---|
| [dashboard.ts](../src/client/stores/dashboard.ts) | Dashboard stats |
| [documents.ts](../src/client/stores/documents.ts) | Document list, import, delete |
| [clients.ts](../src/client/stores/clients.ts) | Client CRUD, active client detail |
| [contracts.ts](../src/client/stores/contracts.ts) | Contract list, expiring soon |
| [reminders.ts](../src/client/stores/reminders.ts) | Reminder list, send-now, dismiss |
| [tasks.ts](../src/client/stores/tasks.ts) | Task list, mark done |
| [settings.ts](../src/client/stores/settings.ts) | App settings load/save |

Each view typically calls its store's `fetch()` from `onMounted()`.

---

## 8. Boot Sequence Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Browser hits http://localhost:4173                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Vite serves src/client/index.html                       │
│  ├─ Sets dir="rtl" lang="he"                             │
│  └─ Loads <script src="./main.ts">                       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  main.ts                                                 │
│  ├─ createApp(App)                                       │
│  ├─ app.use(createPinia())                               │
│  ├─ app.use(router)                                      │
│  └─ app.mount("#app")                                    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  App.vue                                                 │
│  ├─ <n-config-provider> theme + heIL locale              │
│  ├─ <n-layout-sider> sidebar nav                         │
│  ├─ <n-layout-content>                                   │
│  │    └─ <router-view> ← renders the page                │
│  └─ <WsConnector /> ← opens WebSocket                    │
└─────────────────────────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
┌──────────────────────┐   ┌──────────────────────┐
│ WsConnector.vue      │   │ DashboardPage.vue    │
│ connectWs()          │   │ (default "/" route)  │
│ → ws://:3737/ws      │   │ store.fetch()        │
│                      │   │ → GET /api/dashboard │
│ onWsEvent(...)       │   │   /stats             │
└──────────────────────┘   └──────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │ Vite dev proxy       │
                          │ /api/* → :3737       │
                          │ /ws    → :3737/ws    │
                          └──────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │ Bun.serve            │
                          │ Routes API           │
                          │ Broadcasts WS events │
                          └──────────────────────┘
```

---

## 9. Production vs Dev

| | Dev | Production |
|---|---|---|
| Frontend host | Vite (`:4173`) | Server serves built files from `dist/client/` |
| API requests | Vite proxies `/api` → `:3737` | Same-origin, no proxy needed |
| WebSocket | Vite proxies `/ws` → `:3737/ws` | Same-origin upgrade |
| Build command | `bun run client:dev` | `vite build` → `dist/client/` |
| Entry to start | `bun run dev` (both) | `bun run start` |

In production, the Bun server (`src/server/index.ts`) serves `dist/client/index.html` for any non-`/api/*` path — that's the same `index.html` shown above, just rebuilt with hashed asset URLs.
