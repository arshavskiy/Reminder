<template>
  <div class="login-page">
    <div class="login-card">
      <!-- Brand -->
      <div class="login-brand">
        <div class="login-brand__icon">
          <n-icon :component="BriefcaseOutline" :size="32" color="#fff" />
        </div>
        <h1 class="login-brand__title"> ReminderOCR </h1>
        <p class="login-brand__sub">מערכת ניהול תסקירים ותזכורות</p>
      </div>

      <!-- Error / success alerts -->
      <n-alert v-if="successMsg" type="success" :title="successMsg" style="margin-bottom:16px" closable @close="successMsg = null" />
      <n-alert v-if="errorMsg" type="error" :title="errorMsg" style="margin-bottom:16px" closable @close="clearError" />

      <!-- Tab selector -->
      <n-tabs v-model:value="activeTab" type="line" animated style="width:100%;margin-bottom:8px">
        <!-- Sign In tab -->
        <n-tab-pane name="login" tab="כניסה">
          <n-form @submit.prevent="handleLogin" style="margin-top:8px">
            <n-form-item label="אימייל" :show-feedback="false" style="margin-bottom:12px">
              <n-input
                v-model:value="loginEmail"
                type="email"
                placeholder="you@example.com"
                size="large"
                autocomplete="email"
                :disabled="loading"
              />
            </n-form-item>
            <n-form-item label="סיסמה" :show-feedback="false" style="margin-bottom:16px">
              <n-input
                v-model:value="loginPassword"
                type="password"
                placeholder="••••••••"
                size="large"
                show-password-on="click"
                autocomplete="current-password"
                :disabled="loading"
              />
            </n-form-item>
            <n-button
              type="primary"
              size="large"
              style="width:100%;margin-bottom:8px"
              attr-type="submit"
              :loading="loading"
              :disabled="!loginEmail || !loginPassword"
            >
              כניסה
            </n-button>
            <div style="text-align:center">
              <n-button text size="small" @click="showForgot = true">שכחתי סיסמה</n-button>
            </div>
          </n-form>

<!--          <div class="divider"><span>או</span></div>-->
<!--          <GoogleSignIn @error="onGisError" />-->
        </n-tab-pane>

        <!-- Register tab -->
        <n-tab-pane name="register" tab="הרשמה">
          <n-form @submit.prevent="handleRegister" style="margin-top:8px">
            <n-form-item label="שם מלא" :show-feedback="false" style="margin-bottom:12px">
              <n-input
                v-model:value="regName"
                placeholder="ישראל ישראלי"
                size="large"
                autocomplete="name"
                :disabled="loading"
              />
            </n-form-item>
            <n-form-item label="אימייל" :show-feedback="false" style="margin-bottom:12px">
              <n-input
                v-model:value="regEmail"
                type="email"
                placeholder="you@example.com"
                size="large"
                autocomplete="email"
                :disabled="loading"
              />
            </n-form-item>
            <n-form-item label="סיסמה" :show-feedback="false" style="margin-bottom:4px">
              <n-input
                v-model:value="regPassword"
                type="password"
                placeholder="לפחות 8 תווים"
                size="large"
                show-password-on="click"
                autocomplete="new-password"
                :disabled="loading"
              />
            </n-form-item>
            <p v-if="regPassword && regPassword.length < 8" style="color:#f0a020;font-size:12px;margin:4px 0 12px">הסיסמה חייבת להכיל לפחות 8 תווים</p>
            <div style="height:12px" v-else />
            <n-button
              type="primary"
              size="large"
              style="width:100%"
              attr-type="submit"
              :loading="loading"
              :disabled="!regEmail || !regPassword || regPassword.length < 8"
            >
              הרשמה
            </n-button>
          </n-form>
        </n-tab-pane>
      </n-tabs>

      <p class="login-footer">גישה מוגבלת למשתמשים מורשים בלבד</p>
    </div>

    <!-- Forgot password modal -->
    <n-modal v-model:show="showForgot" preset="card" title="שחזור סיסמה" style="max-width:380px;direction:rtl">
      <p style="margin-top:0">הזן את כתובת האימייל שלך ונשלח לך קישור לאיפוס הסיסמה.</p>
      <n-input
        v-model:value="forgotEmail"
        type="email"
        placeholder="you@example.com"
        size="large"
        :disabled="loading"
        style="margin-bottom:16px"
      />
      <template #footer>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <n-button @click="showForgot = false">ביטול</n-button>
          <n-button type="primary" :loading="loading" :disabled="!forgotEmail" @click="handleForgot">שלח</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NIcon, NAlert, NTabs, NTabPane, NForm, NFormItem, NInput, NButton, NModal } from "naive-ui";
