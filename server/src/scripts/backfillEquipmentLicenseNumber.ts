import "./loadEnv";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb, runWithDbTarget} from "../db/db";

const apply = process.argv.includes("--apply");
const production = process.argv.includes("--production");
if (production && !process.env.MONGODB_PRODUCTION_URI) {
  throw new Error("--production needs MONGODB_PRODUCTION_URI");
}

function parseFields(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

function empty(value: unknown): boolean {
  return value == null || String(value).trim() === "";
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const v of values) {
    if (!empty(v)) return String(v).trim();
  }
  return null;
}

await connectDb();
await runWithDbTarget(production ? "production" : "local", async () => {
  const equipmentRows = await col("equipment")
    .find({document_id: {$exists: true, $ne: null}} as any)
    .toArray();

  const candidates = (equipmentRows as any[]).filter((row) => empty(row.license_number));

  console.log(`target=${production ? "production" : "local"} apply=${apply} candidates=${candidates.length}/${equipmentRows.length}`);

  const docCache = new Map<string, Record<string, unknown> | null>();
  let updated = 0;
  let noSourceData = 0;
  let failed = 0;

  for (const row of candidates) {
    const equipmentId = String(row._id);
    const docId = String(row.document_id);
    try {
      let fields = docCache.get(docId);
      if (fields === undefined) {
        const doc = await col("documents").findOne({_id: new ObjectId(docId)} as any);
        fields = doc ? parseFields((doc as any).extracted_fields) : null;
        docCache.set(docId, fields);
      }
      if (!fields) {
        console.log(`\n${equipmentId}  doc=${docId}  missing document`);
        noSourceData += 1;
        continue;
      }

      const equipmentRow = Array.isArray(fields._equipment) ? (fields._equipment[0] as any) : null;
      const licenseNumber = firstNonEmpty(equipmentRow?.license_number, fields.license_number, fields.lisence_number);

      if (!licenseNumber) {
        noSourceData += 1;
        continue;
      }

      console.log(`\n${equipmentId}  doc=${docId}  ${row.name ?? ""}  ->  license_number: ${licenseNumber}`);

      if (!apply) continue;

      await col("equipment").updateOne({_id: row._id}, {$set: {license_number: licenseNumber, updated_at: new Date()}});
      updated += 1;
    } catch (err) {
      failed += 1;
      console.log(`\n${equipmentId}  FAILED  ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\ndone updated=${updated} no_source_data=${noSourceData} failed=${failed} apply=${apply}`);
});
await closeDb();
