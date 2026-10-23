import {existsSync, readFileSync} from "fs";
import {basename, extname} from "path";
import {getSettings} from "../settings";

// Patterns that identify credential values
const KEY_PATTERNS: Array<{ name: string; regex: RegExp; settingKey: string }> = [
  // OpenAI
  { name: "OpenAI API key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/, settingKey: "openAiKey" },
  // SMTP password (key=value style)
  { name: "SMTP password", regex: /SMTP_PASS\s*=\s*(.+)/i, settingKey: "smtpPass" },
  { name: "SMTP user",     regex: /SMTP_USER\s*=\s*(.+)/i, settingKey: "smtpUser" },
  { name: "SMTP host",     regex: /SMTP_HOST\s*=\s*(.+)/i, settingKey: "smtpHost" },
  // Email from
  { name: "Email from",    regex: /EMAIL_FROM\s*=\s*(.+)/i, settingKey: "emailFrom" },
  // Google OAuth
  { name: "Google Client ID",     regex: /GOOGLE_CLIENT_ID\s*=\s*(.+)/i, settingKey: "googleClientId" },
  { name: "Google Client Secret", regex: /GOOGLE_CLIENT_SECRET\s*=\s*(.+)/i, settingKey: "googleClientSecret" },
  // MongoDB
  { name: "MongoDB URI",   regex: /MONGODB_URI\s*=\s*(.+)/i, settingKey: "_mongoUri" },
  // DO Spaces
  { name: "S3 Access Key",    regex: /^AWS_ACCESS_KEY_ID\s*=\s*(.+)/im, settingKey: "doSpacesKey" },
  { name: "S3 Secret Key", regex: /^AWS_SECRET_ACCESS_KEY\s*=\s*(.+)/im, settingKey: "doSpacesSecret" },
  { name: "DO Spaces Bucket", regex: /DO_SPACES_BUCKET\s*=\s*(.+)/i, settingKey: "doSpacesBucket" },
  { name: "DO Spaces Endpoint", regex: /DO_SPACES_ENDPOINT\s*=\s*(.+)/i, settingKey: "doSpacesEndpoint" },
];

const SCANNABLE_EXTS = new Set([".env", ".key", ".txt", ".json", ".conf", ".cfg", ".ini", ".yaml", ".yml"]);
const SCANNABLE_NAMES = new Set([".env", ".env.local", ".env.production", "credentials", "secrets"]);

export interface ScanResult {
  file: string;
  found: Array<{ name: string; settingKey: string; value: string }>;
}

export function shouldScanFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  const name = basename(filePath).toLowerCase();
  return SCANNABLE_EXTS.has(ext) || SCANNABLE_NAMES.has(name) || name.startsWith(".env");
}

export function scanFileForKeys(filePath: string): ScanResult {
  const result: ScanResult = { file: filePath, found: [] };

  if (!existsSync(filePath)) return result;

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return result;
  }

  for (const pattern of KEY_PATTERNS) {
    const match = pattern.regex.exec(content);
    if (!match) continue;

    // For key=value patterns, capture group 1; for raw patterns, full match
    const raw = (match[1] ?? match[0]).trim().replace(/^["']|["']$/g, "");
    if (raw.length < 4) continue;

    result.found.push({ name: pattern.name, settingKey: pattern.settingKey, value: raw });
  }

  return result;
}

export function applyScannedKeys(results: ScanResult[]): number {
  let applied = 0;

  for (const result of results) {
    for (const item of result.found) {
      // Map settingKey → env var name
      const envMap: Record<string, string> = {
        _mongoUri:       "MONGODB_URI",
        openAiKey:       "OPENAI_LOCAL_API_KEY",
        smtpPass:        "SMTP_PASS",
        smtpUser:        "SMTP_USER",
        smtpHost:        "SMTP_HOST",
        emailFrom:       "EMAIL_FROM",
        googleClientId:  "GOOGLE_CLIENT_ID",
        googleClientSecret: "GOOGLE_CLIENT_SECRET",
        doSpacesKey:     "AWS_ACCESS_KEY_ID",
        doSpacesSecret:  "AWS_SECRET_ACCESS_KEY",
        doSpacesBucket:  "BUCKET",
        doSpacesEndpoint:"ENDPOINT",
      };
      const envKey = envMap[item.settingKey];
      if (envKey && !process.env[envKey]) {
        process.env[envKey] = item.value;
        console.log(`[keyScanner] Set ${envKey} from ${result.file}`);
        applied++;
      }
    }
  }

  return applied;
}

export function scanWatchFolder(): number {
  const s = getSettings();
  if (!s.watchFolder) return 0;

  // Also scan DATA_DIR for any dropped credential files
  const foldersToScan = [s.watchFolder];

  const { readdirSync } = require("fs") as typeof import("fs");
  let total = 0;

  for (const folder of foldersToScan) {
    if (!existsSync(folder)) continue;
    let files: string[];
    try {
      files = readdirSync(folder);
    } catch {
      continue;
    }

    const results: ScanResult[] = [];
    for (const file of files) {
      const fullPath = require("path").join(folder, file);
      if (shouldScanFile(fullPath)) {
        const result = scanFileForKeys(fullPath);
        if (result.found.length > 0) {
          results.push(result);
          console.log(`[keyScanner] Found ${result.found.length} credential(s) in ${file}`);
        }
      }
    }

    total += applyScannedKeys(results);
  }

  return total;
}
