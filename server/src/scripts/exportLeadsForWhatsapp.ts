// One-off export: dumps inspector_leads with an Israeli MOBILE number
// (landlines can't receive WhatsApp) for building WhatsApp click-to-chat
// links manually. Generates a fresh magic link per lead that already has an
// app account (links are reusable and expire in 30 days, so old ones are
// still fine to reuse — rerun only if it's actually been that long).
//
// Output format is picked by the output file's extension:
//   .json  — raw lead data, for scripting your own thing
//   .html  — a self-contained page (templates/whatsappLeadsPage.html) with a
//            "send on WhatsApp" button per lead, prefilled with a message
//            and their sign-in link. Contains real people's contact info —
//            never commit the generated output, only this script/template.
//
// Not wired into any npm script — run directly when needed:
//   npx tsx src/scripts/exportLeadsForWhatsapp.ts --production out.html
import "./loadEnv";
import {readFileSync, writeFileSync} from "fs";
import {join} from "path";
import {closeDb, col, connectDb, runWithDbTarget} from "../db/db";
import {createMagicLinkToken} from "../auth/session";

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Israeli mobile prefixes (05X). Landlines (02,03,04,08,09...) can't get WhatsApp. */
function toWhatsappMobilePhone(raw: string): string | null {
  const digits = digitsOnly(raw);
  if (!digits) return null;
  const local = digits.startsWith("972") ? "0" + digits.slice(3) : digits;
  if (!/^05\d{8}$/.test(local)) return null;
  return "972" + local.slice(1);
}

const targetArg = process.argv.find((a) => a.startsWith("--target="))?.slice("--target=".length);
const target = process.argv.includes("--production") || targetArg === "production" ? "production" : "local";
if (target === "production" && !process.env.MONGODB_PRODUCTION_URI) {
  throw new Error("--production needs MONGODB_PRODUCTION_URI to be set");
}

async function main() {
  await connectDb();
  const baseUrl = (process.env.SERVER_URL?.trim()
    || (target === "production" ? "https://api.remindocr.com" : "http://localhost:3737")).replace(/\/+$/, "");

  const leads = await col("inspector_leads")
    .find({phone: {$exists: true, $nin: [null, ""]}} as any)
      .project({name: 1, phone: 1, appUserId: 1, city: 1, professionType: 1, certificationType: 1})
    .toArray() as any[];

  const rows: any[] = [];
  for (const l of leads) {
    const wa = l.phone ? toWhatsappMobilePhone(String(l.phone)) : null;
    if (!wa) continue;
    let magicLink: string | null = null;
    if (l.appUserId) {
      // Leads are provisioned as trial users by createTrialUsersFromInspectorLeads.ts.
      const token = await createMagicLinkToken(String(l.appUserId), "trial");
      magicLink = `${baseUrl}/auth/magic?token=${token}`;
    }
      const professionTypes = Array.isArray(l.professionType)
          ? l.professionType.map(String).filter(Boolean)
          : l.professionType ? [String(l.professionType)] : [];
      const certificationTypes = Array.isArray(l.certificationType)
          ? l.certificationType.map(String).filter(Boolean)
          : l.certificationType ? [String(l.certificationType)] : [];
      rows.push({
          name: l.name ?? "",
          city: l.city ?? "",
          phone: String(l.phone),
          waPhone: wa,
          magicLink,
          professionType: professionTypes,
          certificationType: certificationTypes,
      });
  }

  const outPath = process.argv.find((a) => !a.startsWith("--") && (a.endsWith(".json") || a.endsWith(".html")))
    ?? "leads-whatsapp.json";

  if (outPath.endsWith(".html")) {
    const template = readFileSync(join(import.meta.dirname, "templates", "whatsappLeadsPage.html"), "utf-8");
    const html = template.replace("__LEADS_JSON__", JSON.stringify(rows));
    writeFileSync(outPath, html, "utf-8");
  } else {
    writeFileSync(outPath, JSON.stringify(rows, null, 2), "utf-8");
  }
  console.log(`Wrote ${rows.length} mobile lead(s) to ${outPath} (target: ${target})`);
}

runWithDbTarget(target, main).finally(() => closeDb());
