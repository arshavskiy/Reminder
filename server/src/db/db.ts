import {AsyncLocalStorage} from "async_hooks";
import {Collection, Db, MongoClient} from "mongodb";
import {logger} from "../logger";

export type AdminDbTarget = "local" | "production";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

const MONGODB_URI = env("MONGODB_URI");
const MONGODB_LOCAL_URI = env("MONGODB_LOCAL_URI");
const MONGODB_PRODUCTION_URI = env("MONGODB_PRODUCTION_URI");
const MONGODB_DB = env("MONGODB_DB");
const MONGODB_PRODUCTION_DB = env("MONGODB_PRODUCTION_DB");
const IS_PRODUCTION_RUNTIME =
  env("NODE_ENV") === "production"
  || env("APP_ENV") === "production"
  || Boolean(env("RAILWAY_ENVIRONMENT"));

const LOCAL_URI = IS_PRODUCTION_RUNTIME
  ? (MONGODB_URI ?? MONGODB_PRODUCTION_URI ?? "mongodb://127.0.0.1:27017")
  : (MONGODB_LOCAL_URI
    ?? ((MONGODB_URI && !MONGODB_PRODUCTION_URI)
      ? MONGODB_URI
      : "mongodb://127.0.0.1:27017"));

/** Atlas / production URI when distinct from local. */
const PRODUCTION_URI =
  MONGODB_PRODUCTION_URI
  ?? (MONGODB_LOCAL_URI && !IS_PRODUCTION_RUNTIME ? MONGODB_URI : undefined);

const LOCAL_DB_NAME = MONGODB_DB ?? "reminder-app";
const PRODUCTION_DB_NAME =
  MONGODB_PRODUCTION_DB
  ?? MONGODB_DB
  ?? "reminder-app";

/**
 * Which database the app and scripts actually use.
 *
 * Local by default, so day-to-day work cannot touch customer data by accident.
 * Set MONGODB_TARGET=production to point a script or a one-off run at Atlas: the
 * Atlas slot then becomes the primary that col()/getDb() resolve to, and connectDb()
 * fails loudly rather than falling back to local if that connection cannot be made.
 * It is ignored unless a production URI is configured, so a stray value cannot
 * silently leave you connected to nothing.
 */
const PRIMARY_TARGET: AdminDbTarget =
    String(process.env.MONGODB_TARGET ?? "").trim().toLowerCase() === "production" && PRODUCTION_URI
        ? "production"
        : "local";

type DbSlot = {
  target: AdminDbTarget;
  client: MongoClient;
  db: Db;
  uri: string;
  dbName: string;
};

const als = new AsyncLocalStorage<{ target: AdminDbTarget }>();

let _primary: DbSlot | null = null;
let _local: DbSlot | null = null;
let _production: DbSlot | null = null;
let _productionConnecting: Promise<DbSlot> | null = null;

/** Positive integer from the environment, or the fallback when unset or invalid. */
function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function redactUri(uri: string): string {
  return uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
}

