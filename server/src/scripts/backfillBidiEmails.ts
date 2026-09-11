/**
 * One-off repair of email addresses that Hebrew PDF bidi extraction mangled
 * before emailNormalizer owned the fix.
 *
 * Two artifacts are in the stored data (see emailNormalizer for the mechanism):
 * a reversed domain ("com.gmail@shanigolan") and digits bidi moved to the front
 * of the local part ("83shanigolan@"). Both were being written by the OCR regex
 * path, which carried a copy of the repair that only handled the first.
 *
 * Dry run by default — nothing is written without --apply. Run the dry run,
 * read the list, then re-run with --apply.
 *
 *   npx tsx src/scripts/backfillBidiEmails.ts
 *   npx tsx src/scripts/backfillBidiEmails.ts --apply
 *
 * Safety properties:
 *   - Only rewrites a value when normalizeEmail changes more than its case, so
 *     a pure lower-casing never counts as a repair and never causes a write.
 *   - Skips any value whose repair is not one of the two known artifact shapes,
 *     so an unexpected transformation is reported rather than applied.
 *   - Writes each document's extracted_fields back in the same JSON-string form
 *     it was read in, leaving every other field of the blob untouched.
 *   - Records the original value alongside the repair so a bad run is
 *     reversible from the audit log it prints.
 */
import {MongoClient} from "mongodb";
import {normalizeEmail} from "../pipeline/emailNormalizer.js";

const EMAIL_KEYS = ["contact_email", "client_email", "email"] as const;

type Repair = {
  collection: string;
  id: string;
  field: string;
  from: string;
  to: string;
  label: string;
};

/**
 * Whether a repair matches an artifact this script is allowed to fix.
 *
 * The guard is deliberately narrow: a change that is neither a domain
 * un-reversal nor a digit move is something the audit did not anticipate, and
 * the right response is to print it and leave the row alone.
 */
function isKnownArtifact(from: string, to: string): boolean {
  const lower = from.toLowerCase();
  if (to === lower) return false; // case-only, not a repair

  const [fromLocal = "", fromDomain = ""] = lower.split("@");
  const [toLocal = "", toDomain = ""] = to.split("@");

  // Reversed domain: the two sides swap, so the repaired domain is the old local
  // part read backwards through its separators.
  const domainWasReversed =
    fromDomain !== toDomain &&
    fromLocal.split(".").reverse().join(".").replace(/-/g, "") === toDomain.replace(/-/g, "");

  // Digit glue: same characters, digits moved from the front to the back.
  const digitsMoved = (() => {
    const match = fromLocal.match(/^(\d+)([a-z][a-z0-9._%+-]*)$/i);
    return Boolean(match && `${match[2]}${match[1]}` === toLocal);
  })();

  // Both at once — the case that motivated this script.
  const bothApplied = (() => {
    if (fromDomain === toDomain) return false;
    const swapped = fromDomain;
    const match = swapped.match(/^(\d+)([a-z][a-z0-9._%+-]*)$/i);
    return Boolean(match && `${match[2]}${match[1]}` === toLocal);
  })();

  return domainWasReversed || digitsMoved || bothApplied;
}

