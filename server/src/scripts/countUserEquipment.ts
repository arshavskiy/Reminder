import "./loadEnv";
import {closeDb, col, connectDb, runWithDbTarget} from "../db/db";
import {shouldSkipEquipmentInspection} from "../pipeline/equipmentTableParse";

function parseFields(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

const email = (process.argv.find((a) => a.startsWith("--email="))?.slice("--email=".length) ?? "pechersky.m@gmail.com")
  .trim()
  .toLowerCase();

await connectDb();
await runWithDbTarget("production", async () => {
  const user = await col("users").findOne({$or: [{email}, {gmail_email: email}]} as any) as any;
  if (!user) {
    console.log("NO USER", email);
    return;
  }
  const userId = String(user._id);
  const all = await col("documents")
    .find({user_id: userId} as any)
    .project({document_kind: 1, mime_type: 1, processing_status: 1, document_source: 1, file_name: 1, extracted_fields: 1, spaces_key: 1, file_hash: 1})
    .toArray() as any[];

  const kinds: Record<string, number> = {};
  let inspection = 0;
  let withEq = 0;
  let missing = 0;
  let skipName = 0;
  let noFile = 0;
  let notDone = 0;
  let equipmentRows = 0;

  for (const doc of all) {
    const kind = String(doc.document_kind || "unknown");
    kinds[kind] = (kinds[kind] || 0) + 1;
    if (doc.processing_status !== "done") notDone += 1;
    if (doc.document_kind !== "inspection_report" || doc.mime_type !== "application/pdf" || doc.document_source === "generated") continue;
    inspection += 1;
    const rows = Array.isArray(parseFields(doc.extracted_fields)._equipment)
      ? parseFields(doc.extracted_fields)._equipment as unknown[]
      : [];
    if (rows.length) {
      withEq += 1;
      equipmentRows += rows.length;
    } else {
      missing += 1;
      if (shouldSkipEquipmentInspection(doc.file_name)) skipName += 1;
      if (!(doc.spaces_key || doc.file_hash)) noFile += 1;
    }
  }

  console.log(JSON.stringify({
    userId,
    email: user.email,
    totalDocs: all.length,
    kinds,
    notDone,
    inspectionPdfs: inspection,
    withEquipmentDocs: withEq,
    equipmentRows,
    missingEquipment: missing,
    missingSkipByName: skipName,
    missingNoFile: noFile,
  }, null, 2));
});
await closeDb();
