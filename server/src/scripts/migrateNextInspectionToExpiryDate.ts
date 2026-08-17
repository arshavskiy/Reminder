import { connectDb } from "../db/db.js";
import {
  EXPIRY_FIELD,
  LEGACY_EXPIRY_FIELD,
  mergeLegacyExpiryFields,
  migrateDocTemplateRecord,
  migrateFlatFieldKeys,
} from "../shared/expiryField.js";

const apply = process.argv.includes("--apply");

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function migrateDocuments(db: Awaited<ReturnType<typeof connectDb>>) {
  const col = db.collection("documents");
  const cursor = col.find({ extracted_fields: { $regex: LEGACY_EXPIRY_FIELD } });
  let scanned = 0;
  let updated = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const fields = parseJsonObject(doc.extracted_fields);
    if (!fields) continue;
    const { changed, fields: merged } = mergeLegacyExpiryFields(fields);
    if (!changed) continue;
    updated += 1;
    console.log(`[documents] ${doc._id}`);
    if (apply) {
      await col.updateOne(
        { _id: doc._id },
        { $set: { extracted_fields: JSON.stringify(merged), updated_at: new Date() } },
      );
    }
  }

  console.log(`[documents] scanned=${scanned} updated=${updated}`);
}

async function migrateExtractions(db: Awaited<ReturnType<typeof connectDb>>) {
  const col = db.collection("extractions");
  const cursor = col.find({
    $or: [
      { [`fields.${LEGACY_EXPIRY_FIELD}`]: { $exists: true } },
      { raw_json: { $regex: LEGACY_EXPIRY_FIELD } },
    ],
  });
  let scanned = 0;
  let updated = 0;

  for await (const row of cursor) {
    scanned += 1;
    const patch: Record<string, unknown> = {};
    let changed = false;

    const fields = parseJsonObject(row.fields);
    if (fields) {
      const merged = mergeLegacyExpiryFields(fields);
      if (merged.changed) {
        patch.fields = merged.fields;
        changed = true;
      }
    }

    const raw = parseJsonObject(row.raw_json);
    if (raw) {
      const merged = mergeLegacyExpiryFields(raw);
      if (merged.changed) {
        patch.raw_json = JSON.stringify(merged.fields);
        changed = true;
      }
    }

    if (!changed) continue;
    updated += 1;
    console.log(`[extractions] ${row._id} doc=${row.document_id}`);
    if (apply) {
      await col.updateOne({ _id: row._id }, { $set: { ...patch, updated_at: new Date() } });
    }
  }

  console.log(`[extractions] scanned=${scanned} updated=${updated}`);
}

async function migrateDocTemplates(db: Awaited<ReturnType<typeof connectDb>>) {
  const col = db.collection("doc_templates");
  const cursor = col.find({
    $or: [
      { expiry_field: LEGACY_EXPIRY_FIELD },
      { "fields.key": LEGACY_EXPIRY_FIELD },
    ],
  });
  let scanned = 0;
  let updated = 0;

  for await (const tpl of cursor) {
    scanned += 1;
    const migrated = migrateDocTemplateRecord(tpl as Record<string, unknown>);
    if (!migrated.changed) continue;
    updated += 1;
    console.log(`[doc_templates] ${tpl._id} name=${tpl.name}`);
    if (apply) {
      await col.updateOne(
        { _id: tpl._id },
        { $set: { ...migrated.template, updated_at: new Date() } },
      );
    }
  }

  console.log(`[doc_templates] scanned=${scanned} updated=${updated}`);
}

async function migrateContractManualFields(db: Awaited<ReturnType<typeof connectDb>>) {
  const col = db.collection("contracts");
  const cursor = col.find({ manual_fields: { $regex: LEGACY_EXPIRY_FIELD } });
  let scanned = 0;
  let updated = 0;

  for await (const contract of cursor) {
    scanned += 1;
    const manual = parseJsonObject(contract.manual_fields);
    if (!manual) continue;
    const { changed, fields } = mergeLegacyExpiryFields(manual);
    if (!changed) continue;
    updated += 1;
    console.log(`[contracts.manual_fields] ${contract._id}`);
    if (apply) {
      await col.updateOne(
        { _id: contract._id },
        { $set: { manual_fields: fields, updated_at: new Date() } },
      );
    }
  }

  console.log(`[contracts.manual_fields] scanned=${scanned} updated=${updated}`);
}

async function migratePrintTemplateDrafts(db: Awaited<ReturnType<typeof connectDb>>) {
  const col = db.collection("print_template_drafts");
  const cursor = col.find({ [`data.${LEGACY_EXPIRY_FIELD}`]: { $exists: true } });
  let scanned = 0;
  let updated = 0;

  for await (const draft of cursor) {
    scanned += 1;
    const data = parseJsonObject(draft.data);
    if (!data) continue;
    const { changed, data: merged } = migrateFlatFieldKeys(data);
    if (!changed) continue;
    updated += 1;
    console.log(`[print_template_drafts] ${draft._id}`);
    if (apply) {
      await col.updateOne(
        { _id: draft._id },
        { $set: { data: merged, updated_at: new Date() } },
      );
    }
  }

  console.log(`[print_template_drafts] scanned=${scanned} updated=${updated}`);
}

async function migratePrintTemplates(db: Awaited<ReturnType<typeof connectDb>>) {
  const col = db.collection("print_templates");
  const cursor = col.find({ "cells.bind": LEGACY_EXPIRY_FIELD });
  let scanned = 0;
  let updated = 0;

  for await (const tpl of cursor) {
    scanned += 1;
    if (!Array.isArray(tpl.cells)) continue;
    let changed = false;
    const cells = tpl.cells.map((cell: Record<string, unknown>) => {
      if (cell?.bind === LEGACY_EXPIRY_FIELD) {
        changed = true;
        return { ...cell, bind: EXPIRY_FIELD };
      }
      return cell;
    });
    if (!changed) continue;
    updated += 1;
    console.log(`[print_templates] ${tpl._id} name=${tpl.name}`);
    if (apply) {
      await col.updateOne(
        { _id: tpl._id },
        { $set: { cells, updated_at: new Date() } },
      );
    }
  }

  console.log(`[print_templates] scanned=${scanned} updated=${updated}`);
}

async function main() {
  const db = await connectDb();
  console.log(`[migrate-expiry-field] mode=${apply ? "apply" : "dry-run"}`);

  await migrateDocuments(db);
  await migrateExtractions(db);
  await migrateDocTemplates(db);
  await migrateContractManualFields(db);
  await migratePrintTemplateDrafts(db);
  await migratePrintTemplates(db);

  console.log(apply
    ? "[migrate-expiry-field] Done."
    : "[migrate-expiry-field] Dry run only. Re-run with --apply to write changes.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
