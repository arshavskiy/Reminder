import "./loadEnv";
import {extname} from "path";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb, runWithDbTarget} from "../db/db";
import {resolveDocumentFilePath} from "../documents/fileResolver";
import {parsePdfWithPlumber} from "../pipeline/pdfPlumberParser";
import {
  flattenEquipmentFields,
  isUsableEquipmentRow,
  parseEquipmentFromPlumberTables,
  shouldSkipEquipmentInspection,
  type EquipmentTableRow,
} from "../pipeline/equipmentTableParse";
import {saveTemplateEntitiesForDoc} from "../pipeline/importer";
import {loadTemplate, pickTemplate} from "../templates/seedTemplates";

const apply = process.argv.includes("--apply");
const production = process.argv.includes("--production");
const accessoriesOnly = process.argv.includes("--accessories-only");
if (production && !process.env.MONGODB_PRODUCTION_URI) {
  throw new Error("--production needs MONGODB_PRODUCTION_URI");
}

function parseFields(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

function asRow(value: unknown): EquipmentTableRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    name: String(row.name ?? row.description ?? ""),
    manufacturer: row.manufacturer != null ? String(row.manufacturer) : null,
    model: row.model != null ? String(row.model) : null,
    serial_number: row.serial_number != null ? String(row.serial_number) : null,
    load_capacity_work: Array.isArray(row.load_capacity_work) ? row.load_capacity_work.map(String) : [],
    load_capacity_test: Array.isArray(row.load_capacity_test) ? row.load_capacity_test.map(String) : [],
    load_radius: Array.isArray(row.load_radius) ? row.load_radius.map(String) : [],
    category: String(row.category ?? "other"),
  };
}

await connectDb();
await runWithDbTarget(production ? "production" : "local", async () => {
  const docs = await col("documents")
    .find({
      processing_status: "done",
      mime_type: "application/pdf",
      document_kind: "inspection_report",
    } as any)
    .project({raw_text: 0})
    .toArray();

  const targets = (docs as any[]).filter((doc) => {
    const fields = parseFields(doc.extracted_fields);
    const rows = Array.isArray(fields._equipment) ? fields._equipment : [];
    return rows.length > 0;
  });

  console.log(`target=${production ? "production" : "local"} apply=${apply} docs_with_equipment=${targets.length}`);

  let rewritten = 0;
  let cleared = 0;
  let unchanged = 0;
  let failed = 0;
  let deletedEq = 0;

  for (const doc of targets) {
    const id = String(doc._id);
    const before = parseFields(doc.extracted_fields);
    const beforeRows = (Array.isArray(before._equipment) ? before._equipment : [])
      .map(asRow)
      .filter((row): row is EquipmentTableRow => Boolean(row));
    if (shouldSkipEquipmentInspection(doc.file_name)) {
      console.log(`\n${id}  ${doc.file_name}`);
      console.log("  clear: accessory/סל הרמה");
      if (apply) {
        const removed = await col("equipment").deleteMany({document_id: id} as any);
        deletedEq += removed.deletedCount ?? 0;
        const next = {...before, _equipment: []};
        await col("documents").updateOne(
          {_id: new ObjectId(id)},
          {$set: {extracted_fields: JSON.stringify(next), updated_at: new Date()}},
        );
      }
      cleared += 1;
      continue;
    }
    if (accessoriesOnly) continue;
    try {
      const filePath = await resolveDocumentFilePath(doc);
      if (extname(filePath).toLowerCase() !== ".pdf") continue;
      const plumber = parsePdfWithPlumber(filePath);
      const rows = plumber ? parseEquipmentFromPlumberTables(plumber.tables) : [];
      const junkBefore = beforeRows.filter((row) => !isUsableEquipmentRow(row)).length;
      if (rows.length === beforeRows.length && junkBefore === 0) {
        if (apply && rows.length) {
          const template = (doc.template_id ? await loadTemplate(String(doc.template_id)) : null)
            ?? await pickTemplate(String(doc.file_name ?? ""), doc.user_id);
          if (template) {
            await saveTemplateEntitiesForDoc(id, template, before as any, doc.user_id, true);
          }
        }
        unchanged += 1;
        continue;
      }

      console.log(`\n${id}  ${doc.file_name}`);
      console.log(`  before ${beforeRows.length} rows (${junkBefore} junk) → after ${rows.length}`);
      for (const row of rows.slice(0, 8)) {
        console.log(`  + ${row.serial_number ?? "?"} | ${row.manufacturer ?? "-"} | ${row.model ?? "-"} | ${row.name.slice(0, 36)}`);
      }

      if (!apply) {
        if (rows.length) rewritten += 1;
        else cleared += 1;
        continue;
      }

      const flat = flattenEquipmentFields(rows);
      const next: Record<string, unknown> = {...before, _equipment: rows};
      if (rows[0]) {
        next.manufacturer = next.manufacturer || flat.manufacturer;
        next.model = next.model || flat.model;
        next.serial_number = next.serial_number || flat.serial_number;
        next.load_capacity = next.load_capacity || flat.load_capacity;
      }

      const keepSerials = new Set(rows.map((row) => row.serial_number).filter(Boolean));
      const keepNames = new Set(rows.map((row) => row.name.trim()).filter(Boolean));
      const existingEq = await col("equipment").find({document_id: id} as any).toArray() as any[];
      const staleIds = existingEq
        .filter((eq) => {
          const serial = String(eq.serial_number ?? "").trim();
          const name = String(eq.name ?? "").trim();
          if (serial && keepSerials.has(serial)) return false;
          if (!serial && name && keepNames.has(name) && rows.some((row) => row.name === name && isUsableEquipmentRow(row))) return false;
          return true;
        })
        .map((eq) => eq._id);
      if (staleIds.length) {
        const result = await col("equipment").deleteMany({_id: {$in: staleIds}} as any);
        deletedEq += result.deletedCount ?? 0;
      }

      await col("documents").updateOne(
        {_id: new ObjectId(id)},
        {$set: {extracted_fields: JSON.stringify(next), updated_at: new Date()}},
      );

      const template = (doc.template_id ? await loadTemplate(String(doc.template_id)) : null)
        ?? await pickTemplate(String(doc.file_name ?? ""), doc.user_id);
      if (template && rows.length) {
        await saveTemplateEntitiesForDoc(id, template, next as any, doc.user_id, true);
      }

      if (rows.length) rewritten += 1;
      else cleared += 1;
      console.log(`  applied deleted_eq=${staleIds.length}`);
    } catch (err) {
      failed += 1;
      console.log(`\n${id}  FAILED  ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\ndone rewritten=${rewritten} cleared=${cleared} unchanged=${unchanged} failed=${failed} deleted_eq=${deletedEq} apply=${apply}`);
});
await closeDb();
