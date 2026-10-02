// Release notes shown in the dashboard "What's new" card. Bump WHATS_NEW_RELEASE
// when adding a batch of items: every user then sees the card once more.
export const WHATS_NEW_RELEASE = "2026-10";

export type WhatsNewItemId = "emailIn" | "camera" | "discovery" | "feed" | "push" | "dueSoon" | "tableViews" | "invoiceScan";

type ItemText = { title: string; text: string; action?: string };
type Messages = {
  heading: string;
  subheading: string;
  dismiss: string;
  businessTag: string;
  tour: string;
  items: Record<WhatsNewItemId, ItemText>;
};

export const whatsNewMessages: Record<"he" | "en", Messages> = {
  he: {
    heading: "מה חדש במערכת",
    subheading: "כמה דרכים חדשות להכניס מסמכים ולא לפספס מועדים.",
    dismiss: "הבנתי",
    businessTag: "מסלול עסקי",
    tour: "הדרכה קצרה",
    items: {
      emailIn: { title: "העברת מסמכים בדואר", text: "כתובת אישית: מעבירים אליה חשבונית או תסקיר מכל תיבת דואר, והמערכת מייבאת ומחלצת את התאריכים.", action: "קבלת הכתובת" },
      camera: { title: "צילום ושיתוף מהנייד", text: "מצלמים מסמך בנייד, או משתפים קובץ ישירות לאפליקציה המותקנת.", action: "העלאת מסמך" },
      discovery: { title: "סריקה שבועית של הדואר", text: "מאתרת מועדים ופגישות בעברית, באנגלית וברוסית, כולל מועדים שפוספסו, ומתריעה רק על ממצאים חדשים. כל יום או כל שבוע.", action: "הפעלת הסריקה" },
      feed: { title: "פיד יומן ל-Apple ול-Outlook", text: "מנוי יומן לקריאה בלבד שמציג את התזכורות בכל אפליקציית יומן.", action: "קבלת הקישור" },
      push: { title: "התראות בדפדפן", text: "בפעמון בראש העמוד אפשר להפעיל התראות על תזכורות שנשלחו ועל מועדים חדשים." },
      dueSoon: { title: "חשבוניות לתשלום בקרוב", text: "בלוח הראשי מופיעות חשבוניות שמועד התשלום שלהן קרוב, עם הוספת תזכורת בלחיצה." },
      invoiceScan: { title: "סריקה יומית של חשבוניות", text: "פעם ביום מיובאות אוטומטית חשבוניות וקבלות חדשות מ-Gmail, ותקבלו התראה כשיש חדשות. מפעילים בעמוד החשבוניות.", action: "פתיחת החשבוניות" },
      tableViews: { title: "הטבלאות זוכרות את הבחירות שלכם", text: "סינונים, טווח תאריכים, מיון וגודל עמוד נשמרים בכל טבלה, ועמוד החשבוניות נפתח על שלושת החודשים האחרונים." },
    },
  },
  en: {
    heading: "What's new",
    subheading: "New ways to get documents in and never miss a deadline.",
    dismiss: "Got it",
    businessTag: "Business plan",
    tour: "Quick tour",
    items: {
      emailIn: { title: "Forward documents by email", text: "Get a personal address: forward an invoice or report from any mailbox and it is imported with its dates extracted.", action: "Get my address" },
      camera: { title: "Capture and share from your phone", text: "Photograph a document, or share a file straight into the installed app.", action: "Upload a document" },
      discovery: { title: "Weekly mailbox scan", text: "Finds deadlines and appointments in Hebrew, English and Russian, including missed ones, and alerts you only to new finds. Daily or weekly.", action: "Turn on the scan" },
      feed: { title: "Calendar feed for Apple and Outlook", text: "A read-only calendar subscription that shows your reminders in any calendar app.", action: "Get the link" },
      push: { title: "Browser notifications", text: "Use the bell at the top of the page to turn on alerts for sent reminders and new discoveries." },
      dueSoon: { title: "Invoices due soon", text: "The dashboard lists invoices whose payment date is near, with one-click add-reminder." },
      invoiceScan: { title: "Daily invoice scan", text: "Once a day, new invoices and receipts are imported from Gmail and you get a notification when there are new ones. Turn it on in the Invoices page.", action: "Open Invoices" },
      tableViews: { title: "Tables remember your choices", text: "Filters, date range, sort and page size are saved on each table, and Invoices opens on the last 3 months." },
    },
  },
};
