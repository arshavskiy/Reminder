/**
 * Creates several real hydraulic-check contracts (client + equipment + contract
 * + reminders, exactly like submitting the "תסקיר חדש" modal) with expiry dates
 * spread across different days of the current month. Useful for populating the
 * dashboard calendar with realistic, non-clustered data before recording demo
 * videos.
 *
 * Usage:
 *   npx tsx src/scripts/createContractsAcrossMonth.ts --magic-url="http://localhost:3737/auth/magic?token=..." [--count=8] [--app-url=http://localhost:4173]
 */
import "./loadEnv";

const arg = (name: string) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const magicUrl = arg("magic-url");
const appUrl = (arg("app-url") ?? "http://localhost:4173").replace(/\/$/, "");
const count = Number(arg("count") ?? 8);
if (!magicUrl) throw new Error("Pass --magic-url=\"http://localhost:3737/auth/magic?token=...\"");
if (!Number.isInteger(count) || count < 1 || count > 28) throw new Error("--count must be 1-28");

const companies = [
  "אופק לוגיסטיקה בע\"מ", "שלב 1945 הובלות בע\"מ", "מנוף העמק בע\"מ", "בניה ופיתוח דרום",
  "תעשיות מתכת גליל", "עמל הנדסה", "כרמל שינוע", "אשדוד פורט שירותים",
];
const contactPeople = ["רוני לוי", "קלודין", "יוסי לוי", "מרים כהן", "דוד אבני", "רונית שגב"];
const manufacturers = ["Toyota", "Hiab", "Genie", "JLG", "Manitou", "Fassi"];
const categories = ["lift", "accessory", "elevator", "work_platform", "pressure_vessel"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

async function main() {
  const magicRes = await fetch(magicUrl!, {redirect: "manual"});
  const setCookie = magicRes.headers.get("set-cookie");
  if (!setCookie) throw new Error(`Magic link did not set a cookie (status ${magicRes.status}). Check the token is fresh.`);
  const cookie = setCookie.split(";")[0];
  console.log(`Logged in, cookie=${cookie.slice(0, 24)}...`);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = now.getDate() + 1;
  const remainingDays = daysInMonth - startDay;
  const step = Math.max(1, Math.floor(remainingDays / count));
  if (remainingDays < count) {
    console.warn(`Only ${remainingDays} day(s) left in ${year}-${pad(month + 1)}; some contracts will land next month.`);
  }

  let created = 0;
  for (let i = 0; i < count; i++) {
    const day = startDay + i * step;
    const target = new Date(year, month, day);
    const expiryDate = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
    const checkDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const index = i;
    const body = {
      contract_type: "תסקיר בדיקה תקופתית",
      business: {
        display_name: companies[index % companies.length],
        entity_type: "company",
        contact_person: contactPeople[index % contactPeople.length],
        phone: `03-555${pad(1000 + index)}`,
        mobile: `050-555${pad(2000 + index)}`,
        email: `office${index + 1}@demo-calendar.co.il`,
        address: "רחוב התעשייה 1",
        city: "תל אביב",
      },
      equipment: {
        category: categories[index % categories.length],
        name: `ציוד הדגמה ${index + 1}`,
        manufacturer: manufacturers[index % manufacturers.length],
        model: `CAL-${2026}-${pad(index + 1)}`,
        serial_number: `CAL${20260900 + index}`,
        license_number: String(400000 + index * 137),
        load_capacity_work: "1000",
      },
      inspection_location: "מרכז לוגיסטי, תל אביב",
      check_date: checkDate,
      expiry_date: expiryDate,
      interval_months: 12,
      skip_reminders: false,
    };

    const res = await fetch(`${appUrl}/api/reminders/hydraulic-check`, {
      method: "POST",
      headers: {"Content-Type": "application/json", cookie},
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`  [${index + 1}/${count}] FAILED (${res.status}) expiry=${expiryDate}: ${text.slice(0, 200)}`);
      continue;
    }
    const result = await res.json();
    created += 1;
    console.log(`  [${index + 1}/${count}] OK expiry=${expiryDate} client=${result.client?.display_name ?? "?"} contract=${result.contract?.contract_number ?? result.contract?._id ?? "?"}`);
  }

  console.log(`\ndone: ${created}/${count} contracts created, spread across ${year}-${pad(month + 1)}.`);
}

await main();
