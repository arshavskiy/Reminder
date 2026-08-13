<template>
  <div class="dash">
    <header class="dash__topbar">
      <!--      <h1 class="dash__greet">{{ greeting }}{{ userName ? `, ${userName}` : "" }}</h1>-->
      <!--      <n-button :loading="store.loading" @click="store.fetch(true)">↻ רענן</n-button>-->
    </header>
    <!-- ── Greeting + date ─────────────────────────────────────────────── -->
    <n-spin :show="store.loading">
      <DocumentDropStrip
        v-if="
          hasFeature(FEATURES.dashboard.dropStrip) &&
          hasFeature(FEATURES.pages.documents)
        "
        @uploaded="store.fetch(true)"
      />

      <!-- Quick stats — small chips line, easy to scan -->
      <div class="dash__stats">
        <div v-if="hasFeature(FEATURES.dashboard.statDocuments)" class="stat">
          <span class="stat__num">{{ stats?.total_documents ?? 0 }}</span>
          <span class="stat__label">מסמכים</span>
        </div>
        <div v-if="hasFeature(FEATURES.dashboard.statClients)" class="stat">
          <span class="stat__num">{{ stats?.total_clients ?? 0 }}</span>
          <span class="stat__label">לקוחות</span>
        </div>
        <div v-if="hasFeature(FEATURES.dashboard.statInspections)" class="stat">
          <span class="stat__num">{{ stats?.total_inspections ?? 0 }}</span>
          <span class="stat__label">תסקירים</span>
        </div>
        <div
          v-if="hasFeature(FEATURES.dashboard.statPendingReminders)"
          class="stat"
        >
          <span class="stat__num stat__num--accent">{{
            stats?.pending_reminders ?? 0
          }}</span>
          <span class="stat__label">תזכורות ממתינות</span>
        </div>
        <div
          v-if="
            hasFeature(FEATURES.dashboard.statExpiringSoon) &&
            (stats?.expiring_soon ?? 0) > 0
          "
          class="stat"
        >
          <span class="stat__num stat__num--warn">{{
            stats?.expiring_soon
          }}</span>
          <span class="stat__label">פגי תוקף ב-30 יום</span>
        </div>
      </div>

      <!-- ── Reminders calendar ───────────────────────────────────────── -->
      <div v-if="hasFeature(FEATURES.dashboard.calendar)" class="calendar-pref">
        <span class="calendar-pref__label">הצג רק בדיקות מתוכננות</span>
        <n-switch
          v-model:value="calendarNextTestsOnly"
          :loading="savingCalendarPreference"
          @update:value="saveCalendarPreference"
        />
      </div>
      <ReminderCalendar
        v-if="hasFeature(FEATURES.dashboard.calendar)"
        :loading="calendarLoading"
        :rows="calendarRows"
        :expiry-items="expiryItems"
        :tests-only="calendarNextTestsOnly"
        @open-monthly-report="openMonthlyReport"
        @refresh="refreshCalendar(true)"
      />
      <MonthlyReportModal
        v-model:show="showMonthlyReport"
        :initial-month-ms="monthlyReportMonthMs"
        @open-export="openMonthlyReportExport"
      />

      <!-- ── Module cards ──────────────────────────────────────────────── -->
      <h2 v-if="hasFeature(FEATURES.dashboard.modules)" class="dash__section">
        סביבת העבודה
      </h2>
      <div v-if="hasFeature(FEATURES.dashboard.modules)" class="module-grid">
        <article
          v-for="m in data_cards"
          :key="m.key"
          class="module"
          @click="router.push(m.to)"
        >
          <div class="module__body">
            <div class="module__head">
              <div class="module__icon">
                <n-icon :component="m.icon" :size="22" />
              </div>
              <div class="module__heading">
                <h3 class="module__title">{{ m.title }}</h3>
                <span v-if="m.count" class="module__count">{{
                  m.count()
                }}</span>
              </div>
            </div>
            <p class="module__desc">{{ m.desc }}</p>
            <span class="module__cta">פתח </span>
          </div>
        </article>
      </div>

      <!-- ── Two-column: recent docs + upcoming reminders ──────────────── -->
      <div class="dash__two-col">
        <section
          v-if="hasFeature(FEATURES.dashboard.recentDocuments)"
          class="panel"
        >
          <header class="panel__head">
            <h3>מסמכים אחרונים</h3>
            <router-link class="panel__more" to="/documents"
              >כל המסמכים
            </router-link>
          </header>
          <ul v-if="stats?.recent_documents?.length" class="panel__list">
            <li
              v-for="doc in stats.recent_documents"
              :key="doc.id"
              class="panel__row"
            >
              <router-link
                :to="`/documents/${doc.id}`"
                class="panel__row-title"
              >
                {{ doc.file_name }}
              </router-link>
              <StatusBadge :status="doc.processing_status" />
            </li>
          </ul>
          <p v-else class="panel__empty">אין מסמכים עדיין</p>
        </section>

        <section
          v-if="hasFeature(FEATURES.dashboard.upcomingReminders)"
          class="panel"
        >
          <header class="panel__head">
            <h3>תזכורות קרובות</h3>
            <router-link class="panel__more" to="/reminders"
              >כל התזכורות
            </router-link>
          </header>
          <ul v-if="stats?.upcoming_reminders?.length" class="panel__list">
            <li
              v-for="r in stats.upcoming_reminders"
              :key="r.id"
              class="panel__row"
            >
              <div class="panel__row-stack">
                <strong class="panel__row-title">{{ r.title }}</strong>
                <span v-if="r.client_name" class="panel__row-sub">{{
                  r.client_name
                }}</span>
              </div>
              <span class="panel__row-date">{{ r.trigger_date }}</span>
            </li>
          </ul>
          <p v-else class="panel__empty">אין תזכורות קרובות</p>
        </section>
      </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { NIcon, NSpin, NSwitch, useMessage } from "naive-ui";
