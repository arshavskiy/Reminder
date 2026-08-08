import express from "express";
import {getEffectiveSettings, invalidateSettingsCache, OVERRIDABLE_KEYS} from "../effectiveSettings.js";
import {requireAuth, requireRole} from "../auth/middleware.js";
import type {AuthContext} from "../auth/middleware.js";
import {col} from "../db/db.js";

const OVERRIDABLE_KEY_SET = new Set<string>(OVERRIDABLE_KEYS);
const SECRET_KEYS = new Set([
  "openAiKey", "smtpPass", "googleClientSecret", "sessionSecret", "doSpacesSecret",
]);

function stripSecrets(s: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(s).filter(([k]) => !SECRET_KEYS.has(k)));
}

export function registerSettingsRoutes(app: express.Application) {
  // GET /api/config — non-sensitive public config for any authenticated user
  app.get("/api/config", async (req, res) => {
    try {
      await requireAuth(req.headers.cookie ?? undefined);
    } catch (err: any) {
      res.status(err.status ?? 401).json({error: err.message});
      return;
    }
    const s = await getEffectiveSettings();
    res.json({
      userDocumentLimit: s.userDocumentLimit,
      appEnv: process.env.APP_ENV ?? "development",
      dbName: process.env.MONGODB_DB ?? "unknown",
    });
  });

  // GET /api/settings — admin: effective settings with per-field source annotation
  app.get("/api/settings", async (req, res) => {
    try {
      const auth = await requireAuth(req.headers.cookie ?? undefined);
      requireRole(auth, "admin");
    } catch (err: any) {
      res.status(err.status ?? 403).json({error: err.message});
      return;
    }
    const s = await getEffectiveSettings();
    const safe = stripSecrets(s as unknown as Record<string, unknown>);

    // Annotate which keys come from DB vs env so the UI can show a "DB" badge
    try {
      const doc = await col("system_settings").findOne({_id: "global" as any});
      const dbKeys = new Set(
        doc ? Object.keys(doc).filter(k => !["_id", "updatedAt", "updatedBy"].includes(k)) : []
      );
      safe._sources = Object.fromEntries(
        Object.keys(safe).map(k => [k, dbKeys.has(k) ? "db" : "env"])
      );
      safe._dbOverrideCount = dbKeys.size;
    } catch { /* non-critical */ }

    res.json(safe);
  });

  // POST /api/settings — admin: save overridable settings to DB
  app.post("/api/settings", async (req, res) => {
    let auth: AuthContext;
    try {
      auth = await requireAuth(req.headers.cookie ?? undefined);
      requireRole(auth, "admin");
    } catch (err: any) {
      res.status(err.status ?? 403).json({error: err.message});
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (OVERRIDABLE_KEY_SET.has(k) && v !== undefined) {
        updates[k] = v;
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({error: "No overridable fields in request body"});
      return;
    }

    await col("system_settings").updateOne(
      {_id: "global" as any},
      {$set: {...updates, updatedAt: new Date(), updatedBy: auth.userId}},
      {upsert: true}
    );

    invalidateSettingsCache();

    const s = await getEffectiveSettings();
    res.json(stripSecrets(s as unknown as Record<string, unknown>));
  });
}
