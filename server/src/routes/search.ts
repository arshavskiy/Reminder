import { getDb } from "../db/db";
import { searchDocuments } from "../search/ftsSearch";

export function registerSearchRoutes(router: Map<string, (req: Request) => Promise<Response>>) {
  router.set("GET /api/search", async (req) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const limit = parseInt(url.searchParams.get("limit") ?? "20");
    if (!q.trim()) return json({ documents: [], clients: [], contracts: [] });

    const db = getDb();
    const documents = searchDocuments(q, limit);
    const clients = db
      .prepare(
        `SELECT id, display_name, email, phone FROM clients
         WHERE display_name LIKE ? OR email LIKE ? OR id_number LIKE ?
         LIMIT ?`
      )
      .all(`%${q}%`, `%${q}%`, `%${q}%`, limit);
    const contracts = db
      .prepare(
        `SELECT id, contract_number, contract_type, expiry_date FROM contracts
         WHERE contract_number LIKE ? OR contract_type LIKE ? OR counterparty LIKE ?
         LIMIT ?`
      )
      .all(`%${q}%`, `%${q}%`, `%${q}%`, limit);

    return json({ documents, clients, contracts });
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
