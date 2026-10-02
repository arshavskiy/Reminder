/**
 * Remove duplicate invoices and receipts, keeping one copy of each document.
 * Matching rules live in invoices/duplicates.ts.
 *
 * Dry run (default):
 *   npx tsx src/scripts/removeDuplicateInvoices.ts --user-id <id>
 *   npx tsx src/scripts/removeDuplicateInvoices.ts --email <email>
 *   npx tsx src/scripts/removeDuplicateInvoices.ts --all-users
 *
 * Options:
 *   --loose   also match rows without a document number (same type, supplier, amount, date)
 *   --apply   delete; removed invoices and documents are first saved to data/backups/
 *             (MongoDB extended JSON; restore with BSON.EJSON.parse + insertMany)
 *
 * Uses the database from .env.local / .env (MONGODB_TARGET=production selects the production slot).
 */
import "./loadEnv";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { BSON, ObjectId } from "mongodb";
import { closeDb, col, connectDb, getDbTargetStatus } from "../db/db";
import { planInvoiceDedup, type DedupPlan, type DuplicateCandidate } from "../invoices/duplicates";
import { getDataDir } from "../settings";
import { deleteFromSpaces } from "../storage/spaces";

const apply = process.argv.includes("--apply");
const loose = process.argv.includes("--loose");
const allUsers = process.argv.includes("--all-users");

function arg(name: string): string | undefined {
  const eqPrefix = `--${name}=`;
  const eqArg = process.argv.find((value) => value.startsWith(eqPrefix));
  if (eqArg) return eqArg.slice(eqPrefix.length);
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function idValues(ids: string[]): Array<string | ObjectId> {
  return [...ids, ...ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))];
}

function objectIds(ids: string[]): ObjectId[] {
  return ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
}

async function resolveUserIds(): Promise<string[]> {
  if (allUsers) {
    const ids = await col<any>("invoices").distinct("user_id");
    return ids.map(String).filter(Boolean).sort();
  }
  const userId = arg("user-id");
  if (userId) return [userId];
  const email = arg("email");
  if (email) {
    const user = await col<any>("users").findOne({ email: email.trim().toLowerCase() } as any, { projection: { _id: 1 } } as any);
    if (!user) throw new Error(`No user found with email ${email}`);
    return [String(user._id)];
  }
  throw new Error("Pass --user-id <id>, --email <email> or --all-users.");
}

function describe(c: DuplicateCandidate): string {
  return [
    c.id,
    c.inline ? "inline" : `doc ${c.documentId}`,
    `#${c.number ?? "-"}`,
    c.status,
    c.orphan ? "document missing" : null,
    c.paired ? "paired" : null,
  ].filter(Boolean).join(" · ");
}

function printPlan(userId: string, plan: DedupPlan) {
  console.log(`\n[invoice-dedup] user=${userId} groups=${plan.groups.length} remove=${plan.removeIds.length}`);
  for (const group of plan.groups) {
    const { keep } = group;
    console.log(`  ${keep.supplierLabel} | ${keep.category} | ${keep.amount} ${keep.currency} | ${keep.issueDate ?? "no date"} | match=${group.match}`);
    console.log(`    keep   ${describe(keep)}`);
    for (const removed of group.remove) console.log(`    remove ${describe(removed)}`);
  }
  if (plan.relinks.length) console.log(`  pairs moved to kept copy: ${plan.relinks.length}`);
  if (plan.clearPairs.length) console.log(`  pairs cleared: ${plan.clearPairs.length}`);
}

