import express from "express";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {HTTPException, requireAuth} from "../auth/middleware";

function flatDoc(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}

/**
 * In-app notification center backing the bell icon.
 *
 * GET /api/notifications reads the `notifications` collection for the signed-in
 * user (cookie session). Rows are inserted when a personal reminder is created
 * (createPersonalReminder) and again when it becomes due
 * (handlePersonalReminderDue). Mark-read updates `read_at` on those documents.
 */
export function registerNotificationRoutes(app: express.Application) {
  // GET /api/notifications — most recent first, capped, with unread count.
  app.get("/api/notifications", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const [items, unreadCount] = await Promise.all([
      col("notifications").find({ user_id: userId }).sort({ created_at: -1 }).limit(50).toArray(),
      col("notifications").countDocuments({ user_id: userId, read_at: null }),
    ]);
    res.json({ items: items.map(flatDoc), unreadCount });
  });

  // POST /api/notifications/:id/read
  app.post("/api/notifications/:id/read", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    let id: ObjectId;
    try {
      id = new ObjectId(req.params.id);
    } catch {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    await col("notifications").updateOne(
      { _id: id, user_id: userId } as any,
      { $set: { read_at: new Date() } },
    );
    res.json({ ok: true });
  });

  // POST /api/notifications/read-all
  app.post("/api/notifications/read-all", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    await col("notifications").updateMany(
      { user_id: userId, read_at: null } as any,
      { $set: { read_at: new Date() } },
    );
    res.json({ ok: true });
  });
}
