/**
 * One-off script: find reminders with no email, resolve email from linked
 * client/contract/document, and update both the reminder and document.
 *
 * Usage: npx tsx src/scripts/backfillReminderEmails.ts [--dry-run]
 */
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname.slice(1) });

import { MongoClient, ObjectId } from "mongodb";
import { pickContractEmailWithMeta } from "../contracts/contractEmail.js";

const dryRun = process.argv.includes("--dry-run");
const uri = process.env.MONGODB_URI!;
const dbName = process.env.MONGODB_DB || "reminder-app";

const mongo = new MongoClient(uri);
await mongo.connect();
const db = mongo.db(dbName);

const reminders = await db.collection("reminders")
  .find({
    $or: [
      { email_to: null },
      { email_to: "" },
      { email_to: "[]" },
    ],
  })
  .toArray();

console.log(`Found ${reminders.length} reminders with no email.`);
if (dryRun) console.log("(dry-run mode — no writes)\n");

let updated = 0;
let docsUpdated = 0;
let unresolvable = 0;

for (const reminder of reminders) {
  const rid = reminder._id.toString();
  const contractId = reminder.source_id;
  const clientId = reminder.client_id;
  const documentId = reminder.document_id;

  let contract: any = null;
  if (contractId) {
    try { contract = await db.collection("contracts").findOne({ _id: new ObjectId(contractId) }); } catch {}
    if (!contract) {
      try { contract = await db.collection("contracts").findOne({ _id: contractId as any }); } catch {}
    }
  }

  let client: any = null;
  if (clientId) {
    try { client = await db.collection("clients").findOne({ _id: new ObjectId(clientId) }); } catch {}
    if (!client) {
      try { client = await db.collection("clients").findOne({ _id: clientId as any }); } catch {}
    }
  }

  let doc: any = null;
  let extracted: Record<string, unknown> = {};
  if (documentId) {
    try { doc = await db.collection("documents").findOne({ _id: new ObjectId(documentId) }); } catch {}
    if (!doc) {
      try { doc = await db.collection("documents").findOne({ _id: documentId as any }); } catch {}
    }
    if (doc?.extracted_fields) {
      try { extracted = typeof doc.extracted_fields === "string" ? JSON.parse(doc.extracted_fields) : doc.extracted_fields; } catch {}
    }
  }

  const result = pickContractEmailWithMeta(contract, extracted, client);
  if (!result.email) {
    console.log(`  ✗ ${rid}  "${reminder.title}"  — no email resolvable`);
    unresolvable++;
    continue;
  }

  const source =
    (contract?.contact_email || contract?.client_email) ? "contract" :
    (extracted.contact_email || extracted.client_email || extracted.email) ? "document" :
    client?.email ? "client" : "unknown";

  console.log(`  ✓ ${rid}  "${reminder.title}"  → ${result.email} (from ${source})`);

  if (!dryRun) {
    await db.collection("reminders").updateOne(
      { _id: reminder._id },
      { $set: { email_to: JSON.stringify([result.email]), updated_at: new Date() } },
    );
    updated++;

    if (doc && source === "client" && !extracted.client_email && !extracted.contact_email && !extracted.email) {
      extracted.client_email = result.email;
      await db.collection("documents").updateOne(
        { _id: doc._id },
        { $set: { extracted_fields: JSON.stringify(extracted), updated_at: new Date() } },
      );
      docsUpdated++;
    }
  } else {
    updated++;
  }
}

console.log(`\nSummary:`);
console.log(`  Total no-email reminders: ${reminders.length}`);
console.log(`  ${dryRun ? "Would update" : "Updated"}: ${updated}`);
console.log(`  Documents backfilled: ${docsUpdated}`);
console.log(`  Unresolvable (no email anywhere): ${unresolvable}`);

await mongo.close();
process.exit(0);
