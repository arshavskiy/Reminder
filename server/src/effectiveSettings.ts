/**
 * DB-backed settings overlay.
 *
 * Merges a `system_settings` MongoDB document (written by the admin UI) on top
 * of the env-based singleton from settings.ts.  Falls back silently to env-only
 * when the DB is unavailable (startup window, test runs, etc.).
 *
 * Resolution order:  system_settings DB doc  →  env vars  →  hardcoded defaults
 */
import type {AppSettings, SystemSettingsOverride} from "./shared/types.js";
import {getSettings} from "./settings.js";
import {getDb} from "./db/db.js";

// Fields that can be overridden from the admin UI.
// Secrets (openAiKey, smtpPass, OAuth creds, infra keys) are intentionally absent.
export const OVERRIDABLE_KEYS: ReadonlyArray<keyof SystemSettingsOverride> = [
  "aiBackend", "openAiModel", "ollamaUrl", "ollamaModel", "promptEditorModel",
  "ocrLanguage", "autoExtract", "extractionMaxChars", "genericExtractionPrompt",
  "reminderEnabled", "reminderAdvanceDays", "reminderCheckIntervalMs",
  "escalationEmail", "escalationThresholdDays",
  "watchFolderEnabled", "watchFolder",
  "smtpHost", "smtpPort", "smtpSecure", "smtpRejectUnauthorized",
  "smtpUser", "emailFrom", "emailFromName",
  "testEmail", "testEmailTemplateId", "userDocumentLimit",
];

// Short-lived in-process cache — avoids a DB round-trip on every OCR/AI call.
let _cache: {settings: AppSettings; expiresAt: number} | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

/** Invalidate the settings cache — call immediately after saving to system_settings. */
export function invalidateSettingsCache(): void {
  _cache = null;
}

/**
 * Returns effective settings: DB overrides merged onto env defaults.
 * Safe to call at any point — falls back to env-only if the DB is not ready.
 */
export async function getEffectiveSettings(): Promise<AppSettings> {
  const now = Date.now();
  if (_cache && now < _cache.expiresAt) return _cache.settings;

  const base = getSettings(); // env singleton — always available
  try {
    const db = getDb();
    const doc = await db.collection("system_settings").findOne({_id: "global" as any});
    if (!doc) {
      _cache = {settings: base, expiresAt: now + CACHE_TTL_MS};
      return base;
    }
    // Only merge known overridable keys — never let the DB inject secrets or unknown fields
    const merged: AppSettings = {...base};
    for (const key of OVERRIDABLE_KEYS) {
      if (doc[key] !== undefined && doc[key] !== null) {
        (merged as any)[key] = doc[key];
      }
    }
    _cache = {settings: merged, expiresAt: now + CACHE_TTL_MS};
    return merged;
  } catch {
    // DB not yet connected or unavailable — fall back to env silently
    return base;
  }
}
