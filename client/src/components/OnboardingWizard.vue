<template>
  <n-modal :show="modelValue" :mask-closable="false" :close-on-esc="false" style="max-width: 640px; width: 95vw">
    <n-card :bordered="false" class="onboarding-card" role="dialog" aria-modal="true">
      <!-- Steps indicator -->
      <n-steps :current="currentStep" size="small" class="onboarding-steps">
        <n-step title="ברוכים הבאים" />
        <n-step title="פרטים" />
        <n-step title="מהנדס" />
        <n-step title="חברה" />
        <n-step title="חתימה" />
      </n-steps>

      <div class="onboarding-body">
        <!-- Step 1: Welcome -->
        <div v-if="currentStep === 1" class="step-content">
          <div class="welcome-hero">
            <div class="welcome-icon">📋</div>
            <h2 class="welcome-title">ברוכים הבאים ל-RemindOCR</h2>
            <p class="welcome-desc">
              מערכת חכמה לניהול תסקירים, חוזים ותזכורות.<br>
              בואו נגדיר כמה פרטים בסיסיים כדי להתחיל.
            </p>
          </div>
          <div class="welcome-features">
            <div class="welcome-feature">
              <span class="welcome-feature__icon">📄</span>
              <div>
                <strong>העלאת מסמכים</strong>
                <p>העלו PDF, תמונות או מסמכים — המערכת תחלץ את הנתונים אוטומטית</p>
              </div>
            </div>
            <div class="welcome-feature">
              <span class="welcome-feature__icon">🔔</span>
              <div>
                <strong>תזכורות אוטומטיות</strong>
                <p>קבלו תזכורות במייל לפני שתוקף חוזה או בדיקה פג</p>
              </div>
            </div>
            <div class="welcome-feature">
              <span class="welcome-feature__icon">📊</span>
              <div>
                <strong>דוחות ותסקירים</strong>
                <p>הפיקו תסקירים מקצועיים ודוחות חודשיים בלחיצה</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 2: Personal details -->
        <div v-if="currentStep === 2" class="step-content">
          <h3 class="step-title">פרטים אישיים</h3>
          <p class="step-desc">פרטים אלו ישמשו לזיהוי שלך במערכת ובתסקירים</p>
          <n-form label-placement="top" class="onboarding-form">
            <n-form-item label="שם מלא">
              <n-input v-model:value="form.name" placeholder="ישראל ישראלי" />
            </n-form-item>
            <n-form-item label="טלפון">
              <n-input v-model:value="form.phone" placeholder="052-1234567" dir="ltr" />
            </n-form-item>
            <n-form-item label="שם חברה">
              <n-input v-model:value="form.company_name" placeholder="לדוגמה: M.A.D הנדסה ובטיחות" />
            </n-form-item>
          </n-form>
        </div>

        <!-- Step 3: Engineer profile -->
        <div v-if="currentStep === 3" class="step-content">
          <h3 class="step-title">פרופיל מהנדס</h3>
          <p class="step-desc">פרטי הרישיון שלך — משמשים לתסקירים, סינון מסמכים ומספור אוטומטי</p>
          <n-form label-placement="top" class="onboarding-form">
            <n-form-item label="מספר רישוי">
              <n-input v-model:value="form.inspector_number" placeholder="12345" dir="ltr" />
            </n-form-item>
            <div class="form-row">
              <n-form-item label="כתובת">
                <n-input v-model:value="form.address" placeholder="רחוב ומספר" />
              </n-form-item>
              <n-form-item label="עיר">
                <n-input v-model:value="form.city" placeholder="תל אביב" />
              </n-form-item>
            </div>
            <n-form-item label="עוסק מורשה (ח.פ)">
              <n-input v-model:value="form.company_registration" placeholder="51646673" dir="ltr" />
            </n-form-item>
            <n-form-item label="מספר התחלת תסקירים">
              <n-input v-model:value="form.inspector_id_start" placeholder="לדוגמה: 16125" dir="ltr" />
              <template #feedback>
                <span v-if="form.inspector_number && form.inspector_id_start" class="id-preview">
                  התסקיר הראשון: {{ form.inspector_number }}/{{ form.inspector_id_start }}
                </span>
              </template>
            </n-form-item>
          </n-form>
        </div>

        <!-- Step 4: Company branding -->
        <div v-if="currentStep === 4" class="step-content">
          <h3 class="step-title">פרטי חברה ולוגו</h3>
          <p class="step-desc">פרטים אלו יופיעו בתסקירים, בדוחות ובמיילים שנשלחים ללקוחות</p>
          <n-form label-placement="top" class="onboarding-form">
            <n-form-item label="שם חברה לתסקירים">
              <n-input v-model:value="form.eng_company_name" :placeholder="form.company_name || 'שם החברה'" />
            </n-form-item>
            <n-form-item label="תיאור / כותרת">
              <n-input v-model:value="form.company_subtitle" placeholder="בדיקות בטיחות למתקני הרמה ומכלי לחץ" />
            </n-form-item>
            <div class="form-row">
              <n-form-item label="טלפון חברה" class="form-row__item">
                <n-input v-model:value="form.company_phone" placeholder="052-8195650" dir="ltr" />
              </n-form-item>
              <n-form-item label="אימייל חברה" class="form-row__item">
                <n-input v-model:value="form.company_email" placeholder="name@company.com" dir="ltr" />
              </n-form-item>
            </div>
            <n-form-item label="שם שולח במיילים">
              <n-input v-model:value="form.email_from_name" :placeholder="form.eng_company_name || form.company_name || 'RemindOCR'" />
            </n-form-item>
            <n-form-item label="לוגו חברה">
              <div class="logo-upload">
                <img v-if="logoPreview" :src="logoPreview" class="logo-preview" alt="לוגו" />
                <div v-else class="logo-placeholder">
                  <span>📷</span>
                  <span>העלו לוגו</span>
                </div>
                <input ref="logoInput" type="file" accept="image/*" style="display:none" @change="onLogoSelect" />
                <n-button size="small" secondary @click="(logoInput as HTMLInputElement)?.click()">
                  {{ logoPreview ? 'החלף לוגו' : 'בחר קובץ' }}
                </n-button>
              </div>
            </n-form-item>
          </n-form>
        </div>

        <!-- Step 5: Signature -->
        <div v-if="currentStep === 5" class="step-content">
          <h3 class="step-title">חתימה</h3>
          <p class="step-desc">העלו תמונת חתימה — תופיע בתסקירים שתפיקו. ניתן לדלג ולהוסיף בהמשך.</p>
          <div class="signature-upload-area">
            <img v-if="signaturePreview" :src="signaturePreview" class="signature-preview" alt="חתימה" />
            <div v-else class="signature-placeholder">
              <span class="signature-placeholder__icon">✍️</span>
              <span>גררו תמונת חתימה לכאן או לחצו לבחירה</span>
              <span class="signature-placeholder__hint">PNG או JPG, רקע שקוף מומלץ</span>
            </div>
            <input ref="sigInput" type="file" accept="image/*" style="display:none" @change="onSignatureSelect" />
            <n-button size="small" secondary @click="(sigInput as HTMLInputElement)?.click()" style="margin-top: 12px">
              {{ signaturePreview ? 'החלף חתימה' : 'בחר קובץ' }}
            </n-button>
          </div>

          <!-- Summary -->
          <div class="onboarding-summary">
            <h4>סיכום הפרטים</h4>
            <div class="summary-grid">
              <div v-if="form.name" class="summary-item">
                <span class="summary-label">שם</span>
                <span>{{ form.name }}</span>
              </div>
              <div v-if="form.inspector_number" class="summary-item">
                <span class="summary-label">מפקח</span>
                <span>{{ form.inspector_number }}</span>
              </div>
              <div v-if="form.eng_company_name || form.company_name" class="summary-item">
                <span class="summary-label">חברה</span>
                <span>{{ form.eng_company_name || form.company_name }}</span>
              </div>
              <div v-if="form.phone" class="summary-item">
                <span class="summary-label">טלפון</span>
                <span dir="ltr">{{ form.phone }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation buttons -->
      <div class="onboarding-footer">
        <n-button v-if="currentStep > 1" quaternary @click="currentStep--">
          חזרה
        </n-button>
        <div style="flex:1" />
        <n-button v-if="currentStep < 5" quaternary size="small" class="skip-btn" @click="skipAll">
          דלג על ההגדרה
        </n-button>
        <n-button
          type="primary"
          :loading="saving"
          @click="currentStep < 5 ? currentStep++ : finish()"
        >
          {{ currentStep < 5 ? 'הבא' : 'סיום והתחלה' }}
        </n-button>
      </div>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import {onMounted, ref} from "vue";
import {NButton, NCard, NForm, NFormItem, NInput, NModal, NStep, NSteps, useMessage} from "naive-ui";
import {useAuthStore} from "../stores/auth.js";
import {api} from "../services/apiService.js";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();

const message = useMessage();
const authStore = useAuthStore();
const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const currentStep = ref(1);
const saving = ref(false);

const form = ref({
  name: "",
  phone: "",
  company_name: "",
  inspector_number: "",
  address: "",
  city: "",
  company_registration: "",
  inspector_id_start: "",
  eng_company_name: "",
  company_subtitle: "",
  company_phone: "",
  company_email: "",
  email_from_name: "",
});

const logoInput = ref<HTMLInputElement | null>(null);
const sigInput = ref<HTMLInputElement | null>(null);
const logoFile = ref<File | null>(null);
const sigFile = ref<File | null>(null);
const logoPreview = ref<string | null>(null);
const signaturePreview = ref<string | null>(null);

onMounted(async () => {
  const user = authStore.user;
  if (user) {
    form.value.name = user.name ?? "";
    form.value.phone = user.phone ?? "";
    form.value.company_name = (user as any).company_name ?? "";
  }
  await authStore.fetchMe();
  const p = authStore.user;
  if (p) {
    form.value.inspector_number = p.inspector_number ?? "";
    form.value.address = p.address ?? "";
    form.value.city = p.city ?? "";
    form.value.company_registration = p.company_registration ?? "";
    form.value.inspector_id_start = p.inspector_id_start ?? "";
    form.value.eng_company_name = p.company_name ?? "";
    form.value.company_subtitle = p.company_subtitle ?? "";
    form.value.company_phone = p.company_phone ?? "";
    form.value.company_email = p.company_email ?? "";
    if (p.company_logo_url) logoPreview.value = p.company_logo_url;
  }
});

function onLogoSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  logoFile.value = file;
  logoPreview.value = URL.createObjectURL(file);
}

function onSignatureSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  sigFile.value = file;
  signaturePreview.value = URL.createObjectURL(file);
}

async function finish() {
  saving.value = true;
  try {
    // 1. Save the profile — one document, one request. The wizard asks for the
    // company name twice (personal step and engineer step); the engineer step's
    // answer is the one that was already winning when these were two calls.
    await authStore.save({
      name: form.value.name,
      phone: form.value.phone,
      inspector_number: form.value.inspector_number || null,
      address: form.value.address || null,
      city: form.value.city || null,
      company_registration: form.value.company_registration || null,
      inspector_id_start: form.value.inspector_id_start || null,
      company_name: form.value.eng_company_name || form.value.company_name || null,
      company_subtitle: form.value.company_subtitle || null,
      company_phone: form.value.company_phone || null,
      company_email: form.value.company_email || null,
    });

    // The profile is saved at this point. The uploads below are optional
    // extras, so a failure there is reported but must not present itself as
    // "nothing was saved" — the user would redo a step that already worked.
    const failedUploads: string[] = [];

    // 2. Upload logo if selected
    if (logoFile.value) {
      try {
        const fd = new FormData();
        fd.append("logo", logoFile.value);
        const res = await fetch(`${SERVER}/api/profile/company-logo`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        failedUploads.push("הלוגו");
      }
    }

    // 3. Upload signature if selected
    if (sigFile.value) {
      try {
        await api.templates.uploadUserAsset(sigFile.value, "signature");
      } catch {
        failedUploads.push("החתימה");
      }
    }

    // 4. Save email from name
    if (form.value.email_from_name) {
      await api.userSettings.save({email_from_name: form.value.email_from_name});
    }

    // 5. Mark onboarding complete — server only sets the flag if the core
    // fields (name/phone/company_name) actually came through.
    const completeRes = await fetch(`${SERVER}/api/profile/onboarding-complete`, {
      method: "POST",
      credentials: "include",
    });
    if (!completeRes.ok) throw new Error(`onboarding-complete ${completeRes.status}`);
    const {onboarding_completed: completed} = await completeRes.json();

    await authStore.fetchMe();
    emit("update:modelValue", false);
    if (failedUploads.length) {
      message.warning(`הפרטים נשמרו, אך העלאת ${failedUploads.join(" ו")} נכשלה — ניתן להעלות שוב מהפרופיל`);
    } else {
      message.success(completed ? "ההגדרה הושלמה בהצלחה!" : "הפרטים נשמרו — השלימו שם, טלפון וחברה כדי לסיים את ההגדרה");
    }
  } catch (error) {
    console.error("[onboarding] finish failed", error);
    message.error("שגיאה בשמירת הנתונים");
  } finally {
    saving.value = false;
  }
}

// Just dismisses the modal — does not mark onboarding complete, so the
// dashboard "finish setup" reminder keeps showing until the core fields
// are actually filled in.
function skipAll() {
  emit("update:modelValue", false);
}
</script>

<style scoped>
.onboarding-card {
  border-radius: 16px;
  overflow: hidden;
}

.onboarding-steps {
  padding: 0 8px 16px;
  overflow-x: auto;
}

.onboarding-steps :deep(.n-step-indicator) {
  flex-shrink: 0;
}

@media (max-width: 520px) {
  .onboarding-steps :deep(.n-step-content__title) {
    font-size: 11px;
  }
}

.onboarding-body {
  min-height: 320px;
  padding: 8px 0;
}

.step-content {
  animation: fadeIn 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Welcome step */
.welcome-hero {
  text-align: center;
  margin-bottom: 24px;
}

.welcome-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.welcome-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--text-primary);
}

