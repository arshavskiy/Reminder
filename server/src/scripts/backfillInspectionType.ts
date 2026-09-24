/** Dry run: --target=dev|production|local. Add --apply to persist supported categories. */
import {config} from "dotenv";
import {MongoClient} from "mongodb";
import {resolveInspectionType} from "../documents/inspectionType.js";

const target = process.argv.find(arg => arg.startsWith("--target="))?.split("=")[1];
if (!["dev", "production", "local"].includes(target ?? "")) throw new Error("Specify --target=dev|production|local");
const env: Record<string, string> = {};
config({path: target === "dev" ? ".env.dev" : ".env.local", processEnv: env, quiet: true});
const uri = target === "production" ? env.MONGODB_PRODUCTION_URI : env.MONGODB_LOCAL_URI || env.MONGODB_URI;
const dbName = target === "production" ? env.MONGODB_PRODUCTION_DB : env.MONGODB_DB;
if (!uri || !dbName) throw new Error("Explicit database URI and name required");
if (target !== "local" && !new URL(uri).hostname.endsWith(".mongodb.net")) throw new Error("Expected Atlas target");
const apply = process.argv.includes("--apply");
const client = new MongoClient(uri, {serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000});
try {
  await client.connect();
  const db = client.db(dbName);
  const templates = await db.collection("print_templates").find({}, {projection: {reportTypeKey: 1}}).toArray();
  const templateKeys = new Map(templates.map(t => [String(t._id), t.reportTypeKey]));
  const col = db.collection("documents");
  const docs = await col.find({document_kind: {$in: ["inspection_report", "generated_print_template_pdf"]}}, {projection: {document_kind: 1, inspection_type: 1, extracted_fields: 1, file_name: 1, raw_text: 1, template_id: 1}}).toArray();
  const counts: Record<string, number> = {};
  let unresolved = 0, changed = 0, modified = 0;
  for (const doc of docs) {
    const type = resolveInspectionType({...doc, document_kind: doc.document_kind}, doc.document_kind === "generated_print_template_pdf" ? templateKeys.get(String(doc.template_id)) : undefined);
    if (!type) { unresolved++; continue; }
    if (type === doc.inspection_type) continue;
    changed++;
    if (process.argv.includes("--audit") && changed <= 15) console.log(JSON.stringify({id: String(doc._id), before: doc.inspection_type ?? null, after: type, headings: String(doc.raw_text ?? "").split(/\r?\n/).slice(0, 40).filter(line => /תסקיר|inspection report/i.test(line)).map(line => line.slice(0, 180))}));
    counts[type] = (counts[type] ?? 0) + 1;
    if (apply) {
      const result = await col.updateOne({_id: doc._id, inspection_type: doc.inspection_type ?? null, extracted_fields: doc.extracted_fields ?? null}, {$set: {inspection_type: type, updated_at: new Date()}});
      modified += result.modifiedCount;
    }
  }
  console.log(JSON.stringify({target, database: dbName, apply, scanned: docs.length, changed, modified, unresolved, counts}));
} finally { await client.close(); }
