import "./loadEnv";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb, runWithDbTarget} from "../db/db";

const DOC_ID = process.argv[2];
if (!DOC_ID) {
  console.error("Usage: tsx src/scripts/inspectProdDoc.ts <documentId>");
  process.exit(1);
}

function parseFields(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

await connectDb();
await runWithDbTarget("production", async () => {
  const doc = await col("documents").findOne({_id: new ObjectId(DOC_ID)}) as any;
  if (!doc) {
    console.log("not found");
    return;
  }
  const fields = parseFields(doc.extracted_fields);
  const equipment = await col("equipment").find({document_id: DOC_ID} as any).toArray();
  console.log({
    file_name: doc.file_name,
    status: doc.processing_status,
    user_id: doc.user_id,
    spaces_key: doc.spaces_key ?? null,
    manufacturer: fields.manufacturer ?? null,
    model: fields.model ?? null,
    serial_number: fields.serial_number ?? null,
    load_capacity: fields.load_capacity ?? null,
    checked_equipment: fields.checked_equipment ?? null,
    equipment_description: fields.equipment_description ?? null,
    equipment_rows: Array.isArray(fields._equipment) ? fields._equipment.length : 0,
    _equipment: fields._equipment ?? [],
    equipment_collection: equipment.map((eq: any) => ({
      name: eq.name,
      manufacturer: eq.manufacturer,
      model: eq.model,
      serial_number: eq.serial_number,
      capacity: eq.capacity,
      load_radius: eq.load_radius,
    })),
  });
});
await closeDb();
