import {mkdir, readFile, writeFile} from "node:fs/promises";
import {loadUnsubscribedEmails} from "./unsubscribed.mjs";

// Builds the SEED outreach manifest from a plain list (one address per line),
// skipping anyone flagged unsubscribed in inspector_leads.
// Usage: node email-drafts/prepare-seed-campaign.mjs <path-to-list.txt> [--dev]
const source = process.argv.slice(2).find(arg => !arg.startsWith("--"));
if (!source) throw new Error("Usage: prepare-seed-campaign.mjs <list.txt> [--dev]");
const {emails: unsubscribed} = await loadUnsubscribedEmails({dev: process.argv.includes("--dev")});

const EMAIL_RE = /^[^\s@,;<>/]+@[^\s@,;<>/]+\.[a-z]{2,}$/;
// Obvious domain typos — skip rather than guess at the intended address.
const BAD_DOMAIN_RE = /@(gmail\.(cvom|con|il|co\.il)|gmaill\.com|gnail\.com|gmil\.com|amail\.com|wallal\.com|uahoo\.com|tauex\.tux\.ac\.il)$|\.co\.ul$/;

const lines = (await readFile(source, "utf8")).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const previous = JSON.parse(await readFile(new URL("../data/outreach/inspector-introduction-manifest.json", import.meta.url), "utf8"));
const alreadySent = new Set(previous.recipients);

const recipients = new Set();
const invalid = [];
const typos = [];
const duplicates = [];
const skippedAlreadySent = [];
const skippedUnsubscribed = [];
for (const line of lines) {
  const email = line.toLowerCase();
  if (!EMAIL_RE.test(email)) { invalid.push(line); continue; }
  if (BAD_DOMAIN_RE.test(email)) { typos.push(line); continue; }
  if (recipients.has(email)) { duplicates.push(line); continue; }
  if (unsubscribed.has(email)) { skippedUnsubscribed.push(email); continue; }
  if (alreadySent.has(email)) { skippedAlreadySent.push(email); continue; }
  recipients.add(email);
}

const manifest = {campaign: "seed-introduction-v1", source: "SEED/seed-emails-all.txt", recipients: [...recipients].sort()};
await mkdir(new URL("../data/outreach/", import.meta.url), {recursive: true});
await writeFile(new URL("../data/outreach/seed-introduction-manifest.json", import.meta.url), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({
  lines: lines.length, uniqueRecipients: recipients.size, invalid, typos,
  duplicates: duplicates.length, skippedAlreadySent: skippedAlreadySent.length, skippedUnsubscribed,
  manifest: "server/data/outreach/seed-introduction-manifest.json",
}, null, 2));