async function applyPlan(userId: string, plan: DedupPlan, backupDir: string) {
  const removeInvoiceIds = objectIds(plan.removeIds);
  const removeDocumentIds = [...plan.documentKeeperOf.keys()].filter((id) => ObjectId.isValid(id));
  const docIdValues = idValues(removeDocumentIds);

  const [invoices, documents] = await Promise.all([
    col<any>("invoices").find({ user_id: userId, _id: { $in: removeInvoiceIds } } as any).toArray(),
    removeDocumentIds.length
      ? col<any>("documents").find({ user_id: userId, _id: { $in: objectIds(removeDocumentIds) } } as any).toArray()
      : Promise.resolve([]),
  ]);
  const backupPath = join(backupDir, `invoice-dedup-${userId}-${Date.now()}.json`);
  // Extended JSON keeps ObjectId and Date types, so rows can be re-inserted as they were.
  writeFileSync(backupPath, BSON.EJSON.stringify({ user_id: userId, created_at: new Date(), plan: {
    keeperOf: Object.fromEntries(plan.keeperOf),
    documentKeeperOf: Object.fromEntries(plan.documentKeeperOf),
    relinks: plan.relinks,
    clearPairs: plan.clearPairs,
  }, invoices, documents }, undefined, 2));
  console.log(`  backup: ${backupPath}`);

  for (const [keeperId, fill] of plan.fills) {
    await col<any>("invoices").updateOne({ _id: new ObjectId(keeperId), user_id: userId } as any, { $set: fill } as any);
  }
  for (const [keeperId, messageIds] of plan.supersededMessageIds) {
    await col<any>("invoices").updateOne(
      { _id: new ObjectId(keeperId), user_id: userId } as any,
      { $addToSet: { superseded_gmail_message_ids: { $each: messageIds } } } as any,
    );
  }

  const clearPair = { $unset: { paired_with: "", pair_status: "", pair_score: "", pair_reasons: "", pair_linked_at: "" } };
  if (plan.clearPairs.length) {
    await col<any>("invoices").updateMany({ user_id: userId, _id: { $in: objectIds(plan.clearPairs) } } as any, clearPair as any);
  }
  const linkedAt = new Date();
  for (const relink of plan.relinks) {
    const set = (partner: string) => ({
      paired_with: partner,
      pair_status: relink.status,
      pair_score: relink.score,
      pair_reasons: relink.reasons,
      pair_linked_at: linkedAt,
    });
    await col<any>("invoices").updateOne({ _id: new ObjectId(relink.a), user_id: userId } as any, { $set: set(relink.b) } as any);
    await col<any>("invoices").updateOne({ _id: new ObjectId(relink.b), user_id: userId } as any, { $set: set(relink.a) } as any);
  }

  // Keep Gmail import history pointing at the kept copy so the message still counts as imported.
  const gmailImports = await col<any>("gmail_imports").find({
    user_id: userId,
    $or: [
      { "files.document_id": { $in: removeDocumentIds } },
      { "files.invoice_id": { $in: plan.removeIds } },
    ],
  } as any).toArray();
  for (const row of gmailImports) {
    const files = (row.files ?? []).map((file: Record<string, unknown>) => {
      const documentId = String(file.document_id ?? "");
      const invoiceId = String(file.invoice_id ?? "");
      return {
        ...file,
        ...(plan.documentKeeperOf.has(documentId) && { document_id: plan.documentKeeperOf.get(documentId) }),
        ...(plan.keeperOf.has(invoiceId) && { invoice_id: plan.keeperOf.get(invoiceId) }),
      };
    });
    await col<any>("gmail_imports").updateOne({ _id: row._id } as any, { $set: { files } } as any);
  }

  await col<any>("invoices").deleteMany({ user_id: userId, _id: { $in: removeInvoiceIds } } as any);

  if (removeDocumentIds.length) {
    const contracts = await col<any>("contracts")
      .find({ user_id: userId, document_id: { $in: docIdValues } } as any, { projection: { _id: 1 } } as any)
      .toArray();
    const contractIds = contracts.map((contract: any) => String(contract._id));
    await Promise.all([
      contractIds.length
        ? col("reminders").deleteMany({ user_id: userId, source_type: "contract_expiry", source_id: { $in: contractIds } } as any)
        : Promise.resolve(),
      col("extractions").deleteMany({ document_id: { $in: docIdValues } } as any),
      col("tasks").deleteMany({ user_id: userId, document_id: { $in: docIdValues } } as any),
      col("document_clients").deleteMany({ document_id: { $in: docIdValues } } as any),
      col("timeline_events").deleteMany({ source_type: "document", source_id: { $in: removeDocumentIds } } as any),
      col("reminders").deleteMany({ user_id: userId, document_id: { $in: docIdValues } } as any),
      col("contracts").deleteMany({ user_id: userId, document_id: { $in: docIdValues } } as any),
      col("equipment").deleteMany({ user_id: userId, document_id: { $in: docIdValues } } as any),
      col("document_processing_jobs").deleteMany({ document_id: { $in: docIdValues }, status: { $ne: "running" } } as any),
    ]);
    await col("documents").deleteMany({ user_id: userId, _id: { $in: objectIds(removeDocumentIds) } } as any);

    const docsDir = join(getDataDir(), "documents");
    let driveFilesLeft = 0;
    for (const doc of documents) {
      for (const key of [doc.spaces_key, doc.thumbnail_key]) {
        if (key) await deleteFromSpaces(String(key)).catch((err) => console.warn(`  storage delete failed ${key}: ${err}`));
      }
      for (const path of [doc.file_path, doc.thumbnail_path]) {
        const local = String(path ?? "");
        if (local.startsWith(docsDir) && existsSync(local)) {
          try { unlinkSync(local); } catch (err) { console.warn(`  local delete failed ${local}: ${err}`); }
        }
      }
      if (doc.drive_file_id) driveFilesLeft += 1;
    }
    if (driveFilesLeft) console.log(`  ${driveFilesLeft} removed document(s) still have a Google Drive copy; those are left in place.`);
  }

  console.log(`  deleted invoices=${invoices.length} documents=${documents.length}`);
}

async function main() {
  await connectDb();
  const target = getDbTargetStatus();
  const db = target.primary === "production" ? target.production : target.local;
  console.log(`[invoice-dedup] db=${db.dbName} host=${db.host} mode=${apply ? "apply" : "dry-run"}${loose ? " loose" : ""}`);

  const backupDir = join(getDataDir(), "backups");
  if (apply) mkdirSync(backupDir, { recursive: true });

  let totalGroups = 0;
  let totalRemoved = 0;
  for (const userId of await resolveUserIds()) {
    const rows = await col<any>("invoices")
      .find({ user_id: userId } as any, { projection: { preview_html: 0 } } as any)
      .toArray();
    const documentIds = rows.map((row: any) => String(row.document_id ?? "")).filter((id: string) => ObjectId.isValid(id));
    const existing = documentIds.length
      ? await col<any>("documents").find({ user_id: userId, _id: { $in: objectIds(documentIds) } } as any, { projection: { _id: 1 } } as any).toArray()
      : [];
    const plan = planInvoiceDedup(rows, { loose, existingDocumentIds: new Set(existing.map((doc: any) => String(doc._id))) });
    if (!plan.groups.length) continue;
    totalGroups += plan.groups.length;
    totalRemoved += plan.removeIds.length;
    printPlan(userId, plan);
    if (apply) await applyPlan(userId, plan, backupDir);
  }

  console.log(`\n[invoice-dedup] groups=${totalGroups} ${apply ? "removed" : "would remove"}=${totalRemoved}`);
  if (!apply && totalRemoved) console.log("[invoice-dedup] Dry run only. Add --apply to delete the duplicates.");
}

main()
  .catch((err) => {
    console.error("[invoice-dedup] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
