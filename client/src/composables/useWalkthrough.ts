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

const tours: Record<string, WalkthroughStep[]> = {
  main: [
    {
      selector: ".appbar__brand",
      title: "ברוכים הבאים ל-ReminderOCR",
      text: "המערכת לניהול תסקירים, תזכורות ולקוחות. בואו נכיר את הממשק.",
      placement: "bottom",
      page: "/",
    },
    {
      selector: ".appbar__nav",
      title: "תפריט ניווט",
      text: "כאן תמצאו גישה מהירה לכל חלקי המערכת: מסמכים, תסקירים, תזכורות, דוחות, לקוחות ועוד.",
      placement: "bottom",
      page: "/",
    },
    {
      selector: ".dash__intake",
      title: "אזור העלאה מהירה",
      text: "גררו מסמכים לכאן או לחצו על + ליצירת תסקיר חדש. המערכת תזהה אוטומטית את סוג המסמך.",
      placement: "bottom",
      page: "/",
    },
    {
      selector: ".dash__stats",
      title: "סטטיסטיקות מהירות",
      text: "סקירה כללית של מספר המסמכים, הלקוחות, התסקירים והתזכורות שלכם.",
      placement: "bottom",
      page: "/",
    },
    {
      selector: ".calendar-pref",
      title: "לוח שנה ותזכורות",
      text: "לוח שנה אינטראקטיבי המציג את כל התזכורות והבדיקות המתוכננות שלכם.",
      placement: "top",
      page: "/",
    },
    {
      selector: ".module-grid",
      title: "מודולים",
      text: "קיצורי דרך לכל חלקי המערכת. לחצו על כרטיס כדי לעבור לעמוד המתאים.",
      placement: "top",
      page: "/",
    },
    {
      selector: ".user-dropdown",
      title: "תפריט משתמש",
      text: "מכאן תוכלו לגשת לפרופיל, תבניות הדפסה ואימייל, הגדרות ציוד, וכניסה מחדש לסיור זה.",
      placement: "bottom",
      page: "/",
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
  };
}
