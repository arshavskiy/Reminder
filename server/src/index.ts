import {gmailRequiredFeatures} from "./gmail/featureGate";
import "./loadEnv";
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import {existsSync, readFileSync, watch} from "fs";
import {dirname, join} from "path";
import {fileURLToPath} from "url";
import {closeDb, col, connectDb} from "./db/db";
import {getSettings, validateEnv} from "./settings";
import {startScheduler} from "./reminders/scheduler";
import {seedBuiltinTemplates} from "./templates/seedTemplates";
import {seedDefaultEmailTemplate} from "./templates/seedEmailTemplates";
import {promoteSharedPrintTemplates} from "./templates/seedPrintTemplates";
import {collapseDuplicateGeneratedPdfs} from "./documents/collapseGeneratedPdfs";
import {seedFeatureDefinitions} from "./features";
import {registerDocumentRoutes} from "./routes/documents";
import {registerClientRoutes} from "./routes/clients";
import {registerContractRoutes} from "./routes/contracts";
import {registerReportRoutes} from "./routes/reports";
import {registerReminderRoutes} from "./routes/reminders";
import {registerNotificationRoutes} from "./routes/notifications";
import { registerReviewRoutes } from "./routes/review";
import {registerReminderTableImportRoutes} from "./routes/reminderTableImport";
import {registerActivityRoutes} from "./routes/activity";
import {registerTaskRoutes} from "./routes/tasks";
import {registerSearchRoutes} from "./routes/search";
import {registerEmailRoutes} from "./routes/email";
import {registerSettingsRoutes} from "./routes/settings";
import {registerDashboardRoutes} from "./routes/dashboard";
import {registerTemplateRoutes} from "./routes/templates";
import {registerEquipmentRoutes} from "./routes/equipment";
import {registerAuthRoutes} from "./routes/auth";
import {registerGmailRoutes, startGmailImportJobWorker} from "./routes/gmail";
import {registerGmailObligationRoutes} from "./routes/gmailObligations";
import {registerCalendarRoutes} from "./routes/calendar";
import {registerInboundEmailRoutes} from "./routes/inboundEmail";
import {registerGdriveRoutes, startDriveExportJobWorker} from "./routes/gdrive";
import {registerInvoiceRoutes} from "./routes/invoices";
import {registerUserSettingsRoutes} from "./routes/userSettings";
import {registerProfileRoutes} from "./routes/profile";
import {closeInspectorLeadsClient, registerAdminRoutes} from "./routes/admin";
import {registerAdminCampaignRoutes} from "./routes/adminCampaigns";
import {startUnsubscribeScanScheduler} from "./outreach/unsubscribeScan";
import {registerBillingRoutes} from "./routes/billing";
import {registerAccountInviteRoutes} from "./routes/accountInvite";
import {initPush} from "./push/pushService";
import {checkSystemDeps, logSystemDepsOnStartup} from "./pipeline/systemDeps";
import {registerExtractRemindersRoutes} from "./routes/extractReminders";
import {registerPrintTemplateRoutes} from "./routes/printTemplates";
import {registerFeatureRoutes} from "./routes/features";
import {registerLegalRoutes} from "./routes/legal";
import {seedGmailSearchProviders} from "./gmail/searchProviders";
import {importFile, startDocumentProcessingJobWorker} from "./pipeline/importer";
import {applyScannedKeys, scanFileForKeys, shouldScanFile} from "./pipeline/keyScanner";
import {logger, requestLogger} from "./logger";
import {metricsMiddleware, startServerMetrics} from "./ops/serverMetrics";
import {registerResendWebhook} from "./reminders/resendDelivery";
import {initializePaymentCollections, registerPaymentRoutes} from "./payments/routes";
import {registerWhatsAppRoutes, registerWhatsAppWebhook} from "./whatsapp/routes";
import {initializeWhatsAppQueue, startWhatsAppWorker} from "./whatsapp/queue";
import {startTempFileSweeper, stopTempFileSweeper} from "./storage/tempFiles";
import {requireAnyFeature, requireMinRole, requirePlans} from "./auth/middleware";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

