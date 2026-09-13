import type {ReminderItem} from "../shared/types";
import type {ImportRow} from "./reminderTable";
import {importHash} from "./reminderTable";

/** A table row is an independent reminder subject, not a document or contract. */
export function reminderItemFields(row: ImportRow): Omit<ReminderItem, "id" | "client_id" | "created_at" | "updated_at"> {
  const f = row.fields;
  return {
    name: row.name, category: f.category || null, expiry_date: row.expiry, start_date: row.start,
    description: f.description || null, owner: f.owner || null, folder: f.folder || null,
    tags: (f.tags || "").split(";").map(tag => tag.trim()).filter(Boolean),
    priority: f.priority || null, location: f.location || null,
    document_reference: f.document || null, reference_number: f.documentNumber || null,
    url: f.url || null, audit_date: f.auditDate || null,
    advance_days: row.offsets, recipients: row.recipients, origin: "table_import",
  };
}

export function reminderItemSignature(row: ImportRow): string {
  // Column order, worksheet language and Excel numeric date storage must not affect identity.
  const fields = Object.entries(row.fields).filter(([, value]) => value !== "").sort(([a], [b]) => a.localeCompare(b));
  return importHash(JSON.stringify([row.name, row.expiry, row.start, fields, row.offsets, row.recipients]));
}
