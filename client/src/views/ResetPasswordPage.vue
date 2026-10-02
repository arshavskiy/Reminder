<template>
  <div class="login-page" :dir="localeStore.dir">
    <div class="login-card">
      <div class="login-brand">
        <div class="login-brand__icon">
          <n-icon :component="BriefcaseOutline" :size="32" color="#fff" />
        </div>
        <h1 class="login-brand__title">{{ t.resetTitle }}</h1>
      </div>

      <n-alert v-if="success" type="success" :title="t.resetSuccess" style="margin-bottom:16px;width:100%" />
      <n-alert v-if="errorMsg" type="error" :title="errorMsg" style="margin-bottom:16px;width:100%" closable @close="errorMsg = null" />

      <template v-if="!success">
        <n-form @submit.prevent="handleReset" style="width:100%">
          <n-form-item :label="t.newPassword" :show-feedback="false" style="margin-bottom:12px">
            <n-input
              v-model:value="password"
              type="password"
              :placeholder="t.passwordPlaceholder"
              size="large"
              show-password-on="click"
              autocomplete="new-password"
              :input-props="{ autocomplete: 'new-password' }"
              :disabled="loading"
            />
          </n-form-item>
          <n-form-item :label="t.confirmPassword" :show-feedback="false" style="margin-bottom:20px">
            <n-input
              v-model:value="confirm"
              type="password"
              :placeholder="t.confirmPlaceholder"
              size="large"
              show-password-on="click"
              autocomplete="new-password"
              :input-props="{ autocomplete: 'new-password' }"
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
            {{ t.updatePassword }}
          </n-button>
        </n-form>
      </template>

      <n-button v-if="success" type="primary" size="large" style="width:100%" @click="router.replace(loginPath)">
        {{ t.backToLogin }}
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, onMounted} from "vue";
import {useRoute, useRouter} from "vue-router";
import {NIcon, NAlert, NForm, NFormItem, NInput, NButton} from "naive-ui";
import {BriefcaseOutline} from "@vicons/ionicons5";
import {useLocaleStore} from "../stores/locale.js";

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const route = useRoute();
const router = useRouter();
const localeStore = useLocaleStore();
const t = computed(() => localeStore.messages);
const loginPath = computed(() => (localeStore.locale === "he" ? "/login" : `/${localeStore.locale}/login`));

const token = ref("");
const password = ref("");
const confirm = ref("");
const loading = ref(false);
const success = ref(false);
const errorMsg = ref<string | null>(null);

onMounted(() => {
  token.value = route.query.token as string ?? "";
  if (!token.value) {
    errorMsg.value = t.value.invalidResetLink;
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
      const key = data.error as keyof typeof t.value.errors;
      errorMsg.value = t.value.errors[key] ?? t.value.genericError;
      return;
    }
    success.value = true;
  } catch {
    errorMsg.value = t.value.genericError;
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
