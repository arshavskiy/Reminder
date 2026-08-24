import {config} from "dotenv";
import {resolve} from "path";
import {col, connectDb, closeDb} from "../db/db";
import {generatePdfThumbnailForDocument} from "../documents/pdfThumbnail";
import {logger} from "../logger";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const limitArg = [...args].find((arg) => arg.startsWith("--limit="));
const limit = Math.max(0, Number(limitArg?.split("=")[1] ?? 0) || 0);

await connectDb();

try {
  const filter: Record<string, unknown> = {
    $or: [
      { mime_type: "application/pdf" },
      { file_name: /\.pdf$/i },
      { spaces_key: /\.pdf$/i },
    ],
  };
  if (!force) {
    filter.$and = [
      {
        $or: [
          { thumbnail_key: { $in: [null, ""] } },
          { thumbnail_path: { $in: [null, ""] } },
        ],
      },
    ];
  }

  const docs = await col("documents")
    .find(filter)
    .project({ _id: 1, file_name: 1, user_id: 1, mime_type: 1, file_path: 1, file_hash: 1, spaces_key: 1, thumbnail_key: 1, thumbnail_path: 1 })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of docs as any[]) {
    const id = doc._id?.toString?.() ?? String(doc._id);
    try {
      const result = await generatePdfThumbnailForDocument(id, { force });
      if (result) {
        created += 1;
        console.log(`CREATED ${id} ${doc.file_name ?? ""}`);
      } else {
        skipped += 1;
        console.log(`SKIPPED ${id} ${doc.file_name ?? ""}`);
      }
    } catch (err) {
      failed += 1;
      logger.warn("pdf_thumbnail_backfill_failed", { document_id: id, file_name: doc.file_name ?? null, error: err });
      console.log(`FAILED  ${id} ${doc.file_name ?? ""} ${String(err)}`);
    }
  }

  console.log(JSON.stringify({ matched: docs.length, created, skipped, failed, force, limit: limit || null }, null, 2));
} finally {
  await closeDb();
}