import {
  AlarmOutline,
  ClipboardOutline,
  ConstructOutline,
  ExtensionPuzzleOutline,
  MailOutline,
  PeopleOutline,
  SettingsOutline,
} from "@vicons/ionicons5";
import { useDashboardStore } from "../stores/dashboard.js";
import { useRemindersStore } from "../stores/reminders.js";
import { useAuthStore } from "../stores/auth.js";
import { useFeaturesStore } from "../stores/features.js";
import { useUserSettingsStore } from "../stores/userSettings.js";
import type { ExpiryCalendarItem } from "../services/apiService.js";
import { api } from "../services/apiService.js";
import { FEATURES, type FeatureKey } from "../shared/features.js";
import StatusBadge from "../components/StatusBadge.vue";
import ReminderCalendar from "../components/ReminderCalendar.vue";
import DocumentDropStrip from "../components/DocumentDropStrip.vue";
import MonthlyReportModal from "../components/MonthlyReportModal.vue";

const store = useDashboardStore();
const remindersStore = useRemindersStore();
const authStore = useAuthStore();
const featuresStore = useFeaturesStore();
const userSettingsStore = useUserSettingsStore();
const router = useRouter();
const message = useMessage();
const stats = computed(() => store.stats);
const expiryItems = ref<ExpiryCalendarItem[]>([]);
const loadingExpiryItems = ref(false);
const calendarNextTestsOnly = ref(true);
const savingCalendarPreference = ref(false);
const showMonthlyReport = ref(false);
const monthlyReportMonthMs = ref<number | null>(null);
function hasFeature(feature: FeatureKey): boolean {
  return featuresStore.hasFeature(feature);
}

const calendarRows = computed(() =>
  calendarNextTestsOnly.value ? [] : remindersStore.rows,
);
const calendarLoading = computed(
  () =>
    loadingExpiryItems.value ||
    (!calendarNextTestsOnly.value && remindersStore.loading),
);

function openMonthlyReport(monthMs?: number) {
  monthlyReportMonthMs.value = monthMs ?? Date.now();
  showMonthlyReport.value = true;
}

function openMonthlyReportExport() {
  showMonthlyReport.value = false;
  router.push("/contracts");
}

onMounted(async () => {
  // Always refetch fresh — stats can go stale after a client/contract/document
  // is deleted elsewhere, and the cached singleton would otherwise show the old
  // count until a hard reload.
  store.fetch(true);
  await Promise.all([
    featuresStore.fetchFeatures().catch(() => {}),
    loadCalendarPreference(),
  ]);
  if (hasFeature(FEATURES.dashboard.calendar)) {
    refreshCalendar(false);
  }
});

async function loadCalendarPreference() {
  try {
    const settings = await userSettingsStore.load();
    calendarNextTestsOnly.value = Boolean(settings.calendar_next_tests_only);
  } catch {
    calendarNextTestsOnly.value = false;
  }
}