// CORS — allow Vercel frontend and local dev
const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:5174",
  "http://localhost:4174",
  "http://localhost:5175",
  "http://localhost:4175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:4174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:4175",
];
const configuredAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];
const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...configuredAllowedOrigins])];

// Vercel deployments: any subdomain under vercel.app for this project
const VERCEL_PREVIEW_RE = /^https:\/\/reminder[a-z0-9-]*\.vercel\.app$/;

// Any localhost / 127.0.0.1 port is allowed outside production so ad-hoc Vite
// dev ports (4175, 5175, …) don't hit CORS errors.
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const isDevEnv = process.env.APP_ENV !== "production";

// Production custom domains — any subdomain under handcoded.tech or remindocr.com
const HANDCODED_DOMAIN_RE = /^https:\/\/([a-z0-9-]+\.)*handcoded\.tech$/;
const REMINDOCR_DOMAIN_RE = /^https:\/\/([a-z0-9-]+\.)*remindocr\.com$/;

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (isDevEnv && LOCALHOST_RE.test(origin)) return cb(null, true);
      if (VERCEL_PREVIEW_RE.test(origin)) return cb(null, true);
      if (HANDCODED_DOMAIN_RE.test(origin)) return cb(null, true);
      if (REMINDOCR_DOMAIN_RE.test(origin)) return cb(null, true);
      logger.warn("cors_origin_rejected", { origin });
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    exposedHeaders: ["X-Document-Id", "X-Saved-To-S3"],
  }),
);

registerResendWebhook(app);
registerWhatsAppWebhook(app);

app.use(express.json({ limit: "50mb" }));
app.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  next();
});
// IP blocklist — checked against DB collection + BLOCKED_IPS env var.
// DB entries are managed via admin UI; env var provides a seed / emergency override.
const envBlockedIps = new Set<string>(
  (process.env.BLOCKED_IPS ?? "35.238.129.244")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean),
);
app.use(async (req, res, next) => {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "";
  if (envBlockedIps.has(ip)) { res.status(403).end(); return; }
  try {
    const row = await col("blocked_ips").findOne({ ip });
    if (row) { res.status(403).end(); return; }
  } catch { /* DB not yet ready on first requests — pass through */ }
  next();
});

app.use(requestLogger);
app.use(metricsMiddleware);

// Railway health check — must return 200 before traffic is routed
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

// Live probe for OS-level binaries (Poppler, pdfplumber) used to rasterize
// PDFs and recover equipment tables. Kept off /health so a missing binary
// never fails the deploy.
app.get("/health/deps", async (_req, res) => {
  const report = await checkSystemDeps();
  res.status(report.ok ? 200 : 503).json(report);
});

// Swagger UI — API documentation
try {
  const swaggerSpec = YAML.parse(
    readFileSync(join(__dirname, "../../docs/openapi.yaml"), "utf8"),
  );
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      swaggerOptions: {
        urls: [
          {
            url: "/api-docs.json",
            name: "RemindOCR API",
          },
        ],
      },
      customCss: ".swagger-ui .topbar { display: none }",
    }),
  );
  // Serve spec as JSON for swagger-ui
  app.get("/api-docs.json", (_req, res) => {
    res.json(swaggerSpec);
  });
} catch (e) {
  logger.warn("swagger_spec_unavailable", {
    error: e instanceof Error ? e.message : String(e),
  });
}

// app.use((req, res, next) => {
//   if (req.method === "GET" && req.path.startsWith("/api/")) {
//     res.setHeader("Cache-Control", "private, max-age=300");
//     res.setHeader("Cache-Control", "no-store");
//   }
//   next();
// });

