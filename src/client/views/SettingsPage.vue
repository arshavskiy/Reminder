<template>
  <div style="max-width: 600px">
<!--    <n-h2>הגדרות</n-h2>-->

    <n-spin :show="settingsStore.loading || settingsStore.saving">
      <template v-if="form">
        <n-card title="מראה" style="margin-bottom: 16px">
          <n-form label-placement="top">
            <n-form-item label="ערכת נושא">
              <n-radio-group v-model:value="form.theme">
                <n-radio value="dark">🌙 כהה</n-radio>
                <n-radio value="light">☀️ בהיר</n-radio>
              </n-radio-group>
            </n-form-item>
          </n-form>
        </n-card>

        <n-card title="בינה מלאכותית (AI)" style="margin-bottom: 16px">
          <n-form label-placement="top">
            <n-form-item label="מנוע AI">
              <n-radio-group v-model:value="form.aiBackend">
                <n-radio value="openai">OpenAI</n-radio>
                <n-radio value="ollama">Ollama (מקומי)</n-radio>
              </n-radio-group>
            </n-form-item>
            <template v-if="form.aiBackend === 'openai'">
              <n-form-item label="OpenAI API Key">
                <n-input v-model:value="form.openAiKey" type="password" show-password-on="click" placeholder="sk-..." />
              </n-form-item>
              <n-form-item label="מודל">
                <n-input v-model:value="form.openAiModel" placeholder="gpt-4o-mini" />
              </n-form-item>
            </template>
            <template v-else>
              <n-form-item label="Ollama URL">
                <n-input v-model:value="form.ollamaUrl" placeholder="http://localhost:11434" />
              </n-form-item>
              <n-form-item label="מודל">
                <n-input v-model:value="form.ollamaModel" placeholder="llama3.1" />
              </n-form-item>
            </template>
          </n-form>
        </n-card>

        <n-card title="אימייל (SMTP)" style="margin-bottom: 16px">
          <n-form label-placement="top">
            <n-form-item label="SMTP Host">
              <n-input v-model:value="form.smtpHost" placeholder="smtp.gmail.com" />
            </n-form-item>
            <n-grid :cols="2" :x-gap="16">
              <n-gi>
                <n-form-item label="Port">
                  <n-input-number v-model:value="form.smtpPort" :min="1" :max="65535" />
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="SSL/TLS">
                  <n-switch v-model:value="form.smtpSecure" />
                </n-form-item>
              </n-gi>
            </n-grid>
            <n-form-item label="אמת תעודת SSL (כבה רק לשרתים פנימיים / self-signed)">
              <n-switch v-model:value="form.smtpRejectUnauthorized" />
            </n-form-item>
            <n-form-item label="שם משתמש">
              <n-input v-model:value="form.smtpUser" />
            </n-form-item>
            <n-form-item label="סיסמה">
              <n-input v-model:value="form.smtpPass" type="password" show-password-on="click" />
            </n-form-item>
            <n-form-item label="כתובת שולח">
              <n-input v-model:value="form.emailFrom" placeholder="reminder@example.com" />
            </n-form-item>
            <n-form-item label="כתובת לבדיקות (Test Email)">
              <n-input v-model:value="form.testEmail" placeholder="me@example.com" />
            </n-form-item>
            <n-space>
              <n-button @click="testSmtp" :loading="testing" :disabled="!form.testEmail">
                שלח אימייל בדיקה ל-{{ form.testEmail || '...' }}
              </n-button>
            </n-space>
          </n-form>
        </n-card>

        <n-card title="תזכורות" style="margin-bottom: 16px">
          <n-form label-placement="top">
            <n-form-item label="הפעל תזכורות אוטומטיות">
              <n-switch v-model:value="form.reminderEnabled" />
            </n-form-item>
            <n-form-item label="ימים מראש לתזכורת (מופרדים בפסיק)">
              <n-input
                :value="form.reminderAdvanceDays.join(', ')"
                @update:value="v => form!.reminderAdvanceDays = v.split(',').map(x => parseInt(x.trim())).filter(Boolean)"
                placeholder="90, 60, 30"
              />
            </n-form-item>
          </n-form>
        </n-card>

        <n-card title="תיקיית מעקב (Watch Folder)" style="margin-bottom: 16px">
          <n-form label-placement="top">
            <n-form-item label="הפעל מעקב אוטומטי">
              <n-switch v-model:value="form.watchFolderEnabled" />
            </n-form-item>
            <n-form-item v-if="form.watchFolderEnabled" label="נתיב לתיקייה">
              <n-input v-model:value="form.watchFolder" placeholder="C:\Documents\Inbox" />
            </n-form-item>
            <n-alert v-if="form.watchFolderEnabled" type="info" :show-icon="false">
              כל קובץ שיופל לתיקייה זו ייובא אוטומטית למערכת
            </n-alert>
          </n-form>
        </n-card>

        <n-button type="primary" size="large" @click="save" style="margin-top: 8px">שמור הגדרות</n-button>
      </template>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import {
  NH2, NCard, NForm, NFormItem, NInput, NInputNumber, NRadioGroup, NRadio,
  NSwitch, NGrid, NGi, NSpace, NButton, NSpin, useMessage,
} from "naive-ui";
import { useSettingsStore } from "../stores/settings.js";
import { api } from "../services/apiService.js";
import type { AppSettings } from "@shared/types.js";

const settingsStore = useSettingsStore();
const message = useMessage();
const form = ref<AppSettings | null>(null);
const testing = ref(false);

onMounted(async () => {
  await settingsStore.load();
  form.value = { ...settingsStore.settings! };
});

async function save() {
  if (!form.value) return;
  await settingsStore.save(form.value);
  message.success("הגדרות נשמרו");
}

async function testSmtp() {
  if (!form.value?.testEmail) return;
  // Save first so server-side has the latest SMTP creds + testEmail
  await settingsStore.save(form.value);
  testing.value = true;
  try {
    const r = await api.email.test(form.value.testEmail);
    if (r.success) message.success(`האימייל נשלח ל-${form.value.testEmail}`);
    else message.error(r.error ?? "שגיאה");
  } finally {
    testing.value = false;
  }
}
</script>