async function saveCalendarPreference(value: boolean) {
  savingCalendarPreference.value = true;
  try {
    await userSettingsStore.save({ calendar_next_tests_only: value });
    await refreshCalendar(true);
  } catch (err) {
    calendarNextTestsOnly.value = !value;
    message.error(
      err instanceof Error ? err.message : "שגיאה בשמירת הגדרת הלוח",
    );
  } finally {
    savingCalendarPreference.value = false;
  }
}

async function refreshCalendar(force: boolean) {
  if (!calendarNextTestsOnly.value && (force || !remindersStore.rows.length)) {
    remindersStore.fetch({ limit: 500 }, force);
  }
  loadingExpiryItems.value = true;
  try {
    expiryItems.value = await api.equipment.expiryCalendar(
      calendarNextTestsOnly.value ? { from: todayIso() } : undefined,
    );
  } catch {
    expiryItems.value = [];
  } finally {
    loadingExpiryItems.value = false;
  }
}

function todayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

const userName = computed(() => {
  const u = authStore.user;
  if (!u) return "";
  // Use first name only if full name available, else email prefix
  const name = u.name?.trim();
  if (name) return name.split(" ")[0];
  return u.email?.split("@")[0] ?? "";
});

// "בוקר טוב / צהריים טובים / ערב טוב / לילה טוב" by local hour
const greeting = computed(() => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "בוקר טוב";
  if (h >= 12 && h < 17) return "צהריים טובים";
  if (h >= 17 && h < 21) return "ערב טוב";
  return "לילה טוב";
});

// Hebrew-formatted date: יום רביעי, 20 במאי 2026
const dateLine = computed(() => {
  const d = new Date();
  return d.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

const modules = [
  {
    key: "documents",
    feature: FEATURES.pages.documents,
    title: "מסמכים",
    desc: "צפה, ערוך וסרוק מסמכים בדיקה.",
    count: () => stats.value?.total_documents ?? 0,
    icon: ClipboardOutline,
    to: "/contracts",
    show: true,
  },
  {
    key: "contracts",
    feature: FEATURES.pages.contracts,
    title: "תסקירים",
    desc: "צפה, ערוך וצור תסקירי בדיקה. נהל את כל שלבי התסקיר ממקום אחד.",
    count: () => stats.value?.total_inspections ?? 0,
    icon: ClipboardOutline,
    to: "/contracts",
    show: true,
  },
  {
    key: "equipment",
    feature: FEATURES.pages.equipment,
    title: "הגדרות ציוד",
    desc: "נהל את רשימת הציוד שלך, יצרנים והצהרות בטיחות.",
    count: () => stats.value?.total_equipment ?? 0,
    icon: ConstructOutline,
    to: "/equipment",
    show: true,
  },
  {
    key: "clients",
    feature: FEATURES.pages.clients,
    title: "ניהול לקוחות",
    desc: "הוסף לקוחות חדשים, נהל אנשי קשר ועקוב אחרי פרטי לקוח.",
    count: () => stats.value?.total_clients ?? 0,
    icon: PeopleOutline,
    to: "/clients",
    show: true,
  },
  {
    key: "doc-templates",
    feature: FEATURES.pages.docTemplates,
    title: "תבניות מסמכים",
    desc: "הגדר אילו שדות לחלץ מכל סוג מסמך. יצירה אוטומטית מ-AI.",
    count: () => stats.value?.total_email_templates ?? 0,
    icon: ExtensionPuzzleOutline,
    to: "/email-templates",
    show: true,
  },
  {
    key: "email-templates",
    feature: FEATURES.pages.emailTemplates,
    title: "תבניות",
    desc: "עצב את תוכן התזכורות עם משתנים דינמיים ולוגו של החברה.",
    count: () => stats.value?.total_email_templates ?? 0,
    icon: MailOutline,
    to: "/email-templates",
    show: authStore.user?.role === "admin", // Only show to admins
  },
  {
    key: "reminders",
    feature: FEATURES.pages.reminders,
    title: "תזכורות",
    desc: "כל התזכורות הממתינות והנשלחות. שלח עכשיו או דחה.",
    count: () => stats.value?.pending_reminders ?? 0,
    icon: AlarmOutline,
    to: "/reminders",
    show: true,
  },
  {
    key: "settings",
    feature: FEATURES.pages.settings,
    title: "הגדרות",
    desc: "AI, SMTP, מעקב תיקיות, ערכת נושא ועוד.",
    icon: SettingsOutline,
    to: "/settings",
    show: authStore.user?.role === "admin", // Only show to admins
  },
];

const data_cards = computed(() =>
  modules.filter((m) => m.show && hasFeature(m.feature)),
);
</script>

<style scoped>
.dash {
  max-width: 1200px;
  margin: 0 auto;
}

.dash__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.dash__header {
  margin-bottom: 32px;
}
.dash__greet {
  font-size: 38px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
  letter-spacing: -0.5px;
}
.dash__sub {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0;
}

.calendar-pref {
  align-items: center;
  color: var(--text-secondary);
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin: 0 0 10px;
}

.calendar-pref__label {
  font-size: 13px;
  font-weight: 600;
}

/* ── Stats chips ──────────────────────────────────────────────────────── */
.dash__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 40px;
}
.stat {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 16px 22px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 130px;
}
.stat__num {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}
.stat__num--accent {
  color: var(--brand-color);
}
.stat__num--warn {
  color: var(--color-warning);
}
.stat__label {
  font-size: 13px;
  color: var(--text-secondary);
}

/* ── Section heading ─────────────────────────────────────────────────── */
.dash__section {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 16px;
}

/* ── Module grid ─────────────────────────────────────────────────────── */
.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
  margin-bottom: 40px;
}
.module {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 22px;
  cursor: pointer;
  transition:
    border-color var(--transition),
    box-shadow var(--transition),
    transform var(--transition);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.module:hover {
  border-color: var(--brand-color);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
.module__head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.module__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  flex: 0 0 44px;
  background: rgba(99, 226, 183, 0.14);
  color: var(--brand-color);
  display: flex;
  align-items: center;
  justify-content: center;
}
html[data-theme="light"] .module__icon {
  background: rgba(24, 160, 88, 0.1);
}

.module__heading {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 8px;
  min-width: 0;
}
.module__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.module__count {
  margin-inline-start: auto;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(99, 226, 183, 0.14);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-color);
  line-height: 1;
}
.module__desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.module__cta {
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-color);
}

