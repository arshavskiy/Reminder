import type { Database } from "bun:sqlite";

/**
 * One-time Phase 2 migration: backfill user_id for existing data
 *
 * This runs on first boot when the users table is empty.
 * It creates a default admin user and assigns all existing rows to them.
 */
export function runPhase2Migration(db: Database, adminEmail: string) {
  // Check if already done
  const userCount = db
    .prepare("SELECT COUNT(*) as cnt FROM users")
    .get() as { cnt: number };

  if (userCount.cnt > 0) {
    console.log("[migration] Phase 2 users table already populated, skipping backfill");
    return;
  }

  console.log("[migration] Running Phase 2 backfill for user_id scoping");

  try {
    // Create default admin user
    const stmt = db.prepare(`
      INSERT INTO users (google_sub, email, name, role, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    stmt.run("local-admin-001", adminEmail, "Administrator", "admin", 1);
    const adminUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(adminEmail) as { id: number };

    if (!adminUser) {
      throw new Error("Failed to create admin user");
    }

    const adminId = adminUser.id;
    console.log(`[migration] Created admin user id=${adminId} with email=${adminEmail}`);

    // Backfill all existing tables with user_id
    const tables = [
      "documents",
      "clients",
      "contracts",
      "reminders",
      "tasks",
      "extractions",
      "email_log",
      "timeline_events",
    ];

    for (const table of tables) {
      db.run(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`, [adminId]);
      const result = db
        .prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE user_id = ?`)
        .get(adminId) as { cnt: number };
      console.log(`[migration] ${table}: backfilled ${result.cnt} rows`);
    }

    // Create default user_settings for admin
    db.run(
      `
      INSERT INTO user_settings (user_id, theme, email_from_name, reminder_advance_days, ocr_language)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO NOTHING
    `,
      [adminId, "light", "Client Reminder", "[90,60,30]", "heb+eng"]
    );

    console.log("[migration] Phase 2 backfill complete");
  } catch (error) {
    console.error("[migration] Phase 2 backfill failed:", error);
    throw error;
  }
}

