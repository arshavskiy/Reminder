import { ref, computed, watch, nextTick } from "vue";
import { useRoute } from "vue-router";

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
  "/documents": "documents",
  "/contracts": "contracts",
  "/reminders": "reminders",
  "/clients": "clients",
  "/reports": "reports",
};

const tours: Record<string, WalkthroughStep[]> = {
  main: [
    {
      selector: ".appbar__brand",
      title: "ברוכים הבאים ל-RemindOCR",
      text: "המערכת לניהול תסקירים, תזכורות ולקוחות. בואו נכיר את הממשק.",
      placement: "bottom",
    },
    {
      selector: ".appbar__nav",
      title: "תפריט ניווט",
      text: "כאן תמצאו גישה מהירה לכל חלקי המערכת: מסמכים, תסקירים, תזכורות, דוחות, לקוחות ועוד.",
      placement: "bottom",
    },
    {
      selector: ".dash__intake",
      title: "אזור העלאה מהירה",
      text: "גררו מסמכים לכאן או לחצו על + ליצירת תסקיר חדש. המערכת תזהה אוטומטית את סוג המסמך.",
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
      text: "מכאן תוכלו לגשת לפרופיל, תבניות הדפסה ואימייל, הגדרות ציוד, וכניסה מחדש לסיור זה.",
      placement: "bottom",
    },
  ],
  documents: [
    {
      selector: ".documents-actions",
      title: "פעולות מסמכים",
      text: "העלו מסמכים חדשים, רעננו רשימה, הפעילו סריקה מחדש או מחקו מסמכים.",
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
      text: "חפשו לפי שם קובץ, סננו לפי לקוח או תאריכים, והחליפו בין תצוגת רשימה וכרטיסים.",
      placement: "bottom",
    },
    {
      selector: ".bulk-action-anchor",
      title: "פעולות מרובות",
      text: "הפעילו מצב בחירה כדי לסמן מסמכים ולבצע פעולות על כולם — מחיקה, סריקה מחדש ועוד.",
      placement: "bottom",
    },
  ],
  contracts: [
    {
      selector: ".page__actions-row--main",
      title: "ניהול תסקירים",
      text: "צרו תסקיר חדש, ייצאו דוח חודשי, או עברו לתצוגת מסמכים.",
      placement: "bottom",
    },
    {
      selector: ".filterbar",
      title: "סינון לפי סטטוס",
      text: "סננו תסקירים לפי מצב: הכל, פעיל, פג תוקף, ממתין לבדיקה ועוד.",
      placement: "bottom",
    },
    {
      selector: ".toolbar",
      title: "חיפוש תסקירים",
      text: "חפשו תסקיר לפי שם לקוח, מספר חוזה או כל שדה אחר.",
      placement: "bottom",
    },
    {
      selector: ".bulk-action-anchor",
      title: "פעולות מרובות",
      text: "סמנו תסקירים ושלחו התראות, צרו תזכורות או מחקו בבת אחת.",
      placement: "bottom",
    },
  ],
  reminders: [
    {
      selector: ".reminders-hero",
      title: "ניהול תזכורות",
      text: "כאן תנהלו את כל התזכורות — יצירה, שליחה ומעקב אחרי סטטוס.",
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
  clients: [
    {
      selector: ".clients-actions",
      title: "ניהול לקוחות",
      text: "הוסיפו לקוח חדש, רעננו רשימה, או מחקו לקוחות שאינם רלוונטיים.",
      placement: "bottom",
    },
    {
      selector: ".client-search",
      title: "חיפוש לקוחות",
      text: "חפשו לפי שם, אימייל, טלפון או כל שדה. התוצאות מתעדכנות בזמן אמת.",
      placement: "bottom",
    },
    {
      selector: ".table-wrap",
      title: "טבלת לקוחות",
      text: "כל הלקוחות מוצגים כאן עם פרטי קשר, מספר חוזים ותזכורות. לחצו לעריכה.",
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

export function useWalkthrough() {
  const route = useRoute();
  const steps = computed(() => currentTourId.value ? (tours[currentTourId.value] ?? []) : []);
  const currentStep = computed(() => steps.value[currentStepIndex.value] ?? null);
  const totalSteps = computed(() => steps.value.length);
  const isLastStep = computed(() => currentStepIndex.value >= steps.value.length - 1);

  function startTour(tourId = "main") {
    currentTourId.value = tourId;
    currentStepIndex.value = 0;
    active.value = true;
  }

  function nextStep() {
    if (isLastStep.value) {
      endTour();
      return;
    }
    currentStepIndex.value++;
  }

  function prevStep() {
    if (currentStepIndex.value > 0) {
      currentStepIndex.value--;
    }
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
      const firstStep = tours[tourId]?.[0];
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
