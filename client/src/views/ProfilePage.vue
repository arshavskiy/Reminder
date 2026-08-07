<template>
  <div class="profile-shell">
    <!-- ── Left sidebar nav ──────────────────────────────────────────────── -->
    <aside class="profile-sidebar">
      <div class="sidebar-user">
        <div class="sidebar-avatar">
          <img v-if="user?.picture_url" :src="user.picture_url" alt="avatar" />
          <span v-else class="sidebar-avatar__initials">{{ initials }}</span>
        </div>
        <div class="sidebar-user__info">
          <div class="sidebar-user__name">
            {{ user?.name || user?.email || "—" }}
          </div>
          <n-tag :type="roleTag.type" size="small" style="margin-top: 4px">{{
            roleTag.label
          }}</n-tag>
        </div>
      </div>

      <nav class="sidebar-nav">
        <a
          v-for="item in navItems"
          :key="item.key"
          class="sidebar-nav__item"
          :class="{ 'sidebar-nav__item--active': activeSection === item.key }"
          @click="activeSection = item.key"
        >
          <span class="sidebar-nav__icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </a>
      </nav>
    </aside>

    <!-- ── Main content area ─────────────────────────────────────────────── -->
    <main class="profile-content">
      <n-spin :show="loading">
        <!-- פרטים אישיים -->
        <section v-if="activeSection === 'personal'">
          <div class="section-header">
            <h2 class="section-title">פרטים אישיים</h2>
            <n-button
              v-if="!editingPersonal"
              size="small"
              @click="startEditPersonal"
              >✏️ עריכה</n-button
            >
            <n-space v-else>
              <n-button size="small" @click="cancelEditPersonal"
                >ביטול</n-button
              >
              <n-button
                size="small"
                type="primary"
                :loading="savingPersonal"
                @click="savePersonal"
                >שמור</n-button
              >
            </n-space>
          </div>
          <div class="info-card">
            <div class="info-row">
              <span class="info-label">שם מלא</span>
              <n-input
                v-if="editingPersonal"
                v-model:value="personalForm.name"
                class="info-input"
              />
              <span v-else class="info-val">{{ user?.name || "—" }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">טלפון</span>
              <n-input
                v-if="editingPersonal"
                v-model:value="personalForm.phone"
                class="info-input"
              />
              <span v-else class="info-val">{{ user?.phone || "—" }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">שם חברה</span>
              <n-input
                v-if="editingPersonal"
                v-model:value="personalForm.company_name"
                class="info-input"
                placeholder="לדוגמה: M.A.D הנדסה ובטיחות"
              />
              <span v-else class="info-val">{{
                (user as any)?.company_name || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">אימייל</span>
              <span class="info-val">{{ user?.email }}</span>
            </div>
          </div>
        </section>

        <!-- פרופיל מהנדס -->
        <section v-if="activeSection === 'engineer'">
          <div class="section-header">
            <h2 class="section-title">פרופיל מהנדס</h2>
            <n-button
              v-if="!editingEngineer"
              size="small"
              @click="startEditEngineer"
              >✏️ עריכה</n-button
            >
            <n-space v-else>
              <n-button size="small" @click="cancelEditEngineer"
                >ביטול</n-button
              >
              <n-button
                size="small"
                type="primary"
                :loading="savingEngineer"
                @click="saveEngineer"
                >שמור</n-button
              >
            </n-space>
          </div>
          <div class="info-card">
            <div class="info-row">
              <span class="info-label">מספר מפקח</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.inspector_number"
                class="info-input"
              />
              <span v-else class="info-val">{{
                engineerProfile?.inspector_number || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">כתובת</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.address"
                class="info-input"
              />
              <span v-else class="info-val">{{
                engineerProfile?.address || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">מספר מ.ג.</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.mg_number"
                class="info-input"
              />
              <span v-else class="info-val">{{
                engineerProfile?.mg_number || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">תאריך תחילת חברות</span>
              <n-date-picker
                v-if="editingEngineer"
                v-model:value="engineerForm.membership_start_ms"
                type="date"
                style="flex: 1"
              />
              <span v-else class="info-val">{{
                formatDate(engineerProfile?.membership_start_date)
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">מספר התחלת תסקירים</span>
              <div
                v-if="editingEngineer"
                style="flex: 1; display: flex; flex-direction: column; gap: 4px"
              >
                <n-input
                  v-model:value="engineerForm.inspector_id_start"
                  placeholder="לדוגמה: 16125"
                />
                <span v-if="engineerForm.inspector_id_start" class="info-hint">
                  🔒 מספר זה נקבע כבר. הבא יהיה:
                  {{ engineerProfile?.inspector_number ?? "—" }}/{{
                    engineerForm.inspector_id_start
                  }}
                </span>
              </div>
              <div
                v-else
                class="info-val"
                style="display: flex; flex-direction: column; gap: 4px"
              >
                <span>{{ engineerProfile?.inspector_id_start || "—" }}</span>
                <span
                  v-if="engineerProfile?.inspector_id_start"
                  class="info-hint"
                >
                  הבא יהיה: {{ nextInspectionId }}
                </span>
              </div>
            </div>

            <div class="info-row">
              <span class="info-label">עוסק מורשה (ח.פ)</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.company_registration"
                class="info-input"
                placeholder="לדוגמה: 51646673"
              />
              <span v-else class="info-val">{{
                (engineerProfile as any)?.company_registration || "—"
              }}</span>
            </div>

            <!-- ── Inspector company details (used to filter out from AI extraction) ── -->
            <div class="info-section-divider">
              פרטי החברה / בית העסק (לסינון מהחילוץ)
            </div>
            <div class="info-row">
              <span class="info-label">שם החברה</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.company_name"
                class="info-input"
                placeholder="לדוגמה: M.A.D הנדסה ובטיחות"
              />
              <span v-else class="info-val">{{
                (engineerProfile as any)?.company_name || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">תיאור / כותרת</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.company_subtitle"
                class="info-input"
                placeholder="לדוגמה: בדיקות בטיחות למתקני הרמה ומכלי לחץ"
              />
              <span v-else class="info-val">{{
                (engineerProfile as any)?.company_subtitle || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">טלפון / נייד</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.company_phone"
                class="info-input"
                placeholder="052-8195650"
              />
              <span v-else class="info-val">{{
                (engineerProfile as any)?.company_phone || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">אימייל</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.company_email"
                class="info-input"
                placeholder="name@company.com"
              />
              <span v-else class="info-val">{{
                (engineerProfile as any)?.company_email || "—"
              }}</span>
            </div>
            <div class="info-row" style="align-items:flex-start">
              <span class="info-label">לוגו החברה</span>
              <div style="display:flex; flex-direction:column; gap:8px; flex:1">
                <img
                  v-if="(engineerProfile as any)?.company_logo_url"
                  :src="(engineerProfile as any)?.company_logo_url"
                  style="max-height:56px; max-width:180px; border-radius:6px; object-fit:contain"
                  alt="לוגו חברה"
                />
                <input
                  ref="companyLogoInput"
                  type="file"
                  accept="image/*"
                  style="display:none"
                  @change="uploadCompanyLogo"
                />
                <n-button size="small" secondary @click="(companyLogoInput as HTMLInputElement)?.click()">
                  {{ (engineerProfile as any)?.company_logo_url ? 'החלף לוגו' : 'העלה לוגו' }}
                </n-button>
              </div>
            </div>
          </div>
        </section>

        <!-- סטטיסטיקות -->
        <section v-if="activeSection === 'stats'">
          <div class="section-header">
            <h2 class="section-title">סטטיסטיקות</h2>
            <n-button size="small" @click="exportStatsCsv"
              >📥 יצוא CSV</n-button
            >
          </div>
          <div class="stats-row">
            <div class="stat-card">
              <span class="stat-card__num">{{ inspectionStats.total }}</span>
              <span class="stat-card__label">סה״כ תסקירים</span>
            </div>
            <div class="stat-card stat-card--green">
              <span class="stat-card__num">{{
                inspectionStats.completed
              }}</span>
              <span class="stat-card__label">הושלמו</span>
            </div>
            <div class="stat-card stat-card--orange">
              <span class="stat-card__num">{{ inspectionStats.pending }}</span>
              <span class="stat-card__label">ממתינים</span>
            </div>
          </div>
          <div class="info-card" style="margin-top: 20px">
            <div class="info-row">
              <span class="info-label">סה״כ תסקירים</span>
              <div class="progress-wrap">
                <n-progress
                  type="line"
                  :percentage="100"
                  :height="8"
                  color="#18a058"
                  :show-indicator="false"
                />
                <span class="info-val">{{ inspectionStats.total }}</span>
              </div>
            </div>
            <div class="info-row">
              <span class="info-label">הושלמו</span>
              <div class="progress-wrap">
                <n-progress
                  type="line"
                  :percentage="completedPct"
                  :height="8"
                  color="#18a058"
                  :show-indicator="false"
                />
                <span class="info-val">{{ inspectionStats.completed }}</span>
              </div>
            </div>
            <div class="info-row">
              <span class="info-label">ממתינים</span>
              <div class="progress-wrap">
                <n-progress
                  type="line"
                  :percentage="pendingPct"
                  :height="8"
                  color="#f0a020"
                  :show-indicator="false"
                />
                <span class="info-val">{{ inspectionStats.pending }}</span>
              </div>
            </div>
          </div>
          <div class="info-card" style="margin-top: 16px">
            <div class="info-row">
              <span class="info-label">סיכום חודשי</span>
              <span class="info-val"
                >{{ inspectionStats.monthly }} תסקירים החודש</span
              >
            </div>
          </div>
        </section>

        <!-- התראות ועדכונים -->
        <section v-if="activeSection === 'notifications'">
          <div class="section-header">
            <h2 class="section-title">התראות ועדכונים</h2>
            <n-select
              v-model:value="notifFilter"
              :options="notifFilterOptions"
              size="small"
              style="width: 160px"
            />
          </div>
          <div class="notif-list">
            <div
              v-for="notif in filteredNotifications"
              :key="notif.id"
              class="notif-item"
              :class="{ 'notif-item--unread': !notif.read }"
            >
              <n-tag
                :type="notifTagType(notif.type)"
                size="small"
                style="flex-shrink: 0"
                >{{ notifTypeLabel(notif.type) }}</n-tag
              >
              <div class="notif-body">
                <div class="notif-title">{{ notif.title }}</div>
                <div class="notif-date">{{ formatDate(notif.created_at) }}</div>
              </div>
            </div>
            <div v-if="filteredNotifications.length === 0" class="empty-state">
              אין התראות
            </div>
          </div>
        </section>

        <!-- הגדרות -->
        <section v-if="activeSection === 'settings'">
          <h2 class="section-title">הגדרות</h2>

          <div class="settings-group">
            <h3 class="settings-group__title">שינוי סיסמה</h3>
            <n-form label-placement="top" style="max-width: 400px">
              <n-form-item label="סיסמה נוכחית">
                <n-input
                  v-model:value="pwForm.current"
                  type="password"
                  show-password-on="click"
                />
              </n-form-item>
              <n-form-item label="סיסמה חדשה">
                <n-input
                  v-model:value="pwForm.next"
                  type="password"
                  show-password-on="click"
                />
              </n-form-item>
              <n-form-item label="אימות סיסמה חדשה">
                <n-input
                  v-model:value="pwForm.confirm"
                  type="password"
                  show-password-on="click"
                />
              </n-form-item>
              <n-button
                type="primary"
                :loading="savingPw"
                @click="changePassword"
                >שנה סיסמה</n-button
              >
            </n-form>
          </div>

          <div class="settings-group">
            <h3 class="settings-group__title">תמונת פרופיל</h3>
            <div class="avatar-upload-row">
              <div class="sidebar-avatar sidebar-avatar--lg">
                <img
                  v-if="user?.picture_url"
                  :src="user.picture_url"
                  alt="avatar"
                />
                <span v-else class="sidebar-avatar__initials">{{
                  initials
                }}</span>
              </div>
              <input
                ref="avatarInput"
                type="file"
                accept="image/*"
                style="display: none"
                @change="onAvatarChange"
              />
              <n-button
                size="small"
                :loading="uploadingAvatar"
                @click="avatarInput?.click()"
                >📷 שנה תמונה</n-button
              >
            </div>
          </div>

          <!--          <div class="settings-group">-->
          <!--            <h3 class="settings-group__title">יצוא נתונים</h3>-->
          <!--            <n-space>-->
          <!--              <n-button size="small" @click="exportPdf">📄 יצוא PDF</n-button>-->
          <!--              <n-button size="small" @click="exportWord">📝 יצוא Word</n-button>-->
          <!--            </n-space>-->
          <!--          </div>-->

          <div class="settings-group">
            <h3 class="settings-group__title">ניהול הפעלות</h3>
            <p class="settings-desc">
              סיים את כל ההפעלות הפעילות בכל המכשירים.
            </p>
            <n-button
              type="error"
              :loading="disconnecting"
              @click="disconnectAll"
              >התנתק מכל המכשירים</n-button
            >
          </div>
        </section>

        <!-- נושא עיצוב -->
        <section v-if="activeSection === 'theme'">
          <h2 class="section-title">נושא עיצוב</h2>
          <div class="theme-cards">
            <div
              class="theme-card"
              :class="{ 'theme-card--active': currentTheme === 'light' }"
              @click="setTheme('light')"
            >
              <div class="theme-card__preview theme-card__preview--light">
                <div class="theme-preview-bar" />
                <div class="theme-preview-content" />
              </div>
              <div class="theme-card__label">☀️ מצב בהיר</div>
            </div>
            <div
              class="theme-card"
              :class="{ 'theme-card--active': currentTheme === 'dark' }"
              @click="setTheme('dark')"
            >
              <div class="theme-card__preview theme-card__preview--dark">
                <div class="theme-preview-bar" />
                <div class="theme-preview-content" />
              </div>
              <div class="theme-card__label">🌙 מצב כהה</div>
            </div>
          </div>
        </section>

        <!-- מנוי ותשלומים -->
        <section v-if="activeSection === 'subscription'">
          <h2 class="section-title">מנוי ותשלומים</h2>
          <div class="info-card" style="margin-bottom: 20px">
            <div class="info-row">
              <span class="info-label">תוכנית נוכחית</span>
              <span class="info-val">
                <n-tag :type="roleTag.type" size="small">{{
                  roleTag.label
                }}</n-tag>
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">תוקף מנוי</span>
              <span class="info-val">{{
                subscription.validUntil || "חינמי"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">תסקירים החודש</span>
              <span class="info-val">{{ subscription.monthlyCount }}</span>
            </div>
          </div>
          <div class="section-header" style="margin-bottom: 12px">
            <h3 class="settings-group__title" style="margin: 0">
              היסטוריית חיוב
            </h3>
          </div>
          <n-data-table
            :columns="billingColumns"
            :data="billingHistory"
            :pagination="false"
            :scroll-x="620"
            size="small"
          />
        </section>
      </n-spin>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  NButton,
  NDatePicker,
  NForm,
  NFormItem,
  NInput,
  NProgress,
  NSelect,
  NSpace,
  NSpin,
  useMessage,
} from "naive-ui";
import { useAuthStore } from "../stores/auth.js";
import type { User, UserSettings } from "@shared/types.js";

const message = useMessage();
const authStore = useAuthStore();
const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

// ── State ────────────────────────────────────────────────────────────────────
const loading = ref(true);
const activeSection = ref("personal");

const user = computed(() => authStore.user as User | null);
const userSettings = ref<UserSettings | null>(null);

// ── Sidebar nav ──────────────────────────────────────────────────────────────
const navItems = [
  { key: "personal", icon: "👤", label: "פרטים אישיים" },
  { key: "engineer", icon: "🔧", label: "פרופיל מהנדס" },
  // { key: "stats",         icon: "📊", label: "סטטיסטיקות" },
  // { key: "notifications", icon: "🔔", label: "התראות ועדכונים" },
  { key: "settings", icon: "⚙️", label: "הגדרות" },
  // { key: "theme",         icon: "🎨", label: "נושא עיצוב" },
  { key: "subscription", icon: "💳", label: "מנוי ותשלומים" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const initials = computed(() => {
  const name = user.value?.name ?? "";
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || (user.value?.email ?? "").substring(0, 2).toUpperCase()
  );
});

const ROLE_META: Record<
  string,
  { label: string; type: "warning" | "info" | "default" }
> = {
  admin: { label: "מנהל מערכת", type: "warning" },
  pro: { label: "Pro", type: "info" },
  user: { label: "משתמש", type: "default" },
};
const roleTag = computed(
  () => ROLE_META[user.value?.role ?? "user"] ?? ROLE_META.user,
);

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── Personal info ────────────────────────────────────────────────────────────
const editingPersonal = ref(false);
const savingPersonal = ref(false);
const personalForm = ref({ name: "", phone: "", company_name: "" });

function startEditPersonal() {
  personalForm.value = {
    name: user.value?.name ?? "",
    phone: user.value?.phone ?? "",
    company_name: (user.value as any)?.company_name ?? "",
  };
  editingPersonal.value = true;
}
function cancelEditPersonal() {
  editingPersonal.value = false;
}
async function savePersonal() {
  savingPersonal.value = true;
  try {
    await fetch(`${SERVER}/api/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: personalForm.value.name,
        phone: personalForm.value.phone,
        company_name: personalForm.value.company_name,
      }),
    });
    await authStore.fetchMe();
    editingPersonal.value = false;
    message.success("הפרטים עודכנו");
  } catch {
    message.error("שגיאה בשמירה");
  } finally {
    savingPersonal.value = false;
  }
}

// ── Engineer profile ─────────────────────────────────────────────────────────
const engineerProfile = ref<{
  inspector_number?: string;
  address?: string;
  title?: string;
  expertise?: string;
  mr_number?: string;
  mg_number?: string;
  membership_start_date?: string;
  inspector_id_start?: string;
} | null>(null);

const nextInspectionId = computed(() => {
  const start = parseInt(engineerProfile.value?.inspector_id_start ?? "0", 10);
  const total = inspectionStats.value.total;
  if (!start) return "—";
  return `${engineerProfile.value?.inspector_number ?? "—"}/${start + total}`;
});

const editingEngineer = ref(false);
const savingEngineer = ref(false);
const engineerForm = ref({
  inspector_number: "",
  address: "",
  title: "",
  expertise: "",
  mr_number: "",
  mg_number: "",
  membership_start_ms: null as number | null,
  inspector_id_start: "",
  company_name: "",
  company_registration: "",
  company_subtitle: "",
  company_phone: "",
  company_email: "",
});

function startEditEngineer() {
  const p = engineerProfile.value;
  engineerForm.value = {
    inspector_number: p?.inspector_number ?? "",
    address: p?.address ?? "",
    title: p?.title ?? "",
    expertise: p?.expertise ?? "",
    mr_number: p?.mr_number ?? "",
    mg_number: p?.mg_number ?? "",
    membership_start_ms: p?.membership_start_date
      ? new Date(p.membership_start_date).getTime()
      : null,
    inspector_id_start: p?.inspector_id_start ?? "",
    company_name: (p as any)?.company_name ?? "",
    company_registration: (p as any)?.company_registration ?? "",
    company_subtitle: (p as any)?.company_subtitle ?? "",
    company_phone: (p as any)?.company_phone ?? "",
    company_email: (p as any)?.company_email ?? "",
  };
  editingEngineer.value = true;
}
function cancelEditEngineer() {
  editingEngineer.value = false;
}
async function saveEngineer() {
  savingEngineer.value = true;
  try {
    const payload = {
      ...engineerForm.value,
      membership_start_date: engineerForm.value.membership_start_ms
        ? new Date(engineerForm.value.membership_start_ms)
            .toISOString()
            .slice(0, 10)
        : null,
      inspector_id_start: engineerForm.value.inspector_id_start || null,
    };
    const res = await fetch(`${SERVER}/api/profile/engineer`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (res.ok) engineerProfile.value = await res.json();
    editingEngineer.value = false;
    message.success("הפרופיל עודכן");
  } catch {
    message.error("שגיאה בשמירה");
  } finally {
    savingEngineer.value = false;
  }
}

async function uploadCompanyLogo(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const form = new FormData();
  form.append("logo", file);
  try {
    const res = await fetch(`${SERVER}/api/profile/company-logo`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (res.ok) {
      const data = await res.json();
      if (engineerProfile.value) (engineerProfile.value as any).company_logo_url = data.company_logo_url;
      else engineerProfile.value = { company_logo_url: data.company_logo_url } as any;
      message.success("הלוגו הועלה");
    } else {
      message.error("שגיאה בהעלאת הלוגו");
    }
  } catch {
    message.error("שגיאה בהעלאת הלוגו");
  }
  (e.target as HTMLInputElement).value = "";
}

const companyLogoInput = ref<HTMLInputElement | null>(null);

async function loadEngineerProfile() {
  const res = await fetch(`${SERVER}/api/profile/engineer`, {
    credentials: "include",
  });
  if (res.ok) engineerProfile.value = await res.json();
}

// ── Statistics ───────────────────────────────────────────────────────────────
const inspectionStats = ref({ total: 0, completed: 0, pending: 0, monthly: 0 });
const completedPct = computed(() =>
  inspectionStats.value.total
    ? Math.round(
        (inspectionStats.value.completed / inspectionStats.value.total) * 100,
      )
    : 0,
);
const pendingPct = computed(() =>
  inspectionStats.value.total
    ? Math.round(
        (inspectionStats.value.pending / inspectionStats.value.total) * 100,
      )
    : 0,
);

function exportStatsCsv() {
  const rows = [
    ["סטטיסטיקה", "ערך"],
    ["סה״כ תסקירים", inspectionStats.value.total],
    ["הושלמו", inspectionStats.value.completed],
    ["ממתינים", inspectionStats.value.pending],
    ["החודש", inspectionStats.value.monthly],
  ];
  const csv = rows.map((r) => r.join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
  );
  a.download = "stats.csv";
  a.click();
}

// ── Notifications ────────────────────────────────────────────────────────────
const notifications = ref<any[]>([]);
const notifFilter = ref<string | null>(null);
const notifFilterOptions = [
  { label: "הכל", value: null },
  { label: "מידע", value: "info" },
  { label: "אזהרה", value: "warning" },
  { label: "שגיאה", value: "error" },
];
const filteredNotifications = computed(() =>
  notifFilter.value
    ? notifications.value.filter((n) => n.type === notifFilter.value)
    : notifications.value,
);
function notifTagType(type: string): "info" | "warning" | "error" | "default" {
  const map: Record<string, "info" | "warning" | "error" | "default"> = {
    info: "info",
    warning: "warning",
    error: "error",
  };
  return map[type] ?? "default";
}
function notifTypeLabel(type: string) {
  return { info: "מידע", warning: "אזהרה", error: "שגיאה" }[type] ?? type;
}

// ── Avatar upload ────────────────────────────────────────────────────────────
const avatarInput = ref<HTMLInputElement | null>(null);
const uploadingAvatar = ref(false);

async function onAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploadingAvatar.value = true;
  try {
    const form = new FormData();
    form.append("avatar", file);
    const res = await fetch(`${SERVER}/api/profile/avatar`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) throw new Error(`${res.status}`);
    await authStore.fetchMe();
    message.success("תמונת הפרופיל עודכנה");
  } catch {
    message.error("שגיאה בהעלאת התמונה");
  } finally {
    uploadingAvatar.value = false;
    if (avatarInput.value) avatarInput.value.value = "";
  }
}

// ── Settings: password ───────────────────────────────────────────────────────
const pwForm = ref({ current: "", next: "", confirm: "" });
const savingPw = ref(false);
const disconnecting = ref(false);

async function changePassword() {
  if (!pwForm.value.next || pwForm.value.next !== pwForm.value.confirm) {
    message.warning("הסיסמאות אינן תואמות");
    return;
  }
  savingPw.value = true;
  try {
    const res = await fetch(`${SERVER}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        current_password: pwForm.value.current,
        new_password: pwForm.value.next,
      }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    pwForm.value = { current: "", next: "", confirm: "" };
    message.success("הסיסמה שונתה בהצלחה");
  } catch {
    message.error("שגיאה בשינוי הסיסמה");
  } finally {
    savingPw.value = false;
  }
}

async function disconnectAll() {
  disconnecting.value = true;
  try {
    await authStore.logout();
    message.success("התנתקת מכל המכשירים");
  } catch {
    message.error("שגיאה בהתנתקות");
  } finally {
    disconnecting.value = false;
  }
}

// ── Theme ────────────────────────────────────────────────────────────────────
const currentTheme = ref<string>(localStorage.getItem("theme") ?? "light");

async function setTheme(t: string) {
  currentTheme.value = t;
  localStorage.setItem("theme", t);
  document.documentElement.setAttribute("data-theme", t);
  fetch(`${SERVER}/api/user-settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ theme: t }),
  }).catch(() => {});
  message.success(t === "dark" ? "הוחלף למצב כהה" : "הוחלף למצב בהיר");
}

// ── Subscription ─────────────────────────────────────────────────────────────
const subscription = ref({ validUntil: "", monthlyCount: 0 });
const billingHistory = ref<any[]>([]);
const billingColumns = [
  { title: "תאריך", key: "date", render: (r: any) => formatDate(r.date) },
  { title: "סכום", key: "amount", render: (r: any) => `₪${r.amount}` },
  { title: "סטטוס", key: "status" },
  { title: "תיאור", key: "description" },
];

// ── Export helpers ───────────────────────────────────────────────────────────
function buildProfileHtml(): string {
  const ep = engineerProfile.value;
  const rows = (pairs: [string, string | null | undefined][]) =>
    pairs
      .map(([k, v]) => `<tr><td class="lbl">${k}</td><td>${v || "—"}</td></tr>`)
      .join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; direction: rtl; padding: 40px; color: #111; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; }
  td.lbl { color: #666; width: 200px; }
  .role { display:inline-block; background:#e8f5e9; color:#2e7d32; padding:2px 10px; border-radius:12px; font-size:12px; }
</style>
</head>
<body>
  <h1>${user.value?.name || user.value?.email || ""}</h1>
  <span class="role">${roleTag.value.label}</span>

  <h2>פרטים אישיים</h2>
  <table>${rows([
    ["שם מלא", user.value?.name],
    ["טלפון", user.value?.phone],
    ["אימייל", user.value?.email],
  ])}</table>

  ${
    ep
      ? `<h2>פרופיל מהנדס</h2>
  <table>${rows([
    ["מספר מפקח", ep.inspector_number],
    ["כתובת", ep.address],
    ["תואר מקצועי", ep.title],
    ["התמחות", ep.expertise],
    ["מספר מ.ר.", ep.mr_number],
    ["מספר מ.ג.", ep.mg_number],
    ["תחילת חברות", formatDate(ep.membership_start_date)],
  ])}</table>`
      : ""
  }

  <h2>סטטיסטיקות</h2>
  <table>${rows([
    ["סה״כ תסקירים", String(inspectionStats.value.total)],
    ["הושלמו", String(inspectionStats.value.completed)],
    ["ממתינים", String(inspectionStats.value.pending)],
    ["החודש", String(inspectionStats.value.monthly)],
  ])}</table>
</body></html>`;
}

function exportPdf() {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(buildProfileHtml());
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
}

function exportWord() {
  const html = buildProfileHtml();
  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `profile-${user.value?.name || user.value?.email || "export"}.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Mount ────────────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const [settingsRes, statsRes, engineerRes, notifsRes] =
      await Promise.allSettled([
        fetch(`${SERVER}/api/user-settings`, { credentials: "include" }),
        fetch(`${SERVER}/api/profile/stats`, { credentials: "include" }),
        fetch(`${SERVER}/api/profile/engineer`, { credentials: "include" }),
        fetch(`${SERVER}/api/profile/notifications`, {
          credentials: "include",
        }),
      ]);

    if (settingsRes.status === "fulfilled" && settingsRes.value.ok) {
      userSettings.value = await settingsRes.value.json();
    }
    if (statsRes.status === "fulfilled" && statsRes.value.ok) {
      const data = await statsRes.value.json();
      if (data.active !== undefined) {
        inspectionStats.value = {
          total:
            (data.active ?? 0) + (data.snoozed ?? 0) + (data.completed ?? 0),
          completed: data.completed ?? 0,
          pending: data.active ?? 0,
          monthly: data.monthly ?? 0,
        };
      }
    }
    if (engineerRes.status === "fulfilled" && engineerRes.value.ok) {
      engineerProfile.value = await engineerRes.value.json();
    }
    if (notifsRes.status === "fulfilled" && notifsRes.value.ok) {
      notifications.value = await notifsRes.value.json();
    }
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.profile-shell {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  min-height: calc(100vh - 64px - 64px);
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
.profile-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px 16px;
  position: sticky;
  top: 16px;
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 12px;
}

.sidebar-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #ddeafe;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}
.sidebar-avatar--lg {
  width: 64px;
  height: 64px;
}
.sidebar-avatar img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.sidebar-avatar__initials {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.sidebar-user__info {
  min-width: 0;
}
.sidebar-user__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sidebar-nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
  user-select: none;
}
.sidebar-nav__item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.sidebar-nav__item--active {
  background: rgba(99, 226, 183, 0.14);
  color: var(--brand-color, #18a058);
  font-weight: 600;
}
html[data-theme="light"] .sidebar-nav__item--active {
  background: rgba(24, 160, 88, 0.1);
}
.sidebar-nav__icon {
  font-size: 16px;
}

/* ── Content ─────────────────────────────────────────────────────────────── */
.profile-content {
  flex: 1;
  min-width: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.info-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0 20px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
}
.info-row:last-child {
  border-bottom: none;
}
.info-label {
  color: var(--text-secondary);
  min-width: 160px;
  flex-shrink: 0;
}
.info-val {
  color: var(--text-primary);
  font-weight: 500;
}
.info-input {
  flex: 1;
}
.info-hint {
  font-size: 11px;
  color: var(--color-warning, #f0a020);
}
.info-section-divider {
  grid-column: 1 / -1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px 0 4px;
  border-top: 1px solid var(--border-color);
  margin-top: 4px;
}

.progress-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ── Stats ───────────────────────────────────────────────────────────────── */
.stats-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.stat-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 24px;
  min-width: 100px;
}
.stat-pill--green {
  border-color: rgba(24, 160, 88, 0.3);
}
.stat-pill--red {
  border-color: rgba(208, 48, 80, 0.3);
}
.stat-pill__num {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
}
.stat-pill__label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
  text-align: center;
}

.stat-card {
  flex: 1;
  min-width: 120px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.stat-card--green {
  border-color: rgba(24, 160, 88, 0.3);
}
.stat-card--orange {
  border-color: rgba(240, 160, 32, 0.3);
}
.stat-card__num {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-primary);
}
.stat-card__label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 6px;
}

/* ── Notifications ───────────────────────────────────────────────────────── */
.notif-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.notif-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 16px;
}
.notif-item--unread {
  border-color: var(--brand-color, #18a058);
}
.notif-body {
  flex: 1;
}
.notif-title {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}
.notif-date {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.empty-state {
  padding: 32px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
}

/* ── Settings ────────────────────────────────────────────────────────────── */
.settings-group {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 16px;
}
.settings-group__title {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.settings-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-secondary);
}
.avatar-upload-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* ── Theme ───────────────────────────────────────────────────────────────── */
.theme-cards {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.theme-card {
  cursor: pointer;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  width: 160px;
  transition: border-color 0.15s;
}
.theme-card--active {
  border-color: var(--brand-color, #18a058);
}
.theme-card__preview {
  height: 100px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}
.theme-card__preview--light {
  background: #f5f5f5;
}
.theme-card__preview--dark {
  background: #1a1a2e;
}
.theme-preview-bar {
  height: 10px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.3);
}
.theme-preview-content {
  flex: 1;
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.15);
}
.theme-card__label {
  padding: 10px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
}
.drop-zone {
  border: 2px dashed #444;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  transition:
    border-color 0.2s,
    background 0.2s;
  cursor: pointer;
  font-size: 13px;
}
.drop-zone--active {
  border-color: #63e2b7;
  background: rgba(99, 226, 183, 0.06);
}

@media (max-width: 820px) {
  .profile-shell {
    flex-direction: column;
    gap: 16px;
    min-height: 0;
  }

  .profile-sidebar {
    position: static;
    width: 100%;
    padding: 14px;
  }

  .sidebar-user {
    padding-bottom: 12px;
  }

  .sidebar-nav {
    flex-direction: row;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .sidebar-nav::-webkit-scrollbar {
    display: none;
  }

  .sidebar-nav__item {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .profile-content {
    width: 100%;
  }
}

@media (max-width: 560px) {
  .section-header {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .section-header :deep(.n-button),
  .section-header :deep(.n-select) {
    width: 100% !important;
  }

  .info-card,
  .settings-group {
    padding-inline: 16px;
  }

  .info-row {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .info-label {
    min-width: 0;
  }

  .info-input,
  .progress-wrap {
    width: 100%;
  }

  .stats-row,
  .theme-cards {
    flex-direction: column;
  }

  .stat-pill,
  .stat-card,
  .theme-card {
    width: 100%;
  }

  .avatar-upload-row {
    align-items: stretch;
    flex-direction: column;
  }

  .drop-zone {
    line-height: 1.5;
  }
}
</style>
