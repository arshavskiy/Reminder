/**
 * Revert contract expiry advances that were caused by sending reminders.
 *
 * Default is dry-run. Use --apply to write changes.
 * Optional: --user <userId>, --contract <contractId>
 *
 * The script uses contract_advances history:
 * - restores contracts.expiry_date from new_expiry back to previous_expiry
 * - removes pending reminders for that contract whose trigger_date is after
 *   the restored expiry date
 * - leaves sent reminders and email logs untouched
 */
import {config} from "dotenv";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {MongoClient, ObjectId} from "mongodb";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({path: resolve(__dirname, "../../.env")});

const apply = process.argv.includes("--apply");
const userId = argValue("--user");
const contractId = argValue("--contract");
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "reminder-app";

if (!uri) throw new Error("MONGODB_URI is required");

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const advanceFilter: Record<string, unknown> = {};
if (userId) advanceFilter.user_id = userId;
if (contractId) advanceFilter.contract_id = contractId;

const advances = await db.collection("contract_advances")
  .find(advanceFilter)
  .sort({advanced_at: -1})
  .toArray();

const latestByContract = new Map<string, any>();
for (const advance of advances as any[]) {
  const id = String(advance.contract_id ?? "");
  if (id && !latestByContract.has(id)) latestByContract.set(id, advance);
}

let contractsRestored = 0;
let remindersDeleted = 0;
let skipped = 0;

for (const advance of latestByContract.values()) {
  const id = String(advance.contract_id);
  const contract = await db.collection("contracts").findOne({
    _id: toObjectId(id),
    ...(advance.user_id ? {user_id: advance.user_id} : {}),
  } as any) as any;

  if (!contract) {
    skipped++;
    console.log(`skip ${id}: contract not found`);
    continue;
  }

  if (String(contract.expiry_date ?? "") !== String(advance.new_expiry ?? "")) {
    skipped++;
    console.log(`skip ${id}: expiry ${contract.expiry_date ?? "-"} does not match recorded new_expiry ${advance.new_expiry ?? "-"}`);
    continue;
  }

  const restoredExpiry = String(advance.previous_expiry ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(restoredExpiry)) {
    skipped++;
    console.log(`skip ${id}: invalid previous_expiry ${restoredExpiry}`);
    continue;
  }

  const reminderFilter = {
    user_id: contract.user_id,
    source_type: "contract_expiry",
    source_id: id,
    status: "pending",
    trigger_date: {$gt: restoredExpiry},
  };
  const pendingCount = await db.collection("reminders").countDocuments(reminderFilter);
  console.log(`${apply ? "restore" : "would restore"} ${id}: expiry ${contract.expiry_date} -> ${restoredExpiry}, delete pending future reminders=${pendingCount}`);

  if (!apply) continue;

  await db.collection("contracts").updateOne(
    {_id: contract._id},
    {$set: {expiry_date: restoredExpiry, updated_at: new Date()}}
  );
  contractsRestored++;

  const deleteResult = await db.collection("reminders").deleteMany(reminderFilter);
  remindersDeleted += deleteResult.deletedCount ?? 0;
}

console.log(`${apply ? "Done" : "Dry run"}: contracts_restored=${contractsRestored}, reminders_deleted=${remindersDeleted}, skipped=${skipped}`);

await client.close();

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}

function toObjectId(value: string): ObjectId | string {
  try {
    return new ObjectId(value);
  } catch {
    return value;
  }
}
