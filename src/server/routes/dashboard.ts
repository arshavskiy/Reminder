import { getDb } from "../db/db.js";
import { join } from "path";
import { getDataDir } from "../settings.js";

export function registerDashboardRoutes(router: Map<string, (req: Request) => Promise<Response>>) {
  router.set("GET /api/dashboard/stats", async () => {
    const db = getDb();

    // Predicate: a row in `contracts` is an ACTUAL CONTRACT only when
    //   - the AI identified a contract_number (not just a document/report number), AND
    //   - the contract_type does NOT indicate an inspection report (תסקיר/בדיקה).
    // Inspection reports (תסקירים) live in the same table for reminder generation but
    // are counted separately in the UI.
    const IS_CONTRACT_SQL = `
      contract_number IS NOT NULL
      AND (
        contract_type IS NULL
        OR (contract_type NOT LIKE '%תסקיר%' AND contract_type NOT LIKE '%בדיקה%')
      )
    `;
    const IS_INSPECTION_SQL = `
      contract_type LIKE '%תסקיר%' OR contract_type LIKE '%בדיקה%'
    `;

    const total_documents = (db.prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number }).n;
    const total_clients = (db.prepare("SELECT COUNT(*) AS n FROM clients").get() as { n: number }).n;
    const total_contracts = (
      db.prepare(`SELECT COUNT(*) AS n FROM contracts WHERE ${IS_CONTRACT_SQL}`).get() as { n: number }
    ).n;
    const active_contracts = (
      db.prepare(`SELECT COUNT(*) AS n FROM contracts WHERE status = 'active' AND ${IS_CONTRACT_SQL}`).get() as { n: number }
    ).n;
    const total_inspections = (
      db.prepare(`SELECT COUNT(*) AS n FROM contracts WHERE ${IS_INSPECTION_SQL}`).get() as { n: number }
    ).n;
    const pending_reminders = (
      db.prepare("SELECT COUNT(*) AS n FROM reminders WHERE status = 'pending'").get() as { n: number }
    ).n;
    const expiring_soon = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM contracts
           WHERE status = 'active'
             AND expiry_date BETWEEN date('now') AND date('now', '+30 days')`
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
      total_inspections,
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
