import { getDb } from "../db/db.js";
import { generateContractReminders } from "../reminders/scheduler.js";

export function registerContractRoutes(
  router: Map<string, (req: Request) => Promise<Response>>
) {
  // GET /api/contracts
  router.set("GET /api/contracts", async (req) => {
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId");
    const status = url.searchParams.get("status");
    const limit = parseInt(url.searchParams.get("limit") ?? "50");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    const db = getDb();

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (clientId) { conditions.push("c.client_id = ?"); params.push(clientId); }
    if (status) { conditions.push("c.status = ?"); params.push(status); }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const rows = db
      .prepare(
        `SELECT c.*, cl.display_name AS client_name, d.file_name AS document_name
         FROM contracts c
         LEFT JOIN clients cl ON cl.id = c.client_id
         LEFT JOIN documents d ON d.id = c.document_id
         ${where} ORDER BY c.expiry_date ASC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM contracts c ${where}`)
      .get(...params) as { total: number };

    return json({ rows, total });
  });

  // GET /api/contracts/expiring
  router.set("GET /api/contracts/expiring", async (req) => {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get("days") ?? "30");
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT c.*, cl.display_name AS client_name, d.file_name AS document_name
         FROM contracts c
         LEFT JOIN clients cl ON cl.id = c.client_id
         LEFT JOIN documents d ON d.id = c.document_id
         WHERE c.status = 'active'
           AND c.expiry_date IS NOT NULL
           AND c.expiry_date BETWEEN date('now') AND date('now', '+' || ? || ' days')
         ORDER BY c.expiry_date ASC`
      )
      .all(days);
    return json(rows);
  });

  // GET /api/contracts/:id
  router.set("GET /api/contracts/:id", async (req) => {
    const id = extractId(req.url, "/api/contracts/");
    const db = getDb();
    const row = db
      .prepare(
        `SELECT c.*, cl.display_name AS client_name, d.file_name AS document_name
         FROM contracts c
         LEFT JOIN clients cl ON cl.id = c.client_id
         LEFT JOIN documents d ON d.id = c.document_id
         WHERE c.id = ?`
      )
      .get(id);
    if (!row) return notFound();
    return json(row);
  });

  // PUT /api/contracts/:id
  router.set("PUT /api/contracts/:id", async (req) => {
    const id = extractId(req.url, "/api/contracts/");
    const body = (await req.json()) as Record<string, unknown>;
    const db = getDb();
    db.prepare(
      `UPDATE contracts SET
         contract_number=COALESCE(?,contract_number),
         contract_type=COALESCE(?,contract_type),
         start_date=COALESCE(?,start_date),
         expiry_date=COALESCE(?,expiry_date),
         amount=COALESCE(?,amount),
         currency=COALESCE(?,currency),
         counterparty=COALESCE(?,counterparty),
         summary=COALESCE(?,summary),
         status=COALESCE(?,status),
         updated_at=datetime('now')
       WHERE id=?`
    ).run(
      body.contract_number ?? null,
      body.contract_type ?? null,
      body.start_date ?? null,
      body.expiry_date ?? null,
      body.amount ?? null,
      body.currency ?? null,
      body.counterparty ?? null,
      body.summary ?? null,
      body.status ?? null,
      id
    );

    // Regenerate reminders if expiry changed
    if (body.expiry_date) {
      const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(id) as {
        client_id: number | null;
        document_id: number;
        expiry_date: string;
      };
      generateContractReminders(id, contract.client_id, contract.document_id, String(body.expiry_date));
    }

    return json(db.prepare("SELECT * FROM contracts WHERE id = ?").get(id));
  });

  // DELETE /api/contracts/:id
  router.set("DELETE /api/contracts/:id", async (req) => {
    getDb().prepare("DELETE FROM contracts WHERE id = ?").run(extractId(req.url, "/api/contracts/"));
    return json({ ok: true });
  });
}

function extractId(url: string, prefix: string): number {
  return parseInt(new URL(url).pathname.replace(prefix, ""));
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function notFound() {
  return json({ error: "Not found" }, 404);
}
