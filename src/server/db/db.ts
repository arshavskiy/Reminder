import { Database } from "bun:sqlite";
import { applySchema } from "./schema.js";
import { getDataDir } from "../settings.js";
import { join } from "path";
import { mkdirSync } from "fs";
import { seedBuiltinTemplates } from "../templates/seedTemplates.js";
import { seedDefaultEmailTemplate } from "../templates/seedEmailTemplates.js";

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const dataDir = getDataDir();
  mkdirSync(dataDir, { recursive: true });

  const dbPath = join(dataDir, "reminder.db");
  _db = new Database(dbPath, { create: true });
  applySchema(_db);
  seedBuiltinTemplates(_db);
  seedDefaultEmailTemplate(_db);
  return _db;
}

export function closeDb() {
  _db?.close();
  _db = null;
}
