import "./loadEnv";
import {extname} from "path";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb, runWithDbTarget} from "../db/db";
import {resolveDocumentFilePath} from "../documents/fileResolver";
import {processDocument} from "../pipeline/importer";

const DOC_ID = process.argv.slice(2).find((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
const production = process.argv.includes("--production");

if (!DOC_ID || DOC_ID.startsWith("--")) {
  console.error("Usage: npx tsx src/scripts/reprocessOneDocument.ts <documentId> [--production] [--apply]");
  process.exit(1);
}
if (production && !process.env.MONGODB_PRODUCTION_URI) {
  throw new Error("--production needs MONGODB_PRODUCTION_URI");
}

function summarizeEquipment(fields: Record<string, unknown> | null) {
  const rows = Array.isArray(fields?._equipment) ? fields._equipment as any[] : [];
  return {
    checked_equipment: fields?.checked_equipment ?? null,
    equipment_description: fields?.equipment_description ?? null,
    manufacturer: fields?.manufacturer ?? null,
    model: fields?.model ?? null,
    serial_number: fields?.serial_number ?? null,
    load_capacity: fields?.load_capacity ?? null,
    equipment_rows: rows.length,
    first_row: rows[0] ?? null,
  };
}

function parseFields(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try { return JSON.parse(String(raw)); } catch { return null; }
}

await connectDb();

try {
  await runWithDbTarget(production ? "production" : "local", async () => {
    const doc = await col("documents").findOne({ _id: new ObjectId(DOC_ID) }) as any;
    if (!doc) {
      console.error(`Document not found: ${DOC_ID}`);
      process.exitCode = 1;
      return;
    }

    const before = parseFields(doc.extracted_fields);
    console.log("target:", production ? "production" : "local");
    console.log("file_name:", doc.file_name);
    console.log("status:", doc.processing_status);
    console.log("spaces_key:", doc.spaces_key ?? null);
    console.log("user_id:", doc.user_id);
    console.log("before:", summarizeEquipment(before));

    if (!apply) {
      console.log("dry-run; pass --apply to reprocess");
      return;
    }

    const filePath = await resolveDocumentFilePath(doc);
    const ext = extname(filePath);
    console.log("file:", filePath);
    await processDocument(DOC_ID, filePath, doc.mime_type, ext, undefined, doc.user_id);

    const afterDoc = await col("documents").findOne({ _id: new ObjectId(DOC_ID) }) as any;
    const after = parseFields(afterDoc?.extracted_fields);
    console.log("after status:", afterDoc?.processing_status);
    console.log("after:", summarizeEquipment(after));
    const equipment = await col("equipment").find({ document_id: DOC_ID }).toArray();
    console.log("equipment collection rows:", equipment.length);
    for (const eq of equipment as any[]) {
      console.log(" ", eq.name, eq.manufacturer, eq.model, eq.serial_number, eq.capacity ?? eq.load_capacity_test);
    }
  });
} finally {
  await closeDb();
}
