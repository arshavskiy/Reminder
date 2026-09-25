/**
 * Read-only comparison of the dev database (MONGODB_LOCAL_URI / MONGODB_URI +
 * MONGODB_DB) against production (SEED_MONGODB_URI or MONGODB_PRODUCTION_URI).
 *
 * Prints document counts for the main collections, then a SEED breakdown:
 * leads only in one DB, campaign sends and unsubscribes recorded on each side,
 * email campaigns and unsubscribe scans. Writes nothing.
 *
 *   npx tsx src/scripts/compareSeedDbs.ts
 */
import "./loadEnv";
import {Db, MongoClient} from "mongodb";

const devUri = process.env.MONGODB_LOCAL_URI || process.env.MONGODB_URI;
const devDbName = process.env.MONGODB_DB || "reminder-dev";
const prodUri = process.env.SEED_MONGODB_URI || process.env.MONGODB_PRODUCTION_URI;
const prodDbName = process.env.SEED_MONGODB_DB || process.env.MONGODB_PRODUCTION_DB || "reminder-app";
if (!devUri) throw new Error("MONGODB_LOCAL_URI or MONGODB_URI is required (dev database)");
if (!prodUri) throw new Error("SEED_MONGODB_URI or MONGODB_PRODUCTION_URI is required (production database)");

const COUNTED = [
  "users", "clients", "contracts", "documents", "reminders", "invoices", "equipment",
  "inspector_leads", "email_campaigns", "unsubscribe_scans", "gmail_search_providers",
];

const host = (uri: string) => uri.match(/@([^/?]+)/)?.[1] ?? uri;

async function leadStats(db: Db) {
  const leads = await db.collection("inspector_leads")
    .find({}, {projection: {email: 1, unsubscribed: 1, emailCampaigns: 1, contactStatus: 1, source: 1}})
    .toArray();
  const byEmail = new Map<string, any>();
  let noEmail = 0;
  for (const lead of leads) {
    const email = typeof lead.email === "string" ? lead.email.trim().toLowerCase() : "";
    if (!email) { noEmail += 1; continue; }
    byEmail.set(email, lead);
  }
  const sends = new Map<string, number>();
  for (const lead of leads) for (const c of lead.emailCampaigns ?? []) sends.set(c.campaign, (sends.get(c.campaign) ?? 0) + 1);
  return {
    total: leads.length,
    noEmail,
    byEmail,
    unsubscribed: leads.filter((l) => l.unsubscribed).length,
    withSends: leads.filter((l) => (l.emailCampaigns ?? []).length).length,
    sendsByCampaign: Object.fromEntries(sends),
    sources: leads.reduce<Record<string, number>>((acc, l) => { const k = l.source ?? "(none)"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}),
  };
}

async function main() {
  const dev = new MongoClient(devUri!, {serverSelectionTimeoutMS: 15000});
  const prod = new MongoClient(prodUri!, {serverSelectionTimeoutMS: 15000});
  await Promise.all([dev.connect(), prod.connect()]);
  try {
    const d = dev.db(devDbName);
    const p = prod.db(prodDbName);
    console.log(`dev : ${host(devUri!)} / ${devDbName}`);
    console.log(`prod: ${host(prodUri!)} / ${prodDbName}\n`);

    console.log("collection".padEnd(24) + "dev".padStart(8) + "prod".padStart(8) + "  diff");
    for (const name of COUNTED) {
      const [a, b] = await Promise.all([d.collection(name).estimatedDocumentCount(), p.collection(name).estimatedDocumentCount()]);
      console.log(name.padEnd(24) + String(a).padStart(8) + String(b).padStart(8) + "  " + (a === b ? "" : (a - b > 0 ? "+" : "") + (a - b)));
    }

    const [ld, lp] = await Promise.all([leadStats(d), leadStats(p)]);
    const onlyDev = [...ld.byEmail.keys()].filter((e) => !lp.byEmail.has(e));
    const onlyProd = [...lp.byEmail.keys()].filter((e) => !ld.byEmail.has(e));
    const unsubOnlyDev = [...ld.byEmail.entries()].filter(([e, l]) => l.unsubscribed && !lp.byEmail.get(e)?.unsubscribed).map(([e]) => e);
    const sendsOnlyDev = [...ld.byEmail.entries()].filter(([e, l]) => {
      const prodCampaigns = new Set((lp.byEmail.get(e)?.emailCampaigns ?? []).map((c: any) => c.campaign));
      return (l.emailCampaigns ?? []).some((c: any) => !prodCampaigns.has(c.campaign));
    }).length;

    console.log("\nSEED leads".padEnd(25) + "dev".padStart(8) + "prod".padStart(8));
    for (const [label, a, b] of [
      ["total", ld.total, lp.total],
      ["with email", ld.byEmail.size, lp.byEmail.size],
      ["unsubscribed", ld.unsubscribed, lp.unsubscribed],
      ["with campaign sends", ld.withSends, lp.withSends],
    ] as const) console.log(("  " + label).padEnd(24) + String(a).padStart(8) + String(b).padStart(8));

    console.log(`\n  leads only in dev   : ${onlyDev.length}${onlyDev.length ? `  e.g. ${onlyDev.slice(0, 5).join(", ")}` : ""}`);
    console.log(`  leads only in prod  : ${onlyProd.length}${onlyProd.length ? `  e.g. ${onlyProd.slice(0, 5).join(", ")}` : ""}`);
    console.log(`  unsubscribes missing in prod : ${unsubOnlyDev.length}${unsubOnlyDev.length ? `  (${unsubOnlyDev.join(", ")})` : ""}`);
    console.log(`  leads with sends missing in prod: ${sendsOnlyDev}`);
    console.log(`  sends by campaign  dev : ${JSON.stringify(ld.sendsByCampaign)}`);
    console.log(`  sends by campaign  prod: ${JSON.stringify(lp.sendsByCampaign)}`);
    console.log(`  lead sources dev : ${JSON.stringify(ld.sources)}`);
    console.log(`  lead sources prod: ${JSON.stringify(lp.sources)}`);

    const [cd, cp] = await Promise.all([
      d.collection("email_campaigns").find({}, {projection: {key: 1, name: 1, status: 1, counts: 1}}).toArray(),
      p.collection("email_campaigns").find({}, {projection: {key: 1, name: 1, status: 1, counts: 1}}).toArray(),
    ]);
    const prodKeys = new Set(cp.map((c) => c.key));
    console.log(`\nemail campaigns  dev ${cd.length} · prod ${cp.length}`);
    for (const c of cd.filter((c) => !prodKeys.has(c.key))) console.log(`  only in dev: ${c.name} (${c.key}) · ${c.status} · sent ${c.counts?.sent ?? 0}/${c.counts?.total ?? 0}`);
  } finally {
    await Promise.all([dev.close(), prod.close()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
