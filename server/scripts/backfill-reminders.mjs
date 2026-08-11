/**
 * Backfill reminders for all contracts that have an expiry_date but no pending reminders.
 *
 * Usage (from repo root):
 *   node scripts/backfill-reminders.mjs [--dry-run] [--all] [--user <userId>]
 *
 * Options:
 *   --dry-run        Print what would be created without writing anything
 *   --all            Process ALL contracts including those that already have reminders
 *   --user <id>      Limit to a specific user_id
 */

import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import { resolve } from "path";

import { fileURLToPath } from "url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE_ALL = process.argv.includes("--all");
const userArgIdx = process.argv.indexOf("--user");
const FILTER_USER = userArgIdx !== -1 ? process.argv[userArgIdx + 1] : null;

const MONGODB_URI = process.env.MONGODB_LOCAL_URI ?? process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB ?? "reminder-app";
const ADVANCE_DAYS = Number(process.env.REMINDER_ADVANCE_DAYS ?? 30);

if (!MONGODB_URI) { console.error("No MONGODB_URI"); process.exit(1); }

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db(MONGODB_DB);

function col(name) { return db.collection(name); }

function tryOid(id) {
  try { return new ObjectId(id); } catch { return id; }
}

const today = new Date().toISOString().slice(0, 10);

// Build query
const contractQuery = { expiry_date: { $exists: true, $ne: null, $gt: today } };
if (FILTER_USER) contractQuery.user_id = FILTER_USER;

const contracts = await col("contracts").find(contractQuery).toArray();
console.log(`Found ${contracts.length} contracts with future expiry_date`);
if (DRY_RUN) console.log("DRY RUN — no writes\n");

let skippedNoEmail = 0;
let skippedHasReminders = 0;
let created = 0;
let errors = 0;

for (const contract of contracts) {
  const contractId = String(contract._id);
  const userId = contract.user_id ?? null;
  const expiryDate = String(contract.expiry_date);

  // Skip past dates (shouldn't happen given query, but be safe)
  if (expiryDate <= today) continue;

  // Skip if already has pending reminders (unless --all)
  if (!FORCE_ALL) {
    const existing = await col("reminders").countDocuments({
      source_type: "contract_expiry",
      source_id: contractId,
      status: { $in: ["pending", "snoozed"] },
    });
    if (existing > 0) {
      skippedHasReminders++;
      continue;
    }
  }

  // Resolve email: contact_email on contract > client email
  let email = contract.contact_email?.trim() || null;
  if (!email && contract.client_id) {
    const client = await col("clients").findOne({ _id: tryOid(String(contract.client_id)) });
    email = client?.email?.trim() || null;
  }
  if (!email) {
    console.log(`  SKIP (no email) contract=${contractId} expiry=${expiryDate}`);
    skippedNoEmail++;
    continue;
  }

  // Compute trigger date
  const expiry = new Date(expiryDate);
  const trigger = new Date(expiry);
  trigger.setDate(trigger.getDate() - ADVANCE_DAYS);
  const triggerDate = trigger.toISOString().slice(0, 10);

  const label = contract.contract_type ?? contract.document_name ?? contractId;
  console.log(`  ${DRY_RUN ? "[DRY]" : "CREATE"} contract=${contractId} "${label}" expiry=${expiryDate} trigger=${triggerDate} email=${email}`);

  if (!DRY_RUN) {
    try {
      // Delete stale pending/snoozed/error reminders for this contract first
      await col("reminders").deleteMany({
        ...(userId && { user_id: userId }),
        source_type: "contract_expiry",
        source_id: contractId,
        status: { $in: ["pending", "snoozed", "error"] },
      });

      await col("reminders").insertOne({
        user_id: userId,
        source_type: "contract_expiry",
        source_id: contractId,
        document_id: contract.document_id ?? null,
        client_id: contract.client_id ?? null,
        title: `פג תוקף: ${label}`,
        trigger_date: triggerDate,
        expiry_date: expiryDate,
        status: "pending",
        email,
        created_at: new Date(),
        updated_at: new Date(),
      });
      created++;
    } catch (err) {
      console.error(`  ERROR contract=${contractId}:`, err.message);
      errors++;
    }
  } else {
    created++;
  }
}

console.log(`
=== Summary ===
Contracts scanned:       ${contracts.length}
Reminders created:       ${created}${DRY_RUN ? " (dry run)" : ""}
Skipped (has reminders): ${skippedHasReminders}
Skipped (no email):      ${skippedNoEmail}
Errors:                  ${errors}
`);

await client.close();
