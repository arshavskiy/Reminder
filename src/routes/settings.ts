import express from "express";
import type {AppSettings} from "../settings";
import {getSettings, saveSettings} from "../settings";
import {requireAuth, requireRole} from "../auth/middleware";

type OnSettingsSaved = (settings: AppSettings) => void;
let _onSaved: OnSettingsSaved | undefined;

export function registerSettingsRoutes(
  app: express.Application,
  onSaved?: OnSettingsSaved
) {
  _onSaved = onSaved;

  app.get("/api/settings", async (req, res) => {
    try {
      const auth = await requireAuth(req.headers.cookie ?? undefined);
      requireRole(auth, "admin");
    } catch (err: any) {
      res.status(err.status ?? 403).json({ error: err.message });
      return;
    }
    res.json(getSettings());
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const auth = await requireAuth(req.headers.cookie ?? undefined);
      requireRole(auth, "admin");
    } catch (err: any) {
      res.status(err.status ?? 403).json({ error: err.message });
      return;
    }
    const body = req.body as Partial<AppSettings>;
    const current = getSettings();
    const updated = { ...current, ...body };
    saveSettings(updated);
    _onSaved?.(updated);
    res.json(updated);
  });
}