import { BriefcaseOutline } from "@vicons/ionicons5";
import { useAuthStore } from "../stores/auth.js";
import { useDashboardStore } from "../stores/dashboard.js";
import { useDocumentsStore } from "../stores/documents.js";
import { useContractsStore } from "../stores/contracts.js";
import { useClientsStore } from "../stores/clients.js";
import { useRemindersStore } from "../stores/reminders.js";
import GoogleSignIn from "../components/GoogleSignIn.vue";

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const authStore = useAuthStore();
const dashStore = useDashboardStore();
const docsStore = useDocumentsStore();
const contractsStore = useContractsStore();
const clientsStore = useClientsStore();
const remindersStore = useRemindersStore();
const route = useRoute();
const router = useRouter();

const activeTab = ref<"login" | "register">("login");
const loading = ref(false);
const successMsg = ref<string | null>(null);
const gisError = ref<string | null>(null);
const routeError = ref<string | null>(null);

// Login form
const loginEmail = ref("");
const loginPassword = ref("");

// Register form
const regName = ref("");
const regEmail = ref("");
const regPassword = ref("");

// Forgot password
const showForgot = ref(false);
const forgotEmail = ref("");

const errorMessages: Record<string, string> = {
  not_allowed: "כתובת האימייל שלך אינה ברשימת הגישה המורשית",
  auth_failed: "אירעה שגיאה בתהליך ההתחברות, אנא נסה שנית",
  invalid_state: "בקשת ההתחברות פגה, אנא נסה שנית",
  missing_params: "שגיאה בתהליך OAuth",
  invalid_credentials: "אימייל או סיסמה שגויים",
  email_not_verified: "יש לאמת את כתובת האימייל לפני הכניסה. בדוק את תיבת הדואר שלך.",
  account_disabled: "החשבון הושבת, אנא פנה לתמיכה",
  email_taken: "כתובת האימייל כבר רשומה במערכת",
  invalid_email: "כתובת האימייל אינה תקינה",
  password_too_short: "הסיסמה חייבת להכיל לפחות 8 תווים",
  invalid_token: "קישור האימות אינו תקין",
  token_expired: "קישור האימות פג תוקף — אנא הירשם מחדש",
};

const errorMsg = computed(() => {
  if (gisError.value) return errorMessages[gisError.value] ?? `שגיאה: ${gisError.value}`;
  if (routeError.value) return errorMessages[routeError.value] ?? `שגיאה: ${routeError.value}`;
  return null;
});

function clearError() {
  gisError.value = null;
  routeError.value = null;
  router.replace("/login");
}

function onGisError(msg: string) {
  gisError.value = msg;
}

async function handleLogin() {
  loading.value = true;
  gisError.value = null;
  routeError.value = null;
  successMsg.value = null;
  try {
    const res = await fetch(`${SERVER}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: loginEmail.value, password: loginPassword.value }),
    });
    const data = await res.json() as any;
    if (!res.ok) {
      routeError.value = data.error ?? "auth_failed";
      return;
    }
    authStore.setUser(data.user);
    if (data.user?.role === "admin") {
      router.replace("/admin");
      return;
    }
    // Preload key stores in background so pages feel instant
    Promise.all([
      dashStore.fetch(),
      docsStore.fetch(),
      contractsStore.fetch({ limit: 200 }),
      clientsStore.fetch({ limit: 200 }),
      remindersStore.fetch(),
    ]).catch(() => {});
    router.replace("/");
  } catch {
    routeError.value = "auth_failed";
  } finally {
    loading.value = false;
  }
}

async function handleRegister() {
  loading.value = true;
  gisError.value = null;
  routeError.value = null;
  successMsg.value = null;
  try {
    const res = await fetch(`${SERVER}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: regEmail.value, password: regPassword.value, name: regName.value }),
    });
    const data = await res.json() as any;
    if (!res.ok) {
      routeError.value = data.error ?? "auth_failed";
      return;
    }
    successMsg.value = "נשלח אימייל לאימות הכתובת. אנא בדוק את תיבת הדואר ולחץ על הקישור.";
    regEmail.value = "";
    regPassword.value = "";
    regName.value = "";
    activeTab.value = "login";
  } catch {
    routeError.value = "auth_failed";
  } finally {
    loading.value = false;
  }
}

async function handleForgot() {
  loading.value = true;
  try {
    await fetch(`${SERVER}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotEmail.value }),
    });
    showForgot.value = false;
    successMsg.value = "אם כתובת האימייל קיימת במערכת, נשלח קישור לאיפוס הסיסמה.";
    forgotEmail.value = "";
  } catch {
    // silently ignore
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const e = route.query.error as string | undefined;
  if (e) routeError.value = e;

  if (route.query.tab === "register") activeTab.value = "register";

  if (!authStore.initialized) await authStore.fetchMe();
  if (authStore.user) router.replace("/");
});
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-app);
  padding: 24px;
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 48px 40px 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 8px 48px rgba(0,0,0,0.12);
}

.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
}

.login-brand__icon {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--brand-color), var(--brand-color-hover));
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-brand__title {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.login-brand__sub {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  text-align: center;
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0;
  color: var(--text-secondary);
  font-size: 13px;
  width: 100%;
}

.divider::before,
.divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.login-footer {
  margin-top: 20px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

:deep(.n-tabs) {
  width: 100%;
}
</style>
