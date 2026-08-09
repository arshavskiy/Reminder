/**
 * One-off script: scan contracts with past expiry_date that are still "active",
 * mark them "overdue", and dismiss any pending reminders tied to them.
 *
 * Usage: npx tsx src/scripts/fixOverdueContracts.ts [--dry-run]
 */
import {config} from "dotenv";
config({path: new URL("../../.env", import.meta.url).pathname.slice(1)});

import {MongoClient} from "mongodb";

const dryRun = process.argv.includes("--dry-run");
const uri = process.env.MONGODB_URI!;
const dbName = process.env.MONGODB_DB || "reminder-app";

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const today = new Date().toISOString().slice(0, 10);

const overdueContracts = await db.collection("contracts")
  .find({
    expiry_date: {$lt: today, $ne: null},
    status: {$in: ["active", null]},
  })
  .toArray();

console.log(`Found ${overdueContracts.length} contracts with past expiry still active/null.`);

let contractsFixed = 0;
let remindersFixed = 0;

for (const c of overdueContracts as any[]) {
  const id = c._id.toString();
  const expiry = c.expiry_date;
  const type = c.contract_type ?? "unknown";

  console.log(`  [${id}] type="${type}" expiry=${expiry} status=${c.status}`);

  if (!dryRun) {
    await db.collection("contracts").updateOne(
      {_id: c._id},
      {$set: {status: "overdue", updated_at: new Date()}}
    );
    contractsFixed++;
  }

  // Dismiss pending reminders for this contract
  const pendingReminders = await db.collection("reminders")
    .find({
      source_type: "contract_expiry",
      source_id: id,
      status: "pending",
    })
    .toArray();

  for (const r of pendingReminders as any[]) {
    console.log(`    dismiss reminder ${r._id} trigger=${r.trigger_date} adv=${r.advance_days}d`);
    if (!dryRun) {
      await db.collection("reminders").updateOne(
        {_id: r._id},
        {$set: {status: "dismissed", updated_at: new Date()}}
      );
      remindersFixed++;
    }
  }
}

console.log(`\n${dryRun ? "[DRY RUN] Would fix" : "Fixed"}: ${contractsFixed} contracts, ${remindersFixed} reminders.`);

await client.close();
