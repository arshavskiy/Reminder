import express from "express";
import {col} from "../db/db";
import {requireAuth} from "../auth/middleware";

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
        reminder_advance_days: "[30]",
        ocr_language: "heb+eng",
        pipeline_ocr: true,
        pipeline_ai: true,
        pipeline_s3: true,
        pipeline_entities: true,
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
      pipeline_ocr?: boolean;
      pipeline_ai?: boolean;
      pipeline_s3?: boolean;
      pipeline_entities?: boolean;
    };

    const patch: Record<string, unknown> = {};
    if (body.theme !== undefined)                  patch.theme = body.theme;
    if (body.email_from_name !== undefined)        patch.email_from_name = body.email_from_name ?? null;
    if (body.reminder_advance_days !== undefined)  patch.reminder_advance_days = body.reminder_advance_days;
    if (body.ocr_language !== undefined)           patch.ocr_language = body.ocr_language;
    if (body.pipeline_ocr !== undefined)           patch.pipeline_ocr = body.pipeline_ocr;
    if (body.pipeline_ai !== undefined)            patch.pipeline_ai = body.pipeline_ai;
    if (body.pipeline_s3 !== undefined)            patch.pipeline_s3 = body.pipeline_s3;
    if (body.pipeline_entities !== undefined)      patch.pipeline_entities = body.pipeline_entities;

    await col("user_settings").updateOne(
      { user_id: auth.userId },
      {
        $set: patch,
        $setOnInsert: { user_id: auth.userId },
      },
      { upsert: true }
    );

    const row = await col("user_settings").findOne({ user_id: auth.userId });
    const { _id, ...rest } = (row ?? {}) as any;
    res.json({ id: _id?.toString(), ...rest });
  });
}
