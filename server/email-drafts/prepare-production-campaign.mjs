import {mkdir, writeFile} from "node:fs/promises";
import {config} from "dotenv";
import {MongoClient} from "mongodb";

config({path: new URL("../.env.local", import.meta.url), quiet: true});
config({path: new URL("../.env", import.meta.url), quiet: true});
if (!process.env.MONGODB_PRODUCTION_URI) throw new Error("MONGODB_PRODUCTION_URI is required");
const client = new MongoClient(process.env.MONGODB_PRODUCTION_URI, {serverSelectionTimeoutMS: 15000});
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_PRODUCTION_DB || "reminder-app");
  const leads = await db.collection("inspector_leads").find({}, {projection: {
    email: 1, contactStatus: 1, unsubscribed: 1, optOut: 1, doNotContact: 1, emailOptOut: 1,
  }}).toArray();
  const statuses = {};
  const recipients = new Set();
  const blocked = new Set();
  let invalidOrMissing = 0;
  for (const lead of leads) {
    const status = String(lead.contactStatus || "NEW").toUpperCase();
    statuses[status] = (statuses[status] || 0) + 1;
    const email = String(lead.email || "").trim().toLowerCase();
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) { invalidOrMissing++; continue; }
    if (lead.unsubscribed || lead.optOut || lead.doNotContact || lead.emailOptOut
      || ["UNSUBSCRIBED", "DO_NOT_CONTACT", "NOT_INTERESTED", "BLOCKED", "OPTED_OUT"].includes(status)) blocked.add(email);
    recipients.add(email);
  }
  for (const email of blocked) recipients.delete(email);
  recipients.delete("arshavsky.pasha@gmail.com"); // Already received this version.
  const manifest = {campaign: "inspector-introduction-contact-footer-v2", collection: "inspector_leads", recipients: [...recipients].sort()};
  await mkdir(new URL("../data/outreach/", import.meta.url), {recursive: true});
  await writeFile(new URL("../data/outreach/inspector-introduction-manifest.json", import.meta.url), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({totalLeads: leads.length, statuses, invalidOrMissing, blockedAddresses: blocked.size, uniqueRecipients: recipients.size, manifest: "server/data/outreach/inspector-introduction-manifest.json"}));
} finally { await client.close(); }
