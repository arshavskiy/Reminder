import {readFile} from "node:fs/promises";
import {config} from "dotenv";
import {MongoClient} from "mongodb";

// Records the SEED campaign sends in inspector_leads: existing leads get the send
// appended to emailCampaigns (and NEW becomes CONTACTED); unknown addresses are
// inserted as new leads with source "seed-email-list".
// Dry run by default; pass --apply to write. Targets production (MONGODB_PRODUCTION_URI).
config({path: new URL("../.env.local", import.meta.url), quiet: true});
config({path: new URL("../.env", import.meta.url), quiet: true});
if (!process.env.MONGODB_PRODUCTION_URI) throw new Error("MONGODB_PRODUCTION_URI is required");
const apply = process.argv.includes("--apply");
const CAMPAIGN = "seed-introduction-v1";
const SUBJECT = "פרסומת: ניהול מסמכים, תפוגות ותזכורות — RemindOCR";

const receipts = (await readFile(new URL("../data/outreach/seed-introduction-receipts.jsonl", import.meta.url), "utf8"))
  .trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
const sends = [];
for (const receipt of receipts) {
  receipt.recipients.forEach((email, i) => sends.push({
    email, sentAt: new Date(receipt.acceptedAt), resendId: receipt.result?.data?.[i]?.id ?? null,
  }));
}

const client = new MongoClient(process.env.MONGODB_PRODUCTION_URI, {serverSelectionTimeoutMS: 15000});
try {
  await client.connect();
  const leads = client.db(process.env.MONGODB_PRODUCTION_DB || "reminder-app").collection("inspector_leads");
  const existing = new Map();
  for (const lead of await leads.find({email: {$type: "string"}}, {projection: {email: 1, contactStatus: 1, emailCampaigns: 1}}).toArray()) {
    existing.set(lead.email.trim().toLowerCase(), lead);
  }
  const ops = [];
  let updated = 0, inserted = 0, alreadyRecorded = 0;
  for (const send of sends) {
    const entry = {campaign: CAMPAIGN, subject: SUBJECT, sentAt: send.sentAt, resendId: send.resendId};
    const lead = existing.get(send.email);
    if (lead) {
      if ((lead.emailCampaigns ?? []).some(c => c.campaign === CAMPAIGN)) { alreadyRecorded++; continue; }
      const status = String(lead.contactStatus || "NEW").toUpperCase();
      ops.push({updateOne: {filter: {_id: lead._id}, update: {
        $push: {emailCampaigns: entry},
        $set: {lastEmailedAt: send.sentAt, lastEmailCampaign: CAMPAIGN, updated_at: new Date(), ...(status === "NEW" ? {contactStatus: "CONTACTED"} : {})},
      }}});
      updated++;
    } else {
      ops.push({insertOne: {document: {
        name: null, email: send.email, source: "seed-email-list", contactStatus: "CONTACTED", leadScore: 0,
        emailCampaigns: [entry], lastEmailedAt: send.sentAt, lastEmailCampaign: CAMPAIGN,
        created_at: new Date(), updated_at: new Date(),
      }}});
      inserted++;
    }
  }
  console.log(JSON.stringify({mode: apply ? "apply" : "dry-run", sends: sends.length, updateExisting: updated, insertNew: inserted, alreadyRecorded,
    missingResendIds: sends.filter(s => !s.resendId).length}));
  if (apply && ops.length) {
    const result = await leads.bulkWrite(ops, {ordered: false});
    console.log(JSON.stringify({matched: result.matchedCount, modified: result.modifiedCount, inserted: result.insertedCount}));
  }
} finally { await client.close(); }
