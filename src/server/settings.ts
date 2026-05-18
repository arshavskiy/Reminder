import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import type { AppSettings } from "../shared/types.js";

export type { AppSettings };

const DEFAULTS: AppSettings = {
  theme: "dark",
  port: 3737,

  aiBackend: "openai",
  openAiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: "gpt-4o-mini",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3.1",

  ocrLanguage: "heb+eng",
  autoExtract: true,
  extractionMaxChars: 8000,

  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPass: "",
  emailFrom: "",
  emailFromName: "Client Reminder",

  reminderEnabled: true,
  reminderAdvanceDays: [90, 60, 30],
  reminderCheckIntervalMs: 60_000,

  watchFolderEnabled: false,
  watchFolder: "",
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
      _settings = { ...DEFAULTS, ...parsed };
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
