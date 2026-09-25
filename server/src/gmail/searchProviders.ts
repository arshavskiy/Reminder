import { col } from "../db/db";
import { logger } from "../logger";

export interface GmailSearchProvider {
  id: string;
  category:
    | "household"
    | "transport"
    | "parking"
    | "fuel"
    | "tv"
    | "marketplace"
    | "food"
    | "payment"
    | "government"
    | "insurance"
    | "finance"
    | "travel"
    | "healthcare"
    | "education"
    | "retail"
    | "electronics"
    | "nonprofit"
    | "digital"
    | "development"
    | "general";
  label: string;
  terms: string[];
  sort_order: number;
  enabled: boolean;
}

export const DEFAULT_GMAIL_SEARCH_PROVIDERS: GmailSearchProvider[] = [
  { id: "iec", category: "household", label: "חשמל - חברת חשמל לישראל", terms: ["iec.co.il", "חברת חשמל לישראל", "חברת החשמל"], sort_order: 10, enabled: true },
  { id: "noga", category: "household", label: "חשמל - נגה / ניהול מערכת החשמל", terms: ["noga-iso.co.il", "נגה", "ניהול מערכת החשמל"], sort_order: 20, enabled: true },
  { id: "electra-power", category: "household", label: "חשמל - אלקטרה פאוור", terms: ["electra-power.co.il", "אלקטרה פאוור"], sort_order: 30, enabled: true },
  { id: "cellcom-energy", category: "household", label: "חשמל - סלקום חשמל", terms: ["cellcom.co.il", "סלקום חשמל"], sort_order: 40, enabled: true },
  { id: "partner-energy", category: "household", label: "חשמל - פרטנר חשמל", terms: ["partner.co.il", "פרטנר חשמל"], sort_order: 50, enabled: true },
  { id: "bezeq-energy", category: "household", label: "חשמל - בזק חשמל", terms: ["bezeq.co.il", "בזק חשמל"], sort_order: 60, enabled: true },
  { id: "hot-energy", category: "household", label: "חשמל - HOT Energy", terms: ["hot.net.il", "הוט אנרג'י", "HOT Energy"], sort_order: 70, enabled: true },
  { id: "amisragas-energy", category: "household", label: "חשמל - אמישראגז חשמל", terms: ["am-isragas.co.il", "אמישראגז חשמל"], sort_order: 80, enabled: true },
  { id: "pazgas-energy", category: "household", label: "חשמל - פזגז חשמל", terms: ["pazgas.co.il", "פזגז חשמל"], sort_order: 90, enabled: true },

  { id: "bezeq", category: "household", label: "תקשורת - בזק", terms: ["bezeq.co.il", "בזק"], sort_order: 110, enabled: true },
  { id: "bezeqint", category: "household", label: "תקשורת - בזק בינלאומי", terms: ["bezeqint.net", "בזק בינלאומי"], sort_order: 120, enabled: true },
  { id: "pelephone", category: "household", label: "תקשורת - פלאפון", terms: ["pelephone.co.il", "פלאפון"], sort_order: 130, enabled: true },
  { id: "cellcom", category: "household", label: "תקשורת - סלקום", terms: ["cellcom.co.il", "cellcominv.co.il", "סלקום"], sort_order: 140, enabled: true },
  { id: "partner", category: "household", label: "תקשורת - פרטנר", terms: ["partner.co.il", "פרטנר"], sort_order: 150, enabled: true },
  { id: "hot", category: "household", label: "תקשורת - HOT", terms: ["hot.net.il", "hot-info.net.il", "HOT", "הוט"], sort_order: 160, enabled: true },
  { id: "hot-mobile", category: "household", label: "תקשורת - HOT Mobile", terms: ["hotmobile.co.il", "HOT Mobile", "הוט מובייל"], sort_order: 170, enabled: true },
  { id: "012-mobile", category: "household", label: "תקשורת - 012 מובייל", terms: ["012mobile.co.il", "012 מובייל"], sort_order: 180, enabled: true },
  { id: "013-netvision", category: "household", label: "תקשורת - 013 נטוויז'ן", terms: ["013netvision.net.il", "013 נטוויז'ן", "נטוויז'ן"], sort_order: 190, enabled: true },
  { id: "018-xfone", category: "household", label: "תקשורת - 018 אקספון", terms: ["018.co.il", "xphone.co.il", "XPhone", "אקספון"], sort_order: 200, enabled: true },
  { id: "019-telzar", category: "household", label: "תקשורת - 019 טלזר", terms: ["019mobile.co.il", "019", "טלזר"], sort_order: 210, enabled: true },
  { id: "golan-telecom", category: "household", label: "תקשורת - גולן טלקום", terms: ["golantelecom.co.il", "גולן טלקום"], sort_order: 220, enabled: true },
  { id: "rami-levy-telecom", category: "household", label: "תקשורת - רמי לוי תקשורת", terms: ["ramilevy.co.il", "רמי לוי תקשורת"], sort_order: 230, enabled: true },
  { id: "wecom", category: "household", label: "תקשורת - Wecom", terms: ["we-com.co.il", "Wecom", "וויקום"], sort_order: 240, enabled: true },
  { id: "rimon", category: "household", label: "תקשורת - אינטרנט רימון", terms: ["rimon.net.il", "אינטרנט רימון"], sort_order: 250, enabled: true },
  { id: "binat", category: "household", label: "תקשורת - בינת עסקים", terms: ["binat.net.il", "בינת עסקים"], sort_order: 260, enabled: true },
  { id: "unlimited", category: "household", label: "תקשורת - Unlimited / IBC", terms: ["unlimited.net.il", "IBC", "אנלימיטד"], sort_order: 270, enabled: true },

  { id: "mekorot", category: "household", label: "מים - מקורות", terms: ["mekorot.co.il", "מקורות"], sort_order: 310, enabled: true },
  { id: "mei-avivim", category: "household", label: "מים - מי אביבים", terms: ["mei-avivim.co.il", "מי אביבים"], sort_order: 320, enabled: true },
  { id: "hagihon", category: "household", label: "מים - הגיחון", terms: ["hagihon.co.il", "הגיחון"], sort_order: 330, enabled: true },
  { id: "mey7", category: "household", label: "מים - מי שבע", terms: ["mey7.co.il", "מי שבע"], sort_order: 340, enabled: true },
  { id: "mei-brak", category: "household", label: "מים - מי ברק", terms: ["mei-brak.co.il", "מי ברק"], sort_order: 350, enabled: true },
  { id: "mei-rg", category: "household", label: "מים - מי רמת גן", terms: ["mei-rg.co.il", "מי רמת גן"], sort_order: 360, enabled: true },
  { id: "maniv-rishon", category: "household", label: "מים - מניב ראשון", terms: ["maniv-rishon.co.il", "מניב ראשון"], sort_order: 370, enabled: true },
  { id: "mei-ziona", category: "household", label: "מים - מי ציונה", terms: ["mei-ziona.co.il", "מי ציונה"], sort_order: 380, enabled: true },
  { id: "mei-modiin", category: "household", label: "מים - מי מודיעין", terms: ["mei-modiin.co.il", "מי מודיעין"], sort_order: 390, enabled: true },
  { id: "mei-ono", category: "household", label: "מים - מי אונו", terms: ["mei-ono.co.il", "מי אונו"], sort_order: 400, enabled: true },
  { id: "mei-herz", category: "household", label: "מים - מי הרצליה", terms: ["mei-herz.co.il", "מי הרצליה"], sort_order: 410, enabled: true },
  { id: "mei-netanya", category: "household", label: "מים - מי נתניה", terms: ["mei-netanya.co.il", "מי נתניה"], sort_order: 420, enabled: true },
  { id: "mei-raanana", category: "household", label: "מים - מי רעננה", terms: ["mei-raanana.co.il", "מי רעננה"], sort_order: 430, enabled: true },
  { id: "sharonim", category: "household", label: "מים - שרונים", terms: ["sharonim.org.il", "שרונים"], sort_order: 440, enabled: true },
  { id: "ein-afek", category: "household", label: "מים - עין אפק", terms: ["einafek.co.il", "עין אפק"], sort_order: 450, enabled: true },
  { id: "mei-carmel", category: "household", label: "מים - מי כרמל", terms: ["mei-carmel.co.il", "מי כרמל"], sort_order: 460, enabled: true },
  { id: "yuvalim-ashdod", category: "household", label: "מים - יובלים אשדוד", terms: ["yuvalim-ashdod.co.il", "יובלים אשדוד"], sort_order: 470, enabled: true },
  { id: "mei-ashkelon", category: "household", label: "מים - מי אשקלון", terms: ["mei-a.co.il", "מי אשקלון"], sort_order: 480, enabled: true },
  { id: "palgey-sharon", category: "household", label: "מים - פלגי השרון", terms: ["palgey-sharon.co.il", "פלגי השרון"], sort_order: 490, enabled: true },
  { id: "palgey-galil", category: "household", label: "מים - פלג הגליל", terms: ["palgey-galil.co.il", "פלג הגליל"], sort_order: 500, enabled: true },
  { id: "mayanot-hasharon", category: "household", label: "מים - מעיינות השרון", terms: ["m-sharon.co.il", "מעיינות השרון"], sort_order: 510, enabled: true },
  { id: "mayanot-hameshulash", category: "household", label: "מים - מעיינות המשולש", terms: ["מעיינות המשולש"], sort_order: 520, enabled: true },
  { id: "mei-iron", category: "household", label: "מים - מי עירון", terms: ["מי עירון"], sort_order: 530, enabled: true },
  { id: "hatanur", category: "household", label: "מים - התנור", terms: ["התנור", "תאגיד מים התנור"], sort_order: 540, enabled: true },

  { id: "road6", category: "transport", label: "תחבורה - כביש 6", terms: ["kvish6.co.il", "printernet.co.il", "כביש 6", "דרך ארץ", "Derech Eretz"], sort_order: 610, enabled: true },
  { id: "carmel-tunnels", category: "transport", label: "תחבורה - מנהרות הכרמל", terms: ["carmeltunnels.co.il", "מנהרות הכרמל", "כרמלטון"], sort_order: 620, enabled: true },
  { id: "fast-lanes", category: "transport", label: "תחבורה - הנתיבים המהירים", terms: ["fastlanes.co.il", "הנתיבים המהירים", "נתיב מהיר"], sort_order: 630, enabled: true },
  { id: "israel-railways", category: "transport", label: "תחבורה - רכבת ישראל", terms: ["rail.co.il", "רכבת ישראל"], sort_order: 640, enabled: true },
  { id: "ravkav-online", category: "transport", label: "תחבורה - רב-קו אונליין", terms: ["ravkavonline.co.il", "רב-קו אונליין", "Rav-Kav Online"], sort_order: 650, enabled: true },
  { id: "ravpass", category: "transport", label: "תחבורה - רב-פס", terms: ["ravpass.co.il", "Rav-Pass", "רב-פס", "HopOn"], sort_order: 655, enabled: true },
  { id: "moovit", category: "transport", label: "תחבורה - Moovit", terms: ["moovitapp.com", "Moovit", "מוביט"], sort_order: 660, enabled: true },
  { id: "gett", category: "transport", label: "תחבורה - Gett", terms: ["gett.com", "Gett", "גט טקסי"], sort_order: 670, enabled: true },
  { id: "yango", category: "transport", label: "תחבורה - Yango", terms: ["yango.com", "Yango", "יאנגו"], sort_order: 680, enabled: true },
  { id: "bolt", category: "transport", label: "תחבורה - Bolt", terms: ["bolt.eu", "Your Bolt trip", "Bolt"], sort_order: 682, enabled: true },
  { id: "grab", category: "transport", label: "תחבורה - Grab", terms: ["grab.com", "Grab E-Receipt", "GrabFood"], sort_order: 684, enabled: true },
  { id: "egged", category: "transport", label: "תחבורה - אגד", terms: ["egged.co.il", "אגד"], sort_order: 690, enabled: true },
  { id: "dan", category: "transport", label: "תחבורה - דן", terms: ["dan.co.il", "דן"], sort_order: 700, enabled: true },
  { id: "metropoline", category: "transport", label: "תחבורה - מטרופולין", terms: ["metropoline.com", "מטרופולין"], sort_order: 710, enabled: true },
  { id: "kavim", category: "transport", label: "תחבורה - קווים", terms: ["kavim-t.co.il", "קווים"], sort_order: 720, enabled: true },
  { id: "superbus", category: "transport", label: "תחבורה - סופרבוס", terms: ["superbus.co.il", "סופרבוס"], sort_order: 730, enabled: true },
  { id: "electra-afikim", category: "transport", label: "תחבורה - אלקטרה אפיקים", terms: ["electra-afikim.co.il", "אלקטרה אפיקים", "אפיקים"], sort_order: 740, enabled: true },
  { id: "tnufa", category: "transport", label: "תחבורה - תנופה", terms: ["tnufa-t.com", "תנופה"], sort_order: 750, enabled: true },
  { id: "nateev-express", category: "transport", label: "תחבורה - נתיב אקספרס", terms: ["nateevexpress.com", "נתיב אקספרס"], sort_order: 760, enabled: true },
  { id: "road6-north", category: "transport", label: "תחבורה - 6 צפון", terms: ["6cn.co.il", "6 צפון", "כביש 6 צפון"], sort_order: 770, enabled: true },

  { id: "pango", category: "parking", label: "חניה - Pango", terms: ["pango.co.il", "pango-moovit.co.il", "Pango", "פנגו"], sort_order: 810, enabled: true },
  { id: "cello", category: "parking", label: "חניה - Cello", terms: ["cellopark.co.il", "Cello", "סלופארק", "CelloPark"], sort_order: 820, enabled: true },
  { id: "ahuzot-hahof", category: "parking", label: "חניה - אחוזות החוף", terms: ["ahuzot.co.il", "אחוזות החוף"], sort_order: 830, enabled: true },

  { id: "paz", category: "fuel", label: "דלק - פז", terms: ["paz.co.il", "פז"], sort_order: 910, enabled: true },
  { id: "delek", category: "fuel", label: "דלק - דלק", terms: ["delek.co.il", "דלק"], sort_order: 920, enabled: true },
  { id: "sonol", category: "fuel", label: "דלק - סונול", terms: ["sonol.co.il", "סונול"], sort_order: 930, enabled: true },
  { id: "dor-alon", category: "fuel", label: "דלק - דור אלון", terms: ["dor-alon.co.il", "דור אלון"], sort_order: 940, enabled: true },
  { id: "ten", category: "fuel", label: "דלק - Ten", terms: ["ten10.co.il", "Ten", "טן"], sort_order: 950, enabled: true },
  { id: "menta", category: "fuel", label: "דלק - מנטה", terms: ["menta.co.il", "מנטה"], sort_order: 960, enabled: true },

  { id: "amisragas", category: "household", label: "גז - אמישראגז", terms: ["am-isragas.co.il", "אמישראגז"], sort_order: 1010, enabled: true },
  { id: "supergas", category: "household", label: "גז - סופרגז", terms: ["supergas.co.il", "סופרגז"], sort_order: 1020, enabled: true },
  { id: "pazgas", category: "household", label: "גז - פזגז", terms: ["pazgas.co.il", "פזגז"], sort_order: 1030, enabled: true },
  { id: "dor-gas", category: "household", label: "גז - דור גז", terms: ["dorgas.co.il", "דור גז"], sort_order: 1040, enabled: true },

  { id: "yes", category: "tv", label: "טלוויזיה - yes", terms: ["yes.co.il", "yes", "יס"], sort_order: 1110, enabled: true },
  { id: "sting-tv", category: "tv", label: "טלוויזיה - STINGTV", terms: ["stingtv.co.il", "STINGTV", "סטינג"], sort_order: 1120, enabled: true },
  { id: "hot-tv", category: "tv", label: "טלוויזיה - HOT TV", terms: ["HOT TV", "הוט TV"], sort_order: 1130, enabled: true },
  { id: "partner-tv", category: "tv", label: "טלוויזיה - פרטנר TV", terms: ["פרטנר TV", "Partner TV"], sort_order: 1140, enabled: true },
  { id: "cellcom-tv", category: "tv", label: "טלוויזיה - סלקום TV", terms: ["סלקום TV", "Cellcom TV"], sort_order: 1150, enabled: true },
  { id: "free-tv", category: "tv", label: "טלוויזיה - FreeTV", terms: ["freetv.tv", "FreeTV", "פרי טיוי"], sort_order: 1160, enabled: true },
  { id: "next-tv", category: "tv", label: "טלוויזיה - NEXT TV", terms: ["nexttv.co.il", "NEXT TV", "נקסט TV"], sort_order: 1165, enabled: true },
  { id: "netflix", category: "tv", label: "סטרימינג - Netflix", terms: ["netflix.com", "Netflix", "נטפליקס"], sort_order: 1170, enabled: true },
  { id: "amazon-prime-video", category: "tv", label: "סטרימינג - Amazon Prime Video", terms: ["primevideo.com", "Prime Video", "Amazon Prime Video"], sort_order: 1180, enabled: true },
  { id: "disney-plus", category: "tv", label: "סטרימינג - Disney+", terms: ["disneyplus.com", "Disney+", "דיסני פלוס"], sort_order: 1190, enabled: true },
  { id: "apple-tv", category: "tv", label: "סטרימינג - Apple TV", terms: ["tv.apple.com", "Apple TV", "Apple TV+"], sort_order: 1200, enabled: true },
  { id: "spotify", category: "tv", label: "סטרימינג - Spotify", terms: ["spotify.com", "Spotify"], sort_order: 1210, enabled: true },

  { id: "amazon", category: "marketplace", label: "קניות - Amazon", terms: ["amazon.com", "Amazon", "אמזון"], sort_order: 1310, enabled: true },
  { id: "aliexpress", category: "marketplace", label: "קניות - AliExpress", terms: ["aliexpress.com", "AliExpress", "עלי אקספרס"], sort_order: 1320, enabled: true },
  { id: "ebay", category: "marketplace", label: "קניות - eBay", terms: ["ebay.com", "eBay"], sort_order: 1330, enabled: true },
  { id: "temu", category: "marketplace", label: "קניות - Temu", terms: ["temu.com", "Temu"], sort_order: 1335, enabled: true },
  { id: "shein", category: "marketplace", label: "קניות - Shein", terms: ["shein.com", "Shein"], sort_order: 1337, enabled: true },
  { id: "wish", category: "marketplace", label: "קניות - Wish", terms: ["wish.com", "Wish"], sort_order: 1339, enabled: true },
  { id: "banggood", category: "marketplace", label: "קניות - Banggood", terms: ["banggood.com", "Banggood"], sort_order: 1341, enabled: true },
  { id: "zap", category: "marketplace", label: "קניות - Zap", terms: ["zap.co.il", "Zap", "זאפ"], sort_order: 1370, enabled: true },
  { id: "lastprice", category: "marketplace", label: "קניות - LastPrice", terms: ["lastprice.co.il", "LastPrice", "לאסטפרייס"], sort_order: 1380, enabled: true },
  { id: "terminal-x", category: "marketplace", label: "קניות - TERMINAL X", terms: ["terminalx.com", "TERMINAL X", "טרמינל איקס"], sort_order: 1390, enabled: true },
  { id: "walla-shops", category: "marketplace", label: "קניות - וואלה שופס", terms: ["wallashops.co.il", "וואלה שופס"], sort_order: 1400, enabled: true },

  { id: "shufersal", category: "food", label: "מזון - שופרסל", terms: ["shufersal.co.il", "שופרסל", "סופר-סל", "סופר סל"], sort_order: 1510, enabled: true },
  { id: "rami-levy", category: "food", label: "מזון - רמי לוי", terms: ["ramilevy.co.il", "רמי לוי", "רמי לוי שיווק השקמה"], sort_order: 1520, enabled: true },
  { id: "victory", category: "food", label: "מזון - ויקטורי", terms: ["victoryonline.co.il", "ויקטורי"], sort_order: 1530, enabled: true },
  { id: "yohananof", category: "food", label: "מזון - יוחננוף", terms: ["ybitan.co.il", "yohananof.co.il", "יוחננוף"], sort_order: 1540, enabled: true },
  { id: "osher-ad", category: "food", label: "מזון - אושר עד", terms: ["osherad.co.il", "אושר עד"], sort_order: 1550, enabled: true },
  { id: "tiv-taam", category: "food", label: "מזון - טיב טעם", terms: ["tivtaam.co.il", "טיב טעם"], sort_order: 1560, enabled: true },
  { id: "keshet-teamim", category: "food", label: "מזון - קשת טעמים", terms: ["keshet-teamim.co.il", "קשת טעמים"], sort_order: 1570, enabled: true },
  { id: "ampm", category: "food", label: "מזון - AM:PM", terms: ["ampm.co.il", "AM:PM", "אמפם"], sort_order: 1580, enabled: true },
  { id: "wolt", category: "food", label: "מזון - Wolt", terms: ["wolt.com", "Wolt", "וולט"], sort_order: 1590, enabled: true },
  { id: "tenbis", category: "food", label: "מזון - תן ביס", terms: ["10bis.co.il", "תן ביס", "Ten Bis"], sort_order: 1600, enabled: true },
  { id: "cibus", category: "food", label: "מזון - Cibus", terms: ["cibus-sodexo.co.il", "Cibus", "סיבוס"], sort_order: 1610, enabled: true },

  { id: "grow-business", category: "payment", label: "תשלומים - Grow", terms: ["grow.business", "grow.security", "Grow"], sort_order: 1710, enabled: true },
  { id: "cardcom", category: "payment", label: "תשלומים - Cardcom", terms: ["cardcom.co.il", "out.cardcom.co.il", "Cardcom", "קארדקום"], sort_order: 1720, enabled: true },
  { id: "tranzila", category: "payment", label: "תשלומים - Tranzila", terms: ["tranzila.com", "Tranzila", "טרנזילה"], sort_order: 1730, enabled: true },
  { id: "sinvoice", category: "payment", label: "חשבוניות - S-Invoice", terms: ["sinvoice.co.il", "S-Invoice", "חשבונית"], sort_order: 1740, enabled: true },
  { id: "myofficeguy", category: "payment", label: "חשבוניות - MyOfficeGuy", terms: ["myofficeguy.com", "MyOfficeGuy"], sort_order: 1750, enabled: true },
  { id: "moneysend", category: "payment", label: "תשלומים - MoneySend", terms: ["moneysend.co.il", "MoneySend", "דוח העברת כספים"], sort_order: 1760, enabled: true },
  { id: "hyp", category: "payment", label: "תשלומים - Hyp / iPos", terms: ["hyp.co.il", "ipos@hyp.co.il"], sort_order: 1770, enabled: true },
  { id: "paypal", category: "payment", label: "תשלומים - PayPal", terms: ["paypal.com", "paypal.co.il", "PayPal"], sort_order: 1780, enabled: true },

  { id: "gov-il", category: "government", label: "ממשלה - gov.il", terms: ["gov.il", "DoNotReply@gov.il", "ממשלתי"], sort_order: 1810, enabled: true },
  { id: "ecom-gov", category: "government", label: "ממשלה - שירות התשלומים הממשלתי", terms: ["ecom.gov.il", "שרות התשלומים הממשלתי", "שירות התשלומים הממשלתי"], sort_order: 1820, enabled: true },
  { id: "taxes-gov", category: "government", label: "ממשלה - רשות המסים", terms: ["taxes.gov.il", "רשות המסים", "פקיד שומה"], sort_order: 1830, enabled: true },
  { id: "mof-gov", category: "government", label: "ממשלה - רשות שוק ההון", terms: ["mof.gov.il", "רשות שוק ההון"], sort_order: 1840, enabled: true },
  { id: "police", category: "government", label: "ממשלה - משטרת ישראל", terms: ["police.gov.il", "police.gov.il", "משטרת ישראל"], sort_order: 1850, enabled: true },
  { id: "israel-post", category: "government", label: "דואר - דואר ישראל", terms: ["israelpost.co.il", "דואר ישראל"], sort_order: 1860, enabled: true },
  { id: "idf-digital", category: "government", label: "ממשלה - אתר האישורים צה\"ל", terms: ["digital.idf.il", "אתר האישורים צהל", "אתר האישורים צה\"ל"], sort_order: 1870, enabled: true },

  { id: "tel-aviv-muni", category: "household", label: "עירייה - תל אביב יפו", terms: ["mail.tel-aviv.gov.il", "arnona.tel-aviv.gov.il", "עיריית תל אביב", "עיריית תל-אביב-יפו", "ארנונה תל אביב"], sort_order: 1910, enabled: true },
  { id: "holon-muni", category: "household", label: "עירייה - חולון", terms: ["holon.muni.il", "ladpc.co.il", "עיריית חולון", "שובר תשלום ארנונה"], sort_order: 1920, enabled: true },

  { id: "fnx", category: "insurance", label: "ביטוח - הפניקס", terms: ["fnx.co.il", "9mil.co.il", "הפניקס"], sort_order: 2010, enabled: true },
  { id: "clal-ins", category: "insurance", label: "ביטוח - כלל", terms: ["clal-ins.co.il", "כלל ביטוח", "כלל פנסיה"], sort_order: 2020, enabled: true },
  { id: "menora", category: "insurance", label: "ביטוח - מנורה מבטחים", terms: ["menora.co.il", "מנורה מבטחים"], sort_order: 2030, enabled: true },
  { id: "passportcard", category: "insurance", label: "ביטוח - PassportCard", terms: ["passportcard.co.il", "PassportCard", "פספורטכארד"], sort_order: 2040, enabled: true },
  { id: "shomera", category: "insurance", label: "ביטוח - שומרה", terms: ["shomera.co.il", "שומרה"], sort_order: 2050, enabled: true },
  { id: "wobi", category: "insurance", label: "ביטוח - Wobi", terms: ["wobi.co.il", "Wobi"], sort_order: 2060, enabled: true },
  { id: "slika-ins", category: "insurance", label: "ביטוח - מסלקה פנסיונית", terms: ["tviot.slika-ins.co.il", "מסלקה פנסיונית", "דוח תביעות"], sort_order: 2070, enabled: true },

  { id: "bank-leumi", category: "finance", label: "פיננסים - בנק לאומי", terms: ["bankleumi.co.il", "בנק לאומי", "לאומי"], sort_order: 2110, enabled: true },
  { id: "bank-hapoalim", category: "finance", label: "פיננסים - בנק הפועלים", terms: ["bankhapoalim.co.il", "custmail.bankhapoalim.co.il", "בנק הפועלים"], sort_order: 2120, enabled: true },
  { id: "ibi", category: "finance", label: "פיננסים - IBI", terms: ["ibi.co.il", "IBI"], sort_order: 2130, enabled: true },
  { id: "more", category: "finance", label: "פיננסים - מור גמל ופנסיה", terms: ["more.co.il", "מור גמל", "מור פנסיה"], sort_order: 2140, enabled: true },

  { id: "elal", category: "travel", label: "תיירות - אל על", terms: ["elal-ticketing.com", "elal.com", "EL AL", "אל על"], sort_order: 2210, enabled: true },
  { id: "israir", category: "travel", label: "תיירות - ישראייר", terms: ["israir.co.il", "ישראייר", "Israir"], sort_order: 2220, enabled: true },
  { id: "arkia", category: "travel", label: "תיירות - ארקיע", terms: ["arkia.co.il", "iport.aero", "ארקיע"], sort_order: 2230, enabled: true },
  { id: "ferryscanner", category: "travel", label: "תיירות - Ferryscanner", terms: ["ferryscanner.com", "Ferryscanner"], sort_order: 2240, enabled: true },
  { id: "12go", category: "travel", label: "תיירות - 12Go", terms: ["12go.asia", "b.12go.asia", "12Go"], sort_order: 2250, enabled: true },
  { id: "bravofly", category: "travel", label: "תיירות - Bravofly", terms: ["bravofly.com", "Bravofly"], sort_order: 2260, enabled: true },
  { id: "aeroflot", category: "travel", label: "תיירות - Aeroflot", terms: ["aeroflot.ru", "Aeroflot", "אירופלוט"], sort_order: 2270, enabled: true },
  { id: "booking", category: "travel", label: "תיירות - Booking.com", terms: ["booking.com", "Booking.com"], sort_order: 2280, enabled: true },
  { id: "grab", category: "travel", label: "תיירות - Grab", terms: ["grab.com", "Grab"], sort_order: 2290, enabled: true },

  { id: "hadassah", category: "healthcare", label: "בריאות - הדסה", terms: ["hadassah.org.il", "הדסה"], sort_order: 2310, enabled: true },
  { id: "maccabi-dent", category: "healthcare", label: "בריאות - מכבידנט", terms: ["maccabi-dent.com", "מכבידנט"], sort_order: 2320, enabled: true },
  { id: "femi", category: "healthcare", label: "בריאות - FEMI", terms: ["femi.com", "FEMI", "בדיקת קורונה"], sort_order: 2330, enabled: true },
  { id: "natali", category: "healthcare", label: "בריאות - נטלי", terms: ["natali.co.il", "נטלי"], sort_order: 2340, enabled: true },
  { id: "mediton", category: "healthcare", label: "בריאות - מדיטון", terms: ["mediton.co.il", "מדיטון"], sort_order: 2350, enabled: true },
  { id: "medbalance", category: "healthcare", label: "בריאות - Med Balance", terms: ["medbalance.co.il", "Med Balance"], sort_order: 2360, enabled: true },

  { id: "hit", category: "education", label: "לימודים - HIT", terms: ["hit.ac.il", "HIT", "המכון הטכנולוגי חולון"], sort_order: 2410, enabled: true },
  { id: "john-bryce", category: "education", label: "לימודים - ג'ון ברייס", terms: ["johnbryce.co.il", "ג'ון ברייס"], sort_order: 2420, enabled: true },
  { id: "classoos", category: "education", label: "לימודים - Classoos", terms: ["classoos.com", "Classoos"], sort_order: 2430, enabled: true },
  { id: "college-org", category: "education", label: "לימודים - המכללה למנהל", terms: ["college.org.il", "המכללה למנהל"], sort_order: 2440, enabled: true },
  { id: "israel-cyber-campus", category: "education", label: "לימודים - Israel Cyber Campus", terms: ["israelcybercampus.com", "Israel Cyber Campus"], sort_order: 2450, enabled: true },
  { id: "devops-experts", category: "education", label: "לימודים - DevOps Experts", terms: ["devopsexperts.co.il", "DevOps Experts", "דבאופס"], sort_order: 2460, enabled: true },
  { id: "mika-center", category: "education", label: "לימודים - מיקה סנטר", terms: ["mika.center", "מיקה סנטר"], sort_order: 2470, enabled: true },

  { id: "homecenter", category: "retail", label: "קמעונאות - הום סנטר", terms: ["homecenter.co.il", "הום סנטר", "Home Center"], sort_order: 2520, enabled: true },
  { id: "intertoys", category: "retail", label: "קמעונאות - אינטרטויס", terms: ["אינטרטויס", "Intertoys"], sort_order: 2530, enabled: true },
  { id: "shw", category: "retail", label: "קמעונאות - שמרת הזורע", terms: ["shw.co.il", "שמרת הזורע"], sort_order: 2550, enabled: true },
  { id: "fizikal", category: "retail", label: "קמעונאות - Fizikal", terms: ["fizikal.co.il", "Fizikal"], sort_order: 2560, enabled: true },
  { id: "headstart", category: "retail", label: "קמעונאות - Headstart", terms: ["headstart.co.il", "Headstart", "הדסטארט"], sort_order: 2570, enabled: true },
  { id: "ace", category: "retail", label: "קמעונאות - ACE", terms: ["ace.co.il", "ACE", "אייס"], sort_order: 2571, enabled: true },
  { id: "ikea", category: "retail", label: "קמעונאות - IKEA", terms: ["ikea.co.il", "ikea.com", "IKEA", "איקאה"], sort_order: 2572, enabled: true },
  { id: "max-stock", category: "retail", label: "קמעונאות - Max Stock", terms: ["maxstock.co.il", "Max Stock", "מקס סטוק"], sort_order: 2573, enabled: true },
  { id: "office-depot", category: "retail", label: "קמעונאות - Office Depot", terms: ["officedepot.co.il", "Office Depot", "אופיס דיפו"], sort_order: 2574, enabled: true },
  { id: "fox", category: "retail", label: "קמעונאות - Fox", terms: ["foxhome.co.il", "fox.co.il", "Fox Home", "פוקס"], sort_order: 2575, enabled: true },
  { id: "castro", category: "retail", label: "קמעונאות - Castro", terms: ["castro.co.il", "Castro", "קסטרו"], sort_order: 2576, enabled: true },
  { id: "golf", category: "retail", label: "קמעונאות - Golf", terms: ["golf.co.il", "Golf", "גולף"], sort_order: 2577, enabled: true },
  { id: "renuar", category: "retail", label: "קמעונאות - רנואר", terms: ["renuar.co.il", "Renuar", "רנואר"], sort_order: 2578, enabled: true },
  { id: "hamashbir", category: "retail", label: "קמעונאות - המשביר לצרכן", terms: ["hamashbir.co.il", "המשביר לצרכן", "המשביר"], sort_order: 2579, enabled: true },
  { id: "super-pharm", category: "retail", label: "קמעונאות - סופר פארם", terms: ["super-pharm.co.il", "Super-Pharm", "סופר פארם"], sort_order: 2581, enabled: true },
  { id: "be", category: "retail", label: "קמעונאות - Be", terms: ["be-fashion.co.il", "Be Fashion", "בי סטייל"], sort_order: 2582, enabled: true },
  { id: "steimatzky", category: "retail", label: "קמעונאות - סטימצקי", terms: ["steimatzky.co.il", "Steimatzky", "סטימצקי"], sort_order: 2583, enabled: true },
  { id: "tzomet-sfarim", category: "retail", label: "קמעונאות - צומת ספרים", terms: ["tzometsfarim.co.il", "צומת ספרים"], sort_order: 2584, enabled: true },
  { id: "walkin", category: "retail", label: "קמעונאות - Walk In", terms: ["walkin.co.il", "Walk In", "ווק אין"], sort_order: 2592, enabled: true },
  { id: "onyxboox", category: "retail", label: "קמעונאות - Onyx Boox", terms: ["onyxboox.co.il", "Onyx Boox"], sort_order: 2593, enabled: true },
  { id: "atfolix", category: "retail", label: "קמעונאות - atFoliX", terms: ["folix.de", "atfolix", "atFoliX"], sort_order: 2594, enabled: true },
  { id: "playstation-store", category: "retail", label: "קמעונאות - PlayStation Store", terms: ["playstation.com", "PlayStation Store", "פלייסטיישן"], sort_order: 2595, enabled: true },

  { id: "ksp", category: "electronics", label: "אלקטרוניקה - KSP", terms: ["ksp.co.il", "KSP", "קיאספי"], sort_order: 2585, enabled: true },
  { id: "bug", category: "electronics", label: "אלקטרוניקה - BUG", terms: ["bug.co.il", "BUG", "באג"], sort_order: 2586, enabled: true },
  { id: "ivory", category: "electronics", label: "אלקטרוניקה - Ivory", terms: ["ivory.co.il", "Ivory", "אייבורי"], sort_order: 2587, enabled: true },
  { id: "onepc", category: "electronics", label: "אלקטרוניקה - A&A מחשבים וסלולר", terms: ["1pc.co.il", "א&א מחשבים", "א&A מחשבים"], sort_order: 2588, enabled: true },
  { id: "payngo", category: "electronics", label: "אלקטרוניקה - מחסני חשמל", terms: ["payngo.co.il", "מחסני חשמל", "PayNgo"], sort_order: 2589, enabled: true },
  { id: "bexpress", category: "electronics", label: "אלקטרוניקה - Bexpress", terms: ["bexpress.co.il", "Bexpress", "בי אקספרס"], sort_order: 2590, enabled: true },
  { id: "vinet", category: "electronics", label: "אלקטרוניקה - וויינט", terms: ["vinet.co.il", "וויינט"], sort_order: 2591, enabled: true },

  { id: "zofim", category: "nonprofit", label: "עמותות - הצופים", terms: ["zofim.org.il", "צופים"], sort_order: 2610, enabled: true },
  { id: "bnei-baruch", category: "nonprofit", label: "עמותות - בני ברוך", terms: ["kabbalah.info", "בני ברוך", "קבלה לעם"], sort_order: 2620, enabled: true },
  { id: "shifra", category: "nonprofit", label: "עמותות - שפרה פשוט לאהוב", terms: ["עמותת שפרה פשוט לאהוב", "שפרה פשוט לאהוב"], sort_order: 2630, enabled: true },

  { id: "morning", category: "digital", label: "דיגיטל - Morning (חשבונית ירוקה)", terms: ["morning.co", "חשבונית ירוקה"], sort_order: 2710, enabled: true },
  { id: "google", category: "digital", label: "דיגיטל - Google", terms: ["google.com", "Google", "Google Workspace"], sort_order: 2720, enabled: true },
  { id: "slack", category: "digital", label: "דיגיטל - Slack", terms: ["slack.com", "Slack"], sort_order: 2730, enabled: true },
  { id: "notion", category: "digital", label: "דיגיטל - Notion", terms: ["notion.so", "Notion"], sort_order: 2740, enabled: true },
  { id: "figma", category: "digital", label: "דיגיטל - Figma", terms: ["figma.com", "Figma"], sort_order: 2750, enabled: true },
  { id: "canva", category: "digital", label: "דיגיטל - Canva", terms: ["canva.com", "Canva"], sort_order: 2760, enabled: true },
  { id: "linear", category: "digital", label: "דיגיטל - Linear", terms: ["linear.app", "Linear"], sort_order: 2770, enabled: true },
  { id: "atlassian", category: "digital", label: "דיגיטל - Atlassian", terms: ["atlassian.com", "Jira", "Confluence", "Atlassian"], sort_order: 2780, enabled: true },

  { id: "openai", category: "development", label: "פיתוח - OpenAI", terms: ["openai.com", "OpenAI", "ChatGPT"], sort_order: 2810, enabled: true },
  { id: "anthropic", category: "development", label: "פיתוח - Anthropic", terms: ["anthropic.com", "mail.anthropic.com", "Anthropic", "Claude"], sort_order: 2820, enabled: true },
  { id: "github", category: "development", label: "פיתוח - GitHub", terms: ["github.com", "GitHub"], sort_order: 2830, enabled: true },
  { id: "gitlab", category: "development", label: "פיתוח - GitLab", terms: ["gitlab.com", "GitLab"], sort_order: 2840, enabled: true },
  { id: "npm", category: "development", label: "פיתוח - npm", terms: ["npmjs.com", "npm"], sort_order: 2850, enabled: true },
  { id: "docker", category: "development", label: "פיתוח - Docker", terms: ["docker.com", "Docker"], sort_order: 2860, enabled: true },
  { id: "vercel", category: "development", label: "פיתוח - Vercel", terms: ["vercel.com", "Vercel"], sort_order: 2870, enabled: true },
  { id: "netlify", category: "development", label: "פיתוח - Netlify", terms: ["netlify.com", "Netlify"], sort_order: 2880, enabled: true },
  { id: "render", category: "development", label: "פיתוח - Render", terms: ["render.com", "Render"], sort_order: 2890, enabled: true },
  { id: "railway", category: "development", label: "פיתוח - Railway", terms: ["railway.app", "railway.com", "Railway", "Railway Corporation"], sort_order: 2900, enabled: true },
  { id: "digitalocean", category: "development", label: "פיתוח - DigitalOcean", terms: ["digitalocean.com", "DigitalOcean"], sort_order: 2910, enabled: true },
  { id: "cloudflare", category: "development", label: "פיתוח - Cloudflare", terms: ["cloudflare.com", "Cloudflare"], sort_order: 2920, enabled: true },
  { id: "aws", category: "development", label: "פיתוח - AWS", terms: ["amazon.com", "aws.amazon.com", "AWS", "Amazon Web Services"], sort_order: 2930, enabled: true },
  { id: "azure", category: "development", label: "פיתוח - Microsoft Azure", terms: ["azure.microsoft.com", "microsoft.com", "Azure", "Microsoft Azure"], sort_order: 2940, enabled: true },
  { id: "google-cloud", category: "development", label: "פיתוח - Google Cloud", terms: ["cloud.google.com", "Google Cloud", "GCP"], sort_order: 2950, enabled: true },
  { id: "sentry", category: "development", label: "פיתוח - Sentry", terms: ["sentry.io", "Sentry"], sort_order: 2960, enabled: true },
  { id: "stripe", category: "development", label: "פיתוח - Stripe", terms: ["stripe.com", "Stripe"], sort_order: 2970, enabled: true },
  { id: "twilio", category: "development", label: "פיתוח - Twilio", terms: ["twilio.com", "Twilio"], sort_order: 2980, enabled: true },
  { id: "sendgrid", category: "development", label: "פיתוח - SendGrid", terms: ["sendgrid.com", "SendGrid"], sort_order: 2990, enabled: true },
  { id: "resend", category: "development", label: "פיתוח - Resend", terms: ["resend.com", "Resend"], sort_order: 3000, enabled: true },
  { id: "namecheap", category: "development", label: "פיתוח - Namecheap", terms: ["namecheap.com", "Namecheap"], sort_order: 3010, enabled: true },
  { id: "godaddy", category: "development", label: "פיתוח - GoDaddy", terms: ["godaddy.com", "GoDaddy"], sort_order: 3020, enabled: true },
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
