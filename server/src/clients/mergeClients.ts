import {ObjectId} from "mongodb";
import {col} from "../db/db";

export class MergeClientsError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toObjectId(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

function clientIdQueryValues(id: string): unknown[] {
  const oid = toObjectId(id);
  return oid ? [id, oid] : [id];
}

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as {code?: number}).code === 11000);
}

const FILL_KEYS = [
  "email",
  "phone",
  "mobile",
  "contact_person",
  "id_number",
  "fax",
  "address",
  "city",
  "po_box",
  "client_zipcode",
  "tags",
] as const;

export function uniqueClientIds(values: unknown): string[] {
  const list = Array.isArray(values) ? values : [];
  return [...new Set(list.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

export function applyDuplicateClientFields(canonical: Record<string, any>, duplicate: Record<string, any>) {
  const updates: Record<string, unknown> = {updated_at: new Date()};
  for (const key of FILL_KEYS) {
    if (duplicate[key] && !canonical[key]) {
      updates[key] = duplicate[key];
      canonical[key] = duplicate[key];
    }
  }
  const notes = [
    canonical.notes,
    duplicate.notes,
    `מוזג לקוח כפול "${duplicate.display_name ?? ""}"`,
  ].filter(Boolean).join("\n");
  updates.notes = notes;
  canonical.notes = notes;
  return updates;
}

export async function mergeClientRecord(duplicate: any, canonical: any) {
  const duplicateId = duplicate._id.toString();
  const canonicalId = canonical._id.toString();
  const documentClients = await relinkDocumentClients(duplicateId, canonicalId);
  const linked = await relinkSimpleClientFields(duplicateId, canonicalId);
  const updates = applyDuplicateClientFields(canonical, duplicate);

  await col("clients").updateOne({_id: canonical._id}, {$set: updates});
  await col("clients").deleteOne({_id: duplicate._id});

  return {documentClients, linked};
}

export async function mergeClientsForUser(userId: string, sourceIds: string[], canonicalId: string) {
  const uniqueIds = uniqueClientIds(sourceIds);
  const keptId = String(canonicalId ?? "").trim();
  if (uniqueIds.length < 2) {
    throw new MergeClientsError(400, "Choose at least two clients to merge");
  }
  if (!keptId || !uniqueIds.includes(keptId)) {
    throw new MergeClientsError(400, "Canonical client must be one of the selected clients");
  }

  const objectIds = uniqueIds.map((id) => toObjectId(id)).filter((id): id is ObjectId => Boolean(id));
  const clients = await col("clients").find({
    user_id: userId,
    $or: [
      ...(objectIds.length ? [{_id: {$in: objectIds}}] : []),
      {_id: {$in: uniqueIds}},
    ],
  } as any).toArray() as any[];

  const byId = new Map(clients.map((client) => [client._id.toString(), client]));
  if (uniqueIds.some((id) => !byId.has(id))) {
    throw new MergeClientsError(404, "One or more clients were not found");
  }

  const canonical = byId.get(keptId);
  const duplicates = uniqueIds.filter((id) => id !== keptId).map((id) => byId.get(id));
  for (const duplicate of duplicates) {
    await mergeClientRecord(duplicate, canonical);
  }

  return {
    ok: true as const,
    merged: duplicates.length,
    kept: keptId,
    clientName: String(canonical.display_name ?? ""),
  };
}

async function relinkDocumentClients(duplicateId: string, canonicalId: string) {
  const canonicalValues = clientIdQueryValues(canonicalId);
  const [links, canonicalLinks] = await Promise.all([
    col("document_clients").find({client_id: {$in: clientIdQueryValues(duplicateId)}} as any).toArray() as Promise<any[]>,
    col("document_clients").find({client_id: {$in: canonicalValues}} as any).toArray() as Promise<any[]>,
  ]);
  const canonicalDocIds = new Set(canonicalLinks.map((link) => String(link.document_id)));
  let relinked = 0;
  let removed = 0;

  for (const link of links) {
    const documentId = String(link.document_id);
    if (canonicalDocIds.has(documentId)) {
      await col("document_clients").deleteOne({_id: link._id});
      removed += 1;
      continue;
    }
    try {
      await col("document_clients").updateOne({_id: link._id}, {$set: {client_id: canonicalId}});
      canonicalDocIds.add(documentId);
      relinked += 1;
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      await col("document_clients").deleteOne({_id: link._id});
      removed += 1;
    }
  }

  return {relinked, removed};
}

async function relinkSimpleClientFields(duplicateId: string, canonicalId: string) {
  const idValues = clientIdQueryValues(duplicateId);
  const [contracts, reminders, tasks, equipment, timeline, drafts] = await Promise.all([
    col("contracts").updateMany({client_id: {$in: idValues}} as any, {$set: {client_id: canonicalId}}),
    col("reminders").updateMany({client_id: {$in: idValues}} as any, {$set: {client_id: canonicalId}}),
    col("tasks").updateMany({client_id: {$in: idValues}} as any, {$set: {client_id: canonicalId}}),
    col("equipment").updateMany({client_id: {$in: idValues}} as any, {$set: {client_id: canonicalId}}),
    col("timeline_events").updateMany({client_id: {$in: idValues}} as any, {$set: {client_id: canonicalId}}),
    col("print_template_drafts").updateMany({client_id: {$in: idValues}} as any, {$set: {client_id: canonicalId}}),
  ]);

  return {
    contracts: contracts.modifiedCount,
    reminders: reminders.modifiedCount,
    tasks: tasks.modifiedCount,
    equipment: equipment.modifiedCount,
    timeline: timeline.modifiedCount,
    drafts: drafts.modifiedCount,
  };
}
