import {ObjectId} from "mongodb";
import {closeDb, col, connectDb} from "../db/db";
import {extractKnownInvoiceFields, saveTemplateEntitiesForDoc} from "../pipeline/importer";
import {documentTypeFromTemplate, loadAllTemplates} from "../templates/seedTemplates";

const apply = process.argv.includes("--apply");
const userId = readArg("--user-id");

await connectDb();

try {
  const filter: Record<string, unknown> = {
    raw_text: {$regex: "github|vercel", $options: "i"},
  };
  if (userId) filter.user_id = userId;

  const docs = await col("documents")
    .find(filter as any)
    .project({_id: 1, user_id: 1, file_name: 1, raw_text: 1})
    .toArray() as Array<Record<string, any>>;

  let matched = 0;
  let updated = 0;
  let skipped = 0;

  for (const doc of docs) {
    const documentId = doc._id?.toString?.() ?? String(doc._id);
    const fields = extractKnownInvoiceFields(String(doc.raw_text ?? ""), doc.file_name);
    if (!fields) {
      skipped += 1;
      continue;
    }
    matched += 1;
    if (!apply) continue;

    const ownerId = String(doc.user_id ?? userId ?? "");
    const templates = await loadAllTemplates(ownerId || undefined);
    const invoiceTemplate = templates.find((tpl) => tpl.document_kind === "invoice" || tpl.name === "חשבונית");
    if (!invoiceTemplate) {
      skipped += 1;
      continue;
    }

    const now = new Date();
    await col("extractions").insertOne({
      document_id: documentId,
      template_id: invoiceTemplate.id ?? null,
      template_name: invoiceTemplate.name,
      backend: "deterministic",
      model: "known-invoice-parser",
      fields,
      raw_json: fields,
      error: null,
      usage: null,
      exec_ms: 0,
      created_at: now,
    } as any);
    await col("documents").updateOne(
      {_id: new ObjectId(documentId)} as any,
      {
        $set: {
          extracted_fields: JSON.stringify(fields),
          template_id: invoiceTemplate.id,
          document_type: documentTypeFromTemplate(invoiceTemplate),
          document_kind: documentTypeFromTemplate(invoiceTemplate),
          processing_status: "done",
          error_message: null,
          updated_at: now,
        },
      },
    );
    await saveTemplateEntitiesForDoc(documentId, invoiceTemplate, fields as any, ownerId || undefined);
    updated += 1;
  }

  console.log(JSON.stringify({
    scanned: docs.length,
    matched,
    updated,
    skipped,
    applied: apply,
    user_id: userId ?? null,
  }, null, 2));
} finally {
  await closeDb();
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}
