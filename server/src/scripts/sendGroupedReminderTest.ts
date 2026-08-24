import { config } from "dotenv";
import { ObjectId } from "mongodb";
import { closeDb, col, connectDb } from "../db/db";
import { parseObjectRecord } from "../contracts/contractEmail";
import { sendGroupedReminderEmail } from "../reminders/emailSender";
import { buildGroupedItemsTable, expiryFromReminderTitle } from "../reminders/groupedReminderEmail";
import { clientDisplayName } from "../utils/clientNames";
import type { ReminderWithContext } from "../shared/types";

config({ path: ".env.local" });
config();

const to = readArg("--to") ?? "arshavsky.pasha@gmail.com";
const userId = readArg("--user-id");
const date = readArg("--date");
const clientQuery = readArg("--client");

await connectDb();

try {
  const group = await findReminderGroup();
  if (!group) {
    console.log(JSON.stringify({ ok: false, error: "No grouped pending reminders found" }, null, 2));
    process.exitCode = 1;
  } else {
    const result = await sendGroupedReminderEmail({
      reminders: group.reminders,
      recipients: [to],
      clientName: group.clientName,
      triggerDate: group.triggerDate,
      itemsHtml: buildGroupedItemsTable(group.items),
    });

    console.log(JSON.stringify({
      ok: result.success,
      error: result.error ?? null,
      providerMessageId: result.providerMessageId ?? null,
      subject: result.subject,
      to,
      clientName: group.clientName,
      clientId: group.clientId,
      triggerDate: group.triggerDate,
      itemCount: group.reminders.length,
      reminders: group.reminders.map((row) => ({
        id: row.id,
        title: row.title,
        contract_number: row.contract_number,
      })),
      items: group.items,
    }, null, 2));

    if (!result.success) process.exitCode = 1;
  }
} finally {
  await closeDb();
}

async function findReminderGroup(): Promise<{
  clientId: string | null;
  clientName: string;
  triggerDate: string;
  reminders: ReminderWithContext[];
  items: Array<{ contract_number: string; equipment: string; license_number: string; expiry_date: string }>;
} | null> {
  const filter: Record<string, unknown> = { status: "pending" };
  if (userId) filter.user_id = userId;
  if (date) filter.trigger_date = date;

  const rows = await col("reminders")
    .find(filter as any)
    .sort({ trigger_date: 1 })
    .limit(1000)
    .toArray() as Array<Record<string, any>>;

  const prepared = [];
  for (const row of rows) {
    const contract = await resolveContract(row) as any;
    const clientId = String(row.client_id ?? contract?.client_id ?? "");
    if (!clientId) continue;
    const client = await findById("clients", clientId) as any;
    const clientName = clientDisplayName(client?.display_name) ?? String(client?.display_name ?? clientId);
    if (clientQuery && !`${clientName} ${clientId}`.toLowerCase().includes(clientQuery.toLowerCase())) continue;
    const documentId = row.document_id ?? contract?.document_id ?? null;
    const document = documentId ? await findById("documents", documentId) as any : null;
    const reminder = {
      ...row,
      id: row._id?.toString?.() ?? String(row._id),
      client_id: clientId,
      document_id: documentId ? String(documentId) : null,
      client_name: clientName,
      document_name: document?.file_name ?? null,
      contract_number: contract?.contract_number ?? null,
      contract_type: contract?.contract_type ?? null,
    } as unknown as ReminderWithContext;
    prepared.push({
      reminder,
      contract,
      document,
      key: `${clientId}|${row.trigger_date}`,
      clientId,
      clientName,
      triggerDate: String(row.trigger_date ?? ""),
    });
  }

  const groups = new Map<string, typeof prepared>();
  for (const row of prepared) {
    const list = groups.get(row.key) ?? [];
    list.push(row);
    groups.set(row.key, list);
  }

  const selected = [...groups.values()]
    .filter((items) => items.length > 1)
    .sort((a, b) => b.length - a.length || a[0].triggerDate.localeCompare(b[0].triggerDate))[0];
  if (!selected) return null;

  return {
    clientId: selected[0].clientId,
    clientName: selected[0].clientName,
    triggerDate: selected[0].triggerDate,
    reminders: selected.map((row) => row.reminder),
    items: selected.map((row) => groupedTableItem(row)),
  };
}

function groupedTableItem(row: { reminder: ReminderWithContext; contract: any; document: any }) {
  const extracted = parseObjectRecord(row.document?.extracted_fields);
  const contract = row.contract ?? {};
  return {
    contract_number: String(contract.contract_number ?? row.reminder.contract_number ?? ""),
    equipment: String(
      extracted.checked_equipment
      ?? extracted.equipment_description
      ?? contract.checked_equipment
      ?? contract.equipment_description
      ?? row.reminder.title
      ?? "",
    ),
    license_number: String(extracted.license_number ?? contract.license_number ?? ""),
    expiry_date: String(contract.expiry_date ?? expiryFromReminderTitle(row.reminder.title) ?? ""),
  };
}

async function resolveContract(reminder: Record<string, any>) {
  if (!reminder.source_id) return null;
  const sourceType = String(reminder.source_type ?? "");
  if (sourceType && sourceType !== "contract_expiry" && sourceType !== "manual") return null;
  return findById("contracts", reminder.source_id);
}

async function findById(collection: string, id: unknown) {
  if (id == null || id === "") return null;
  const raw = String(id);
  const or: Array<Record<string, unknown>> = [{ _id: raw }, { id: raw }];
  if (ObjectId.isValid(raw)) or.unshift({ _id: new ObjectId(raw) });
  return col(collection).findOne({ $or: or } as any);
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}
