import {join} from "path";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "fs";
import type {AppSettings} from "../src/shared/types.js";

export type { AppSettings };

const DEFAULTS: AppSettings = {
  theme: "light",
  port: 3737,

  aiBackend: "openai",
  openAiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: "gpt-4o-mini",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3.1",

  ocrLanguage: "heb+eng",
  autoExtract: true,
  extractionMaxChars: 8000,

  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpRejectUnauthorized: true,
  emailFrom: process.env.EMAIL_FROM ?? "",
  emailFromName: process.env.EMAIL_FROM_NAME ?? " ReminderOCR ",

  reminderEnabled: true,
  reminderAdvanceDays: [90, 60, 30],
  reminderCheckIntervalMs: 60_000,
  testEmail: "",
  testEmailTemplateId: null,

  watchFolderEnabled: false,
  watchFolder: "",

  // Phase 2: Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3737/auth/google/callback",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  allowedEmails: process.env.ALLOWED_EMAILS?.split(",").map(e => e.trim()) ?? [],

  userDocumentLimit: parseInt(process.env.USER_DOCUMENT_LIMIT ?? "25"),
};

function resolveDataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  // In dev: ./data relative to project root; in production same
  return join(process.cwd(), "data");
}

const _dataDir = resolveDataDir();

export function getDataDir(): string {
  return _dataDir;
}

const SETTINGS_PATH = join(_dataDir, "settings.json");

let _settings: AppSettings | null = null;

export function loadSettings(): AppSettings {
  if (_settings) return _settings;

  mkdirSync(_dataDir, { recursive: true });

  if (existsSync(SETTINGS_PATH)) {
    try {
      const raw = readFileSync(SETTINGS_PATH, "utf-8");
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      // Env vars always win for secrets — never let saved settings override them
      const envOverrides: Partial<AppSettings> = {};
      if (process.env.OPENAI_API_KEY)       envOverrides.openAiKey          = process.env.OPENAI_API_KEY;
      if (process.env.GOOGLE_CLIENT_ID)     envOverrides.googleClientId     = process.env.GOOGLE_CLIENT_ID;
      if (process.env.GOOGLE_CLIENT_SECRET) envOverrides.googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (process.env.GOOGLE_REDIRECT_URI)  envOverrides.googleRedirectUri  = process.env.GOOGLE_REDIRECT_URI;
      if (process.env.SESSION_SECRET)       envOverrides.sessionSecret      = process.env.SESSION_SECRET;
      if (process.env.ALLOWED_EMAILS)       envOverrides.allowedEmails      = process.env.ALLOWED_EMAILS.split(",").map(e => e.trim());
      if (process.env.SMTP_HOST)            envOverrides.smtpHost           = process.env.SMTP_HOST;
      if (process.env.SMTP_PORT)            envOverrides.smtpPort           = parseInt(process.env.SMTP_PORT);
      if (process.env.SMTP_SECURE)          envOverrides.smtpSecure         = process.env.SMTP_SECURE === "true";
      if (process.env.SMTP_USER)            envOverrides.smtpUser           = process.env.SMTP_USER;
      if (process.env.SMTP_PASS)            envOverrides.smtpPass           = process.env.SMTP_PASS;
      if (process.env.EMAIL_FROM)           envOverrides.emailFrom          = process.env.EMAIL_FROM;
      if (process.env.EMAIL_FROM_NAME)      envOverrides.emailFromName      = process.env.EMAIL_FROM_NAME;
      if (process.env.DO_SPACES_KEY)        envOverrides.doSpacesKey        = process.env.DO_SPACES_KEY;
      if (process.env.DO_SPACES_SECRET)     envOverrides.doSpacesSecret     = process.env.DO_SPACES_SECRET;
      if (process.env.DO_SPACES_ENDPOINT)   envOverrides.doSpacesEndpoint   = process.env.DO_SPACES_ENDPOINT;
      if (process.env.DO_SPACES_BUCKET)     envOverrides.doSpacesBucket     = process.env.DO_SPACES_BUCKET;
      if (process.env.DO_SPACES_REGION)     envOverrides.doSpacesRegion     = process.env.DO_SPACES_REGION;
      if (process.env.ALLOWED_ORIGINS)      envOverrides.allowedOrigins     = process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim());
      if (process.env.USER_DOCUMENT_LIMIT)  envOverrides.userDocumentLimit  = parseInt(process.env.USER_DOCUMENT_LIMIT);
      _settings = { ...DEFAULTS, ...parsed, ...envOverrides };
      return _settings;
    } catch {
      // corrupted — fall through to defaults
    }
  }

  _settings = { ...DEFAULTS };
  saveSettings(_settings);
  return _settings;
}

export function saveSettings(settings: AppSettings) {
  mkdirSync(_dataDir, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
  _settings = settings;
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  const current = loadSettings();
  const updated = { ...current, [key]: value };
  saveSettings(updated);
  return updated;
}

export function getSettings(): AppSettings {
  return loadSettings();
}
