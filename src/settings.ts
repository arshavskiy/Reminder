import {join} from "path";
import type {AppSettings} from "../src/shared/types.js";

export type { AppSettings };

function resolveDataDir(): string {
  return process.env.DATA_DIR ?? join(process.cwd(), "data");
}

export function getDataDir(): string {
  return resolveDataDir();
}

function buildSettings(): AppSettings {
  return {
    theme: "light",
    port: parseInt(process.env.PORT ?? "3737"),

    aiBackend: (process.env.AI_BACKEND as "openai" | "ollama") ?? "openai",
    openAiKey: process.env.OPENAI_LOCAL_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.1",

    ocrLanguage: process.env.OCR_LANGUAGE ?? "heb+eng",
    autoExtract: process.env.AUTO_EXTRACT !== "false",
    extractionMaxChars: parseInt(process.env.EXTRACTION_MAX_CHARS ?? "8000"),

    smtpHost: process.env.SMTP_HOST ?? "",
    smtpPort: parseInt(process.env.SMTP_PORT ?? "587"),
    smtpSecure: process.env.SMTP_SECURE === "true",
    smtpUser: process.env.SMTP_USER ?? "",
    smtpPass: process.env.SMTP_PASS ?? "",
    smtpRejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "false",
    emailFrom: process.env.EMAIL_FROM ?? "",
    emailFromName: process.env.EMAIL_FROM_NAME ?? "ReminderOCR",

    reminderEnabled: process.env.REMINDER_ENABLED !== "false",
    reminderAdvanceDays: [30], // per-user value lives in user_settings.reminder_advance_days
    reminderCheckIntervalMs: parseInt(process.env.REMINDER_CHECK_INTERVAL_MS ?? "60000"),
    testEmail: process.env.TEST_EMAIL ?? "",
    testEmailTemplateId: process.env.TEST_EMAIL_TEMPLATE_ID ? parseInt(process.env.TEST_EMAIL_TEMPLATE_ID) : null,

    watchFolderEnabled: process.env.WATCH_FOLDER_ENABLED === "true",
    watchFolder: process.env.WATCH_FOLDER ?? "",

    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3737/auth/google/callback",
    sessionSecret: process.env.SESSION_SECRET ?? "",
    allowedEmails: process.env.ALLOWED_EMAILS ? process.env.ALLOWED_EMAILS.split(",").map(e => e.trim()).filter(Boolean) : [],

    allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim()).filter(Boolean) : [],

    userDocumentLimit: parseInt(process.env.USER_DOCUMENT_LIMIT ?? "25"),
    processOnly: process.env.PROCESS_ONLY === "true",
  };
}

let _settings: AppSettings | null = null;

export function loadSettings(): AppSettings {
  if (!_settings) _settings = buildSettings();
  return _settings;
}

export function getSettings(): AppSettings {
  return loadSettings();
}

// No-op kept for call-site compatibility — settings are env-only now
export function saveSettings(_settings: AppSettings): void {}
export function setSetting<K extends keyof AppSettings>(_key: K, _value: AppSettings[K]): AppSettings {
  return getSettings();
}
