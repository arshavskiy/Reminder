<template>
  <div class="profile-page">
    <n-spin :show="loading">

      <!-- ── Hero card ───────────────────────────────────────────────────── -->
      <div class="hero-card">
        <!-- Left: avatar + name + role -->
        <div class="hero-left">
          <div class="avatar">
            <img v-if="user?.picture_url" :src="user.picture_url" alt="avatar" />
            <span v-else class="avatar__initials">{{ initials }}</span>
          </div>
          <div class="hero-info">
            <h1 class="hero-name">{{ user?.name || '—' }}</h1>
            <p class="hero-email">{{ user?.email }}</p>
            <n-tag :type="roleTag.type" size="small" style="margin-top:6px">
              {{ roleTag.label }}
            </n-tag>
          </div>
        </div>

        <!-- Right: stats -->
        <div class="stats">
          <div class="stat">
            <span class="stat__num">{{ stats.active }}</span>
            <span class="stat__label">תזכורות פעילות</span>
          </div>
          <div class="stat">
            <span class="stat__num">{{ stats.snoozed }}</span>
            <span class="stat__label">הושעו</span>
          </div>
          <div class="stat">
            <span class="stat__num">{{ stats.completed }}</span>
            <span class="stat__label">נשלחו</span>
          </div>
        </div>
      </div>

      <!-- ── Settings card ───────────────────────────────────────────────── -->
      <div v-if="settings" class="section-card">
        <h2 class="section-title">הגדרות משתמש</h2>

        <n-form :disabled="savingSettings" label-placement="top">
          <n-form-item label="ערכת נושא">
            <n-radio-group v-model:value="settings.theme">
              <n-radio value="light">☀️ בהיר</n-radio>
              <n-radio value="dark">🌙 כהה</n-radio>
            </n-radio-group>
          </n-form-item>

          <n-grid :cols="2" :x-gap="16">
            <n-gi>
              <n-form-item label="שם שולח אימייל">
                <n-input v-model:value="settings.email_from_name" placeholder="לדוגמה: ReminderOCR" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="ימים מראש לתזכורת">
                <n-input v-model:value="reminderDaysStr" placeholder="90, 60, 30" />
              </n-form-item>
            </n-gi>
          </n-grid>

          <n-form-item label="שפת OCR">
            <n-input v-model:value="settings.ocr_language" placeholder="heb+eng" />
          </n-form-item>
        </n-form>

        <div class="section-footer">
          <n-button @click="resetSettings">ביטול</n-button>
          <n-button :loading="savingSettings" type="primary" @click="saveSettings">שמור הגדרות</n-button>
        </div>
      </div>

      <!-- ── Session info card ───────────────────────────────────────────── -->
      <div class="section-card">
        <h2 class="section-title">חשבון</h2>
        <div v-if="user?.created_at" class="info-row">
          <span class="info-label">הצטרף</span>
          <span class="info-val">{{ formatDate(user.created_at) }}</span>
        </div>
        <div v-if="user?.last_login_at" class="info-row">
          <span class="info-label">כניסה אחרונה</span>
          <span class="info-val">{{ formatDate(user.last_login_at) }}</span>
        </div>
      </div>

      <!-- ── Users management (admin only) ─────────────────────────────── -->
      <div v-if="isAdmin" class="section-card">
        <h2 class="section-title">ניהול משתמשים</h2>
        <n-data-table
          :columns="usersColumns"
          :data="allUsers"
          :loading="loadingUsers"
          :pagination="false"
          size="small"
        />
      </div>

      <!-- ── Danger zone ─────────────────────────────────────────────────── -->
      <div class="section-card section-card--danger">
        <h2 class="section-title section-title--danger">אזור סכנה</h2>
        <p class="danger-desc">סיים את כל ההפעלות הפעילות בכל המכשירים. פעולה זו לא ניתנת לביטול.</p>
        <n-button :loading="disconnecting" type="error" @click="disconnectAll">
          התנתק מכל המכשירים
        </n-button>
      </div>

    </n-spin>
  </div>
</template>

<script setup lang="ts">
import {computed, h, onMounted, ref} from "vue";
import {
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NInput,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpin,
  NTag,
  useMessage,
} from "naive-ui";
import {useAuthStore} from "../stores/auth.js";
import type {User, UserRole, UserSettings} from "@shared/types.js";

const message = useMessage();
const authStore = useAuthStore();

const loading = ref(true);
const savingSettings = ref(false);
const disconnecting = ref(false);

const user = computed(() => authStore.user as User | null);
const settings = ref<UserSettings | null>(null);
const reminderDaysStr = ref("90, 60, 30");
const settingsSnapshot = ref<string>("");

const stats = ref({ active: 0, snoozed: 0, completed: 0 });

const initials = computed(() => {
  const name = user.value?.name ?? "";
  return name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase();
});

const ROLE_META: Record<string, { label: string; type: "warning" | "info" | "default" }> = {
  admin: { label: "מנהל מערכת", type: "warning" },
  pro:   { label: "Pro",        type: "info" },
  user:  { label: "משתמש",      type: "default" },
};
const roleTag = computed(() => ROLE_META[user.value?.role ?? "user"] ?? ROLE_META.user);

const isAdmin = computed(() => user.value?.role === "admin");

