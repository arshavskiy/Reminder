import { getSettings, saveSettings } from "../settings";
import type { AppSettings } from "../settings";

type OnSettingsSaved = (settings: AppSettings) => void;
let _onSaved: OnSettingsSaved | undefined;

export function registerSettingsRoutes(
  router: Map<string, (req: Request) => Promise<Response>>,
  onSaved?: OnSettingsSaved
) {
  _onSaved = onSaved;

  router.set("GET /api/settings", async () => {
    return json(getSettings());
  });

  router.set("POST /api/settings", async (req) => {
    const body = (await req.json()) as Partial<AppSettings>;
    const current = getSettings();
    const updated = { ...current, ...body };
    saveSettings(updated);
    _onSaved?.(updated);
    return json(updated);
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
