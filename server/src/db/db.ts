import { MongoClient, Db, Collection } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB ?? "reminder";

let _client: MongoClient | null = null;
let _db: Db | null = null;

export async function connectDb(): Promise<Db> {
  if (_db) return _db;
  _client = new MongoClient(MONGODB_URI);
  await _client.connect();
  _db = _client.db(DB_NAME);
  await applyIndexes(_db);
  console.log(`[db] Connected to MongoDB: ${DB_NAME}`);
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

async function applyIndexes(db: Db): Promise<void> {
  // users
  await db.collection("users").createIndex({ google_sub: 1 }, { unique: true });
  await db.collection("users").createIndex({ email: 1 }, { unique: true });

  // sessions
  await db.collection("sessions").createIndex({ user_id: 1 });
  await db.collection("sessions").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });

  // oauth_states — TTL 10 minutes
  await db.collection("oauth_states").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });

  // documents
  await db.collection("documents").createIndex({ file_hash: 1 }, { unique: true });
  await db.collection("documents").createIndex({ processing_status: 1 });
  await db.collection("documents").createIndex({ user_id: 1 });
  await db.collection("documents").createIndex({ created_at: -1 });

  // clients
  await db.collection("clients").createIndex({ user_id: 1 });
  await db.collection("clients").createIndex({ display_name: 1 });

  // contracts
  await db.collection("contracts").createIndex({ user_id: 1 });
  await db.collection("contracts").createIndex({ expiry_date: 1 });
  await db.collection("contracts").createIndex({ status: 1 });
  await db.collection("contracts").createIndex({ document_id: 1 });
  await db.collection("contracts").createIndex({ client_id: 1 });

  // reminders
  await db.collection("reminders").createIndex({ user_id: 1 });
  await db.collection("reminders").createIndex({ trigger_date: 1 });
  await db.collection("reminders").createIndex({ status: 1 });

  // tasks
  await db.collection("tasks").createIndex({ user_id: 1 });
  await db.collection("tasks").createIndex({ due_date: 1 });

  // timeline_events
  await db.collection("timeline_events").createIndex({ client_id: 1, event_date: -1 });
  await db.collection("timeline_events").createIndex({ user_id: 1 });

  // email_log
  await db.collection("email_log").createIndex({ user_id: 1 });
  await db.collection("email_log").createIndex({ reminder_id: 1 });

  // equipment
  await db.collection("equipment").createIndex({ category: 1 });
  await db.collection("equipment").createIndex(
    { name: 1, category: 1 },
    { unique: true }
  );

  // doc_templates
  await db.collection("doc_templates").createIndex({ name: 1 }, { unique: true });

  // email_templates
  await db.collection("email_templates").createIndex({ name: 1 }, { unique: true });
  await db.collection("email_templates").createIndex({ doc_template_id: 1 });
}

// Typed collection helpers
export function col<T extends object>(name: string): Collection<T> {
  return getDb().collection<T>(name);
}
