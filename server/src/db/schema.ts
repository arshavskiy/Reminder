import type { Database } from "bun:sqlite";

export function applySchema(db: Database) {
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  // ── Phase 2: Multi-user Authentication ──────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      google_sub      TEXT NOT NULL UNIQUE,
      email           TEXT NOT NULL UNIQUE,
      name            TEXT,
      picture_url     TEXT,
      role            TEXT NOT NULL DEFAULT 'user',
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at   TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id              TEXT PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at      TEXT NOT NULL,
      user_agent      TEXT,
      ip              TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_exp  ON sessions (expires_at)`);

  // OAuth PKCE state store — persisted so server restarts don't break the flow
  db.run(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state         TEXT PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      expires_at    TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme                TEXT DEFAULT 'light',
      email_from_name      TEXT,
      reminder_advance_days TEXT DEFAULT '[90,60,30]',
      ocr_language         TEXT DEFAULT 'heb+eng'
    )
  `);

  // Add user_id to existing tables (Phase 2 scoping)
  addColumnIfMissing(db, "documents", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
  addColumnIfMissing(db, "clients", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
  addColumnIfMissing(db, "contracts", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
  addColumnIfMissing(db, "reminders", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
  addColumnIfMissing(db, "tasks", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
  addColumnIfMissing(db, "extractions", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
  addColumnIfMissing(db, "email_log", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
  addColumnIfMissing(db, "timeline_events", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");

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
  addColumnIfMissing(db, "documents", "extracted_fields", "TEXT"); // JSON blob of dynamic fields
  addColumnIfMissing(db, "documents", "template_id", "INTEGER");   // FK to doc_templates

  // Per-reminder email template override. When null, scheduler falls back to
  // the doc-template-bound template, then to the global default.
  addColumnIfMissing(db, "reminders", "email_template_id", "INTEGER");

  // ── Equipment catalogue ────────────────────────────────────────────────────
  // Reusable equipment definitions (e.g. lifts, cranes, hoists) that the user
  // can attach to clients/contracts. The spec calls this "הגדרת ציוד".
  db.run(`
    CREATE TABLE IF NOT EXISTS equipment (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      category        TEXT NOT NULL DEFAULT 'other',
      manufacturer    TEXT,
      model           TEXT,
      capacity        TEXT,
      description     TEXT,
      notes           TEXT,
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment (category)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_equipment_active   ON equipment (is_active)`);
  // Remove accidental duplicates (keep the earliest id per name+category) and
  // add a UNIQUE index to enforce the constraint going forward. This makes the
  // seeding and subsequent server restarts idempotent even if old DBs contain
  // duplicate seed rows.
  // NOTE: deleting rows is destructive for duplicates — a backup is recommended
  // before running this in production.
  db.run("DELETE FROM equipment WHERE id NOT IN (SELECT MIN(id) FROM equipment GROUP BY name, category);");
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_unique_name_cat ON equipment (name, category);");

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

  // Phase 2: User scoping indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_documents_user   ON documents (user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_clients_user     ON clients (user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_contracts_user   ON contracts (user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reminders_user   ON reminders (user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_user       ON tasks (user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_extractions_user ON extractions (user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_email_log_user   ON email_log (user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_timeline_user    ON timeline_events (user_id)`);

  // ── Document templates ──────────────────────────────────────────────────────
  // User-defined "what to extract" recipes. The AI prompt is generated from these.
  // `match_keywords` is a JSON array of Hebrew keywords used to auto-pick a template
  // when a document is imported. `fields` is a JSON array describing each field.
  db.run(`
    CREATE TABLE IF NOT EXISTS doc_templates (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL UNIQUE,        -- Hebrew name e.g. "תסקיר בדיקה"
      description     TEXT,
      match_keywords  TEXT NOT NULL DEFAULT '[]',  -- JSON: ["תסקיר","בדיקה"]
      fields          TEXT NOT NULL DEFAULT '[]',  -- JSON Field[]
      expiry_field    TEXT,                        -- which field key drives reminders
      is_default      INTEGER NOT NULL DEFAULT 0,
      is_builtin      INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_doc_templates_name ON doc_templates (name)`);

  // ── Email templates ─────────────────────────────────────────────────────────
  // HTML email bodies bound (optionally) to a doc_template. When a reminder
  // fires we look up: 1) template matching the document's template_id, else
  // 2) any default template, else 3) the hardcoded fallback in emailSender.ts.
  db.run(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL UNIQUE,
      doc_template_id INTEGER REFERENCES doc_templates(id) ON DELETE SET NULL,
      subject         TEXT NOT NULL DEFAULT '[תזכורת] {{title}}',
      html            TEXT NOT NULL,               -- HTML with {{var}} placeholders
      logo_path       TEXT,                        -- path under data/assets/
      is_default      INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_email_templates_doc ON email_templates (doc_template_id)`);
}

function addColumnIfMissing(db: Database, table: string, column: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.find((c) => c.name === column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