/* ── Two-column panels ───────────────────────────────────────────────── */
.dash__two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
@media (max-width: 900px) {
  .dash__two-col {
    grid-template-columns: 1fr;
  }
}

.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px 22px;
}
.panel__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.panel__head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.panel__more {
  font-size: 13px;
  color: var(--brand-color);
  text-decoration: none;
}

.panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}
.panel__row:last-child {
  border-bottom: none;
}
.panel__row-title {
  color: var(--text-primary);
  font-size: 13px;
  text-decoration: none;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.panel__row-title:hover {
  color: var(--brand-color);
}
.panel__row-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.panel__row-sub {
  font-size: 12px;
  color: var(--text-muted);
}
.panel__row-date {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}
.panel__empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 18px 0 6px;
  margin: 0;
}

@media (max-width: 680px) {
  .dash {
    max-width: none;
    width: 100%;
  }

  .dash__topbar {
    margin-bottom: 10px;
  }

  .dash__stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 24px;
  }

  .stat {
    min-width: 0;
    padding: 13px 14px;
    border-radius: 12px;
  }

  .stat__num {
    font-size: 24px;
  }

  .module-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    margin-bottom: 28px;
  }

  .module {
    padding: 18px;
    border-radius: 14px;
  }

  .module:hover {
    transform: none;
  }

  .module__title {
    font-size: 15px;
  }

  .panel {
    padding: 16px;
    border-radius: 14px;
  }

  .panel__row {
    align-items: flex-start;
  }

  .panel__row-title {
    flex: 1 1 auto;
    max-width: 100%;
  }
}

@media (max-width: 430px) {
  .dash__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .stat {
    min-height: 82px;
    padding: 12px;
  }

  .stat__num {
    font-size: 24px;
  }

  .stat__label {
    font-size: 12px;
    line-height: 1.35;
  }

  .dash__section {
    font-size: 16px;
  }

  .module__head,
  .module__heading {
    align-items: flex-start;
  }

  .module__heading {
    flex-direction: column;
    gap: 6px;
  }

  .module__count {
    margin-inline-start: 0;
  }

  .panel__head {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .panel__row {
    flex-direction: column;
    gap: 6px;
  }

  .panel__row-date {
    white-space: normal;
  }
}
</style>
