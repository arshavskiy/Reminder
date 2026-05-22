import { col } from "../db/db";
import type { DocumentSearchResult } from "../../src/shared/types.js";

export async function searchDocuments(query: string, limit = 20): Promise<DocumentSearchResult[]> {
  if (!query.trim()) return [];

  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  const docs = await col("documents")
    .find({ raw_text: regex })
    .project({ file_name: 1, raw_text: 1 })
    .limit(limit)
    .toArray();

  return docs.map((d: any) => {
    const rawText: string = d.raw_text ?? "";
    const idx = rawText.search(regex);
    const start = Math.max(0, idx - 60);
    const end = Math.min(rawText.length, idx + 120);
    const snippet = idx >= 0
      ? "…" + rawText.slice(start, end).replace(regex, (m) => `<mark>${m}</mark>`) + "…"
      : rawText.slice(0, 120) + "…";

    return {
      id: d._id?.toString(),
      file_name: d.file_name,
      snippet,
      rank: 1,
    } as DocumentSearchResult;
  });
}
