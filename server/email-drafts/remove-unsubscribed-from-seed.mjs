import {copyFile, readFile, writeFile} from "node:fs/promises";
import {loadUnsubscribedEmails} from "./unsubscribed.mjs";

// Rewrites a SEED list (one address per line) without anyone flagged unsubscribed
// in inspector_leads. Keeps a dated .bak copy of the original.
// Usage: node remove-unsubscribed-from-seed.mjs <list.txt> [--dev] [--apply]
const source = process.argv.slice(2).find(arg => !arg.startsWith("--"));
if (!source) throw new Error("Usage: remove-unsubscribed-from-seed.mjs <list.txt> [--dev] [--apply]");
const apply = process.argv.includes("--apply");
const {db, emails: unsubscribed} = await loadUnsubscribedEmails({dev: process.argv.includes("--dev")});

const raw = await readFile(source, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);
const removed = [];
const kept = lines.filter(line => {
  const email = line.trim().toLowerCase();
  if (email && unsubscribed.has(email)) { removed.push(line.trim()); return false; }
  return true;
});

console.log(JSON.stringify({mode: apply ? "apply" : "dry-run", db, unsubscribedInDb: unsubscribed.size, removed}, null, 2));
if (apply && removed.length) {
  const backup = `${source}.bak-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
  await copyFile(source, backup);
  await writeFile(source, kept.join(eol));
  console.log(JSON.stringify({written: source, backup}));
}
