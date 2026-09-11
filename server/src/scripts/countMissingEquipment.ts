import "./loadEnv";
import {closeDb, col, connectDb, runWithDbTarget} from "../db/db";

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

await connectDb();
await runWithDbTarget("production", async () => {
  const docs = await col("documents")
    .find({
      processing_status: "done",
      mime_type: "application/pdf",
      document_kind: "inspection_report",
      document_source: {$ne: "generated"},
    } as any)
    .project({file_name: 1, extracted_fields: 1, spaces_key: 1, file_hash: 1})
    .toArray();

  let missingEquipment = 0;
  let missingSerial = 0;
  let missingLoads = 0;
  let missingMfr = 0;
  let hasFile = 0;

  for (const doc of docs as any[]) {
    const f = parseFields(doc.extracted_fields);
    const rows = Array.isArray(f._equipment) ? f._equipment as any[] : [];
    if (rows.length === 0) missingEquipment += 1;
    if (empty(f.serial_number) && rows.every((r) => empty(r?.serial_number))) missingSerial += 1;
    if (empty(f.load_capacity) && rows.every((r) => !r?.load_capacity_work?.length)) missingLoads += 1;
    if (empty(f.manufacturer) && rows.every((r) => empty(r?.manufacturer))) missingMfr += 1;
    if (doc.spaces_key || doc.file_hash) hasFile += 1;
  }

  console.log({
    inspection_pdfs: docs.length,
    with_file: hasFile,
    no_equipment_rows: missingEquipment,
    missing_serial: missingSerial,
    missing_loads: missingLoads,
    missing_manufacturer: missingMfr,
  });
});
await closeDb();