// Register all route modules
app.use("/api/dashboard", requireAnyFeature(["pages.dashboard"]));
app.use("/api/documents", requireAnyFeature(["pages.documents"]));
app.use("/api/extract", requireAnyFeature(["pages.documents"]));
app.use("/api/review", requireAnyFeature(["pages.documents"]));
app.use("/api/clients", requireAnyFeature(["pages.clients"]));
app.use("/api/contracts", requireAnyFeature(["pages.contracts"]));
app.use("/api/payment-requests", requireAnyFeature(["pages.contracts"]));
app.use("/api/reminders", requireAnyFeature(["pages.reminders", "dashboard.calendar"]));
app.use("/api/reports", requireAnyFeature(["pages.reports"]));
app.use("/api/search", requireAnyFeature(["pages.search"]));
app.use("/api/settings", requireAnyFeature(["pages.settings"]));
app.use("/api/admin", requireAnyFeature(["pages.settings"]));
app.use("/api/doc-templates", requireAnyFeature(["pages.doc_templates"]));
app.use("/api/email-templates", requireAnyFeature(["pages.email_templates"]));
app.use("/api/email", requireAnyFeature(["pages.settings", "pages.email_templates"]));
app.use("/api/email-log", requireAnyFeature(["pages.settings", "pages.email_templates"]));
app.use("/api/tasks", requireAnyFeature(["pages.reminders"]));
app.use("/api/profile", requireAnyFeature(["pages.profile"]));
app.use("/api/user", requireAnyFeature(["pages.profile"]));
app.use("/api/equipment", (req, res, next) => {
  const required = req.path.startsWith("/expiry-calendar")
    ? ["pages.equipment", "dashboard.calendar"]
    : ["pages.equipment"];
  return requireAnyFeature(required)(req, res, next);
});

registerAuthRoutes(app);
registerBillingRoutes(app);
registerAccountInviteRoutes(app);
app.use("/api/gmail", (req, res, next) => requireAnyFeature(gmailRequiredFeatures(req.path))(req, res, next));
// Invoices are a plan feature, not an admin one. This was requireMinRole("admin"),
// which refused every non-admin account regardless of what it had paid for.
app.use("/api/invoices", requirePlans(["trial", "digital", "business"]));
registerGmailRoutes(app);
registerGmailObligationRoutes(app);
registerCalendarRoutes(app);
registerInboundEmailRoutes(app);
registerGdriveRoutes(app);
registerReportRoutes(app);
registerInvoiceRoutes(app);
registerDocumentRoutes(app);
registerClientRoutes(app);
registerContractRoutes(app);
registerPaymentRoutes(app);
registerReminderRoutes(app);
registerNotificationRoutes(app);
registerReviewRoutes(app);
registerReminderTableImportRoutes(app);
registerActivityRoutes(app);
registerTaskRoutes(app);
registerSearchRoutes(app);
registerEmailRoutes(app);
registerSettingsRoutes(app);
registerDashboardRoutes(app);
registerTemplateRoutes(app);
registerEquipmentRoutes(app);
registerUserSettingsRoutes(app);
registerFeatureRoutes(app);
registerLegalRoutes(app);
registerProfileRoutes(app);
registerAdminRoutes(app);
registerAdminCampaignRoutes(app);
registerWhatsAppRoutes(app);
registerExtractRemindersRoutes(app);
registerPrintTemplateRoutes(app);

// Static file serving (production)
const STATIC_DIR = join(__dirname, "../../dist/client");
if (process.env.NODE_ENV === "production" && existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.get("*", (_req, res) => res.sendFile(join(STATIC_DIR, "index.html")));
}

function isLocalRuntime(): boolean {
  const appEnv = process.env.APP_ENV?.trim().toLowerCase();
  return Boolean(appEnv && appEnv !== "production");
}

