/**
 * Patches document_number/extracted_fields.report_number/contract_number for
 * air_receiver documents whose report number was dropped by the pre-fix
 * extractCurrentReportNumber bug (commit 9a7b8e5): "מספר תסקיר:" and its
 * value on separate lines produced ":" instead of the real number.
 * Re-derives the number from the document's already-stored raw_text with the
 * fixed regex — no AI call, no client/reminder side effects, no delete.
 *
 * extracted_fields is stored as a JSON *string* on the document (see
 * client/src/shared/rowIssues.ts parseDocumentExtractedFields), and the
 * Documents page reads report_number from inside it before ever falling back
 * to the top-level document_number — so both must be patched, not just the
 * top-level field.
 *
 * Dry run by default; pass --apply to write.
 *
 *   npx tsx src/scripts/backfillAirReceiverReportNumbers.ts
 *   npx tsx src/scripts/backfillAirReceiverReportNumbers.ts --apply
 */
import dotenv from "dotenv";
dotenv.config({path: ".env.local"});
dotenv.config();

import {ObjectId} from "mongodb";
import {closeDb, col, connectDb} from "../db/db.js";
import {extractCurrentReportNumber} from "../pipeline/importer.js";

const apply = process.argv.includes("--apply");

await connectDb();

try {
  const docs = await col("documents")
    .find({inspection_type: "air_receiver", raw_text: {$exists: true, $ne: null}} as any)
    .project({_id: 1, file_name: 1, raw_text: 1, document_number: 1, extracted_fields: 1})
    .toArray();

  console.log(`Scanning ${docs.length} air_receiver documents...`);

  type Row = {
    documentId: string;
    fileName: string;
    oldNumber: string | null;
    newNumber: string;
    extractedFields: Record<string, unknown> | null;
  };
  const rows: Row[] = [];

  for (const doc of docs as any[]) {
    const rawText = String(doc.raw_text ?? "");
    const reportNumber = extractCurrentReportNumber(rawText);
    if (!reportNumber) continue;

    let extractedFields: Record<string, unknown> | null = null;
    if (typeof doc.extracted_fields === "string" && doc.extracted_fields) {
      try {
        const parsed = JSON.parse(doc.extracted_fields);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) extractedFields = parsed;
      } catch {
        // leave null — malformed JSON, skip patching extracted_fields for this doc
      }
    }

    const topAlreadyCorrect = reportNumber === doc.document_number;
    const fieldsAlreadyCorrect = extractedFields ? extractedFields.report_number === reportNumber : true;
    if (topAlreadyCorrect && fieldsAlreadyCorrect) continue; // nothing to fix

    rows.push({
      documentId: String(doc._id),
      fileName: doc.file_name ?? "",
      oldNumber: doc.document_number ?? null,
      newNumber: reportNumber,
      extractedFields,
    });
  }

  console.table(rows.map((r) => ({
    file: r.fileName,
    was: r.oldNumber,
    now: r.newNumber,
    was_fields_report_number: r.extractedFields ? String(r.extractedFields.report_number ?? "") : "(no fields)",
  })));

  if (!apply) {
    console.log(`\nDry run only. ${rows.length} document(s) would be updated. Re-run with --apply to write.`);
    process.exit(0);
  }

  let updatedDocs = 0;
  let updatedContracts = 0;
  for (const row of rows) {
    const set: Record<string, unknown> = {document_number: row.newNumber, updated_at: new Date()};
    if (row.extractedFields) {
      set.extracted_fields = JSON.stringify({...row.extractedFields, report_number: row.newNumber});
    }
    const docResult = await col("documents").updateOne(
      {_id: new ObjectId(row.documentId)} as any,
      {$set: set},
    );
    if (docResult.modifiedCount) updatedDocs++;

    const contractResult = await col("contracts").updateOne(
      {document_id: row.documentId} as any,
      {$set: {contract_number: row.newNumber, updated_at: new Date()}},
    );
    if (contractResult.modifiedCount) updatedContracts++;
  }

  console.log(`Updated ${updatedDocs} document(s), ${updatedContracts} contract(s).`);
} finally {
  await closeDb();
}