// ── Users management (admin only) ────────────────────────────────────────────
const allUsers = ref<any[]>([]);
const loadingUsers = ref(false);

const roleOptions = [
  { label: "מנהל מערכת", value: "admin" },
  { label: "Pro",          value: "pro" },
  { label: "משתמש",        value: "user" },
];

async function loadUsers() {
  loadingUsers.value = true;
  try {
    const res = await fetch(`${SERVER}/api/admin/users`, { credentials: "include" });
    if (res.ok) allUsers.value = await res.json();
  } finally {
    loadingUsers.value = false;
  }
}

async function updateUserRole(userId: string, role: UserRole) {
  await fetch(`${SERVER}/api/admin/users/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ role }),
  });
  await loadUsers();
  message.success("התפקיד עודכן");
}

async function toggleActive(userId: string, is_active: number) {
  await fetch(`${SERVER}/api/admin/users/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ is_active }),
  });
  await loadUsers();
  message.success(is_active ? "המשתמש הופעל" : "המשתמש הושבת");
}

const usersColumns = computed(() => [
  { title: "שם", key: "name", render: (row: any) => row.name || row.email },
  { title: "אימייל", key: "email" },
  {
    title: "תפקיד",
    key: "role",
    width: 160,
    render: (row: any) => h(NSelect, {
      value: row.role,
      options: roleOptions,
      size: "small",
      style: "min-width:130px",
      disabled: row.id === user.value?.id?.toString(),
      onUpdateValue: (v: any) => updateUserRole(row.id, v as UserRole),
    }),
  },
  {
    title: "סטטוס",
    key: "is_active",
    width: 100,
    render: (row: any) => h(NButton, {
      size: "small",
      type: row.is_active ? "default" : "error",
      disabled: row.id === user.value?.id?.toString(),
      onClick: () => toggleActive(row.id, row.is_active ? 0 : 1),
    }, () => row.is_active ? "פעיל" : "מושבת"),
  },
]);

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL", { year: "numeric", month: "long", day: "numeric" });
}

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

onMounted(async () => {
  try {
    const [settingsRes, statsRes] = await Promise.all([
      fetch(`${SERVER}/api/user-settings`, { credentials: "include" }),
      fetch(`${SERVER}/api/profile/stats`, { credentials: "include" }),
    ]);

    if (settingsRes.ok) {
      const data = await settingsRes.json() as UserSettings;
      settings.value = data;
      reminderDaysStr.value = JSON.parse(data.reminder_advance_days ?? "[90,60,30]").join(", ");
      settingsSnapshot.value = JSON.stringify(data);
    }

    if (statsRes.ok) {
      stats.value = await statsRes.json();
    }

    if (authStore.user?.role === "admin") {
      await loadUsers();
    }
  } finally {
    loading.value = false;
  }
});

function resetSettings() {
  if (!settingsSnapshot.value) return;
  settings.value = JSON.parse(settingsSnapshot.value);
  reminderDaysStr.value = JSON.parse(settings.value!.reminder_advance_days ?? "[90,60,30]").join(", ");
}

async function saveSettings() {
  if (!settings.value) return;
  savingSettings.value = true;
  try {
    const days = reminderDaysStr.value
      .split(",")
      .map((x) => parseInt(x.trim()))
      .filter((x) => !isNaN(x) && x > 0);
    const payload: UserSettings = {
      ...settings.value,
      reminder_advance_days: JSON.stringify(days),
    };
    const res = await fetch(`${SERVER}/api/user-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    settings.value = await res.json();
    reminderDaysStr.value = JSON.parse(settings.value!.reminder_advance_days).join(", ");
    settingsSnapshot.value = JSON.stringify(settings.value);
    message.success("ההגדרות נשמרו");
  } catch {
    message.error("שגיאה בשמירת ההגדרות");
  } finally {
    savingSettings.value = false;
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
</script>

<style scoped>
.profile-page {
  max-width: 860px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── Hero card ─────────────────────────────────────────────────────────────── */
.hero-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 28px 32px;
}

.hero-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: #DDEAFE;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar__initials { font-size: 28px; font-weight: 700; color: #0F172A; }

.hero-name { margin: 0 0 4px; font-size: 22px; font-weight: 700; color: var(--text-primary); }
.hero-email { margin: 0; font-size: 14px; color: var(--text-secondary); }

.stats {
  display: flex;
  gap: 20px;
  flex-shrink: 0;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 24px;
  min-width: 90px;
}
.stat__num { font-size: 26px; font-weight: 700; color: var(--text-primary); }
.stat__label { font-size: 11px; color: var(--text-secondary); margin-top: 4px; text-align: center; }

/* ── Section cards ─────────────────────────────────────────────────────────── */
.section-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 24px 28px;
}
.section-card--danger { border-color: rgba(208, 48, 80, 0.25); }

.section-title {
  margin: 0 0 20px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}
.section-title--danger { color: var(--color-error, #d03050); }

.section-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

/* ── Info rows ─────────────────────────────────────────────────────────────── */
.info-row {
  display: flex;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
}
.info-row:last-child { border-bottom: none; }
.info-label { color: var(--text-secondary); min-width: 120px; }
.info-val { color: var(--text-primary); font-weight: 500; }

.danger-desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