async function localServerAlreadyListening(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(800),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ── HTTP server ───────────────────────────────────────────────────────────────
async function main() {
  validateEnv();
  const settings = getSettings();
  if (isLocalRuntime() && await localServerAlreadyListening(settings.port)) {
    logger.info("server_already_running", {
      port: settings.port,
      health_url: `http://localhost:${settings.port}/health`,
    });
    return;
  }
  await connectDb();
  await initializePaymentCollections();
  await initializeWhatsAppQueue();
  const stopWhatsAppWorker = startWhatsAppWorker();
  initPush();
  await logSystemDepsOnStartup();
  await seedFeatureDefinitions();
  await seedBuiltinTemplates();
  await seedDefaultEmailTemplate();
  await promoteSharedPrintTemplates();
  await seedGmailSearchProviders();
  await collapseDuplicateGeneratedPdfs();
  startGmailImportJobWorker();
  startDriveExportJobWorker();
  startDocumentProcessingJobWorker();
  startTempFileSweeper();

  const server = app.listen(settings.port, () => {
    logger.info("server_started", {
      port: settings.port,
      health_url: `http://localhost:${settings.port}/health`,
      api_docs_url: `http://localhost:${settings.port}/api-docs`,
    });
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      logger.warn("server_port_in_use", {
        port: settings.port,
        hint: `Stop the other process on ${settings.port} or keep using that instance`,
      });
      process.exit(isLocalRuntime() ? 0 : 1);
      return;
    }
    logger.error("server_listen_failed", { error: err });
    process.exit(1);
  });

  // Railway sends SIGTERM on every redeploy. Without this the process dies with its
  // Mongo pools open, so Atlas holds those sockets until its own timeout and a
  // rolling deploy stacks the old replica's connections on top of the new one's —
  // which is how the cluster hits its connection cap and requests start failing with
  // "Timed out while checking out a connection from connection pool".
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("server_shutdown_started", { signal });
    server.close();
    try {
      stopTempFileSweeper();
      await stopWhatsAppWorker();
      await closeInspectorLeadsClient();
      await closeDb();
      logger.info("server_shutdown_complete", { signal });
    } catch (err) {
      logger.error("server_shutdown_failed", { signal, error: err });
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.on("SIGINT", () => { void shutdown("SIGINT"); });

  startScheduler();
  startUnsubscribeScanScheduler();
  startServerMetrics();
  startWatchFolder();
}

main().catch((err) => {
  logger.error("server_startup_failed", { error: err });
  process.exit(1);
});

// Keep the server alive even if a background pipeline task throws
process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", { reason });
});
process.on("uncaughtException", (err) => {
  logger.error("uncaught_exception", { error: err });
});

// ── Watch folder ──────────────────────────────────────────────────────────────
const SUPPORTED_EXTS = new Set([
  ".pdf",
  ".docx",
  ".xlsx",
  ".txt",
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".tif",
  ".tiff",
]);

function startWatchFolder() {
  const s = getSettings();
  if (!s.watchFolderEnabled || !s.watchFolder) return;
  if (!existsSync(s.watchFolder)) {
    logger.warn("watch_folder_missing", { path: s.watchFolder });
    return;
  }

  logger.info("watch_folder_started", { path: s.watchFolder });
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  watch(s.watchFolder, { persistent: true }, (event, filename) => {
    if (!filename) return;
    const filePath = join(s.watchFolder, filename);
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();

    // Credential file dropped — scan and apply keys
    if (shouldScanFile(filePath)) {
      clearTimeout(pending.get(filename));
      pending.set(
        filename,
        setTimeout(() => {
          pending.delete(filename);
          if (!existsSync(filePath)) return;
          logger.info("credential_file_detected", { file_name: filename });
          const result = scanFileForKeys(filePath);
          if (result.found.length > 0) {
            applyScannedKeys([result]);
          }
        }, 1000),
      );
      return;
    }

    if (!SUPPORTED_EXTS.has(ext)) return;

    clearTimeout(pending.get(filename));
    pending.set(
      filename,
      setTimeout(async () => {
        pending.delete(filename);
        if (!existsSync(filePath)) return;
        logger.info("watch_file_detected", { file_name: filename });
        try {
          await importFile(filePath);
        } catch (err) {
          logger.error("watch_file_import_failed", {
            file_name: filename,
            error: err,
          });
        }
      }, 1000),
    );
  });
}
