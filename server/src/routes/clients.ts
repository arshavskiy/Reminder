import { getDb } from "../db/db";

export function registerClientRoutes(
  router: Map<string, (req: Request) => Promise<Response>>
) {
  // GET /api/clients
  router.set("GET /api/clients", async (req) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const limit = parseInt(url.searchParams.get("limit") ?? "50");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    const db = getDb();

    const where = q ? "WHERE display_name LIKE ? OR email LIKE ?" : "";
    const params = q ? [`%${q}%`, `%${q}%`, limit, offset] : [limit, offset];
    const countParams = q ? [`%${q}%`, `%${q}%`] : [];

    const rows = db
      .prepare(`SELECT * FROM clients ${where} ORDER BY display_name ASC LIMIT ? OFFSET ?`)
      .all(...params);
    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM clients ${where}`)
      .get(...countParams) as { total: number };

    return json({ rows, total });
  });

  // GET /api/clients/:id
  router.set("GET /api/clients/:id", async (req) => {
    const id = extractId(req.url, "/api/clients/");
    const db = getDb();
    const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
    if (!client) return notFound();

    const doc_count = (
      db
        .prepare("SELECT COUNT(*) AS n FROM document_clients WHERE client_id = ?")
        .get(id) as { n: number }
    ).n;
    const contract_count = (
      db
        .prepare("SELECT COUNT(*) AS n FROM contracts WHERE client_id = ?")
        .get(id) as { n: number }
    ).n;
    const open_reminder_count = (
      db
        .prepare("SELECT COUNT(*) AS n FROM reminders WHERE client_id = ? AND status = 'pending'")
        .get(id) as { n: number }
    ).n;

    return json({ ...client, doc_count, contract_count, open_reminder_count });
  });

  // POST /api/clients
  router.set("POST /api/clients", async (req) => {
    const body = (await req.json()) as Record<string, unknown>;
    const db = getDb();
    const r = db
      .prepare(
        `INSERT INTO clients (display_name, entity_type, id_number, email, phone, address, notes, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.display_name,
        body.entity_type ?? "person",
        body.id_number ?? null,
        body.email ?? null,
        body.phone ?? null,
        body.address ?? null,
        body.notes ?? null,
        body.tags ?? null
      );
    return json(db.prepare("SELECT * FROM clients WHERE id = ?").get(r.lastInsertRowid), 201);
  });

  // PUT /api/clients/:id
  router.set("PUT /api/clients/:id", async (req) => {
    const id = extractId(req.url, "/api/clients/");
    const body = (await req.json()) as Record<string, unknown>;
    const db = getDb();
    db.prepare(
      `UPDATE clients SET display_name=COALESCE(?,display_name), entity_type=COALESCE(?,entity_type),
       id_number=COALESCE(?,id_number), email=COALESCE(?,email), phone=COALESCE(?,phone),
       address=COALESCE(?,address), notes=COALESCE(?,notes), tags=COALESCE(?,tags),
       updated_at=datetime('now') WHERE id=?`
    ).run(
      body.display_name ?? null,
      body.entity_type ?? null,
      body.id_number ?? null,
      body.email ?? null,
      body.phone ?? null,
      body.address ?? null,
      body.notes ?? null,
      body.tags ?? null,
      id
    );
    return json(db.prepare("SELECT * FROM clients WHERE id = ?").get(id));
  });

  // DELETE /api/clients/:id
  router.set("DELETE /api/clients/:id", async (req) => {
    const id = extractId(req.url, "/api/clients/");
    getDb().prepare("DELETE FROM clients WHERE id = ?").run(id);
    return json({ ok: true });
  });

  // GET /api/clients/:id/timeline
  router.set("GET /api/clients/:id/timeline", async (req) => {
    const id = extractId(req.url, "/api/clients/", "/timeline");
    const rows = getDb()
      .prepare("SELECT * FROM timeline_events WHERE client_id = ? ORDER BY event_date DESC LIMIT 100")
      .all(id);
    return json(rows);
  });

  // GET /api/clients/:id/documents
  router.set("GET /api/clients/:id/documents", async (req) => {
    const id = extractId(req.url, "/api/clients/", "/documents");
    const rows = getDb()
      .prepare(
        `SELECT d.* FROM documents d
         JOIN document_clients dc ON dc.document_id = d.id
         WHERE dc.client_id = ? ORDER BY d.import_date DESC`
      )
      .all(id);
    return json(rows);
  });
}

function extractId(url: string, prefix: string, suffix = ""): number {
  const path = new URL(url).pathname;
  return parseInt(path.replace(prefix, "").replace(suffix, ""));
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function notFound() {
  return json({ error: "Not found" }, 404);
}
