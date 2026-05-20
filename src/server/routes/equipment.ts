import { getDb } from "../db/db.js";
import type { Equipment, EquipmentCategory } from "../../shared/types.js";

export function registerEquipmentRoutes(
  router: Map<string, (req: Request) => Promise<Response>>
) {
  // GET /api/equipment  — optional ?category=lift filter
  router.set("GET /api/equipment", async (req) => {
    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const search = url.searchParams.get("q");
    const db = getDb();

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (category && category !== "all") {
      conditions.push("category = ?");
      params.push(category);
    }
    if (search) {
      conditions.push("(name LIKE ? OR manufacturer LIKE ? OR model LIKE ?)");
      const p = `%${search}%`;
      params.push(p, p, p);
    }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const rows = db
      .prepare(`SELECT * FROM equipment ${where} ORDER BY name ASC`)
      .all(...params);
    return json(rows);
  });

  // GET /api/equipment/stats  — count per category for the UI chips
  router.set("GET /api/equipment/stats", async () => {
    const db = getDb();
    const counts = db
      .prepare(
        `SELECT category, COUNT(*) AS n FROM equipment WHERE is_active = 1 GROUP BY category`
      )
      .all() as Array<{ category: EquipmentCategory; n: number }>;
    const total = (db.prepare("SELECT COUNT(*) AS n FROM equipment WHERE is_active = 1").get() as { n: number }).n;
    const map: Record<string, number> = { all: total };
    for (const c of counts) map[c.category] = c.n;
    return json(map);
  });

  // GET /api/equipment/:id
  router.set("GET /api/equipment/:id", async (req) => {
    const id = idFromUrl(req.url, "/api/equipment/");
    const row = getDb().prepare("SELECT * FROM equipment WHERE id = ?").get(id);
    if (!row) return notFound();
    return json(row);
  });

  // POST /api/equipment
  router.set("POST /api/equipment", async (req) => {
    const body = (await req.json()) as Partial<Equipment>;
    if (!body.name) return badRequest("name required");
    const db = getDb();
    const r = db
      .prepare(
        `INSERT INTO equipment (name, category, manufacturer, model, capacity, description, notes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.name,
        body.category ?? "other",
        body.manufacturer ?? null,
        body.model ?? null,
        body.capacity ?? null,
        body.description ?? null,
        body.notes ?? null,
        body.is_active ?? 1
      );
    return json(db.prepare("SELECT * FROM equipment WHERE id = ?").get(r.lastInsertRowid), 201);
  });

  // PUT /api/equipment/:id
  router.set("PUT /api/equipment/:id", async (req) => {
    const id = idFromUrl(req.url, "/api/equipment/");
    const body = (await req.json()) as Partial<Equipment>;
    const db = getDb();
    db.prepare(
      `UPDATE equipment SET
         name = COALESCE(?, name),
         category = COALESCE(?, category),
         manufacturer = COALESCE(?, manufacturer),
         model = COALESCE(?, model),
         capacity = COALESCE(?, capacity),
         description = COALESCE(?, description),
         notes = COALESCE(?, notes),
         is_active = COALESCE(?, is_active),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      body.name ?? null,
      body.category ?? null,
      body.manufacturer ?? null,
      body.model ?? null,
      body.capacity ?? null,
      body.description ?? null,
      body.notes ?? null,
      body.is_active ?? null,
      id
    );
    return json(db.prepare("SELECT * FROM equipment WHERE id = ?").get(id));
  });

  // DELETE /api/equipment/:id
  router.set("DELETE /api/equipment/:id", async (req) => {
    const id = idFromUrl(req.url, "/api/equipment/");
    getDb().prepare("DELETE FROM equipment WHERE id = ?").run(id);
    return json({ ok: true });
  });
}

function idFromUrl(url: string, prefix: string): number {
  return parseInt(new URL(url).pathname.replace(prefix, ""));
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function notFound() { return json({ error: "Not found" }, 404); }
function badRequest(msg: string) { return json({ error: msg }, 400); }
