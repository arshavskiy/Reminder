<template>
  <div class="settings-page">
    <PageHeader title="הגדרות" subtitle="הגדרות כלליות של המערכת" />

    <n-spin :show="settingsStore.loading || settingsStore.saving">
      <template v-if="form">
        <!-- Theme moved to personal profile settings (ProfilePage.vue) - keep global settings page theme link unchanged -->

        <n-card title="בינה מלאכותית (AI)" style="margin-bottom: 16px">
          <n-form label-placement="top">
            <n-form-item label="מנוע AI">
              <n-radio-group v-model:value="form.aiBackend">
                <n-radio value="openai">OpenAI</n-radio>
                <n-radio value="ollama">Ollama (מקומי)</n-radio>
              </n-radio-group>
            </n-form-item>
            <template v-if="form.aiBackend === 'openai'">
              <n-alert type="default" :show-icon="false" style="margin-bottom: 12px; font-size: 12px">
                מפתח OpenAI API מוגדר דרך משתנה סביבה <strong>OPENAI_LOCAL_API_KEY</strong> בשרת — אינו ניתן לשינוי מה-UI.
              </n-alert>
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

        <n-card title="OCR וחילוץ טקסט" style="margin-bottom: 16px">
          <n-form label-placement="top">
            <n-form-item label="שפת OCR (Tesseract)">
              <n-input v-model:value="form.ocrLanguage" placeholder="heb+eng" />
              <template #feedback>שפות מופרדות ב-+  (למשל: heb+eng | heb+eng+ara)</template>
            </n-form-item>
            <n-form-item label="חילוץ AI אוטומטי עם העלאה">
              <n-switch v-model:value="form.autoExtract" />
            </n-form-item>
            <n-form-item label="מקסימום תווים לחילוץ AI">
              <n-input-number v-model:value="form.extractionMaxChars" :min="1000" :step="1000" />
            </n-form-item>
          </n-form>
        </n-card>

        <n-card title="אימייל (SMTP)" style="margin-bottom: 16px">
          <n-form label-placement="top">
            <n-form-item label="SMTP Host">
              <n-input v-model:value="form.smtpHost" placeholder="smtp-relay.brevo.com" />
            </n-form-item>
            <n-alert :show-icon="false" style="margin-bottom: 16px; font-size: 12px" type="info">
              מומלץ Brevo (300 אימיילים/יום בחינם): Host = smtp-relay.brevo.com, Port = 587, SSL/TLS כבוי,
              שם משתמש = כתובת האימייל של חשבון ה-Brevo, סיסמה = SMTP key מתוך app.brevo.com/settings/keys/smtp
            </n-alert>
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
            <n-alert type="default" :show-icon="false" style="margin-bottom: 12px; font-size: 12px">
              סיסמת SMTP מוגדרת דרך משתנה סביבה <strong>SMTP_PASS</strong> בשרת — אינה ניתנת לשינוי מה-UI.
            </n-alert>
            <n-form-item label="כתובת שולח">
              <n-input v-model:value="form.emailFrom" placeholder="reminder@example.com" />
            </n-form-item>
            <n-form-item label="כתובת לבדיקות (Test Email)">
              <n-input v-model:value="form.testEmail" placeholder="me@example.com" />
            </n-form-item>
            <n-form-item v-if="canSelectEmailTemplates" label="תבנית אימייל לבדיקה">
              <n-select
                v-model:value="form.testEmailTemplateId"
                :options="emailTemplateOptions"
                placeholder="בחר תבנית (או השתמש בברירת מחדל)"
                clearable
                :virtual-scroll="false"
              />
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
            <n-form-item label="אימייל הסלמה (supervisor)">
              <n-input v-model:value="form.escalationEmail" placeholder="supervisor@example.com" />
            </n-form-item>
            <n-form-item label="ימי איחור לפני הסלמה">
              <n-input-number v-model:value="form.escalationThresholdDays" :max="30" :min="1" />
            </n-form-item>
            <n-alert :show-icon="false" style="margin-top: 4px; font-size: 12px" type="info">
              אם תזכורת לא טופלה תוך N ימים מתאריכה, יישלח אימייל נוסף לכתובת ההסלמה.
            </n-alert>
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
import {computed, onMounted, ref} from "vue";
import PageHeader from "../components/PageHeader.vue";
import {
  NAlert,
  NButton,
  NCard,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NInput,
  NInputNumber,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  useMessage,
} from "naive-ui";
import {useSettingsStore} from "../stores/settings.js";
import {useFeaturesStore} from "../stores/features.js";
import {api} from "../services/apiService.js";
import {FEATURES} from "../shared/features.js";
import type {AppSettings, EmailTemplate} from "@shared/types.js";

const settingsStore = useSettingsStore();
const featuresStore = useFeaturesStore();
const message = useMessage();
const form = ref<AppSettings | null>(null);
const testing = ref(false);
const emailTemplates = ref<EmailTemplate[]>([]);

const emailTemplateOptions = computed(() =>
  emailTemplates.value.map((t) => ({ label: t.name, value: t.id }))
);
const canSelectEmailTemplates = computed(() => featuresStore.hasFeature(FEATURES.pages.emailTemplates));

onMounted(async () => {
  await featuresStore.fetchFeatures().catch(() => {});
  await settingsStore.load();
  form.value = { ...settingsStore.settings! };
  if (canSelectEmailTemplates.value) {
    try {
      emailTemplates.value = await api.emailTemplates.list();
    } catch (e) {
      console.error("Failed to load email templates:", e);
    }
  } else if (form.value) {
    form.value.testEmailTemplateId = null;
  }
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
    const r = await api.email.test(
      form.value.testEmail,
      canSelectEmailTemplates.value ? form.value.testEmailTemplateId : null
    );
    if (r.success) message.success(`האימייל נשלח ל-${form.value.testEmail}`);
    else message.error(r.error ?? "שגיאה");
  } finally {
    testing.value = false;
  }
}
</script>

<style scoped>
.settings-page {
  max-width: 600px;
  width: 100%;
}

@media (max-width: 640px) {
  .settings-page {
    max-width: none;
  }

  :deep(.n-card) {
    border-radius: 12px;
  }

  :deep(.n-card-header),
  :deep(.n-card__content) {
    padding-inline: 16px;
  }

  :deep(.n-grid) {
    grid-template-columns: 1fr !important;
  }

  :deep(.n-gi) {
    grid-column: span 1 / span 1 !important;
  }

  :deep(.n-radio-group) {
    display: grid;
    gap: 8px;
  }

  :deep(.n-space),
  :deep(.n-button) {
    width: 100%;
  }

  :deep(.n-button) {
    justify-content: center;
  }
}
</style>
