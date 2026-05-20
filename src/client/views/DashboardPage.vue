<template>
  <div class="dash">
    <!-- ── Greeting + date ─────────────────────────────────────────────── -->
    <n-spin :show="store.loading">
      <header class="dash__header">
        <h1 class="dash__greet">{{ greeting }}{{ userName ? `, ${userName}` : "" }}</h1>
        <p class="dash__sub">הנה מרכז העבודה שלך. {{ dateLine }}</p>
      </header>

      <!-- Quick stats — small chips line, easy to scan -->
      <div class="dash__stats">
        <div class="stat">
          <span class="stat__num">{{ stats?.total_documents ?? 0 }}</span>
          <span class="stat__label">מסמכים</span>
        </div>
        <div class="stat">
          <span class="stat__num">{{ stats?.total_clients ?? 0 }}</span>
          <span class="stat__label">לקוחות</span>
        </div>
        <div class="stat">
          <span class="stat__num">{{ stats?.total_inspections ?? 0 }}</span>
          <span class="stat__label">תסקירים</span>
        </div>
        <div class="stat">
          <span class="stat__num stat__num--accent">{{ stats?.pending_reminders ?? 0 }}</span>
          <span class="stat__label">תזכורות ממתינות</span>
        </div>
        <div class="stat" v-if="(stats?.expiring_soon ?? 0) > 0">
          <span class="stat__num stat__num--warn">{{ stats?.expiring_soon }}</span>
          <span class="stat__label">פגי תוקף ב-30 יום</span>
        </div>
      </div>

      <!-- ── Module cards ──────────────────────────────────────────────── -->
      <h2 class="dash__section">סביבת העבודה</h2>
      <div class="module-grid">
        <article
          v-for="m in modules"
          :key="m.key"
          class="module"
          @click="router.push(m.to)"
        >
          <div class="module__icon">
            <n-icon :component="m.icon" :size="22" />
          </div>
          <div class="module__body">
            <h3 class="module__title">{{ m.title }}</h3>
            <p class="module__desc">{{ m.desc }}</p>
            <span class="module__cta">פתח ←</span>
          </div>
        </article>
      </div>

      <!-- ── Two-column: recent docs + upcoming reminders ──────────────── -->
      <div class="dash__two-col">
        <section class="panel">
          <header class="panel__head">
            <h3>מסמכים אחרונים</h3>
            <router-link class="panel__more" to="/documents">כל המסמכים ←</router-link>
          </header>
          <ul v-if="stats?.recent_documents?.length" class="panel__list">
            <li v-for="doc in stats.recent_documents" :key="doc.id" class="panel__row">
              <router-link :to="`/documents/${doc.id}`" class="panel__row-title">
                {{ doc.file_name }}
              </router-link>
              <StatusBadge :status="doc.processing_status" />
            </li>
          </ul>
          <p v-else class="panel__empty">אין מסמכים עדיין</p>
        </section>

        <section class="panel">
          <header class="panel__head">
            <h3>תזכורות קרובות</h3>
            <router-link class="panel__more" to="/reminders">כל התזכורות ←</router-link>
          </header>
          <ul v-if="stats?.upcoming_reminders?.length" class="panel__list">
            <li v-for="r in stats.upcoming_reminders" :key="r.id" class="panel__row">
              <div class="panel__row-stack">
                <strong class="panel__row-title">{{ r.title }}</strong>
                <span v-if="r.client_name" class="panel__row-sub">{{ r.client_name }}</span>
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
import { onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { NIcon, NSpin } from "naive-ui";
import {
  ClipboardOutline, PeopleOutline, ExtensionPuzzleOutline,
  MailOutline, SettingsOutline, AlarmOutline, ConstructOutline,
} from "@vicons/ionicons5";
import { useDashboardStore } from "../stores/dashboard.js";
import StatusBadge from "../components/StatusBadge.vue";

const store = useDashboardStore();
const router = useRouter();
const stats = computed(() => store.stats);
onMounted(() => store.fetch());

// Read the user's name from settings if present, otherwise no name in greeting.
const userName = computed(() => "");

// "בוקר טוב / צהריים טובים / ערב טוב / לילה טוב" by local hour
const greeting = computed(() => {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "בוקר טוב";
  if (h >= 12 && h < 17) return "צהריים טובים";
  if (h >= 17 && h < 21) return "ערב טוב";
  return "לילה טוב";
});

// Hebrew-formatted date: יום רביעי, 20 במאי 2026
const dateLine = computed(() => {
  const d = new Date();
  return d.toLocaleDateString("he-IL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
});

const modules = [
  {
    key: "contracts",
    title: "ניהול תסקירים",
    desc: "צפה, ערוך וצור תסקירי בדיקה. נהל את כל שלבי התסקיר ממקום אחד.",
    icon: ClipboardOutline,
    to: "/contracts",
  },
  {
    key: "clients",
    title: "ניהול לקוחות",
    desc: "הוסף לקוחות חדשים, נהל אנשי קשר ועקוב אחרי פרטי לקוח.",
    icon: PeopleOutline,
    to: "/clients",
  },
  {
    key: "equipment",
    title: "הגדרות ציוד",
    desc: "נהל את רשימת הציוד שלך, יצרנים והצהרות בטיחות.",
    icon: ConstructOutline,
    to: "/equipment",
  },
  {
    key: "doc-templates",
    title: "תבניות מסמכים",
    desc: "הגדר אילו שדות לחלץ מכל סוג מסמך. יצירה אוטומטית מ-AI.",
    icon: ExtensionPuzzleOutline,
    to: "/doc-templates",
  },
  {
    key: "email-templates",
    title: "תבניות אימייל",
    desc: "עצב את תוכן התזכורות עם משתנים דינמיים ולוגו של החברה.",
    icon: MailOutline,
    to: "/email-templates",
  },
  {
    key: "reminders",
    title: "תזכורות",
    desc: "כל התזכורות הממתינות והנשלחות. שלח עכשיו או דחה.",
    icon: AlarmOutline,
    to: "/reminders",
  },
  {
    key: "settings",
    title: "הגדרות",
    desc: "AI, SMTP, מעקב תיקיות, ערכת נושא ועוד.",
    icon: SettingsOutline,
    to: "/settings",
  },
];
</script>

<style scoped>
.dash { max-width: 1200px; margin: 0 auto; }

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
.stat__num--accent { color: var(--brand-color); }
.stat__num--warn   { color: var(--color-warning); }
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
  transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.module:hover {
  border-color: var(--brand-color);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
.module__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(99, 226, 183, 0.14);
  color: var(--brand-color);
  display: flex;
  align-items: center;
  justify-content: center;
}
html[data-theme="light"] .module__icon { background: rgba(24, 160, 88, 0.10); }

.module__title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
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
  .dash__two-col { grid-template-columns: 1fr; }
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
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}
.panel__row:last-child { border-bottom: none; }
.panel__row-title {
  color: var(--text-primary);
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  //text-overflow: ellipsis;
  //max-width: 70%;
}
.panel__row-title:hover { color: var(--brand-color); }
.panel__row-stack { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
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
</style>
