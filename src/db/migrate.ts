/**
 * MongoDB migration shim.
 * SQLite migrations are replaced by MongoDB index creation in db.ts (applyIndexes).
 * This export is kept so existing imports compile without changes.
 */
export async function runMigrations(): Promise<void> {
  // No-op: indexes and schema are applied in connectDb() via applyIndexes().
}
