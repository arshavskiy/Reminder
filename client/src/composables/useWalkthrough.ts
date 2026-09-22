import { ref, computed, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { localizedPath, stripLocalePrefix, useLocaleStore } from "../stores/locale.js";

export interface WalkthroughStep {
  selector: string;
  title: string;
  text: string;
  placement?: "top" | "bottom" | "left" | "right";
  page?: string;
  onBeforeShow?: () => void;
}

const STORAGE_KEY = "walkthrough_completed";
const active = ref(false);
const currentStepIndex = ref(0);
const currentTourId = ref<string | null>(null);

function getCompleted(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function markCompleted(tourId: string) {
  const list = getCompleted();
  if (!list.includes(tourId)) {
    list.push(tourId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
}

function isCompleted(tourId: string): boolean {
  return getCompleted().includes(tourId);
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
}

const PAGE_TOUR_MAP: Record<string, string> = {
  "/": "main",
  "/dashboard": "main",
  "/documents": "documents",
  "/quotes": "quotes",
  "/activity": "activity",
  "/reminders": "reminders",
  "/equipment": "equipment",
  "/clients": "clients",
  "/reports": "reports",
};

const TOURS_HE: Record<string, WalkthroughStep[]> = {
  main: [
    {
      selector: ".app-nav__brand",
      title: "ברוכים הבאים ללובי",
      text: "מכאן חוזרים ללובי. המערכת לניהול תסקירים, תזכורות ולקוחות.",
      placement: "left",
    },
    {
      selector: ".app-nav__list",
      title: "תפריט צד",
      text: "לחצו על פריט כדי לעבור לעמוד. פריט עם חץ נפתח בריחוף: תסקירים (תסקירים, הצעות מחיר, יומן פעילות), תזכורות (תזכורות ויומן פעילות), וציוד (ציוד ויצרנים). אפשר לכווץ את התפריט לאייקונים.",
      placement: "left",
    },
    {
      selector: ".dash__intake",
      title: "אזור העלאה מהירה",
      text: "גררו מסמכים לכאן, לחצו על + ליצירת תסקיר חדש, או השתמשו בייבוא תסקירי בדיקה מ-Gmail.",
      placement: "bottom",
    },
    {
      selector: ".dash__stats",
      title: "סטטיסטיקות מהירות",
      text: "סקירה כללית של מספר המסמכים, הלקוחות, התסקירים והתזכורות שלכם.",
      placement: "bottom",
    },
    {
      selector: ".calendar-pref",
      title: "לוח שנה ותזכורות",
      text: "לוח שנה אינטראקטיבי המציג את כל התזכורות והבדיקות המתוכננות שלכם.",
      placement: "top",
    },
    {
      selector: ".module-grid",
      title: "מודולים",
      text: "קיצורי דרך לכל חלקי המערכת. לחצו על כרטיס כדי לעבור לעמוד המתאים.",
      placement: "top",
    },
    {
      selector: ".user-dropdown",
      title: "תפריט משתמש",
      text: "מכאן נכנסים לפרופיל, להגדרות, למנוי ולתבניות. אפשר גם להתחיל מחדש את הסיור.",
      placement: "left",
    },
  ],
  documents: [
    {
      selector: ".page-header__hero",
      title: "פעולות תסקירים",
      text: "תסקיר חדש, העלאת קבצים, ייבוא מ-Gmail, ייצוא ל-Drive ודוח חודשי.",
      placement: "bottom",
    },
    {
      selector: ".page-header__tools",
      title: "כלים",
      text: "רענון, בחירה מרובה (הורדה, מיזוג, חילוץ ומחיקה) והגדרות עיבוד. יומן הפעילות נמצא בתפריט הצד תחת תסקירים.",
      placement: "bottom",
    },
    {
      selector: ".filterbar",
      title: "סינון לפי סטטוס",
      text: "סננו מסמכים לפי מצב עיבוד: הכל, ממתין, הושלם, שגיאה ועוד.",
      placement: "bottom",
    },
    {
      selector: ".toolbar",
      title: "חיפוש וסינון מתקדם",
      text: "חפשו לפי שם קובץ, וסננו לפי לקוח, סוג או תאריכים.",
      placement: "bottom",
    },
  ],
  quotes: [
    {
      selector: ".quotes-head",
      title: "הצעות מחיר",
      text: "צרו הצעת מחיר חדשה או רעננו את הרשימה. העמוד נמצא בתפריט הצד תחת תסקירים.",
      placement: "bottom",
    },
    {
      selector: ".quotes-table-wrap, .quotes-empty",
      title: "רשימת הצעות",
      text: "כל ההצעות עם לקוח, תסקיר, תוקף וסכום. לחצו על שורה לפרטים.",
      placement: "top",
    },
  ],
  activity: [
    {
      selector: ".page-header",
      title: "יומן פעילות",
      text: "מגיעים לכאן מתפריט תסקירים (פעילות מסמכים) או מתפריט תזכורות (פעילות מיילים).",
      placement: "bottom",
    },
    {
      selector: ".quick-filterbar",
      title: "סינון לפי סוג",
      text: "החליפו בין סוגי הפעילות. הקישור מהתפריט כבר מסנן לתסקירים או לתזכורות.",
      placement: "bottom",
    },
  ],
  reminders: [
    {
      selector: ".reminders-hero",
      title: "ניהול תזכורות",
      text: "כאן תנהלו את כל התזכורות — יצירה, שליחה ומעקב אחרי סטטוס. יומן הפעילות נמצא בתפריט הצד תחת תזכורות.",
      placement: "bottom",
    },
    {
      selector: ".reminders-summary",
      title: "סיכום מהיר",
      text: "מבט מהיר על מספר התזכורות לפי סטטוס: ממתין, נשלח, בוצע.",
      placement: "bottom",
    },
    {
      selector: ".reminders-controls",
      title: "חיפוש וסינון",
      text: "חפשו תזכורות לפי טקסט חופשי, סננו לפי סטטוס או השתמשו בפילטרים מהירים.",
      placement: "bottom",
    },
    {
      selector: ".reminders-table",
      title: "טבלת תזכורות",
      text: "כל התזכורות ברשימה עם פרטים מלאים. לחצו על שורה לפרטים נוספים ופעולות.",
      placement: "top",
    },
  ],
  equipment: [
    {
      selector: ".page__head",
      title: "ציוד",
      text: "ניהול ציוד. בתפריט הצד תחת ציוד יש שני עמודים: ציוד ויצרנים.",
      placement: "bottom",
    },
    {
      selector: ".subhead",
      title: "העמוד הפעיל",
      text: "כותרת העמוד הנוכחי. בעמוד ציוד מופיעים כאן גם הוספה, ייבוא ורענון.",
      placement: "bottom",
    },
  ],
  clients: [
    {
      selector: ".clients-actions",
      title: "ניהול לקוחות",
      text: "הוסיפו לקוח חדש, רעננו את הרשימה, בחרו כמה לקוחות או מחקו.",
      placement: "bottom",
    },
    {
      selector: ".clients-toolbar",
      title: "חיפוש וסינון",
      text: "חפשו לפי שם, אימייל או טלפון, וסננו לפי סוג.",
      placement: "bottom",
    },
    {
      selector: ".clients-table-wrap, .clients-empty",
      title: "טבלת לקוחות",
      text: "כל הלקוחות עם פרטי קשר ומספר מסמכים. לחצו על שורה לעריכה.",
      placement: "top",
    },
  ],
  reports: [
    {
      selector: ".reports-panel--generator",
      title: "הפקת דוחות",
      text: "בחרו לקוח ותקופה, התאימו עמודות, והפיקו דוח PDF או Excel.",
      placement: "bottom",
    },
    {
      selector: ".field-selector",
      title: "בחירת שדות",
      text: "בחרו אילו עמודות יופיעו בדוח. ההגדרות נשמרות עבורכם.",
      placement: "bottom",
    },
    {
      selector: ".reports-panel--schedule",
      title: "דוחות מתוזמנים",
      text: "הגדירו שליחת דוחות אוטומטית מדי חודש לכתובות אימייל שתבחרו.",
      placement: "bottom",
    },
  ],
};

const TOURS_EN: Record<string, WalkthroughStep[]> = {
  main: [
    {
      selector: ".app-nav__brand",
      title: "Welcome to the lobby",
      text: "This returns you to the lobby. The system for managing inspections, reminders, and clients.",
      placement: "right",
    },
    {
      selector: ".app-nav__list",
      title: "Side menu",
      text: "Click an item to open that page. An item with a chevron opens on hover: Inspections (inspections, quotes, activity log), Reminders (reminders and activity log), and Equipment (equipment and manufacturers). You can collapse the menu to icons.",
      placement: "right",
    },
    {
      selector: ".dash__intake",
      title: "Quick upload area",
      text: "Drag documents here, click + to create a new inspection report, or import inspection reports from Gmail.",
      placement: "bottom",
    },
    {
      selector: ".dash__stats",
      title: "Quick stats",
      text: "An overview of your document, client, inspection, and reminder counts.",
      placement: "bottom",
    },
    {
      selector: ".calendar-pref",
      title: "Calendar and reminders",
      text: "An interactive calendar showing all your scheduled reminders and inspections.",
      placement: "top",
    },
    {
      selector: ".module-grid",
      title: "Modules",
      text: "Shortcuts to every part of the system. Click a card to jump to that page.",
      placement: "top",
    },
    {
      selector: ".user-dropdown",
      title: "User menu",
      text: "Open your profile, settings, subscription, and templates. You can also restart this tour from here.",
      placement: "right",
    },
  ],
  documents: [
    {
      selector: ".page-header__hero",
      title: "Inspection actions",
      text: "New inspection, file upload, Gmail import, Drive export, and the monthly report.",
      placement: "bottom",
    },
    {
      selector: ".page-header__tools",
      title: "Tools",
      text: "Refresh, multi-select (download, merge, extract, and delete), and processing settings. The activity log is in the side menu under Inspections.",
      placement: "bottom",
    },
    {
      selector: ".filterbar",
      title: "Filter by status",
      text: "Filter documents by processing state: all, pending, done, error, and more.",
      placement: "bottom",
    },
    {
      selector: ".toolbar",
      title: "Search and advanced filters",
      text: "Search by file name, and filter by client, type, or date.",
      placement: "bottom",
    },
  ],
  quotes: [
    {
      selector: ".quotes-head",
      title: "Quotes",
      text: "Create a new quote or refresh the list. This page is in the side menu under Inspections.",
      placement: "bottom",
    },
    {
      selector: ".quotes-table-wrap, .quotes-empty",
      title: "Quote list",
      text: "Every quote with client, inspection, validity, and amount. Click a row for details.",
      placement: "top",
    },
  ],
  activity: [
    {
      selector: ".page-header",
      title: "Activity log",
      text: "Open this from Inspections (document activity) or from Reminders (email activity).",
      placement: "bottom",
    },
    {
      selector: ".quick-filterbar",
      title: "Filter by type",
      text: "Switch activity types. The menu link already filters to inspections or reminders.",
      placement: "bottom",
    },
  ],
  reminders: [
    {
      selector: ".reminders-hero",
      title: "Manage reminders",
      text: "Create, send, and track the status of all your reminders here. The activity log is in the side menu under Reminders.",
      placement: "bottom",
    },
    {
      selector: ".reminders-summary",
      title: "Quick summary",
      text: "A quick look at reminder counts by status: pending, sent, done.",
      placement: "bottom",
    },
    {
      selector: ".reminders-controls",
      title: "Search and filter",
      text: "Search reminders by free text, filter by status, or use the quick filters.",
      placement: "bottom",
    },
    {
      selector: ".reminders-table",
      title: "Reminders table",
      text: "All reminders listed with full details. Click a row for more details and actions.",
      placement: "top",
    },
  ],
  equipment: [
    {
      selector: ".page__head",
      title: "Equipment",
      text: "Manage equipment. Under Equipment in the side menu there are two pages: Equipment and Manufacturers.",
      placement: "bottom",
    },
    {
      selector: ".subhead",
      title: "Current page",
      text: "The heading for the page you are on. On Equipment, add, import, and refresh are here too.",
      placement: "bottom",
    },
  ],
  clients: [
    {
      selector: ".clients-actions",
      title: "Manage clients",
      text: "Add a client, refresh the list, select several clients, or delete them.",
      placement: "bottom",
    },
    {
      selector: ".clients-toolbar",
      title: "Search and filter",
      text: "Search by name, email, or phone, and filter by type.",
      placement: "bottom",
    },
    {
      selector: ".clients-table-wrap, .clients-empty",
      title: "Clients table",
      text: "All clients with contact details and document counts. Click a row to edit.",
      placement: "top",
    },
  ],
  reports: [
    {
      selector: ".reports-panel--generator",
      title: "Generate reports",
      text: "Choose a client and period, customize columns, and generate a PDF or Excel report.",
      placement: "bottom",
    },
    {
      selector: ".field-selector",
      title: "Choose fields",
      text: "Choose which columns appear in the report. Your settings are saved for next time.",
      placement: "bottom",
    },
    {
      selector: ".reports-panel--schedule",
      title: "Scheduled reports",
      text: "Set up automatic monthly report delivery to the email addresses you choose.",
      placement: "bottom",
    },
  ],
};

const TOURS_BY_LOCALE: Record<"he" | "en", Record<string, WalkthroughStep[]>> = {
  he: TOURS_HE,
  en: TOURS_EN,
};

export function useWalkthrough() {
  const localeStore = useLocaleStore();
  const tours = computed(() => TOURS_BY_LOCALE[localeStore.locale] ?? TOURS_HE);
  const route = useRoute();
  const router = useRouter();
  const steps = computed(() => currentTourId.value ? (tours.value[currentTourId.value] ?? []) : []);
  const currentStep = computed(() => steps.value[currentStepIndex.value] ?? null);
  const totalSteps = computed(() => steps.value.length);

  function selectorExists(selector: string): boolean {
    return !!document.querySelector(selector);
  }

  function findVisibleIndex(from: number, direction: 1 | -1): number | null {
    const list = steps.value;
    for (let i = from; i >= 0 && i < list.length; i += direction) {
      const step = list[i];
      if (step && selectorExists(step.selector)) return i;
    }
    return null;
  }

  const isLastStep = computed(() => findVisibleIndex(currentStepIndex.value + 1, 1) == null);

  function focusVisibleStep(from: number, direction: 1 | -1) {
    const index = findVisibleIndex(from, direction);
    if (index == null) {
      endTour();
      return;
    }
    currentStepIndex.value = index;
  }

  function beginTour(tourId: string) {
    currentTourId.value = tourId;
    currentStepIndex.value = 0;
    active.value = true;
    void nextTick(() => {
      if (!active.value || currentTourId.value !== tourId) return;
      focusVisibleStep(0, 1);
    });
  }

  function startTour(tourId = "main") {
    if (tourId === "main" && stripLocalePrefix(route.path) !== "/dashboard") {
      active.value = true;
      currentTourId.value = tourId;
      void router.push(localizedPath("/dashboard")).then(() => beginTour(tourId));
      return;
    }
    beginTour(tourId);
  }

  function nextStep() {
    const next = findVisibleIndex(currentStepIndex.value + 1, 1);
    if (next == null) {
      endTour();
      return;
    }
    currentStepIndex.value = next;
  }

  function prevStep() {
    const prev = findVisibleIndex(currentStepIndex.value - 1, -1);
    if (prev != null) currentStepIndex.value = prev;
  }

  function endTour() {
    active.value = false;
    if (currentTourId.value) {
      markCompleted(currentTourId.value);
    }
    currentTourId.value = null;
    currentStepIndex.value = 0;
  }

  function skipTour() {
    endTour();
  }

  function autoTriggerForPage(path: string) {
    const tourId = PAGE_TOUR_MAP[path];
    if (!tourId || isCompleted(tourId) || active.value) return;
    setTimeout(() => {
      if (isCompleted(tourId) || active.value) return;
      const firstStep = tours.value[tourId]?.[0];
      if (firstStep && document.querySelector(firstStep.selector)) {
        startTour(tourId);
      }
    }, 800);
  }

  return {
    active,
    currentStep,
    currentStepIndex,
    totalSteps,
    isLastStep,
    startTour,
    nextStep,
    prevStep,
    endTour,
    skipTour,
    isCompleted,
    resetAll,
    autoTriggerForPage,
  };
}
