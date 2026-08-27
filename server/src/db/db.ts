import {Collection, Db, MongoClient} from "mongodb";
import {logger} from "../logger";

const MONGODB_URI = process.env.MONGODB_LOCAL_URI ?? process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB ?? "reminder-app";

let _client: MongoClient | null = null;
let _db: Db | null = null;

export async function connectDb(): Promise<Db> {
  if (_db) return _db;
  _client = new MongoClient(MONGODB_URI);
  await _client.connect();
  _db = _client.db(DB_NAME);
  await ensureCollections(_db);
  await applyIndexes(_db);
  logger.info("db_connected", { db_name: DB_NAME, uri: MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, "//***:***@") });
  return _db;
}

export function getDb(): Db {
  if (!_db) throw new Error("Database not connected. Call connectDb() first.");
  return _db;
}

export async function closeDb(): Promise<void> {
  await _client?.close();
  _client = null;
  _db = null;
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
  "engineer_profiles",
  "certificates",
  "notifications",
  "gmail_imports",
  "gmail_import_jobs",
  "gmail_search_providers",
  "document_processing_jobs",
  "drive_export_jobs",
  "calendar_links",
];

async function ensureCollections(db: Db): Promise<void> {
  const existing = new Set(
    (await db.listCollections().toArray()).map((c) => c.name)
  );
  for (const name of ALL_COLLECTIONS) {
    if (!existing.has(name)) {
      await db.createCollection(name);
      logger.info("db_collection_created", { collection: name });
    }
  }
}

async function applyIndexes(db: Db): Promise<void> {
  // users
  await db.collection("users").createIndex({ google_sub: 1 }, { unique: true, sparse: true });
  await db.collection("users").createIndex({ email: 1 }, { unique: true, sparse: true });
  await db.collection("users").createIndex({ verification_token: 1 }, { sparse: true });
  await db.collection("users").createIndex({ reset_token: 1 }, { sparse: true });
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
  try { await db.collection("documents").dropIndex("file_hash_1"); } catch { /* didn't exist */ }
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
  // Unique per real document_id, but many manual contracts (document_id: null)
  // must coexist. A sparse index still indexes explicit nulls, so a second
  // manual contract collides; a partial index scoped to string document_ids
  // enforces uniqueness only where it matters. Recreate if the old
  // sparse/plain index is present.
  try { await db.collection("contracts").dropIndex("document_id_1"); } catch { /* didn't exist */ }
  await db.collection("contracts").createIndex(
    { document_id: 1 },
    { unique: true, partialFilterExpression: { document_id: { $type: "string" } } }
  );
  await db.collection("contracts").createIndex({ client_id: 1 });

  // invoices / bills — extracted from invoice templates; not part of reminder contract flow
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

  // equipment — drop old unique(name,category) if present, replace with serial_number
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

  // print_template_drafts — legacy template drafts plus one saved fill-state per contract
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

  // engineer_profiles — one per user
  await db.collection("engineer_profiles").createIndex({ user_id: 1 }, { unique: true, sparse: true });

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
}

// Typed collection helper
export function col<T extends object>(name: string): Collection<T> {
  return getDb().collection<T>(name);
}
