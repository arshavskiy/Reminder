import { col } from "../db/db";
import { logger } from "../logger";

export interface GmailSearchProvider {
  id: string;
  category: "electricity" | "telecom" | "water" | "general";
  label: string;
  terms: string[];
  sort_order: number;
  enabled: boolean;
}

export const DEFAULT_GMAIL_SEARCH_PROVIDERS: GmailSearchProvider[] = [
  { id: "iec", category: "electricity", label: "חשמל - חברת חשמל לישראל", terms: ["iec.co.il", "חברת חשמל לישראל", "חברת החשמל"], sort_order: 10, enabled: true },
  { id: "noga", category: "electricity", label: "חשמל - נגה / ניהול מערכת החשמל", terms: ["noga-iso.co.il", "נגה", "ניהול מערכת החשמל"], sort_order: 20, enabled: true },
  { id: "electra-power", category: "electricity", label: "חשמל - אלקטרה פאוור", terms: ["electra-power.co.il", "אלקטרה פאוור"], sort_order: 30, enabled: true },
  { id: "cellcom-energy", category: "electricity", label: "חשמל - סלקום חשמל", terms: ["cellcom.co.il", "סלקום חשמל"], sort_order: 40, enabled: true },
  { id: "partner-energy", category: "electricity", label: "חשמל - פרטנר חשמל", terms: ["partner.co.il", "פרטנר חשמל"], sort_order: 50, enabled: true },
  { id: "bezeq-energy", category: "electricity", label: "חשמל - בזק חשמל", terms: ["bezeq.co.il", "בזק חשמל"], sort_order: 60, enabled: true },
  { id: "hot-energy", category: "electricity", label: "חשמל - HOT Energy", terms: ["hot.net.il", "הוט אנרג'י", "HOT Energy"], sort_order: 70, enabled: true },
  { id: "amisragas-energy", category: "electricity", label: "חשמל - אמישראגז חשמל", terms: ["am-isragas.co.il", "אמישראגז חשמל"], sort_order: 80, enabled: true },
  { id: "pazgas-energy", category: "electricity", label: "חשמל - פזגז חשמל", terms: ["pazgas.co.il", "פזגז חשמל"], sort_order: 90, enabled: true },

  { id: "bezeq", category: "telecom", label: "תקשורת - בזק", terms: ["bezeq.co.il", "בזק"], sort_order: 110, enabled: true },
  { id: "bezeqint", category: "telecom", label: "תקשורת - בזק בינלאומי", terms: ["bezeqint.net", "בזק בינלאומי"], sort_order: 120, enabled: true },
  { id: "pelephone", category: "telecom", label: "תקשורת - פלאפון", terms: ["pelephone.co.il", "פלאפון"], sort_order: 130, enabled: true },
  { id: "cellcom", category: "telecom", label: "תקשורת - סלקום", terms: ["cellcom.co.il", "סלקום"], sort_order: 140, enabled: true },
  { id: "partner", category: "telecom", label: "תקשורת - פרטנר", terms: ["partner.co.il", "פרטנר"], sort_order: 150, enabled: true },
  { id: "hot", category: "telecom", label: "תקשורת - HOT", terms: ["hot.net.il", "HOT", "הוט"], sort_order: 160, enabled: true },
  { id: "hot-mobile", category: "telecom", label: "תקשורת - HOT Mobile", terms: ["hotmobile.co.il", "HOT Mobile", "הוט מובייל"], sort_order: 170, enabled: true },
  { id: "012-mobile", category: "telecom", label: "תקשורת - 012 מובייל", terms: ["012mobile.co.il", "012 מובייל"], sort_order: 180, enabled: true },
  { id: "013-netvision", category: "telecom", label: "תקשורת - 013 נטוויז'ן", terms: ["013netvision.net.il", "013 נטוויז'ן", "נטוויז'ן"], sort_order: 190, enabled: true },
  { id: "018-xfone", category: "telecom", label: "תקשורת - 018 אקספון", terms: ["018.co.il", "XPhone", "אקספון"], sort_order: 200, enabled: true },
  { id: "019-telzar", category: "telecom", label: "תקשורת - 019 טלזר", terms: ["019mobile.co.il", "019", "טלזר"], sort_order: 210, enabled: true },
  { id: "golan-telecom", category: "telecom", label: "תקשורת - גולן טלקום", terms: ["golantelecom.co.il", "גולן טלקום"], sort_order: 220, enabled: true },
  { id: "rami-levy-telecom", category: "telecom", label: "תקשורת - רמי לוי תקשורת", terms: ["ramilevy.co.il", "רמי לוי תקשורת"], sort_order: 230, enabled: true },
  { id: "wecom", category: "telecom", label: "תקשורת - Wecom", terms: ["we-com.co.il", "Wecom", "וויקום"], sort_order: 240, enabled: true },
  { id: "rimon", category: "telecom", label: "תקשורת - אינטרנט רימון", terms: ["rimon.net.il", "אינטרנט רימון"], sort_order: 250, enabled: true },
  { id: "binat", category: "telecom", label: "תקשורת - בינת עסקים", terms: ["binat.net.il", "בינת עסקים"], sort_order: 260, enabled: true },
  { id: "unlimited", category: "telecom", label: "תקשורת - Unlimited / IBC", terms: ["unlimited.net.il", "IBC", "אנלימיטד"], sort_order: 270, enabled: true },

  { id: "mekorot", category: "water", label: "מים - מקורות", terms: ["mekorot.co.il", "מקורות"], sort_order: 310, enabled: true },
  { id: "mei-avivim", category: "water", label: "מים - מי אביבים", terms: ["mei-avivim.co.il", "מי אביבים"], sort_order: 320, enabled: true },
  { id: "hagihon", category: "water", label: "מים - הגיחון", terms: ["hagihon.co.il", "הגיחון"], sort_order: 330, enabled: true },
  { id: "mey7", category: "water", label: "מים - מי שבע", terms: ["mey7.co.il", "מי שבע"], sort_order: 340, enabled: true },
  { id: "mei-brak", category: "water", label: "מים - מי ברק", terms: ["mei-brak.co.il", "מי ברק"], sort_order: 350, enabled: true },
  { id: "mei-rg", category: "water", label: "מים - מי רמת גן", terms: ["mei-rg.co.il", "מי רמת גן"], sort_order: 360, enabled: true },
  { id: "maniv-rishon", category: "water", label: "מים - מניב ראשון", terms: ["maniv-rishon.co.il", "מניב ראשון"], sort_order: 370, enabled: true },
  { id: "mei-ziona", category: "water", label: "מים - מי ציונה", terms: ["mei-ziona.co.il", "מי ציונה"], sort_order: 380, enabled: true },
  { id: "mei-modiin", category: "water", label: "מים - מי מודיעין", terms: ["mei-modiin.co.il", "מי מודיעין"], sort_order: 390, enabled: true },
  { id: "mei-ono", category: "water", label: "מים - מי אונו", terms: ["mei-ono.co.il", "מי אונו"], sort_order: 400, enabled: true },
  { id: "mei-herz", category: "water", label: "מים - מי הרצליה", terms: ["mei-herz.co.il", "מי הרצליה"], sort_order: 410, enabled: true },
  { id: "mei-netanya", category: "water", label: "מים - מי נתניה", terms: ["mei-netanya.co.il", "מי נתניה"], sort_order: 420, enabled: true },
  { id: "mei-raanana", category: "water", label: "מים - מי רעננה", terms: ["mei-raanana.co.il", "מי רעננה"], sort_order: 430, enabled: true },
  { id: "sharonim", category: "water", label: "מים - שרונים", terms: ["sharonim.org.il", "שרונים"], sort_order: 440, enabled: true },
  { id: "ein-afek", category: "water", label: "מים - עין אפק", terms: ["einafek.co.il", "עין אפק"], sort_order: 450, enabled: true },
  { id: "mei-carmel", category: "water", label: "מים - מי כרמל", terms: ["mei-carmel.co.il", "מי כרמל"], sort_order: 460, enabled: true },
  { id: "yuvalim-ashdod", category: "water", label: "מים - יובלים אשדוד", terms: ["yuvalim-ashdod.co.il", "יובלים אשדוד"], sort_order: 470, enabled: true },
  { id: "mei-ashkelon", category: "water", label: "מים - מי אשקלון", terms: ["mei-a.co.il", "מי אשקלון"], sort_order: 480, enabled: true },
  { id: "palgey-sharon", category: "water", label: "מים - פלגי השרון", terms: ["palgey-sharon.co.il", "פלגי השרון"], sort_order: 490, enabled: true },
  { id: "palgey-galil", category: "water", label: "מים - פלג הגליל", terms: ["palgey-galil.co.il", "פלג הגליל"], sort_order: 500, enabled: true },
  { id: "mayanot-hasharon", category: "water", label: "מים - מעיינות השרון", terms: ["m-sharon.co.il", "מעיינות השרון"], sort_order: 510, enabled: true },
  { id: "mayanot-hameshulash", category: "water", label: "מים - מעיינות המשולש", terms: ["מעיינות המשולש"], sort_order: 520, enabled: true },
  { id: "mei-iron", category: "water", label: "מים - מי עירון", terms: ["מי עירון"], sort_order: 530, enabled: true },
  { id: "hatanur", category: "water", label: "מים - התנור", terms: ["התנור", "תאגיד מים התנור"], sort_order: 540, enabled: true },

  { id: "morning", category: "general", label: "חשבוניות - Morning (חשבונית ירוקה)", terms: ["morning.co", "חשבונית ירוקה"], sort_order: 610, enabled: true },
  { id: "github", category: "general", label: "כללי - GitHub", terms: ["github.com", "GitHub"], sort_order: 620, enabled: true },
  { id: "digitalocean", category: "general", label: "כללי - DigitalOcean", terms: ["digitalocean.com", "DigitalOcean"], sort_order: 630, enabled: true },
  { id: "google", category: "general", label: "כללי - Google", terms: ["google.com", "Google"], sort_order: 640, enabled: true },
];

