<template>
  <div class="profile-page">
    <n-spin :show="loading">
      <PageHeader title="הפרופיל שלי" subtitle="ניהול המידע האישי וההגדרות שלך">
        <!-- action slot could be used for edit buttons in future -->
      </PageHeader>

      <!-- Main profile card (refined layout) -->
      <n-card style="margin-bottom: 24px">
        <div class="profile-main">
          <div class="profile-main__left">
            <div class="avatar">
              <template v-if="form && form.picture_url">
                <img :src="form.picture_url" alt="avatar" />
              </template>
              <template v-else>
                <div class="avatar__initials">{{ initials }}</div>
              </template>
            </div>
            <div class="actions">
              <n-button type="default" @click="resetSettings">ביטול</n-button>
              <n-button type="primary" :loading="saving" @click="saveProfile">ערוך פרופיל</n-button>
            </div>
          </div>

          <div class="profile-main__right">
            <div class="profile-info">
              <h2>{{ form?.name }}</h2>
              <div class="muted">{{ form?.email }}</div>
              <div class="role-tag" style="margin-top:8px;">
                <n-tag :type="form?.role === 'admin' ? 'warning' : 'info'">
                  {{ form?.role === 'admin' ? '👑 מנהל' : '👤 משתמש' }}
                </n-tag>
              </div>
            </div>

            <div class="stats">
              <div class="stat">
                <div class="stat__num">24</div>
                <div class="stat__label muted">תזכורות פעילות</div>
              </div>
              <div class="stat">
                <div class="stat__num">8</div>
                <div class="stat__label muted">הושעו</div>
              </div>
              <div class="stat">
                <div class="stat__num">12</div>
                <div class="stat__label muted">הושלמו</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Expanded settings below -->
          <n-form label-placement="top" v-if="userSettings" style="margin-top:16px">
            <n-form-item label="ערכת נושא">
              <n-radio-group v-model:value="userSettings.theme">
                <n-radio value="light">☀️ בהיר</n-radio>
                <n-radio value="dark">🌙 כהה</n-radio>
              </n-radio-group>
            </n-form-item>

            <n-grid :cols="2" :x-gap="16">
              <n-gi>
                <n-form-item label="שם שולח אימייל">
                  <n-input v-model:value="userSettings.email_from_name" placeholder="לדוגמה:  ReminderOCR " />
                </n-form-item>
              </n-gi>

              <n-gi>
                <n-form-item label="ימים מראש לתזכורת">
                  <n-input v-model:value="reminderAdvanceDays" placeholder="90, 60, 30" @input="updateReminderDays" />
                </n-form-item>
              </n-gi>
            </n-grid>

            <n-form-item label="שפה לזיהוי טקסט (OCR)">
              <n-input v-model:value="userSettings.ocr_language" placeholder="heb+eng" />
            </n-form-item>

            <template #action>
              <n-button @click="resetSettings">ביטול</n-button>
              <n-button type="primary" :loading="savingSettings" @click="saveSettings">שמור</n-button>
            </template>
          </n-form>
      </n-card>

      <!-- Danger Zone remains unchanged -->
      <n-card style="margin-bottom: 24px">
          <span style="color: var(--error-color); font-weight: 600;">⚠️ אזור סכנה</span>

        <n-alert type="error" style="margin-bottom: 16px">
          פעולות אלו לא ניתנות להחזרה
        </n-alert>

        <n-space vertical>
          <div>
            <p style="margin: 0 0 8px 0; font-weight: 500;">🚪 התנתק מכל המכשירים</p>
            <p style="margin: 0 0 12px 0; font-size: 13px; color: var(--text-secondary);">
              יסיים את כל ההפעלות הפעילות בכל המכשירים
            </p>
            <n-button type="error" :loading="disconnecting" @click="disconnectAllSessions">
              התנתק מהכל
            </n-button>
          </div>
        </n-space>
      </n-card>

    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import {
  NCard, NForm, NFormItem, NInput, NButton, NSpace, NSpin, NGrid, NGi,
  NRadioGroup, NRadio, NTag, NAlert, NText, useMessage,
} from 'naive-ui';
import type { User, UserSettings } from '@shared/types.js';
import { useAuthStore } from '../stores/auth.js';

const message = useMessage();
const authStore = useAuthStore();

// State
const loading = ref(true);
const saving = ref(false);
const savingSettings = ref(false);
const disconnecting = ref(false);

const form = ref<Partial<User> | null>(null);
const userSettings = ref<UserSettings | null>(null);
const reminderAdvanceDays = ref('90, 60, 30');

const initials = computed(() => {
  const name = form.value?.name || '';
  if (!name) return '';
  return name.split(' ').filter(Boolean).slice(0,2).map(n => n[0]).join('').toUpperCase();
});

onMounted(async () => {
  try {
    const u = authStore.user;
    form.value = u ? {
      id: u.id,
      email: u.email,
      name: u.name,
      picture_url: u.picture_url,
      role: u.role,
      is_active: 1,
      google_sub: '',
      created_at: '',
      last_login_at: null,
    } : null;

    const res = await fetch('/api/user-settings', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json() as UserSettings;
      userSettings.value = data;
      reminderAdvanceDays.value = JSON.parse(data.reminder_advance_days).join(', ');
    }
  } catch {
    // silently continue — settings panel just won't show
  } finally {
    loading.value = false;
  }
});

function updateReminderDays(value: string) {
  reminderAdvanceDays.value = value;
}

async function saveProfile() {
  message.info('הפרופיל מנוהל על ידי Google — אין צורך לעדכן ידנית');
}

async function saveSettings() {
  if (!userSettings.value) return;

  savingSettings.value = true;
  try {
    const days = reminderAdvanceDays.value
      .split(',')
      .map(x => parseInt(x.trim()))
      .filter(x => !isNaN(x));
    userSettings.value.reminder_advance_days = JSON.stringify(days);

    await fetch('/api/user-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(userSettings.value),
    });
    message.success('ההגדרות שמורות בהצלחה');
  } catch {
    message.error('שגיאה בשמירת ההגדרות');
  } finally {
    savingSettings.value = false;
  }
}

function resetSettings() {
  if (userSettings.value) {
    reminderAdvanceDays.value = JSON.parse(userSettings.value.reminder_advance_days).join(', ');
  }
}

async function disconnectAllSessions() {
  disconnecting.value = true;
  try {
    message.success('התנתקת מכל המכשירים');
    await authStore.logout();
  } catch {
    message.error('שגיאה בהתנתקה');
  } finally {
    disconnecting.value = false;
  }
}
</script>

<style scoped>
.profile-page {
  max-width: 1100px;
}

.profile-header {
  margin-bottom: 24px;
}

.profile-header h1 {
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
}

.profile-header__desc {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.profile-main {
  display: flex;
  gap: 24px;
}

.profile-main__left {
  width: 260px;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:12px;
}

.avatar {
  width:136px;
  height:136px;
  border-radius:68px;
  background:#DDEAFE;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:36px;
  color:#0F172A;
  font-weight:700;
}

.avatar img { width:100%; height:100%; object-fit:cover; border-radius:68px }

.actions { display:flex; gap:8px }

.profile-main__right { flex:1 }

.profile-info h2 { margin:0; font-size:20px }
.muted { color:var(--text-secondary); font-size:13px }

.stats { display:flex; gap:12px; margin-top:16px }
.stat { background:#fff; border:1px solid var(--card-border); padding:12px; border-radius:8px; min-width:110px; text-align:center }
.stat__num { font-weight:700; font-size:18px }
.stat__label { font-size:12px; color:var(--text-secondary) }
</style>

