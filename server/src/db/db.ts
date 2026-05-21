import { Database } from "bun:sqlite";
import { applySchema } from "./schema";
import { getDataDir } from "../settings";
import { join } from "path";
import { mkdirSync } from "fs";
import { seedBuiltinTemplates } from "../templates/seedTemplates";
import { seedDefaultEmailTemplate } from "../templates/seedEmailTemplates";
import { seedBuiltinEquipment } from "../templates/seedEquipment";

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
  seedBuiltinEquipment(_db);
  return _db;
}

export function closeDb() {
  _db?.close();
  _db = null;
}
