import "dotenv/config";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb} from "../db/db";
import {normalizeClientIdentityKey, normalizePhoneIdentityKey} from "../pipeline/importer";

const OWNER_EMAIL = "arshavsky.pasha@gmail.com";

function arg(name: string): string | undefined {
  const eqPrefix = `--${name}=`;
  const eqArg = process.argv.find((value) => value.startsWith(eqPrefix));
  if (eqArg) return eqArg.slice(eqPrefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function isApply(): boolean {
  return process.argv.includes("--apply");
}

function toObjectId(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

function legalSuffixPenalty(name: string): number {
  const normalized = name
    .toLowerCase()
    .replace(/[״“”׳‘’`'"]/g, "\"");
  if (/(?:^|\s)מ\s*"?\s*ע(?=\s|$)/.test(normalized)) return 20;
  if (/בע\s*"?\s*מ|ב\s*ע\s*מ|בעמ/.test(normalized)) return 5;
  return 0;
}

function chooseCanonical(candidates: any[]): any {
  return [...candidates].sort((a, b) => {
    const aName = String(a.display_name ?? "");
    const bName = String(b.display_name ?? "");
    const aScore =
      legalSuffixPenalty(aName) -
      (a.email ? 3 : 0) -
      (a.id_number ? 3 : 0) -
      (a.phone ? 1 : 0) -
      (a.mobile ? 1 : 0);
    const bScore =
      legalSuffixPenalty(bName) -
      (b.email ? 3 : 0) -
      (b.id_number ? 3 : 0) -
      (b.phone ? 1 : 0) -
      (b.mobile ? 1 : 0);
    if (aScore !== bScore) return aScore - bScore;
    return aName.length - bName.length;
  })[0];
}

async function findUserId(): Promise<string> {
  const explicitUserId = arg("user-id") ?? arg("userId");
  if (explicitUserId?.trim()) return explicitUserId.trim();

  const email = arg("email") ?? OWNER_EMAIL;
  const user = await col("users").findOne({email}) as any;
  if (!user) throw new Error(`No user found with email ${email}`);
  return user._id.toString();
}

async function relinkDocumentClients(duplicateId: string, canonicalId: string) {
  const links = await col("document_clients").find({client_id: duplicateId}).toArray() as any[];
  let relinked = 0;
  let removed = 0;

  for (const link of links) {
    const existing = await col("document_clients").findOne({
      document_id: link.document_id,
      client_id: canonicalId,
    }) as any;

    if (existing) {
      await col("document_clients").deleteOne({_id: link._id});
      removed += 1;
    } else {
      await col("document_clients").updateOne({_id: link._id}, {$set: {client_id: canonicalId}});
      relinked += 1;
    }
  }

  return {relinked, removed};
}

async function relinkSimpleClientFields(duplicateId: string, canonicalId: string) {
  const duplicateObjectId = toObjectId(duplicateId);
  const idValues: any[] = [duplicateId, ...(duplicateObjectId ? [duplicateObjectId] : [])];

  const [contracts, reminders, tasks, equipment, timeline] = await Promise.all([
    col("contracts").updateMany({client_id: {$in: idValues}} as any, {$set: {client_id: canonicalId}}),
    col("reminders").updateMany({client_id: {$in: idValues}} as any, {$set: {client_id: canonicalId}}),
    col("tasks").updateMany({client_id: {$in: idValues}} as any, {$set: {client_id: canonicalId}}),
    col("equipment").updateMany({client_id: {$in: idValues}} as any, {$set: {client_id: canonicalId}}),
    col("timeline_events").updateMany({client_id: {$in: idValues}} as any, {$set: {client_id: canonicalId}}),
  ]);

  return {
    contracts: contracts.modifiedCount,
    reminders: reminders.modifiedCount,
    tasks: tasks.modifiedCount,
    equipment: equipment.modifiedCount,
    timeline: timeline.modifiedCount,
  };
}

async function mergeClient(duplicate: any, canonical: any) {
  const duplicateId = duplicate._id.toString();
  const canonicalId = canonical._id.toString();
  const documentClients = await relinkDocumentClients(duplicateId, canonicalId);
  const linked = await relinkSimpleClientFields(duplicateId, canonicalId);

  const notes = [
    canonical.notes,
    duplicate.notes,
    `Merged duplicate client "${duplicate.display_name}" (${duplicateId})`,
  ].filter(Boolean).join("\n");

  await col("clients").updateOne(
    {_id: canonical._id},
    {
      $set: {
        ...(duplicate.email && !canonical.email && {email: duplicate.email}),
        ...(duplicate.phone && !canonical.phone && {phone: duplicate.phone}),
        ...(duplicate.mobile && !canonical.mobile && {mobile: duplicate.mobile}),
        ...(duplicate.contact_person && !canonical.contact_person && {contact_person: duplicate.contact_person}),
        ...(duplicate.id_number && !canonical.id_number && {id_number: duplicate.id_number}),
        notes,
        updated_at: new Date(),
      },
    },
  );
  await col("clients").deleteOne({_id: duplicate._id});

  return {documentClients, linked};
}

async function main() {
  const apply = isApply();
  await connectDb();
  const userId = await findUserId();
  const clients = await col("clients").find({user_id: userId}).toArray() as any[];
  const groups = new Map<string, {label: string; clients: any[]}>();

  for (const client of clients) {
    const phoneKey = normalizePhoneIdentityKey(client.phone);
    const mobileKey = normalizePhoneIdentityKey(client.mobile);
    const nameKey = normalizeClientIdentityKey(String(client.display_name ?? ""));
    const effectivePhoneKey = phoneKey || mobileKey;
    const key = effectivePhoneKey ? `phone:${effectivePhoneKey}` : nameKey.length >= 3 ? `name:${nameKey}` : null;
    if (!key) continue;
    const group = groups.get(key) ?? {label: effectivePhoneKey ? `טלפון ${effectivePhoneKey}` : nameKey, clients: []};
    group.clients.push(client);
    groups.set(key, group);
  }

  const duplicateGroups = [...groups.entries()].filter(([, group]) => group.clients.length > 1);
  console.log(`[client-merge] user=${userId} duplicate groups=${duplicateGroups.length} mode=${apply ? "apply" : "dry-run"}`);

  for (const [, group] of duplicateGroups) {
    const canonical = chooseCanonical(group.clients);
    const duplicates = group.clients.filter((client) => client._id.toString() !== canonical._id.toString());
    console.log(`[client-merge] ${group.label}: keep "${canonical.display_name}" (${canonical._id}); merge ${duplicates.map((client) => `"${client.display_name}"`).join(", ")}`);

    if (!apply) continue;
    for (const duplicate of duplicates) {
      const result = await mergeClient(duplicate, canonical);
      console.log(`[client-merge] merged ${duplicate._id} -> ${canonical._id}`, result);
    }
  }

  if (!apply) console.log("[client-merge] Dry run only. Add --apply to merge and delete duplicates.");
}

main()
  .catch((err) => {
    console.error("[client-merge] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
