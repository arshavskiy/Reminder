import { getDb } from "../db/db";
import { requireAuth } from "../auth/middleware";

type Handler = (req: Request) => Promise<Response>;

export function registerUserSettingsRoutes(router: Map<string, Handler>) {
  router.set("GET /api/user-settings", async (req) => {
    const db = getDb();
    let auth;
    try { auth = requireAuth(db, req.headers.get("cookie") ?? undefined); }
    catch { return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } }); }

    const row = db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(auth.userId);
    if (!row) {
      const defaults = { user_id: auth.userId, theme: "light", email_from_name: null, reminder_advance_days: "[90,60,30]", ocr_language: "heb+eng" };
      db.prepare("INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)").run(auth.userId);
      return new Response(JSON.stringify(defaults), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(row), { headers: { "Content-Type": "application/json" } });
  });

  router.set("PUT /api/user-settings", async (req) => {
    const db = getDb();
    let auth;
    try { auth = requireAuth(db, req.headers.get("cookie") ?? undefined); }
    catch { return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } }); }

    const body = await req.json() as { theme?: string; email_from_name?: string; reminder_advance_days?: string; ocr_language?: string };

    db.prepare(`
      INSERT INTO user_settings (user_id, theme, email_from_name, reminder_advance_days, ocr_language)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        theme = excluded.theme,
        email_from_name = excluded.email_from_name,
        reminder_advance_days = excluded.reminder_advance_days,
        ocr_language = excluded.ocr_language
    `).run(
      auth.userId,
      body.theme ?? "light",
      body.email_from_name ?? null,
      body.reminder_advance_days ?? "[90,60,30]",
      body.ocr_language ?? "heb+eng",
    );

    const row = db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(auth.userId);
    return new Response(JSON.stringify(row), { headers: { "Content-Type": "application/json" } });
  });
}
