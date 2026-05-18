import { getDb } from "../db/db.js";
import { join } from "path";
import { getDataDir } from "../settings.js";

export function registerDashboardRoutes(router: Map<string, (req: Request) => Promise<Response>>) {
  router.set("GET /api/dashboard/stats", async () => {
    const db = getDb();

    const total_documents = (db.prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number }).n;
    const total_clients = (db.prepare("SELECT COUNT(*) AS n FROM clients").get() as { n: number }).n;
    const total_contracts = (db.prepare("SELECT COUNT(*) AS n FROM contracts").get() as { n: number }).n;
    const active_contracts = (
      db.prepare("SELECT COUNT(*) AS n FROM contracts WHERE status = 'active'").get() as { n: number }
    ).n;
    const pending_reminders = (
      db.prepare("SELECT COUNT(*) AS n FROM reminders WHERE status = 'pending'").get() as { n: number }
    ).n;
    const expiring_soon = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM contracts
           WHERE status = 'active' AND expiry_date BETWEEN date('now') AND date('now', '+30 days')`
        )
        .get() as { n: number }
    ).n;

    const recent_documents = db
      .prepare("SELECT * FROM documents ORDER BY created_at DESC LIMIT 5")
      .all();

    const upcoming_reminders = db
      .prepare(
        `SELECT r.*, c.display_name AS client_name, d.file_name AS document_name
         FROM reminders r
         LEFT JOIN clients c ON c.id = r.client_id
         LEFT JOIN documents d ON d.id = r.document_id
         WHERE r.status = 'pending'
         ORDER BY r.trigger_date ASC LIMIT 10`
      )
      .all();

    return json({
      total_documents,
      total_clients,
      total_contracts,
      active_contracts,
      pending_reminders,
      expiring_soon,
      recent_documents,
      upcoming_reminders,
      dataDir: getDataDir(),
      dbPath: join(getDataDir(), "reminder.db"),
    });
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
