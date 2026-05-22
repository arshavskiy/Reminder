import express from "express";
import { getSettings, saveSettings } from "../settings";
import type { AppSettings } from "../settings";

type OnSettingsSaved = (settings: AppSettings) => void;
let _onSaved: OnSettingsSaved | undefined;

export function registerSettingsRoutes(
  app: express.Application,
  onSaved?: OnSettingsSaved
) {
  _onSaved = onSaved;

  app.get("/api/settings", async (_req, res) => {
    res.json(getSettings());
  });

  app.post("/api/settings", async (req, res) => {
    const body = req.body as Partial<AppSettings>;
    const current = getSettings();
    const updated = { ...current, ...body };
    saveSettings(updated);
    _onSaved?.(updated);
    res.json(updated);
  });
}
