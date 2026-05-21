import { getDb } from "../db/db";

export function registerTaskRoutes(router: Map<string, (req: Request) => Promise<Response>>) {
  // GET /api/tasks
  router.set("GET /api/tasks", async (req) => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const clientId = url.searchParams.get("clientId");
    const db = getDb();

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (status) { conditions.push("t.status = ?"); params.push(status); }
    if (clientId) { conditions.push("t.client_id = ?"); params.push(clientId); }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const rows = db
      .prepare(
        `SELECT t.*, c.display_name AS client_name
         FROM tasks t LEFT JOIN clients c ON c.id = t.client_id
         ${where} ORDER BY t.due_date ASC`
      )
      .all(...params);
    return json(rows);
  });

  // PUT /api/tasks/:id
  router.set("PUT /api/tasks/:id", async (req) => {
    const id = parseInt(new URL(req.url).pathname.replace("/api/tasks/", ""));
    const body = (await req.json()) as Record<string, unknown>;
    const db = getDb();
    db.prepare(
      `UPDATE tasks SET description=COALESCE(?,description), due_date=COALESCE(?,due_date),
       status=COALESCE(?,status), updated_at=datetime('now') WHERE id=?`
    ).run(body.description ?? null, body.due_date ?? null, body.status ?? null, id);
    return json(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id));
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
