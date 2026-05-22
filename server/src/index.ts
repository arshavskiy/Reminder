import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, watch } from "fs";
import { connectDb } from "./db/db";
import { loadSettings } from "./settings";
import { startScheduler } from "./reminders/scheduler";
import { registerDocumentRoutes } from "./routes/documents";
import { registerClientRoutes } from "./routes/clients";
import { registerContractRoutes } from "./routes/contracts";
import { registerReminderRoutes } from "./routes/reminders";
import { registerTaskRoutes } from "./routes/tasks";
import { registerSearchRoutes } from "./routes/search";
import { registerEmailRoutes } from "./routes/email";
import { registerSettingsRoutes } from "./routes/settings";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerTemplateRoutes } from "./routes/templates";
import { registerEquipmentRoutes } from "./routes/equipment";
import { registerAuthRoutes } from "./routes/auth";
import { registerUserSettingsRoutes } from "./routes/userSettings";
import { importFile } from "./pipeline/importer";
import type { WsEvent } from "../src/shared/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── WebSocket broadcast ───────────────────────────────────────────────────────
const wsClients = new Set<WebSocket>();

function broadcast(event: WsEvent) {
  const payload = JSON.stringify(event);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch { wsClients.delete(ws); }
    }
  }
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "50mb" }));

// Register all route modules
registerAuthRoutes(app);
registerDocumentRoutes(app, broadcast);
registerClientRoutes(app);
registerContractRoutes(app);
registerReminderRoutes(app, broadcast);
registerTaskRoutes(app);
registerSearchRoutes(app);
registerEmailRoutes(app);
registerSettingsRoutes(app, (updated) => {
  if (updated.watchFolderEnabled && updated.watchFolder) startWatchFolder();
});
registerDashboardRoutes(app);
registerTemplateRoutes(app);
registerEquipmentRoutes(app);
registerUserSettingsRoutes(app);

// Static file serving (production)
const STATIC_DIR = join(__dirname, "../../dist/client");
if (process.env.NODE_ENV === "production" && existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.get("*", (_req, res) => res.sendFile(join(STATIC_DIR, "index.html")));
}

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
async function main() {
  const settings = loadSettings();
  await connectDb();

  const httpServer = createServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws) => {
    wsClients.add(ws);
    ws.send(JSON.stringify({ type: "connected" }));
    ws.on("close", () => wsClients.delete(ws));
    ws.on("message", (msg) => console.log("[ws] message:", msg.toString()));
  });

  httpServer.listen(settings.port, () => {
    console.log(`[server] Running at http://localhost:${settings.port}`);
    console.log(`[server] Data dir: ${join(process.cwd(), "data")}`);
  });

  startScheduler(broadcast);
  startWatchFolder();
}

main().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});

// ── Watch folder ──────────────────────────────────────────────────────────────
const SUPPORTED_EXTS = new Set([".pdf", ".docx", ".xlsx", ".txt", ".md", ".png", ".jpg", ".jpeg", ".tif", ".tiff"]);

function startWatchFolder() {
  const s = loadSettings();
  if (!s.watchFolderEnabled || !s.watchFolder) return;
  if (!existsSync(s.watchFolder)) {
    console.warn(`[watch] Folder not found: ${s.watchFolder}`);
    return;
  }

  console.log(`[watch] Watching: ${s.watchFolder}`);
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  watch(s.watchFolder, { persistent: true }, (event, filename) => {
    if (!filename) return;
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) return;

    const filePath = join(s.watchFolder, filename);
    clearTimeout(pending.get(filename));
    pending.set(filename, setTimeout(async () => {
      pending.delete(filename);
      if (!existsSync(filePath)) return;
      console.log(`[watch] New file detected: ${filename}`);
      try {
        await importFile(filePath, broadcast);
      } catch (err) {
        console.error(`[watch] Import failed for ${filename}:`, err);
      }
    }, 1000));
  });
}
