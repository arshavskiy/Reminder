import type { Database } from "bun:sqlite";

export function applySchema(db: Database) {
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name         TEXT NOT NULL,
      file_path         TEXT NOT NULL,
      original_path     TEXT,
      file_hash         TEXT NOT NULL UNIQUE,
      mime_type         TEXT NOT NULL,
      file_size_bytes   INTEGER NOT NULL,
      import_date       TEXT NOT NULL,
      processing_status TEXT NOT NULL DEFAULT 'queued',
      error_message     TEXT,
      raw_text          TEXT,
      language          TEXT DEFAULT 'he',
      page_count        INTEGER,
      document_type     TEXT,
      document_number   TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Idempotent migration: add columns if older DBs don't have them
  addColumnIfMissing(db, "documents", "document_type", "TEXT");
  addColumnIfMissing(db, "documents", "document_number", "TEXT");

  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name  TEXT NOT NULL,
      entity_type   TEXT NOT NULL DEFAULT 'person',
      id_number     TEXT,
      email         TEXT,
      phone         TEXT,
      address       TEXT,
      notes         TEXT,
      tags          TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS document_clients (
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      role        TEXT,
      PRIMARY KEY (document_id, client_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS contracts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      client_id       INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      contract_number TEXT,
      contract_type   TEXT,
      start_date      TEXT,
      expiry_date     TEXT,
      amount          REAL,
      currency        TEXT DEFAULT 'ILS',
      counterparty    TEXT,
      summary         TEXT,
      confidence      TEXT DEFAULT 'medium',
      status          TEXT DEFAULT 'active',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type   TEXT NOT NULL,
      source_id     INTEGER,
      client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      document_id   INTEGER REFERENCES documents(id) ON DELETE SET NULL,
      trigger_date  TEXT NOT NULL,
      advance_days  INTEGER DEFAULT 30,
      title         TEXT NOT NULL,
      body          TEXT,
      email_to      TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      snoozed_until TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
      client_id   INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      due_date    TEXT,
      status      TEXT NOT NULL DEFAULT 'open',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS extractions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      backend     TEXT NOT NULL,
      model       TEXT NOT NULL,
      result_json TEXT NOT NULL,
      parsed_ok   INTEGER NOT NULL DEFAULT 0,
      error       TEXT,
      exec_ms     INTEGER,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS email_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      reminder_id INTEGER REFERENCES reminders(id) ON DELETE SET NULL,
      to_address  TEXT NOT NULL,
      subject     TEXT NOT NULL,
      body_html   TEXT,
      sent_at     TEXT NOT NULL,
      success     INTEGER NOT NULL DEFAULT 1,
      error       TEXT,
      smtp_host   TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS timeline_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      event_type  TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT,
      event_date  TEXT NOT NULL,
      source_id   INTEGER,
      source_type TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      raw_text,
      content='documents',
      content_rowid='id',
      tokenize='unicode61'
    )
  `);

  // FTS sync triggers
  db.run(`
    CREATE TRIGGER IF NOT EXISTS doc_fts_insert AFTER INSERT ON documents BEGIN
      INSERT INTO documents_fts(rowid, raw_text) VALUES (new.id, new.raw_text);
    END
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS doc_fts_update AFTER UPDATE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, raw_text) VALUES ('delete', old.id, old.raw_text);
      INSERT INTO documents_fts(rowid, raw_text) VALUES (new.id, new.raw_text);
    END
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS doc_fts_delete AFTER DELETE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, raw_text) VALUES ('delete', old.id, old.raw_text);
    END
  `);

  // Indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_doc_status       ON documents (processing_status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_doc_hash         ON documents (file_hash)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_contract_expiry  ON contracts (expiry_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_contract_status  ON contracts (status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reminder_trigger ON reminders (trigger_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reminder_status  ON reminders (status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_task_due         ON tasks (due_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_timeline_client  ON timeline_events (client_id, event_date DESC)`);
}

function addColumnIfMissing(db: Database, table: string, column: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.find((c) => c.name === column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