async function openSlot(target: AdminDbTarget, uri: string, dbName: string): Promise<DbSlot> {
  // Pool sizing is explicit because the driver default of 100 per client, across
  // the local and production slots, let a burst of small queries saturate the
  // pool: connections plateaued while every later request queued for a free one,
  // which reads as a slow database but is really waiting for a turn.
  //
  // waitQueueTimeoutMS matters as much as the size. Without it a saturated pool
  // makes requests wait indefinitely, so a slow patch stops the healthcheck
  // answering and the container is killed; failing fast keeps the process alive
  // and surfaces the real problem.
  const client = new MongoClient(uri, {
    maxPoolSize: readPositiveIntEnv("MONGODB_MAX_POOL_SIZE", 50),
    minPoolSize: readPositiveIntEnv("MONGODB_MIN_POOL_SIZE", 5),
    waitQueueTimeoutMS: readPositiveIntEnv("MONGODB_WAIT_QUEUE_TIMEOUT_MS", 10_000),
    maxIdleTimeMS: readPositiveIntEnv("MONGODB_MAX_IDLE_TIME_MS", 60_000),
  });
  // Pool telemetry: a checkout timeout ("Timed out while checking out a connection
  // from connection pool") only says the pool was full, not which slot or how full.
  // Logging the driver's own pool events names the saturating client instead.
  client.on("connectionCheckOutFailed", (ev: any) => {
    logger.warn("db_pool_checkout_failed", { target, db_name: dbName, reason: ev?.reason });
  });
  client.on("connectionPoolCleared", () => {
    logger.warn("db_pool_cleared", { target, db_name: dbName });
  });

  await client.connect();
  const db = client.db(dbName);
  await ensureCollections(db);

  // Index maintenance must not be able to stop the server serving. During a
  // rollout the old and new containers start together and race each other's
  // index builds, and Mongo fails the loser with "Index build failed ... caused
  // by :: dropIndexes command". That was aborting startup, so the healthcheck
  // never answered and Railway killed the deploy — for a collection whose
  // indexes already existed.
  //
  // The indexes are created once and then simply confirmed on every later boot,
  // so a failure here means "another container is doing it", not "the schema is
  // wrong". Log it and carry on; the next boot reconciles.
  try {
    await applyIndexes(db);
  } catch (err) {
    logger.warn("db_index_apply_failed", {
      target,
      db_name: dbName,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info("db_connected", {
    target,
    db_name: dbName,
    uri: redactUri(uri),
  });
  return { target, client, db, uri, dbName };
}

export async function connectDb(): Promise<Db> {
  if (_primary) return _primary.db;

  // Labelled by what the URI actually points at, not by slot name: MONGODB_LOCAL_URI
  // is often an Atlas string, and logging that connection as "local" made it look
  // like a localhost database when it was the customer one.
  _local = await openSlot(
      /mongodb\+srv:|mongodb\.net/i.test(LOCAL_URI) ? "production" : "local",
      LOCAL_URI,
      LOCAL_DB_NAME,
  );

  if (PRODUCTION_URI && PRODUCTION_URI === LOCAL_URI) {
    _production = _local;
  } else if (PRIMARY_TARGET === "production") {
    // MONGODB_TARGET=production is an explicit "operate on Atlas" instruction, so
    // a failure here must not fall back to local: a reseed or backfill script that
    // silently wrote to the developer's local database instead of the customer one
    // is worse than a script that refuses to start.
    await ensureProductionDb();
  } else if (IS_PRODUCTION_RUNTIME) {
    // Railway wants Atlas warm on boot, but serving must not depend on it — the
    // request path reaches it through ensureProductionDb() anyway.
    try {
      await ensureProductionDb();
    } catch (err) {
      logger.warn("db_production_connect_failed", {
        error: err instanceof Error ? err.message : String(err),
        uri: redactUri(PRODUCTION_URI ?? ""),
      });
    }
  }

  // MONGODB_TARGET=production makes the Atlas slot primary, so col()/getDb() and
  // every script that never touches the admin override resolve to it. Without this
  // the flag only pre-warmed the slot and left every unscoped read on local.
  _primary = PRIMARY_TARGET === "production" && _production ? _production : _local;
  return _primary.db;
}

/** Open the Atlas slot on first admin/script use. Safe to call more than once. */
export async function ensureProductionDb(): Promise<DbSlot> {
  if (_production) return _production;
  if (!PRODUCTION_URI) throw new Error("Production database is not configured");
  if (!_local) throw new Error("Database not connected. Call connectDb() first.");
  if (PRODUCTION_URI === LOCAL_URI) {
    _production = _local;
    return _production;
  }
  if (!_productionConnecting) {
    _productionConnecting = openSlot("production", PRODUCTION_URI, PRODUCTION_DB_NAME);
  }
  try {
    _production = await _productionConnecting;
    return _production;
  } catch (err) {
    _productionConnecting = null;
    throw err;
  }
}

// The inspector-leads collection in admin routes used to open its own MongoClient
// against MONGODB_URI. In production that is the same cluster as the primary slot,
// so it added a second, uncapped pool (driver default 100, no waitQueueTimeoutMS)
// on top of this one. Exposing the primary URI lets that code reuse this pool when
// the URI matches instead of doubling the connection count per replica.
export function getPrimaryUri(): string | null {
  return _primary?.uri ?? null;
}

export function getPrimaryDb(): Db {
  if (!_primary) throw new Error("Database not connected. Call connectDb() first.");
  return _primary.db;
}

export function getDb(): Db {
  const override = als.getStore()?.target;
  if (override === "production") {
    if (!_production) {
      throw new Error("Production database is not configured or failed to connect");
    }
    return _production.db;
  }
  if (override === "local") {
    if (!_local) throw new Error("Database not connected. Call connectDb() first.");
    return _local.db;
  }
  return getPrimaryDb();
}

export function getActiveDbTarget(): AdminDbTarget {
  return als.getStore()?.target ?? PRIMARY_TARGET;
}

export function enterAdminDbTarget(target: AdminDbTarget): void {
  als.enterWith({ target });
}

export async function runWithDbTarget<T>(target: AdminDbTarget, fn: () => T | Promise<T>): Promise<T> {
  if (target === "production") await ensureProductionDb();
  return als.run({ target }, fn);
}

export function runWithPrimaryDb<T>(fn: () => T): T {
  return als.run({ target: PRIMARY_TARGET }, fn);
}

export function parseAdminDbTarget(raw: unknown): AdminDbTarget {
  const value = String(raw ?? "local").trim().toLowerCase();
  if (value === "production" || value === "prod" || value === "atlas") return "production";
  return "local";
}

export function getDbTargetStatus() {
  return {
    active: getActiveDbTarget(),
    primary: PRIMARY_TARGET,
    local: {
      configured: Boolean(_local),
      connected: Boolean(_local),
      dbName: _local?.dbName ?? LOCAL_DB_NAME,
      host: redactUri(_local?.uri ?? LOCAL_URI),
    },
    production: {
      configured: Boolean(PRODUCTION_URI),
      // URI present means admin can switch; the socket opens on first use.
      connected: Boolean(_production) || Boolean(PRODUCTION_URI),
      dbName: _production?.dbName ?? PRODUCTION_DB_NAME,
      host: PRODUCTION_URI ? redactUri(_production?.uri ?? PRODUCTION_URI) : null,
      sameAsLocal: Boolean(_production && _local && _production.db === _local.db),
    },
  };
}

export async function closeDb(): Promise<void> {
  const clients = new Set<MongoClient>();
  if (_local) clients.add(_local.client);
  if (_production) clients.add(_production.client);
  await Promise.all([...clients].map((c) => c.close()));
  _primary = null;
  _local = null;
  _production = null;
  _productionConnecting = null;
}

// All collection names used by the application
const ALL_COLLECTIONS = [
  "users",
  "sessions",
  "oauth_states",
  "magic_link_tokens",
  "user_settings",
  "documents",
  "document_clients",
  "clients",
  "contracts",
  "invoices",
  "reminder_discoveries",
  "reminders",
  "tasks",
  "extractions",
  "timeline_events",
  "email_log",
  "equipment",
  "doc_templates",
  "email_templates",
  "print_templates",
  "print_template_drafts",
  "features",
  "certificates",
  "notifications",
  "gmail_imports",
  "gmail_import_jobs",
  "gmail_search_providers",
  "document_processing_jobs",
  "drive_export_jobs",
  "calendar_links",
  "inspector_leads",
];

async function ensureCollections(db: Db): Promise<void> {
  const existing = new Set(
    (await db.listCollections().toArray()).map((c) => c.name)
  );
  for (const name of ALL_COLLECTIONS) {
    if (!existing.has(name)) {
      await db.createCollection(name);
      logger.info("db_collection_created", { collection: name, db_name: db.databaseName });
    }
  }
}

async function applyIndexes(db: Db): Promise<void> {
  // users
  await db.collection("users").createIndex({ google_sub: 1 }, { unique: true, sparse: true });
  await db.collection("reminder_discoveries").createIndex({ user_id: 1, account: 1, messageId: 1 }, { unique: true });
  await db.collection("reminder_discoveries").createIndex({ user_id: 1, due_date: 1 });
  await db.collection("users").createIndex({ email: 1 }, { unique: true, sparse: true });
  await db.collection("users").createIndex({ username: 1 }, { unique: true, sparse: true });
  await db.collection("users").createIndex({ verification_token: 1 }, { sparse: true });
  await db.collection("users").createIndex({ reset_token: 1 }, { sparse: true });
    await db.collection("users").createIndex({billing_mode: 1, billing_next_payment_at: 1});
  await db.collection("users").createIndex({gmail_email: 1}, {unique: true, sparse: true});

  // sessions
  await db.collection("calendar_links").createIndex(
    { user_id: 1, source_type: 1, source_id: 1 },
    { unique: true },
  );
  await db.collection("calendar_links").createIndex({ user_id: 1, gcal_event_id: 1 });

  await db.collection("sessions").createIndex({ user_id: 1 });
  await db.collection("sessions").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });

  // oauth_states — TTL 10 minutes
  await db.collection("oauth_states").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });

  // magic_link_tokens — single-use, TTL cleanup
  await db.collection("magic_link_tokens").createIndex({ token: 1 }, { unique: true });
  await db.collection("magic_link_tokens").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  await db.collection("magic_link_tokens").createIndex({ user_id: 1 });

  // user_settings
  await db.collection("user_settings").createIndex({ user_id: 1 }, { unique: true, sparse: true });

  // documents
  await db.collection("documents").updateMany(
    { document_source: { $exists: false }, document_kind: "generated_print_template_pdf" },
    { $set: { document_source: "generated" } }
  );
  await db.collection("documents").updateMany(
    { document_source: { $exists: false } },
    { $set: { document_source: "scanned" } }
  );
  await db.collection("documents").createIndex({ user_id: 1, file_hash: 1 }, { unique: true, sparse: true });
  await db.collection("documents").createIndex({ processing_status: 1 });
  await db.collection("documents").createIndex({ document_source: 1 });
  await db.collection("documents").createIndex({ user_id: 1 });
  await db.collection("documents").createIndex({ user_id: 1, created_at: -1 });
  await db.collection("documents").createIndex({ created_at: -1 });
  await db.collection("documents").createIndex({ import_date: -1 });

  // document_clients (join collection)
  await db.collection("document_clients").createIndex({ document_id: 1 });
  await db.collection("document_clients").createIndex({ client_id: 1 });
  await db.collection("document_clients").createIndex(
    { document_id: 1, client_id: 1 },
    { unique: true }
  );

  // clients
  await db.collection("clients").createIndex({ user_id: 1 });
  await db.collection("clients").createIndex({ display_name: 1 });

  // contracts
  await db.collection("contracts").createIndex({ user_id: 1 });
  await db.collection("contracts").createIndex({ expiry_date: 1 });
  await db.collection("contracts").createIndex({ status: 1 });
  await db.collection("contracts").createIndex(
    { document_id: 1 },
    { unique: true, partialFilterExpression: { document_id: { $type: "string" } } }
  );
  await db.collection("contracts").createIndex({ client_id: 1 });

  // invoices / bills
  await db.collection("invoices").createIndex({ user_id: 1 });
  await db.collection("invoices").createIndex({ document_id: 1 }, { unique: true });
  await db.collection("invoices").createIndex({ supplier_name: 1 });
  await db.collection("invoices").createIndex({ payment_due_date: 1 });
  await db.collection("invoices").createIndex({ created_at: -1 });

  // reminders
  await db.collection("reminders").createIndex({ user_id: 1 });
  await db.collection("reminders").createIndex({ trigger_date: 1 });
  await db.collection("reminders").createIndex({ status: 1 });
  await db.collection("reminders").createIndex({ source_type: 1, source_id: 1, advance_days: 1 });

  // tasks
  await db.collection("tasks").createIndex({ user_id: 1 });
  await db.collection("tasks").createIndex({ due_date: 1 });
  await db.collection("tasks").createIndex({ document_id: 1 });
  await db.collection("tasks").createIndex({ client_id: 1 });

  // extractions
  await db.collection("extractions").createIndex({ document_id: 1 });
  await db.collection("extractions").createIndex({ created_at: -1 });

  // timeline_events
  await db.collection("timeline_events").createIndex({ client_id: 1, event_date: -1 });
  await db.collection("timeline_events").createIndex({ user_id: 1 });

  // email_log
  await db.collection("email_log").createIndex({ user_id: 1 });
  await db.collection("email_log").createIndex({ reminder_id: 1 });
  await db.collection("email_log").createIndex({ provider_message_id: 1 });
  await db.collection("email_log").createIndex({ sent_at: -1 });

  // equipment
  try { await db.collection("equipment").dropIndex("name_1_category_1"); } catch { /* didn't exist */ }
  await db.collection("equipment").createIndex({ category: 1 });
  await db.collection("equipment").createIndex({ name: 1 });
  await db.collection("equipment").createIndex(
    { serial_number: 1 },
    { unique: true, sparse: true }
  );
  await db.collection("equipment").createIndex({ user_id: 1 });
  await db.collection("equipment").createIndex({ is_active: 1 });
  await db.collection("equipment").createIndex({ document_id: 1 });
  await db.collection("equipment").createIndex({ client_id: 1 });

  // doc_templates
  try { await db.collection("doc_templates").dropIndex("name_1"); } catch { /* didn't exist */ }
  await db.collection("doc_templates").createIndex({ user_id: 1, name: 1 }, { unique: true });
  await db.collection("doc_templates").createIndex({ is_default: 1 });

  // email_templates
  await db.collection("email_templates").createIndex({ name: 1 }, { unique: true });
  await db.collection("email_templates").createIndex({ doc_template_id: 1 });
  await db.collection("email_templates").createIndex({ is_default: 1 });

  // print_templates
  await db.collection("print_templates").createIndex({ user_id: 1 });
  await db.collection("print_templates").createIndex({ user_id: 1, name: 1 });
  await db.collection("print_templates").createIndex({is_shared: 1}, {sparse: true});
    await db.collection("print_templates").createIndex({system_key: 1}, {unique: true, sparse: true});
    await db.collection("print_templates").createIndex({reportTypeKey: 1}, {sparse: true});

  // print_template_drafts
  try { await db.collection("print_template_drafts").dropIndex("user_id_1_template_id_1"); } catch { /* didn't exist */ }
  await db.collection("print_template_drafts").createIndex({ user_id: 1, template_id: 1 });
  await db.collection("print_template_drafts").createIndex(
    { user_id: 1, contract_id: 1 },
    { unique: true, partialFilterExpression: { contract_id: { $type: "string" } } }
  );
  await db.collection("print_template_drafts").createIndex({ updated_at: -1 });

  // features
  await db.collection("features").createIndex({ key: 1 }, { unique: true });
  await db.collection("features").createIndex({ scope: 1, sort_order: 1 });

  // certificates
  await db.collection("certificates").createIndex({ user_id: 1 });
  await db.collection("certificates").createIndex({ expiry_date: 1 });

  // notifications
  await db.collection("notifications").createIndex({ user_id: 1 });
  await db.collection("notifications").createIndex({ created_at: -1 });
  await db.collection("notifications").createIndex({ read: 1 });

  // gmail_imports
  await db.collection("gmail_imports").createIndex({ user_id: 1 });
  await db.collection("gmail_imports").createIndex({ message_id: 1 });
  await db.collection("gmail_imports").createIndex({ user_id: 1, message_id: 1 }, { unique: true });
  await db.collection("gmail_imports").createIndex({ imported_at: -1 });

  // gmail_import_jobs
  await db.collection("gmail_import_jobs").createIndex({ user_id: 1, created_at: -1 });
  await db.collection("gmail_import_jobs").createIndex({ status: 1, updated_at: 1 });
  await db.collection("gmail_import_jobs").createIndex({ user_id: 1, status: 1, created_at: -1 });

  // gmail_search_providers
  await db.collection("gmail_search_providers").createIndex({ id: 1 }, { unique: true });
  await db.collection("gmail_search_providers").createIndex({ enabled: 1, sort_order: 1 });

  // document_processing_jobs
  await db.collection("document_processing_jobs").createIndex({ status: 1, next_run_at: 1, created_at: 1 });
  await db.collection("document_processing_jobs").createIndex({ document_id: 1 });
  await db.collection("document_processing_jobs").createIndex({ user_id: 1, status: 1, created_at: -1 });
  await db.collection("document_processing_jobs").createIndex({ locked_at: 1 });

  // inspector_leads
  await db.collection("inspector_leads").createIndex({ email: 1 }, { sparse: true });
  await db.collection("inspector_leads").createIndex({ phone: 1 }, { sparse: true });
  await db.collection("inspector_leads").createIndex({ website: 1 }, { sparse: true });
  await db.collection("inspector_leads").createIndex({ source: 1 });
  await db.collection("inspector_leads").createIndex({ contactStatus: 1, leadScore: -1 });
  await db.collection("inspector_leads").createIndex({ leadScore: -1 });
}

// Typed collection helper
export function col<T extends object>(name: string): Collection<T> {
  return getDb().collection<T>(name);
}
