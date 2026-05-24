/**
 * Schema is managed by MongoDB indexes in db.ts (applyIndexes).
 * This file is kept as a no-op shim so existing imports compile.
 */
export function applySchema(): void {
  // No-op: schema/indexes are applied in connectDb() via applyIndexes in db.ts
}
