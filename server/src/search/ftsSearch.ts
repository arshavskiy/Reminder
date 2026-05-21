import { getDb } from "../db/db";
import type { DocumentSearchResult } from "../../src/shared/types.js";

export function searchDocuments(query: string, limit = 20): DocumentSearchResult[] {
  const db = getDb();
  // Escape FTS5 special characters
  const safeQuery = query.replace(/['"*]/g, " ").trim();
  if (!safeQuery) return [];

  const rows = db
    .prepare(
      `SELECT d.id, d.file_name,
              snippet(documents_fts, 0, '<mark>', '</mark>', '…', 20) AS snippet,
              rank
       FROM documents_fts
       JOIN documents d ON d.id = documents_fts.rowid
       WHERE documents_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
    )
    .all(safeQuery, limit) as DocumentSearchResult[];

  return rows;
}
