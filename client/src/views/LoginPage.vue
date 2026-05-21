<template>
  <div class="login-page">
    <div class="login-card">
      <!-- Logo / brand -->
      <div class="login-brand">
        <div class="login-brand__icon">
          <n-icon :component="BriefcaseOutline" :size="32" color="#fff" />
        </div>
        <h1 class="login-brand__title">תזכורת לקוח</h1>
        <p class="login-brand__sub">מערכת ניהול תסקירים ותזכורות</p>
      </div>

      <!-- Error alert -->
      <n-alert v-if="errorMsg" type="error" :title="errorMsg" style="margin-bottom: 24px" closable @close="clearError" />

      <!-- Google sign-in button (GIS) -->
      <GoogleSignIn @error="onGisError" />

      <p class="login-footer">גישה מוגבלת למשתמשים מורשים בלבד</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NIcon, NAlert } from "naive-ui";
import { BriefcaseOutline } from "@vicons/ionicons5";
import { useAuthStore } from "../stores/auth.js";
import GoogleSignIn from "../components/GoogleSignIn.vue";

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const errorMessages: Record<string, string> = {
  not_allowed: "כתובת האימייל שלך אינה ברשימת הגישה המורשית",
  auth_failed: "אירעה שגיאה בתהליך ההתחברות, אנא נסה שנית",
  invalid_state: "בקשת ההתחברות פגה, אנא נסה שנית",
  missing_params: "שגיאה בתהליך OAuth",
};

const gisError = ref<string | null>(null);

const errorMsg = computed(() => {
  if (gisError.value) return errorMessages[gisError.value] ?? `שגיאה: ${gisError.value}`;
  const e = route.query.error as string | undefined;
  return e ? (errorMessages[e] ?? `שגיאה: ${e}`) : null;
});

function clearError() {
  gisError.value = null;
  router.replace("/login");
}

function onGisError(msg: string) {
  gisError.value = msg;
}

onMounted(async () => {
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
  max-width: 400px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 48px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  box-shadow: 0 8px 48px rgba(0,0,0,0.12);
}

.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 40px;
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

.google-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 24px;
  background: #fff;
  color: #3c4043;
  border: 1px solid #dadce0;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  font-family: inherit;
}

.google-btn:hover:not(:disabled) {
  background: #f8f9fa;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}

.google-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.google-btn__logo {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.login-footer {
  margin-top: 24px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}
</style>
