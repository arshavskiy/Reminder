/**
 * Merge the Ministry of Labor inspector-registry exports in SEED/ into
 * inspector_leads, and upsert the result to both the local and production
 * databases.
 *
 * The same person shows up many times across these files — once per
 * certification qualification they hold (lifting machines, accessories,
 * elevators, pressure vessels, tower cranes, ...), and often again across
 * several scrape runs of the same qualification. This script merges all of
 * that into one lead document per person, keyed by normalized name + city,
 * with certificationType collecting every qualification they hold.
 *
 * Sources, in the order contact info is preferred from them:
 *   1. inspectors.csv — manually researched business-directory data
 *      (company, phone, email, website, notes). Richest contact info, no
 *      ministry AuthorizationId for most rows.
 *   2. inspectors-elevators-with-contacts.xlsx,
 *      inspectors-lifting-machines-with-contacts.xlsx — the ministry
 *      registry for those two qualifications, merged with scraped contact
 *      details. Has AuthorizationId.
 *   3. labor-serviceproviders-*.json — raw browser-console scrape dumps
 *      covering the remaining qualifications (accessories, pressure
 *      vessels, boilers, cranes, ...). Heavily duplicated across files
 *      (repeated scrape runs), and a fraction of each file's rows are
 *      scraper pagination artifacts ("1 2 3 4 5 ...", detailStatus
 *      "not_opened") rather than real people — those are skipped.
 *
 * inspectors-elevators.csv / inspectors-lifting-machines.csv /
 * inspectors-elevators.xlsx / inspectors-lifting-machines.xlsx are not read
 * separately: they are the same ministry rows as the "-with-contacts"
 * xlsx files, just without the merged contact columns.
 *
 * Dry run by default; pass --apply to write. Writes to local and production
 * only if both MONGODB_LOCAL_URI (or MONGODB_URI) and MONGODB_PRODUCTION_URI
 * are set — pass --local-only or --prod-only to target one.
 *
 *   npm run inspector-leads:seed
 *   npm run inspector-leads:seed -- --apply
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import XLSX from "xlsx";
import { MongoClient } from "mongodb";

const SEED_DIR = "C:\\Users\\User\\Desktop\\Reminder\\SEED";
const apply = process.argv.includes("--apply");
const localOnly = process.argv.includes("--local-only");
const prodOnly = process.argv.includes("--prod-only");

interface RawContact {
  name: string;
    professionType?: string;
  company?: string;
  city?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  certificationType?: string;
  authId?: string;
  serviceNum?: string;
  sourceUrl?: string;
  notes?: string;
  sourceFile: string;
  sourceRank: number; // lower = preferred for contact-field precedence
}

interface MergedLead {
  name: string;
    professionType: string[];
  company: string | null;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  certificationType: string[];
  ministryAuthIds: string[];
  source: string;
  notes: string | null;
  contactStatus: "NEW";
  leadScore: number;
  created_at: Date;
  updated_at: Date;
}

// ── Text normalization ──────────────────────────────────────────────────────

/** Collapses the handful of apostrophe/quote glyphs these sources mix (' ׳ ’ `) into one, and trims whitespace. */
function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u2019\u05F3`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Case/quote/whitespace-insensitive key for matching the same person across sources. */
function identityKey(name: string, city: string): string {
  return `${normalizeText(name).toLowerCase()}|${normalizeText(city).toLowerCase()}`;
}

/** Scraper pagination artifacts look like "1 2 3 4 5 ..." or "... 8 9 10 11" rather than a name. */
function looksLikeJunkRow(name: string): boolean {
  const n = normalizeText(name);
  if (!n) return true;
  return /^[.\d\s]+$/.test(n);
}

function splitMulti(value: unknown): string[] {
  return normalizeText(value)
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** A raw email field sometimes carries two addresses joined by ; or , — only the first is a real single value. */
function firstEmail(value: unknown): string | undefined {
  return splitMulti(value)[0];
}

function firstNonEmpty(values: Array<string | undefined | null>): string | null {
  for (const v of values) {
    const n = normalizeText(v);
    if (n) return n;
  }
  return null;
}

// ── Source readers ──────────────────────────────────────────────────────────

function readCsv(path: string): Record<string, string>[] {
  const buf = readFileSync(path, "utf8");
  const wb = XLSX.read(buf, { type: "string" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function readXlsx(path: string): Record<string, string>[] {
  const wb = XLSX.readFile(path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

/**
 * inspectors.csv: manually-researched business-directory rows. Unlike the
 * ministry sources, `specialty` here is often several qualifications joined by
 * ";" in one cell (e.g. "בודק אבזרי הרמה; בודק מכונות הרמה") rather than one
 * row per qualification — split it so certificationType ends up with atomic
 * labels like every other source, instead of one long joined string sitting
 * next to the short ones.
 */
function loadInspectorsCsv(): RawContact[] {
  const rows = readCsv(join(SEED_DIR, "inspectors.csv"));
  const out: RawContact[] = [];
  for (const r of rows) {
    const name = normalizeText(r.name);
    if (!name || looksLikeJunkRow(name)) continue;
    const base = {
      name,
        professionType: "בודק מוסמך",
      company: normalizeText(r.company) || undefined,
      city: normalizeText(r.city) || undefined,
      phone: splitMulti(r.phone)[0],
      email: firstEmail(r.email),
      website: normalizeText(r.website) || undefined,
      authId: normalizeText(r.ministry_auth_id) || undefined,
      sourceUrl: normalizeText(r.source_url) || undefined,
      notes: normalizeText(r.notes) || undefined,
      sourceFile: "inspectors.csv",
      sourceRank: 0,
    };
    const specialties = normalizeText(r.specialty).split(";").map((s) => s.trim()).filter(Boolean);
    if (!specialties.length) {
      out.push({ ...base, certificationType: undefined });
    } else {
      for (const certificationType of specialties) out.push({ ...base, certificationType });
    }
  }
  return out;
}

/** The two "-with-contacts" xlsx exports: Hebrew-labelled ministry registry + merged contacts. */
function loadWithContactsXlsx(fileName: string): RawContact[] {
  const rows = readXlsx(join(SEED_DIR, fileName));
  return rows
    .map((r): RawContact | null => {
      const name = normalizeText(r["שם"]);
      if (!name || looksLikeJunkRow(name)) return null;
      const phones = splitMulti(r["טלפון"]).filter((p) => !p.toLowerCase().includes("פקס"));
      return {
        name,
          professionType: "בודק מוסמך",
        city: normalizeText(r["יישוב"]) || undefined,
        phone: phones[0],
        whatsapp: phones[0],
        email: firstEmail(r["דוא\u05f4ל"]),
        certificationType: normalizeText(r["הסמכה"]) || undefined,
        authId: normalizeText(r["AuthorizationId"]) || undefined,
        serviceNum: normalizeText(r["מספר נותן שירות"]) || undefined,
        sourceUrl: normalizeText(r["קישור פרטים"]) || undefined,
        notes: normalizeText(r["הערות"]) || undefined,
        sourceFile: fileName,
        sourceRank: 1,
      };
    })
    .filter((r): r is RawContact => r !== null);
}

/** Additional registry exports added to SEED, including service-provider type. */
function loadAdditionalRegistryXlsx(fileName: string): RawContact[] {
    const rows = readXlsx(join(SEED_DIR, fileName));
    return rows.map((r): RawContact | null => {
        const name = normalizeText(r["שם"]);
        if (!name || looksLikeJunkRow(name)) return null;
        const phones = splitMulti(r["טלפון"]).filter((p) => !p.toLowerCase().includes("פקס"));
        return {
            name,
            professionType: normalizeText(r["סוג נותן שירות"]) || "בודק מוסמך",
            city: normalizeText(r["יישוב"]) || undefined,
            phone: phones[0],
            whatsapp: phones.find((phone) => /^(?:\+?972|0)?5\d/.test(phone.replace(/\D/g, ""))) ?? phones[0],
            email: firstEmail(r["דוא״ל"]),
            certificationType: normalizeText(r["הסמכה/תפקיד"] ?? r["הסמכה"]) || undefined,
            authId: normalizeText(r["מזהה הסמכה"] ?? r["AuthorizationId"]) || undefined,
            serviceNum: normalizeText(r["מספר נותן שירות"]) || undefined,
            sourceUrl: normalizeText(r["קישור"] ?? r["קישור פרטים"]) || undefined,
            notes: normalizeText(r["הערות"]) || undefined,
            sourceFile: fileName,
            sourceRank: 1,
        };
    }).filter((row): row is RawContact => row !== null);
}

function loadAdjacentProfessionsCsv(): RawContact[] {
    return readCsv(join(SEED_DIR, "remindocr-adjacent-professions.csv"))
        .map((r): RawContact | null => {
            const name = normalizeText(r["שם_חברה"]);
            if (!name || looksLikeJunkRow(name)) return null;
            const professionType = normalizeText(r["קטגוריה"]);
            return {
                name,
                company: name,
                professionType: professionType || "עסק בתחום הבדיקות",
                city: normalizeText(r["יישוב"]) || undefined,
                phone: splitMulti(r["טלפון"])[0],
                whatsapp: splitMulti(r["טלפון"])[0],
                email: firstEmail(r["דואל"]),
                website: normalizeText(r["אתר"]) || undefined,
                notes: normalizeText(r["הערות"]) || undefined,
                sourceUrl: normalizeText(r["מקור"]) || undefined,
                sourceFile: "remindocr-adjacent-professions.csv",
                sourceRank: 0,
            };
        })
        .filter((row): row is RawContact => row !== null);
}

/** labor-serviceproviders-*.json scrape dumps: many files, heavy duplication, some pagination-artifact rows. */
function loadScrapeDumps(): RawContact[] {
  const files = readdirSync(SEED_DIR).filter((f) => /^labor-serviceproviders-\d+\.json$/.test(f));
  const out: RawContact[] = [];
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(SEED_DIR, file), "utf8"));
    const leads: any[] = Array.isArray(parsed?.leads) ? parsed.leads : [];
    for (const lead of leads) {
      if (lead.detailStatus === "not_opened") continue;
      const name = normalizeText(lead.name);
      if (!name || looksLikeJunkRow(name)) continue;
      const authId = typeof lead.sourceUrl === "string"
        ? lead.sourceUrl.match(/AuthorizationId=(\d+)/)?.[1]
        : undefined;
      out.push({
        name,
          professionType: "בודק מוסמך",
        company: normalizeText(lead.company) || undefined,
        city: normalizeText(lead.city) || undefined,
        phone: normalizeText(lead.phone) || undefined,
        whatsapp: normalizeText(lead.whatsapp) || undefined,
        email: firstEmail(lead.email),
        certificationType: normalizeText(lead.certificationType) || undefined,
        authId,
        sourceUrl: normalizeText(lead.sourceUrl) || undefined,
        notes: normalizeText(lead.notes) || undefined,
        sourceFile: file,
        sourceRank: 2,
      });
    }
  }
  return out;
}

// ── Merge ────────────────────────────────────────────────────────────────────

function mergeContacts(rows: RawContact[]): MergedLead[] {
  // Group by identity, keeping every source row's precedence rank so contact
  // fields prefer the best source without discarding what the other sources add
  // (certification types, auth ids, notes).
  const byIdentity = new Map<string, RawContact[]>();
  for (const row of rows) {
      const key = identityKey(row.name, row.city ?? "");
    const list = byIdentity.get(key) ?? [];
    list.push(row);
    byIdentity.set(key, list);
  }

  const merged: MergedLead[] = [];
  for (const group of byIdentity.values()) {
    group.sort((a, b) => a.sourceRank - b.sourceRank);
    const best = group[0];

    const certificationType = [...new Set(
      group.map((g) => g.certificationType).filter((v): v is string => Boolean(v))
    )];
      const professionType = [...new Set(
          group.map((g) => g.professionType).filter((v): v is string => Boolean(v))
      )];
    const ministryAuthIds = [...new Set(
      group.map((g) => g.authId).filter((v): v is string => Boolean(v))
    )];
    const notes = [...new Set(
      group.map((g) => g.notes).filter((v): v is string => Boolean(v))
    )].join(" | ") || null;
    const sourceFiles = [...new Set(group.map((g) => g.sourceFile))];

    const phone = firstNonEmpty(group.map((g) => g.phone));
    const whatsapp = firstNonEmpty(group.map((g) => g.whatsapp)) ?? phone;
    const email = firstNonEmpty(group.map((g) => g.email));
    const website = firstNonEmpty(group.map((g) => g.website));
    const company = firstNonEmpty(group.map((g) => g.company));

    // More qualifications and real contact info both indicate a lead worth
    // outreach over a bare name-only registry row.
    let leadScore = certificationType.length * 10;
    if (email) leadScore += 15;
    if (phone) leadScore += 10;
    if (website) leadScore += 5;

    const now = new Date();
    merged.push({
      name: best.name,
        professionType,
      company,
      city: best.city ?? null,
      phone,
      whatsapp,
      email,
      website,
      certificationType,
      ministryAuthIds,
      source: sourceFiles.length === 1 ? sourceFiles[0] : `merged:${sourceFiles.length}-sources`,
      notes,
      contactStatus: "NEW",
      leadScore,
      created_at: now,
      updated_at: now,
    });
  }
  return merged;
}

// ── Run ──────────────────────────────────────────────────────────────────────

const rawRows = [
  ...loadInspectorsCsv(),
  ...loadWithContactsXlsx("inspectors-elevators-with-contacts.xlsx"),
  ...loadWithContactsXlsx("inspectors-lifting-machines-with-contacts.xlsx"),
    ...loadAdditionalRegistryXlsx("all-other-bodekim-with-contacts.xlsx"),
    ...loadAdditionalRegistryXlsx("maaltan-with-contacts.xlsx"),
    ...loadAdditionalRegistryXlsx("menahel-avoda-with-contacts.xlsx"),
    ...loadAdditionalRegistryXlsx("safety-roles-with-contacts.xlsx"),
    ...loadAdjacentProfessionsCsv(),
  ...loadScrapeDumps(),
];
const leads = mergeContacts(rawRows);

const withEmail = leads.filter((l) => l.email).length;
const withPhone = leads.filter((l) => l.phone).length;
console.log(`Raw rows read: ${rawRows.length}`);
console.log(`Merged into ${leads.length} unique leads (by name + city)`);
console.log(`  with email: ${withEmail}`);
console.log(`  with phone: ${withPhone}`);
console.table(
  leads
    .slice()
    .sort((a, b) => b.leadScore - a.leadScore)
    .slice(0, 10)
    .map((l) => ({
      name: l.name,
      city: l.city,
        professionType: l.professionType.join(", "),
      quals: l.certificationType.length,
      email: l.email ?? "",
      phone: l.phone ?? "",
      leadScore: l.leadScore,
    })),
);

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to upsert into inspector_leads.");
  process.exit(0);
}

const localUri = process.env.MONGODB_LOCAL_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const localDbName = process.env.MONGODB_DB ?? "reminder-app";
const prodUri = process.env.MONGODB_PRODUCTION_URI;
const prodDbName = process.env.MONGODB_PRODUCTION_DB ?? "reminder-app";

const targets: Array<{ label: string; uri: string; dbName: string }> = [];
if (!prodOnly) targets.push({ label: "local", uri: localUri, dbName: localDbName });
if (!localOnly) {
  if (prodUri) targets.push({ label: "production", uri: prodUri, dbName: prodDbName });
  else if (prodOnly) throw new Error("MONGODB_PRODUCTION_URI is not set");
}
if (!targets.length) throw new Error("No write targets resolved — check --local-only/--prod-only and env vars.");

for (const target of targets) {
  const client = new MongoClient(target.uri);
  try {
    await client.connect();
    const col = client.db(target.dbName).collection("inspector_leads");
    await col.createIndex({ email: 1 }, { sparse: true });
    await col.createIndex({ phone: 1 }, { sparse: true });
    await col.createIndex({ website: 1 }, { sparse: true });
    await col.createIndex({ source: 1 });
    await col.createIndex({ contactStatus: 1, leadScore: -1 });
    await col.createIndex({ leadScore: -1 });

    let upserted = 0;
    let matched = 0;
    for (const lead of leads) {
      const { created_at, contactStatus, ...updatable } = lead;
      const result = await col.updateOne(
        { name: lead.name, city: lead.city } as any,
        {
          $set: { ...updatable, updated_at: lead.updated_at },
          $setOnInsert: { created_at, contactStatus },
        } as any,
        { upsert: true },
      );
      if (result.upsertedCount) upserted++;
      else if (result.matchedCount) matched++;
    }
    console.log(`[${target.label}] upserted ${upserted} new, updated ${matched} existing`);
  } finally {
    await client.close();
  }
}
