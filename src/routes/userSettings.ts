import express from "express";
import { col } from "../db/db";
import { requireAuth } from "../auth/middleware";

export function registerUserSettingsRoutes(app: express.Application) {
  app.get("/api/user-settings", async (req, res) => {
    let auth;
    try {
      auth = await requireAuth(req.headers.cookie ?? undefined);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const row = await col("user_settings").findOne({ user_id: auth.userId });
    if (!row) {
      const defaults = {
        user_id: auth.userId,
        theme: "light",
        email_from_name: null,
        reminder_advance_days: "[90,60,30]",
        ocr_language: "heb+eng",
      };
      await col("user_settings").updateOne(
        { user_id: auth.userId },
        { $setOnInsert: defaults },
        { upsert: true }
      );
      res.json(defaults);
      return;
    }
    const { _id, ...rest } = row as any;
    res.json({ id: _id?.toString(), ...rest });
  });

  app.put("/api/user-settings", async (req, res) => {
    let auth;
    try {
      auth = await requireAuth(req.headers.cookie ?? undefined);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = req.body as {
      theme?: string;
      email_from_name?: string;
      reminder_advance_days?: string;
      ocr_language?: string;
    };

    await col("user_settings").updateOne(
      { user_id: auth.userId },
      {
        $set: {
          theme: body.theme ?? "light",
          email_from_name: body.email_from_name ?? null,
          reminder_advance_days: body.reminder_advance_days ?? "[90,60,30]",
          ocr_language: body.ocr_language ?? "heb+eng",
        },
        $setOnInsert: { user_id: auth.userId },
      },
      { upsert: true }
    );

    const row = await col("user_settings").findOne({ user_id: auth.userId });
    const { _id, ...rest } = (row ?? {}) as any;
    res.json({ id: _id?.toString(), ...rest });
  });
}
