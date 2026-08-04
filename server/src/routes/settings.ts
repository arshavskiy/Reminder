import express from "express";
import { getSettings } from "../settings";
import { requireAuth, requireRole } from "../auth/middleware";

export function registerSettingsRoutes(app: express.Application) {
  // Public config — non-sensitive values any authenticated client may read
  app.get("/api/config", async (req, res) => {
    try {
      await requireAuth(req.headers.cookie ?? undefined);
    } catch (err: any) {
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }
    const s = getSettings();
    res.json({ userDocumentLimit: s.userDocumentLimit });
  });

  // GET /api/settings — admin read of current settings (from env)
  app.get("/api/settings", async (req, res) => {
    try {
      const auth = await requireAuth(req.headers.cookie ?? undefined);
      requireRole(auth, "admin");
    } catch (err: any) {
      res.status(err.status ?? 403).json({ error: err.message });
      return;
    }
    const s = getSettings();
    // Strip secrets before returning
    const { openAiKey, smtpPass, googleClientSecret, sessionSecret, doSpacesSecret, ...safe } = s as any;
    res.json(safe);
  });

  // POST /api/settings — disabled; settings are env-only
  app.post("/api/settings", (_req, res) => {
    res.status(405).json({ error: "Settings are managed via environment variables. Use .env to configure the server." });
  });
}
