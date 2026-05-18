import { join } from "path";
import { existsSync } from "fs";
import { watch } from "fs";
import { getDb } from "./db/db.js";
import { loadSettings } from "./settings.js";
import { startScheduler } from "./reminders/scheduler.js";
import { registerDocumentRoutes } from "./routes/documents.js";
import { registerClientRoutes } from "./routes/clients.js";
import { registerContractRoutes } from "./routes/contracts.js";
import { registerReminderRoutes } from "./routes/reminders.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerEmailRoutes } from "./routes/email.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerTemplateRoutes } from "./routes/templates.js";
import { importFile } from "./pipeline/importer.js";
import type { WsEvent } from "../shared/types.js";

// ── Init ─────────────────────────────────────────────────────────────────────
const settings = loadSettings();
const db = getDb(); // ensures schema is applied

// ── WebSocket broadcast ───────────────────────────────────────────────────────
const wsClients = new Set<import("bun").ServerWebSocket<unknown>>();

function broadcast(event: WsEvent) {
  const payload = JSON.stringify(event);
  for (const ws of wsClients) {
    try { ws.send(payload); } catch { wsClients.delete(ws); }
  }
}

// ── Router ───────────────────────────────────────────────────────────────────
// We use a simple Map<string, handler> where key = "METHOD /path-prefix"
// Dynamic segments (:id) are matched by prefix scan below.
type Handler = (req: Request, push: typeof broadcast) => Promise<Response>;
const router = new Map<string, Handler>();

registerDocumentRoutes(router as Map<string, Handler>, broadcast);
registerClientRoutes(router as Map<string, (req: Request) => Promise<Response>>);
registerContractRoutes(router as Map<string, (req: Request) => Promise<Response>>);
registerReminderRoutes(router as Map<string, Handler>, broadcast);
registerTaskRoutes(router as Map<string, (req: Request) => Promise<Response>>);
registerSearchRoutes(router as Map<string, (req: Request) => Promise<Response>>);
registerEmailRoutes(router as Map<string, (req: Request) => Promise<Response>>);
registerSettingsRoutes(router as Map<string, (req: Request) => Promise<Response>>, (updated) => {
  // Re-apply watch folder if it changed
  if (updated.watchFolderEnabled && updated.watchFolder) {
    startWatchFolder(broadcast);
  }
});
registerDashboardRoutes(router as Map<string, (req: Request) => Promise<Response>>);
registerTemplateRoutes(router as Map<string, (req: Request) => Promise<Response>>);

function matchRoute(method: string, pathname: string): Handler | null {
  // Exact match
  const exact = `${method} ${pathname}`;
  if (router.has(exact)) return router.get(exact)!;

  // Pattern match for routes registered with :id segments
  // e.g. "GET /api/clients/:id" registered as "GET /api/clients/:id"
  // We match by stripping trailing segment and looking for a prefix
  for (const [key, handler] of router) {
    if (!key.startsWith(method + " ")) continue;
    const pattern = key.slice(method.length + 1);
    if (matchPattern(pattern, pathname)) return handler;
  }

  return null;
}

function matchPattern(pattern: string, path: string): boolean {
  const pp = pattern.split("/");
  const ap = path.split("/");
  if (pp.length !== ap.length) return false;
  return pp.every((seg, i) => seg.startsWith(":") || seg === ap[i]);
}

// ── Static file serving ───────────────────────────────────────────────────────
const STATIC_DIR = join(import.meta.dir, "../../dist/client");
const DEV_PROXY = process.env.NODE_ENV !== "production";

async function serveStatic(pathname: string): Promise<Response | null> {
  if (DEV_PROXY) return null; // in dev, Vite serves the frontend

  const filePath = join(STATIC_DIR, pathname === "/" ? "index.html" : pathname);
  if (existsSync(filePath)) {
    return new Response(Bun.file(filePath));
  }
  // SPA fallback
  const index = join(STATIC_DIR, "index.html");
  if (existsSync(index)) return new Response(Bun.file(index));
  return null;
}

// ── Bun.serve ─────────────────────────────────────────────────────────────────
const server = Bun.serve({
  port: settings.port,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // API routes
    if (url.pathname.startsWith("/api/")) {
      const handler = matchRoute(req.method, url.pathname);
      if (handler) {
        try {
          return await handler(req, broadcast);
        } catch (err) {
          console.error(`[${req.method} ${url.pathname}]`, err);
          return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Static files
    const staticResp = await serveStatic(url.pathname);
    if (staticResp) return staticResp;

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      wsClients.add(ws);
      ws.send(JSON.stringify({ type: "connected" }));
    },
    close(ws) {
      wsClients.delete(ws);
    },
    message(ws, msg) {
      // Client → server WS messages not used currently
      console.log("[ws] message:", msg);
    },
  },
});

startScheduler(broadcast);
startWatchFolder(broadcast);

console.log(`[server] Running at http://localhost:${settings.port}`);
console.log(`[server] Data dir: ${join(process.cwd(), "data")}`);

// ── Watch folder ──────────────────────────────────────────────────────────────
const SUPPORTED_EXTS = new Set([".pdf", ".docx", ".xlsx", ".txt", ".md", ".png", ".jpg", ".jpeg", ".tif", ".tiff"]);

function startWatchFolder(push: typeof broadcast) {
  const s = loadSettings();
  if (!s.watchFolderEnabled || !s.watchFolder) return;
  if (!existsSync(s.watchFolder)) {
    console.warn(`[watch] Folder not found: ${s.watchFolder}`);
    return;
  }

  console.log(`[watch] Watching: ${s.watchFolder}`);

  // Debounce per filename so rapid file-copy events don't double-import
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  watch(s.watchFolder, { persistent: true }, (event, filename) => {
    if (!filename) return;
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) return;

    const filePath = join(s.watchFolder, filename);

    // Debounce 1s — wait for the file to finish copying
    clearTimeout(pending.get(filename));
    pending.set(filename, setTimeout(async () => {
      pending.delete(filename);
      if (!existsSync(filePath)) return;
      console.log(`[watch] New file detected: ${filename}`);
      try {
        await importFile(filePath, push);
      } catch (err) {
        console.error(`[watch] Import failed for ${filename}:`, err);
      }
    }, 1000));
  });
}

