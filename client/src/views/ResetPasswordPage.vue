<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <div class="login-brand__icon">
          <n-icon :component="BriefcaseOutline" :size="32" color="#fff" />
        </div>
        <h1 class="login-brand__title">איפוס סיסמה</h1>
      </div>

      <n-alert v-if="success" type="success" title="הסיסמה עודכנה בהצלחה — ניתן להתחבר" style="margin-bottom:16px;width:100%" />
      <n-alert v-if="errorMsg" type="error" :title="errorMsg" style="margin-bottom:16px;width:100%" closable @close="errorMsg = null" />

      <template v-if="!success">
        <n-form @submit.prevent="handleReset" style="width:100%">
          <n-form-item label="סיסמה חדשה" :show-feedback="false" style="margin-bottom:12px">
            <n-input
              v-model:value="password"
              type="password"
              placeholder="לפחות 8 תווים"
              size="large"
              show-password-on="click"
              autocomplete="new-password"
              :disabled="loading"
            />
          </n-form-item>
          <n-form-item label="אימות סיסמה" :show-feedback="false" style="margin-bottom:20px">
            <n-input
              v-model:value="confirm"
              type="password"
              placeholder="חזור על הסיסמה"
              size="large"
              show-password-on="click"
              autocomplete="new-password"
              :disabled="loading"
            />
          </n-form-item>
          <n-button
            type="primary"
            size="large"
            style="width:100%"
            attr-type="submit"
            :loading="loading"
            :disabled="!password || password.length < 8 || password !== confirm"
          >
            עדכן סיסמה
          </n-button>
        </n-form>
      </template>

      <n-button v-if="success" type="primary" size="large" style="width:100%" @click="router.replace('/login')">
        לדף הכניסה
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NIcon, NAlert, NForm, NFormItem, NInput, NButton } from "naive-ui";
import { BriefcaseOutline } from "@vicons/ionicons5";

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const route = useRoute();
const router = useRouter();

const token = ref("");
const password = ref("");
const confirm = ref("");
const loading = ref(false);
const success = ref(false);
const errorMsg = ref<string | null>(null);

onMounted(() => {
  token.value = route.query.token as string ?? "";
  if (!token.value) {
    errorMsg.value = "קישור האיפוס אינו תקין";
  }
});

async function handleReset() {
  loading.value = true;
  errorMsg.value = null;
  try {
    const res = await fetch(`${SERVER}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.value, password: password.value }),
    });
    const data = await res.json() as any;
    if (!res.ok) {
      const msgs: Record<string, string> = {
        invalid_or_expired_token: "הקישור פג תוקף — אנא בקש קישור חדש",
        password_too_short: "הסיסמה חייבת להכיל לפחות 8 תווים",
      };
      errorMsg.value = msgs[data.error] ?? "אירעה שגיאה, נסה שנית";
      return;
    }
    success.value = true;
  } catch {
    errorMsg.value = "אירעה שגיאה, נסה שנית";
  } finally {
    loading.value = false;
  }
}
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
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}
</style>
