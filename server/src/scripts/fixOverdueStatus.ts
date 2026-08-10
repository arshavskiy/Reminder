/**
 * One-time maintenance script:
 * 1. Find all contracts where expiry_date < today and status != "expired" → set status = "expired"
 * 2. For each overdue contract, delete all pending/snoozed/error reminders
 * Run: npx tsx src/scripts/fixOverdueStatus.ts
 */
import {connectDb, col} from "../db/db";

async function main() {
  await connectDb();
  const today = new Date().toISOString().slice(0, 10);

  // 1. Find contracts past expiry not yet marked overdue
  const contracts = await col("contracts")
    .find({ expiry_date: { $lt: today }, status: { $nin: ["expired", "cancelled"] } })
    .toArray();

  console.log(`Found ${contracts.length} contracts to mark overdue`);

  let markedOverdue = 0;
  let deletedReminders = 0;

  for (const c of contracts) {
    await col("contracts").updateOne(
      { _id: c._id },
      { $set: { status: "expired", updated_at: new Date() } }
    );
    markedOverdue++;

    const contractId = c._id.toString();
    const del = await col("reminders").deleteMany({
      source_type: "contract_expiry",
      source_id: contractId,
      status: { $in: ["pending", "snoozed", "error"] },
    });
    deletedReminders += del.deletedCount;

    console.log(`  ${contractId} expiry=${(c as any).expiry_date} → overdue, deleted ${del.deletedCount} reminders`);
  }

  // 2. Also delete stale pending reminders for contracts already marked overdue
  const overdueContracts = await col("contracts")
    .find({ status: "expired" })
    .project({ _id: 1 })
    .toArray();

  const overdueIds = overdueContracts.map((c: any) => c._id.toString());
  const staleDel = await col("reminders").deleteMany({
    source_type: "contract_expiry",
    source_id: { $in: overdueIds },
    status: { $in: ["pending", "snoozed", "error"] },
  });
  deletedReminders += staleDel.deletedCount;
  if (staleDel.deletedCount) {
    console.log(`Deleted ${staleDel.deletedCount} stale reminders for already-overdue contracts`);
  }

  console.log(`\nDone. marked_overdue=${markedOverdue} deleted_reminders=${deletedReminders}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
