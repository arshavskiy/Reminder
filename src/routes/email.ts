import express from "express";
import { col } from "../db/db";
import { sendTestEmail } from "../reminders/emailSender";

export function registerEmailRoutes(app: express.Application) {
  app.get("/api/email-log", async (req, res) => {
    const limit = parseInt((req.query.limit as string) ?? "50");
    const offset = parseInt((req.query.offset as string) ?? "0");

    const [rows, total] = await Promise.all([
      col("email_log")
        .find({})
        .sort({ sent_at: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      col("email_log").countDocuments({}),
    ]);

    res.json({ rows: rows.map(docWithId), total });
  });

  app.post("/api/email/test", async (req, res) => {
    const { to, templateId } = req.body as { to: string; templateId?: string | null };
    if (!to) {
      res.status(400).json({ error: "to required" });
      return;
    }
    const result = await sendTestEmail(to, templateId ?? null);
    res.json(result);
  });
}

function docWithId(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}
