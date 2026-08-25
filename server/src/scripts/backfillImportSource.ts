import "./loadEnv"; // must precede ../db/db — see loadEnv.ts
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb} from "../db/db";

/**
 * Backfills documents.import_source for rows imported before the field existed.
 *
 * Gmail origin was never recorded on the document — document_source is
 * "scanned" for everything — so it is reconstructed from the strongest
 * available evidence, in order:
 *
 *   1. a gmail_imports row referencing the document  (authoritative)
 *   2. gmail_provider_id set                         (only Gmail import sets it)
 *   3. an invoices/gmail storage key                 (only Gmail invoices use it)
 *
 * Everything else is left alone rather than guessed at: absence of evidence is
 * not evidence of upload, and a wrong provenance badge is worse than none.
 *
 *   --apply   perform the update (default is a dry run)
 */

const apply = process.argv.includes("--apply");

await connectDb();

try {
  // 1. Document ids referenced by gmail_imports.
  const gmailRows = await col<any>("gmail_imports")
    .find({} as any)
    .project({files: 1})
    .toArray();
  const fromGmailImports = new Set<string>();
  for (const row of gmailRows) {
    for (const file of row.files ?? []) {
      const id = String(file?.document_id ?? "").trim();
      if (id) fromGmailImports.add(id);
    }
  }

  // 2 + 3. Secondary evidence, for documents whose gmail_imports row was pruned.
  const secondary = await col<any>("documents")
    .find({
      import_source: {$exists: false},
      $or: [
        {gmail_provider_id: {$nin: [null, ""]}},
        {spaces_key: {$regex: "/invoices/gmail/"}},
        {spaces_key: {$regex: "^gmail/invoices/"}},
      ],
    } as any)
    .project({_id: 1})
    .toArray();
  for (const doc of secondary) fromGmailImports.add(String(doc._id));

  const ids = [...fromGmailImports].filter((id) => ObjectId.isValid(id));
  const objectIds = ids.map((id) => new ObjectId(id));

  const alreadySet = await col("documents").countDocuments({import_source: {$exists: true}} as any);
  const wouldSet = await col("documents").countDocuments({
    _id: {$in: objectIds},
    import_source: {$exists: false},
  } as any);
  const total = await col("documents").countDocuments({} as any);

  let modified = 0;
  if (apply && objectIds.length) {
    const result = await col("documents").updateMany(
      {_id: {$in: objectIds}, import_source: {$exists: false}} as any,
      {$set: {import_source: "gmail", updated_at: new Date()}} as any,
    );
    modified = result.modifiedCount;
  }

  // document_kind is only written after text extraction, so a document that has
  // never processed has none — and the documents list, which hides invoices by
  // kind, cannot exclude it. Gmail invoice-storage keys identify these
  // unambiguously, so set the kind their import already implied.
  const kindFilter = {
    document_kind: {$in: [null, ""]},
    spaces_key: {$regex: "/invoices/gmail/|^gmail/invoices/"},
  };
  const missingKind = await col("documents").countDocuments(kindFilter as any);
  let kindModified = 0;
  if (apply && missingKind) {
    const result = await col("documents").updateMany(
      kindFilter as any,
      {$set: {document_kind: "invoice", updated_at: new Date()}} as any,
    );
    kindModified = result.modifiedCount;
  }

  console.log(JSON.stringify({
    documents_total: total,
    already_had_import_source: alreadySet,
    gmail_evidence_found: ids.length,
    would_set_gmail: wouldSet,
    modified,
    left_unset: total - alreadySet - (apply ? modified : wouldSet),
    invoice_docs_missing_kind: missingKind,
    kind_modified: kindModified,
    applied: apply,
  }, null, 2));

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write import_source.");
  }
} finally {
  await closeDb();
}
