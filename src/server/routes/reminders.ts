import { getDb } from "../db/db.js";
import { sendReminderEmail } from "../reminders/emailSender.js";
import type { ReminderWithContext, WsEvent } from "../../shared/types.js";

export function registerReminderRoutes(
  router: Map<string, (req: Request, push: (e: WsEvent) => void) => Promise<Response>>,
  push: (e: WsEvent) => void
) {
  // GET /api/reminders
  router.set("GET /api/reminders", async (req) => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const days = url.searchParams.get("days");
    const limit = parseInt(url.searchParams.get("limit") ?? "50");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    const db = getDb();

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (status) { conditions.push("r.status = ?"); params.push(status); }
    if (days) {
      conditions.push("r.trigger_date BETWEEN date('now') AND date('now', '+' || ? || ' days')");
      params.push(days);
    }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const rows = db
      .prepare(
        `SELECT r.*, c.display_name AS client_name, d.file_name AS document_name
         FROM reminders r
         LEFT JOIN clients c ON c.id = r.client_id
         LEFT JOIN documents d ON d.id = r.document_id
         ${where} ORDER BY r.trigger_date ASC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM reminders r ${where}`)
      .get(...params) as { total: number };

    return json({ rows, total });
  });

  // POST /api/reminders
  router.set("POST /api/reminders", async (req) => {
    const body = (await req.json()) as Record<string, unknown>;
    const db = getDb();
    const r = db
      .prepare(
        `INSERT INTO reminders (source_type, source_id, client_id, document_id,
                                trigger_date, advance_days, title, body, email_to, email_template_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.source_type ?? "manual",
        body.source_id ?? null,
        body.client_id ?? null,
        body.document_id ?? null,
        body.trigger_date,
        body.advance_days ?? 0,
        body.title,
        body.body ?? null,
        body.email_to ?? null,
        body.email_template_id ?? null
      );
    return json(db.prepare("SELECT * FROM reminders WHERE id = ?").get(r.lastInsertRowid), 201);
  });

  // PUT /api/reminders/:id
  router.set("PUT /api/reminders/:id", async (req) => {
    const id = extractId(req.url, "/api/reminders/");
    const body = (await req.json()) as Record<string, unknown>;
    const db = getDb();
    db.prepare(
      `UPDATE reminders SET
         title=COALESCE(?,title), body=COALESCE(?,body), trigger_date=COALESCE(?,trigger_date),
         email_to=COALESCE(?,email_to), status=COALESCE(?,status),
         email_template_id=COALESCE(?,email_template_id),
         updated_at=datetime('now')
       WHERE id=?`
    ).run(
      body.title ?? null, body.body ?? null, body.trigger_date ?? null,
      body.email_to ?? null, body.status ?? null,
      body.email_template_id ?? null,
      id
    );
    return json(db.prepare("SELECT * FROM reminders WHERE id = ?").get(id));
  });

  // POST /api/reminders/:id/dismiss
  router.set("POST /api/reminders/:id/dismiss", async (req) => {
    const id = extractId(req.url, "/api/reminders/", "/dismiss");
    getDb()
      .prepare(`UPDATE reminders SET status='dismissed', updated_at=datetime('now') WHERE id=?`)
      .run(id);
    return json({ ok: true });
  });

  // POST /api/reminders/:id/snooze
  router.set("POST /api/reminders/:id/snooze", async (req) => {
    const id = extractId(req.url, "/api/reminders/", "/snooze");
    const { until } = (await req.json()) as { until: string };
    getDb()
      .prepare(
        `UPDATE reminders SET status='snoozed', snoozed_until=?, trigger_date=?, updated_at=datetime('now') WHERE id=?`
      )
      .run(until, until, id);
    return json({ ok: true });
  });

  // POST /api/reminders/:id/send-now
  router.set("POST /api/reminders/:id/send-now", async (req) => {
    const id = extractId(req.url, "/api/reminders/", "/send-now");
    const db = getDb();
    const reminder = db
      .prepare(
        `SELECT r.*, c.display_name AS client_name, d.file_name AS document_name, c.email AS client_email
         FROM reminders r
         LEFT JOIN clients c ON c.id = r.client_id
         LEFT JOIN documents d ON d.id = r.document_id
         WHERE r.id = ?`
      )
      .get(id) as (ReminderWithContext & { client_email?: string }) | null;

    if (!reminder) return notFound();

    let recipients: string[] = [];
    try { recipients = reminder.email_to ? JSON.parse(reminder.email_to) : []; } catch { recipients = []; }
    if (recipients.length === 0 && reminder.client_email) recipients = [reminder.client_email];

    const result = await sendReminderEmail(reminder, recipients);

    if (result.success) {
      db.prepare(`UPDATE reminders SET status='sent', updated_at=datetime('now') WHERE id=?`).run(id);
      db.prepare(
        `INSERT INTO email_log (reminder_id, to_address, subject, sent_at, success, smtp_host)
         VALUES (?, ?, ?, datetime('now'), 1, ?)`
      ).run(id, recipients.join(", "), `[תזכורת] ${reminder.title}`, "manual");
      push({ type: "reminder:fired", reminderId: id, clientId: reminder.client_id, title: reminder.title });
    }

    return json(result);
  });
}

function extractId(url: string, prefix: string, suffix = ""): number {
  return parseInt(new URL(url).pathname.replace(prefix, "").replace(suffix, ""));
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function notFound() {
  return json({ error: "Not found" }, 404);
}
