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

      <!-- Google sign-in button -->
      <button class="google-btn" :disabled="loading" @click="authStore.loginWithGoogle()">
        <svg class="google-btn__logo" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
          <path fill="#EA4335" d="M24 9.5c3.1 0 5.8 1.1 8 2.9l6-6C34.5 3.1 29.6 1 24 1 14.7 1 6.8 6.6 3.3 14.4l7 5.4C12.1 13.5 17.6 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 2.9-2.3 5.3-4.8 7l7.4 5.7C43.5 37.3 46.5 31.4 46.5 24.5z"/>
          <path fill="#FBBC05" d="M10.3 28.6A14.8 14.8 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6L3.3 14C1.2 17.7 0 22 0 24s1.2 6.3 3.3 10l7-5.4z"/>
          <path fill="#34A853" d="M24 47c5.6 0 10.3-1.8 13.7-5l-7.4-5.7c-1.9 1.3-4.2 2.1-6.3 2.1-6.4 0-11.9-4-13.7-9.8l-7 5.4C6.8 41.4 14.7 47 24 47z"/>
        </svg>
        <span>{{ loading ? "מתחבר..." : "כניסה עם Google" }}</span>
      </button>

      <p class="login-footer">גישה מוגבלת למשתמשים מורשים בלבד</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NIcon, NAlert } from "naive-ui";
import { BriefcaseOutline } from "@vicons/ionicons5";
import { useAuthStore } from "../stores/auth.js";

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const loading = computed(() => authStore.loading);

const errorMessages: Record<string, string> = {
  not_allowed: "כתובת האימייל שלך אינה ברשימת הגישה המורשית",
  auth_failed: "אירעה שגיאה בתהליך ההתחברות, אנא נסה שנית",
  invalid_state: "בקשת ההתחברות פגה, אנא נסה שנית",
  missing_params: "שגיאה בתהליך OAuth",
};

const errorMsg = computed(() => {
  const e = route.query.error as string | undefined;
  return e ? (errorMessages[e] ?? `שגיאה: ${e}`) : null;
});

function clearError() {
  router.replace("/login");
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