.welcome-desc {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
  margin: 0;
}

.welcome-features {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.welcome-feature {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 16px;
  background: var(--bg-elevated, rgba(255,255,255,0.04));
  border-radius: 10px;
  border: 1px solid var(--border-color);
}

.welcome-feature__icon {
  font-size: 24px;
  flex-shrink: 0;
  margin-top: 2px;
}

.welcome-feature strong {
  display: block;
  font-size: 14px;
  margin-bottom: 2px;
  color: var(--text-primary);
}

.welcome-feature p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* Form steps */
.step-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 4px;
  color: var(--text-primary);
}

.step-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 20px;
}

.onboarding-form {
  max-width: 480px;
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-row__item {
  flex: 1;
}

.id-preview {
  color: var(--brand, #63e2b7);
  font-size: 12px;
}

/* Logo upload */
.logo-upload {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo-preview {
  max-height: 56px;
  max-width: 180px;
  border-radius: 8px;
  object-fit: contain;
  border: 1px solid var(--border-color);
  padding: 4px;
  background: rgba(255,255,255,0.05);
}

.logo-placeholder {
  width: 120px;
  height: 56px;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

/* Signature upload */
.signature-upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  margin-bottom: 20px;
}

.signature-preview {
  max-height: 80px;
  max-width: 300px;
  object-fit: contain;
}

.signature-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 14px;
}

.signature-placeholder__icon {
  font-size: 36px;
}

.signature-placeholder__hint {
  font-size: 12px;
  opacity: 0.6;
}

/* Summary */
.onboarding-summary {
  background: var(--bg-elevated, rgba(255,255,255,0.04));
  border-radius: 10px;
  padding: 16px;
  border: 1px solid var(--border-color);
}

.onboarding-summary h4 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 24px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}

.summary-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Footer */
.onboarding-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.skip-btn {
  opacity: 0.6;
  font-size: 12px;
}

/* Mobile */
@media (max-width: 640px) {
  .form-row {
    flex-direction: column;
    gap: 0;
  }
  .summary-grid {
    grid-template-columns: 1fr;
  }
  .welcome-features {
    gap: 10px;
  }
}
</style>
