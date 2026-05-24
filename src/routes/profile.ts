import express from "express";
import {col} from "../db/db";
import {requireAuth} from "../auth/middleware";

export function registerProfileRoutes(app: express.Application) {
  // GET /api/profile/stats — real reminder counts for the logged-in user
  app.get("/api/profile/stats", async (req, res) => {
    let auth;
    try {
      auth = await requireAuth(req.headers.cookie ?? undefined);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [active, snoozed, sent] = await Promise.all([
      col("reminders").countDocuments({ user_id: auth.userId, status: "pending" }),
      col("reminders").countDocuments({ user_id: auth.userId, status: "snoozed" }),
      col("reminders").countDocuments({ user_id: auth.userId, status: "sent" }),
    ]);

    res.json({ active, snoozed, completed: sent });
  });
}
