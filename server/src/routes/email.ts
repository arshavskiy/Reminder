import { getDb } from "../db/db";
import { sendTestEmail } from "../reminders/emailSender";

export function registerEmailRoutes(router: Map<string, (req: Request) => Promise<Response>>) {
  router.set("GET /api/email-log", async (req) => {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "50");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM email_log ORDER BY sent_at DESC LIMIT ? OFFSET ?")
      .all(limit, offset);
    const { total } = db.prepare("SELECT COUNT(*) AS total FROM email_log").get() as { total: number };
    return json({ rows, total });
  });

  router.set("POST /api/email/test", async (req) => {
    const { to, templateId } = (await req.json()) as { to: string; templateId?: number | null };
    if (!to) return json({ error: "to required" }, 400);
    const result = await sendTestEmail(to, templateId ?? null);
    return json(result);
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
