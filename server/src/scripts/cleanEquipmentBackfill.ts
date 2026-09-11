import "./loadEnv";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb, runWithDbTarget} from "../db/db";

const apply = process.argv.includes("--apply");
const production = process.argv.includes("--production");
const email = (process.argv.find((a) => a.startsWith("--email="))?.slice("--email=".length) ?? "")
  .trim()
  .toLowerCase();

if (production && !process.env.MONGODB_PRODUCTION_URI) {
  throw new Error("--production needs MONGODB_PRODUCTION_URI");
}
if (!email) throw new Error("--email= is required");

function parseFields(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

await connectDb();
await runWithDbTarget(production ? "production" : "local", async () => {
  const user = await col("users").findOne({$or: [{email}, {gmail_email: email}]} as any) as any;
  if (!user) throw new Error(`no user for ${email}`);
  const userId = String(user._id);

  const docs = await col("documents")
    .find({
      user_id: userId,
      document_kind: "inspection_report",
      mime_type: "application/pdf",
      document_source: {$ne: "generated"},
    } as any)
    .project({extracted_fields: 1, file_name: 1})
    .toArray() as any[];

  const withRows = docs.filter((doc) => {
    const rows = parseFields(doc.extracted_fields)._equipment;
    return Array.isArray(rows) && rows.length > 0;
  });
  const docIds = withRows.map((doc) => String(doc._id));

  const eqBefore = await col("equipment").countDocuments({user_id: userId} as any);
  const eqFromDocs = await col("equipment").countDocuments({
    user_id: userId,
    document_id: {$in: docIds},
  } as any);

  console.log(`target=${production ? "production" : "local"} apply=${apply} user=${email}`);
  console.log(`inspection_pdfs=${docs.length} docs_with__equipment=${withRows.length} equipment_total=${eqBefore} equipment_from_those_docs=${eqFromDocs}`);

  if (!apply) {
    console.log("dry-run; pass --apply to delete those equipment rows and clear _equipment");
    return;
  }

  const removed = await col("equipment").deleteMany({
    user_id: userId,
    document_id: {$in: docIds},
  } as any);

  let cleared = 0;
  for (const doc of withRows) {
    const fields = parseFields(doc.extracted_fields);
    fields._equipment = [];
    await col("documents").updateOne(
      {_id: new ObjectId(String(doc._id))},
      {$set: {extracted_fields: JSON.stringify(fields), updated_at: new Date()}},
    );
    cleared += 1;
  }

  const eqAfter = await col("equipment").countDocuments({user_id: userId} as any);
  console.log(`deleted_equipment=${removed.deletedCount ?? 0} cleared_docs=${cleared} equipment_left=${eqAfter}`);
});
await closeDb();
