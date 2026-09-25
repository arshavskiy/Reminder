/**
 * One-time move of SEED data that was recorded only in the dev database into
 * production, before every environment switches to the single production SEED
 * database (see db/seedDb.ts).
 *
 * Merges by email, never deletes, never overwrites production values:
 *   - leads missing in production are inserted
 *   - campaign sends (emailCampaigns) missing in production are appended
 *   - unsubscribes are copied when production does not have them
 *   - NEW contactStatus is raised to the dev value (CONTACTED / NOT_RELEVANT)
 *   - email_campaigns and unsubscribe_scans missing in production are copied,
 *     with campaign recipients' leadIds remapped to production lead ids
 *
 * Dry run by default; --apply writes to production.
 *   npx tsx src/scripts/syncSeedToProduction.ts
 *   npx tsx src/scripts/syncSeedToProduction.ts --apply
 */
import "./loadEnv";
import {MongoClient, ObjectId} from "mongodb";

const apply = process.argv.includes("--apply");
const devUri = process.env.MONGODB_LOCAL_URI || process.env.MONGODB_URI;
const devDbName = process.env.MONGODB_DB || "reminder-dev";
const prodUri = process.env.SEED_MONGODB_URI || process.env.MONGODB_PRODUCTION_URI;
const prodDbName = process.env.SEED_MONGODB_DB || process.env.MONGODB_PRODUCTION_DB || "reminder-app";
if (!devUri) throw new Error("MONGODB_LOCAL_URI or MONGODB_URI is required (dev database)");
if (!prodUri) throw new Error("SEED_MONGODB_URI or MONGODB_PRODUCTION_URI is required (production database)");
if (devUri === prodUri && devDbName === prodDbName) throw new Error("dev and production point at the same database");

const emailOf = (lead: any) => (typeof lead.email === "string" ? lead.email.trim().toLowerCase() : "");
const STATUS_RANK: Record<string, number> = {NEW: 0, CONTACTED: 1, NOT_RELEVANT: 1, DEMO: 2, TRIAL: 3, CUSTOMER: 4};
const UNSUB_FIELDS = ["unsubscribed", "unsubscribedAt", "unsubscribeSource", "unsubscribeMessageId", "unsubscribeSubject", "unsubscribeSnippet", "unsubscribeScanId"];

async function main() {
  const dev = new MongoClient(devUri!, {serverSelectionTimeoutMS: 15000});
  const prod = new MongoClient(prodUri!, {serverSelectionTimeoutMS: 15000});
  await Promise.all([dev.connect(), prod.connect()]);
  try {
    const d = dev.db(devDbName);
    const p = prod.db(prodDbName);
    const devLeads = await d.collection("inspector_leads").find({}).toArray();
    const prodLeads = await p.collection("inspector_leads").find({}).toArray();
    const prodByEmail = new Map(prodLeads.filter(emailOf).map((l) => [emailOf(l), l]));

    const ops: any[] = [];
    const stats = {insertLeads: 0, appendSends: 0, copyUnsubscribes: 0, raiseStatus: 0};
    for (const lead of devLeads) {
      const email = emailOf(lead);
      if (!email) continue;
      const target = prodByEmail.get(email);
      if (!target) {
        const {_id, ...rest} = lead;
        ops.push({insertOne: {document: {...rest, synced_from_dev_at: new Date()}}});
        stats.insertLeads += 1;
        continue;
      }
      const set: Record<string, any> = {};
      const push: any[] = [];
      const known = new Set((target.emailCampaigns ?? []).map((c: any) => `${c.campaign}|${new Date(c.sentAt).getTime()}`));
      for (const c of lead.emailCampaigns ?? []) {
        if (!known.has(`${c.campaign}|${new Date(c.sentAt).getTime()}`)) push.push(c);
      }
      if (push.length) {
        stats.appendSends += push.length;
        const latest = [...(target.emailCampaigns ?? []), ...push].sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt))[0];
        set.lastEmailedAt = latest.sentAt;
        set.lastEmailCampaign = latest.campaign;
      }
      if (lead.unsubscribed && !target.unsubscribed) {
        for (const field of UNSUB_FIELDS) if (lead[field] !== undefined) set[field] = lead[field];
        stats.copyUnsubscribes += 1;
      }
      const devStatus = String(lead.contactStatus ?? "NEW");
      const prodStatus = String(target.contactStatus ?? "NEW");
      if (prodStatus === "NEW" && (STATUS_RANK[devStatus] ?? 0) > 0) {
        set.contactStatus = devStatus;
        stats.raiseStatus += 1;
      }
      if (!push.length && !Object.keys(set).length) continue;
      ops.push({updateOne: {
        filter: {_id: target._id},
        update: {...(push.length ? {$push: {emailCampaigns: {$each: push}}} : {}), $set: {...set, updated_at: new Date()}},
      }});
    }

    // Campaign docs: remap recipient leadIds from dev ids to production ids by email.
    const devIdToEmail = new Map(devLeads.map((l) => [String(l._id), emailOf(l)]));
    const prodCampaignKeys = new Set((await p.collection("email_campaigns").find({}, {projection: {key: 1}}).toArray()).map((c) => c.key));
    const campaigns = (await d.collection("email_campaigns").find({}).toArray()).filter((c) => !prodCampaignKeys.has(c.key));
    const prodIdByEmail = new Map(prodLeads.map((l) => [emailOf(l), String(l._id)]));
    const campaignDocs: any[] = campaigns.map(({_id, ...c}: any) => ({
      ...c,
      recipients: (c.recipients ?? []).map((r: any) => ({...r, leadId: prodIdByEmail.get(devIdToEmail.get(String(r.leadId)) ?? r.email) ?? null})),
      synced_from_dev_at: new Date(),
    }));
    const prodScanIds = new Set((await p.collection("unsubscribe_scans").find({}, {projection: {_id: 1}}).toArray()).map((s) => String(s._id)));
    const scans = (await d.collection("unsubscribe_scans").find({}).toArray()).filter((s) => !prodScanIds.has(String(s._id)));

    console.log(JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      from: devDbName,
      to: prodDbName,
      leads: stats,
      emailCampaignsToCopy: campaignDocs.map((c) => `${c.name} (${c.status})`),
      unsubscribeScansToCopy: scans.length,
    }, null, 2));

    if (!apply) return;
    if (ops.length) await p.collection("inspector_leads").bulkWrite(ops, {ordered: false});
    // New leads were just inserted, so campaign recipients get another id pass after the insert.
    if (campaignDocs.length) {
      const refreshed = new Map((await p.collection("inspector_leads").find({}, {projection: {email: 1}}).toArray()).map((l) => [emailOf(l), String(l._id)]));
      for (const c of campaignDocs) c.recipients = c.recipients.map((r: any) => ({...r, leadId: r.leadId ?? refreshed.get(String(r.email).toLowerCase()) ?? null}));
      await p.collection("email_campaigns").insertMany(campaignDocs as any[]);
    }
    if (scans.length) await p.collection("unsubscribe_scans").insertMany(scans.map((s) => ({...s, _id: new ObjectId(String(s._id))})));
    console.log("applied");
  } finally {
    await Promise.all([dev.close(), prod.close()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
