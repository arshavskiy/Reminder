import {join} from "path";
import type {AppSettings} from "../src/shared/types.js";

export type { AppSettings };

// ── Required env vars ─────────────────────────────────────────────────────────
// Call validateEnv() once at startup. Missing required vars abort the process.
const REQUIRED: Array<keyof NodeJS.ProcessEnv> = [
  "MONGODB_URI",
  "SESSION_SECRET",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "EMAIL_FROM",
  "OPENAI_LOCAL_API_KEY",
];

export function validateEnv(): void {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[settings] Missing required environment variables:\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }
}

// ── Pure env-based settings ───────────────────────────────────────────────────
function buildSettings(): AppSettings {
  return {
    theme: "light",
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3737,

    aiBackend: (process.env.AI_BACKEND as "openai" | "ollama") ?? "openai",
    openAiKey: process.env.OPENAI_LOCAL_API_KEY ?? "",
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "llama3",

    ocrLanguage: process.env.OCR_LANGUAGE ?? "heb+eng",
    autoExtract: process.env.AUTO_EXTRACT !== "false",
    extractionMaxChars: process.env.EXTRACTION_MAX_CHARS ? parseInt(process.env.EXTRACTION_MAX_CHARS, 10) : 12000,

    smtpHost: process.env.SMTP_HOST ?? "",
    smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    smtpSecure: process.env.SMTP_SECURE === "true",
    smtpUser: process.env.SMTP_USER ?? "",
    smtpPass: process.env.SMTP_PASS ?? "",
    smtpRejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "false",
    emailFrom: process.env.EMAIL_FROM ?? "",
    emailFromName: process.env.EMAIL_FROM_NAME ?? "ReminderOCR",

    reminderEnabled: process.env.REMINDER_ENABLED !== "false",
    reminderAdvanceDays: process.env.REMINDER_ADVANCE_DAYS
      ? process.env.REMINDER_ADVANCE_DAYS.split(",").map((d) => parseInt(d.trim(), 10)).filter((n) => Number.isFinite(n))
      : [30, 14, 3],
    reminderCheckIntervalMs: process.env.REMINDER_CHECK_INTERVAL_MS
      ? parseInt(process.env.REMINDER_CHECK_INTERVAL_MS, 10)
      : 3600000,
    testEmail: process.env.TEST_EMAIL ?? "",
    testEmailTemplateId: process.env.TEST_EMAIL_TEMPLATE_ID ? parseInt(process.env.TEST_EMAIL_TEMPLATE_ID, 10) : null,

    watchFolderEnabled: process.env.WATCH_FOLDER_ENABLED === "true",
    watchFolder: process.env.WATCH_FOLDER ?? "",

    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3737/auth/google/callback",
    sessionSecret: process.env.SESSION_SECRET ?? "",
    allowedEmails: process.env.ALLOWED_EMAILS
      ? process.env.ALLOWED_EMAILS.split(",").map((e) => e.trim()).filter(Boolean)
      : [],

    doSpacesKey: process.env.ACCESS_KEY_ID ?? process.env.DO_SPACES_KEY ?? "",
    doSpacesSecret: process.env.SECRET_ACCESS_KEY ?? process.env.DO_SPACES_SECRET ?? "",
    doSpacesEndpoint: process.env.ENDPOINT ?? process.env.DO_SPACES_ENDPOINT ?? "",
    doSpacesBucket: process.env.BUCKET ?? process.env.DO_SPACES_BUCKET ?? "",
    doSpacesRegion: process.env.REGION ?? process.env.DO_SPACES_REGION ?? "",

    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
      : [],

    userDocumentLimit: process.env.USER_DOCUMENT_LIMIT ? parseInt(process.env.USER_DOCUMENT_LIMIT, 10) : 25,

    escalationEmail: process.env.ESCALATION_EMAIL ?? "",
    escalationThresholdDays: process.env.ESCALATION_THRESHOLD_DAYS
      ? parseInt(process.env.ESCALATION_THRESHOLD_DAYS, 10)
      : 3,
  };
}

// Singleton — built once per process, immutable after that.
let _settings: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (!_settings) _settings = buildSettings();
  return _settings;
}

// Kept for backwards compatibility — resolves to the data dir used by file storage.
export function getDataDir(): string {
  return process.env.DATA_DIR || join(process.cwd(), "data");
}

// Stubs retained so import sites don't break at compile time.
// They are no-ops: settings are read-only from env.
export function loadSettings(): AppSettings {
  return getSettings();
}

/** @deprecated settings are now env-only; this is a no-op */
export function saveSettings(_settings: AppSettings): void {
  // intentional no-op
}

/** @deprecated settings are now env-only; this is a no-op */
export function setSetting<K extends keyof AppSettings>(_key: K, _value: AppSettings[K]): AppSettings {
  return getSettings();
}