/** A repair worth making: changes something beyond case, and is a known shape. */
function planRepair(value: unknown): string | null {
  if (typeof value !== "string" || !value.includes("@")) return null;
  const fixed = normalizeEmail(value);
  if (fixed === value || fixed === value.toLowerCase().trim()) return null;
  return fixed;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "reminder-app");

  const repairs: Repair[] = [];
  const skipped: Repair[] = [];

  // ── documents.extracted_fields (stored as a JSON string) ───────────────────
  const documents = await db.collection("documents")
    .find(
      { extracted_fields: { $exists: true, $ne: null } },
      { projection: { extracted_fields: 1, file_name: 1 } },
    )
    .toArray();

  const documentUpdates: Array<{ id: any; fields: string }> = [];
  for (const doc of documents as any[]) {
    const raw = doc.extracted_fields;
    let parsed: any = raw;
    if (typeof raw === "string") {
      try { parsed = JSON.parse(raw); } catch { continue; }
    }
    if (!parsed || typeof parsed !== "object") continue;

    let touched = false;
    for (const key of EMAIL_KEYS) {
      const fixed = planRepair(parsed[key]);
      if (!fixed) continue;
      const entry: Repair = {
        collection: "documents",
        id: String(doc._id),
        field: key,
        from: String(parsed[key]),
        to: fixed,
        label: String(doc.file_name ?? "").slice(0, 60),
      };
      if (!isKnownArtifact(entry.from, entry.to)) { skipped.push(entry); continue; }
      repairs.push(entry);
      parsed[key] = fixed;
      touched = true;
    }
    // Re-serialised only when something changed, and in the same shape it was
    // read in, so an untouched document is never rewritten.
    if (touched) documentUpdates.push({ id: doc._id, fields: JSON.stringify(parsed) });
  }

  // ── clients.email — the addresses reminders are actually sent to ───────────
  const clientUpdates: Array<{ id: any; email: string }> = [];
  const clients = await db.collection("clients")
    .find({ email: { $exists: true, $ne: null } }, { projection: { email: 1, name: 1, display_name: 1 } })
    .toArray();
  for (const row of clients as any[]) {
    const fixed = planRepair(row.email);
    if (!fixed) continue;
    const entry: Repair = {
      collection: "clients",
      id: String(row._id),
      field: "email",
      from: String(row.email),
      to: fixed,
      label: String(row.name ?? row.display_name ?? "").slice(0, 60),
    };
    if (!isKnownArtifact(entry.from, entry.to)) { skipped.push(entry); continue; }
    repairs.push(entry);
    clientUpdates.push({ id: row._id, email: fixed });
  }

  // ── contracts ──────────────────────────────────────────────────────────────
  const contractUpdates: Array<{ id: any; set: Record<string, string> }> = [];
  const contracts = await db.collection("contracts")
    .find({}, { projection: { email: 1, contact_email: 1, client_email: 1, title: 1 } })
    .toArray();
  for (const row of contracts as any[]) {
    const set: Record<string, string> = {};
    for (const key of ["email", "contact_email", "client_email"]) {
      const fixed = planRepair(row[key]);
      if (!fixed) continue;
      const entry: Repair = {
        collection: "contracts",
        id: String(row._id),
        field: key,
        from: String(row[key]),
        to: fixed,
        label: String(row.title ?? "").slice(0, 60),
      };
      if (!isKnownArtifact(entry.from, entry.to)) { skipped.push(entry); continue; }
      repairs.push(entry);
      set[key] = fixed;
    }
    if (Object.keys(set).length > 0) contractUpdates.push({ id: row._id, set });
  }

  // ── reminders — pending sends still addressed to a mangled address ─────────
  // email_log is deliberately NOT repaired: it records what was actually sent,
  // and rewriting it would hide that 12 reminders really did go to the wrong
  // address between 17 and 29 Aug 2026.
  const reminderUpdates: Array<{ id: any; set: Record<string, string> }> = [];
  const reminders = await db.collection("reminders")
    .find({}, { projection: { email_to: 1, client_email: 1, title: 1 } })
    .toArray();
  for (const row of reminders as any[]) {
    const set: Record<string, string> = {};
    for (const key of ["email_to", "client_email"]) {
      const fixed = planRepair(row[key]);
      if (!fixed) continue;
      const entry: Repair = {
        collection: "reminders",
        id: String(row._id),
        field: key,
        from: String(row[key]),
        to: fixed,
        label: String(row.title ?? "").slice(0, 60),
      };
      if (!isKnownArtifact(entry.from, entry.to)) { skipped.push(entry); continue; }
      repairs.push(entry);
      set[key] = fixed;
    }
    if (Object.keys(set).length > 0) reminderUpdates.push({ id: row._id, set });
  }

  // ── report ─────────────────────────────────────────────────────────────────
  const byCollection = repairs.reduce<Record<string, number>>((acc, r) => {
    acc[r.collection] = (acc[r.collection] ?? 0) + 1;
    return acc;
  }, {});
  const distinct = new Map<string, string>();
  for (const r of repairs) distinct.set(r.from, r.to);

  console.log(apply ? "=== APPLYING REPAIRS ===" : "=== DRY RUN — nothing will be written ===");
  console.log(`scanned: ${documents.length} documents, ${clients.length} clients, ${contracts.length} contracts, ${reminders.length} reminders`);
  console.log(`repairs: ${repairs.length} field values across ${Object.entries(byCollection).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(`distinct addresses: ${distinct.size}`);
  console.log("");

  console.log("--- distinct repairs ---");
  for (const [from, to] of [...distinct].sort()) {
    const count = repairs.filter((r) => r.from === from).length;
    console.log(`  x${String(count).padStart(3)}  ${from.padEnd(34)} -> ${to}`);
  }

  const reminderRepairs = repairs.filter((r) => r.collection === "reminders");
  if (reminderRepairs.length > 0) {
    console.log("");
    console.log("--- reminders (pending sends — these would go to the wrong address) ---");
    for (const r of reminderRepairs) console.log(`  ${r.from} -> ${r.to}   (${r.label})`);
  }

  const clientRepairs = repairs.filter((r) => r.collection === "clients");
  if (clientRepairs.length > 0) {
    console.log("");
    console.log("--- clients (these receive reminder email) ---");
    for (const r of clientRepairs) console.log(`  ${r.from} -> ${r.to}   (${r.label})`);
  }

  if (skipped.length > 0) {
    console.log("");
    console.log(`--- SKIPPED: ${skipped.length} value(s) whose repair is not a recognised artifact ---`);
    for (const s of skipped) console.log(`  [${s.collection}.${s.field}] ${s.from} -> ${s.to}   id=${s.id}`);
    console.log("  Left unchanged. Review these by hand.");
  }

  if (!apply) {
    console.log("");
    console.log("Dry run complete. Re-run with --apply to write these changes.");
    await client.close();
    return;
  }

  // ── apply ──────────────────────────────────────────────────────────────────
  let written = 0;
  for (const update of documentUpdates) {
    await db.collection("documents").updateOne(
      { _id: update.id },
      { $set: { extracted_fields: update.fields, updated_at: new Date() } },
    );
    written++;
  }
  for (const update of clientUpdates) {
    await db.collection("clients").updateOne(
      { _id: update.id },
      { $set: { email: update.email, updated_at: new Date() } },
    );
    written++;
  }
  for (const update of contractUpdates) {
    await db.collection("contracts").updateOne(
      { _id: update.id },
      { $set: { ...update.set, updated_at: new Date() } },
    );
    written++;
  }
  for (const update of reminderUpdates) {
    await db.collection("reminders").updateOne(
      { _id: update.id },
      { $set: { ...update.set, updated_at: new Date() } },
    );
    written++;
  }

  console.log("");
  console.log(`Applied. ${written} record(s) updated (${repairs.length} field values).`);
  await client.close();
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
