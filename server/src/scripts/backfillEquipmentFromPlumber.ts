import "./loadEnv";
import {extname} from "path";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb, runWithDbTarget} from "../db/db";
import {resolveDocumentFilePath} from "../documents/fileResolver";
import {parsePdfWithPlumber} from "../pipeline/pdfPlumberParser";
import {flattenEquipmentFields, isUsableEquipmentRow, parseEquipmentFromPlumberTables, shouldSkipEquipmentInspection} from "../pipeline/equipmentTableParse";
import {saveTemplateEntitiesForDoc} from "../pipeline/importer";
import {loadTemplate, pickTemplate} from "../templates/seedTemplates";

const apply = process.argv.includes("--apply");
const production = process.argv.includes("--production");
const all = process.argv.includes("--all");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 8;
const emailArg = process.argv.find((a) => a.startsWith("--email="));
const email = emailArg ? emailArg.slice("--email=".length).trim().toLowerCase() : "";
const onlyIds = process.argv
  .filter((a) => a.startsWith("--id="))
  .map((a) => a.slice("--id=".length));

if (production && !process.env.MONGODB_PRODUCTION_URI) {
  throw new Error("--production needs MONGODB_PRODUCTION_URI");
}

function parseFields(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

function empty(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "";
}

function mergeEquipment(existing: Record<string, unknown>, rows: ReturnType<typeof parseEquipmentFromPlumberTables>) {
  const flat = flattenEquipmentFields(rows);
  const next: Record<string, unknown> = {...existing, _equipment: rows};
  for (const key of ["manufacturer", "model", "serial_number", "load_capacity"] as const) {
    if (empty(next[key]) && !empty((flat as Record<string, unknown>)[key])) next[key] = (flat as Record<string, unknown>)[key];
  }
  return next;
}

await connectDb();
await runWithDbTarget(production ? "production" : "local", async () => {
  let userId: string | null = null;
  if (email) {
    const user = await col("users").findOne({
      $or: [{email}, {gmail_email: email}],
    } as any);
    if (!user) throw new Error(`no user for ${email}`);
    userId = String((user as any)._id);
    console.log(`user ${email} id=${userId}`);
  }

  const docs = await col("documents")
    .find({
      processing_status: "done",
      mime_type: "application/pdf",
      document_kind: "inspection_report",
      document_source: {$ne: "generated"},
      ...(userId ? {user_id: userId} : {}),
    } as any)
    .project({raw_text: 0})
    .sort({import_date: -1, _id: -1} as any)
    .toArray();

  const candidates = (docs as any[]).filter((doc) => {
    if (onlyIds.length) return onlyIds.includes(String(doc._id));
    const fields = parseFields(doc.extracted_fields);
    const rows = Array.isArray(fields._equipment) ? fields._equipment : [];
    return rows.length === 0 && (doc.spaces_key || doc.file_hash);
  });
  const capped = onlyIds.length || all ? candidates : candidates.slice(0, limit);

  console.log(`target=${production ? "production" : "local"} apply=${apply} candidates=${capped.length}/${candidates.length} missing of ${docs.length} inspection pdfs`);

  let parsed = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of capped) {
    const id = String(doc._id);
    const before = parseFields(doc.extracted_fields);
    if (shouldSkipEquipmentInspection(doc.file_name)) {
      console.log(`\n${id}  ${doc.file_name}`);
      console.log("  skip: accessory/סל הרמה");
      skipped += 1;
      continue;
    }
    try {
      const filePath = await resolveDocumentFilePath(doc);
      if (extname(filePath).toLowerCase() !== ".pdf") {
        skipped += 1;
        continue;
      }
      const plumber = parsePdfWithPlumber(filePath);
      const rows = (plumber ? parseEquipmentFromPlumberTables(plumber.tables) : [])
        .filter(isUsableEquipmentRow);
      console.log(`\n${id}  ${doc.file_name}`);
      console.log("  before:", before.manufacturer ?? "-", before.model ?? "-", before.serial_number ?? "-");
      if (!rows.length) {
        console.log("  parser: no equipment table");
        skipped += 1;
        continue;
      }
      parsed += 1;
      for (const row of rows) {
        console.log(`  + ${row.serial_number ?? "?"} | ${row.manufacturer ?? "-"} | ${row.model ?? "-"} | ${row.name.slice(0, 40)} | work=${row.load_capacity_work.join(",") || "-"} | r=${row.load_radius.join(",") || "-"}`);
      }
      if (!apply) continue;

      const fields = mergeEquipment(before, rows);
      const template = (doc.template_id ? await loadTemplate(String(doc.template_id)) : null)
        ?? await pickTemplate(String(doc.file_name ?? ""), doc.user_id);
      if (!template) {
        console.log("  skip apply: no template");
        continue;
      }
      const keepSerials = new Set(rows.map((row) => row.serial_number).filter(Boolean));
      await col("equipment").deleteMany({
        document_id: id,
        serial_number: {$nin: [...keepSerials]},
      } as any);
      await col("documents").updateOne(
        {_id: new ObjectId(id)},
        {$set: {extracted_fields: JSON.stringify(fields), updated_at: new Date()}},
      );
      await saveTemplateEntitiesForDoc(id, template, fields as any, doc.user_id, true);
      console.log("  applied");
    } catch (err) {
      failed += 1;
      console.log(`\n${id}  FAILED  ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\ndone parsed=${parsed} skipped=${skipped} failed=${failed} apply=${apply}`);
});
await closeDb();