export async function seedGmailSearchProviders(): Promise<void> {
  const collection = col<any>("gmail_search_providers");
  const now = new Date();

  for (const provider of DEFAULT_GMAIL_SEARCH_PROVIDERS) {
    await collection.updateOne(
      { id: provider.id },
      {
        $set: {
          category: provider.category,
          label: provider.label,
          terms: provider.terms,
          sort_order: provider.sort_order,
          updated_at: now,
        },
        $setOnInsert: {
          id: provider.id,
          enabled: provider.enabled,
          created_at: now,
        },
      },
      { upsert: true },
    );
  }

  logger.info("gmail_search_providers_seeded", { count: DEFAULT_GMAIL_SEARCH_PROVIDERS.length });
}

export async function loadGmailSearchProviders(): Promise<GmailSearchProvider[]> {
  const rows = await col<any>("gmail_search_providers")
    .find({ enabled: { $ne: false } })
    .sort({ sort_order: 1, label: 1 })
    .toArray();

  if (!rows.length) {
    await seedGmailSearchProviders();
    return DEFAULT_GMAIL_SEARCH_PROVIDERS;
  }

  return rows.map((row) => ({
    id: String(row.id),
    category: row.category ?? "general",
    label: String(row.label ?? row.id),
    terms: Array.isArray(row.terms) ? row.terms.map(String).filter(Boolean) : [],
    sort_order: Number(row.sort_order ?? 0),
    enabled: row.enabled !== false,
  }));
}
