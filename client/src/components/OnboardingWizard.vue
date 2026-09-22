<template>
  <n-modal :show="modelValue" :mask-closable="false" :close-on-esc="false" style="max-width: 640px; width: 95vw">
    <n-card
      :bordered="false"
      class="onboarding-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      :dir="dir"
    >
      <h2 id="onboarding-title" class="onboarding-sr-title">{{ ob.welcomeTitle }}</h2>
      <n-steps :current="currentStep" size="small" class="onboarding-steps">
        <n-step :title="ob.stepWelcome" />
        <n-step :title="ob.stepDetails" />
        <n-step :title="ob.stepEngineer" />
        <n-step :title="ob.stepCompany" />
        <n-step :title="ob.stepSignature" />
      </n-steps>

      <div class="onboarding-body">
        <div v-if="currentStep === 1" class="step-content">
          <div class="welcome-hero">
            <div class="welcome-icon" aria-hidden="true">
              <n-icon :component="ClipboardOutline" :size="28" />
            </div>
            <h2 class="welcome-title">{{ ob.welcomeTitle }}</h2>
            <p class="welcome-desc">{{ ob.welcomeDesc }}</p>
          </div>
          <div class="welcome-plan">
            <div class="welcome-plan__head">
              <span class="welcome-plan__icon" aria-hidden="true">
                <n-icon :component="DiamondOutline" :size="22" />
              </span>
              <div>
                <span class="welcome-plan__kicker">{{ ob.planLabel }}</span>
                <strong class="welcome-plan__name">{{ pricingPlan.name }}</strong>
                <p v-if="trialDaysLeft" class="welcome-plan__meta">{{ trialDaysLeft }}</p>
              </div>
            </div>
            <p class="welcome-plan__blurb">{{ pricingPlan.blurb }}</p>
            <ul class="welcome-plan__features">
              <li v-for="feature in pricingPlan.features" :key="feature">
                <n-icon :component="CheckmarkCircleOutline" :size="16" />
                <span>{{ feature }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div v-if="currentStep === 2" class="step-content">
          <h2 class="step-title">{{ ob.personalTitle }}</h2>
          <p class="step-desc">{{ ob.personalDesc }}</p>
          <n-form label-placement="top" class="onboarding-form">
            <n-form-item :label="pp.fullName">
              <n-input v-model:value="form.name" :placeholder="ob.namePlaceholder" />
            </n-form-item>
            <n-form-item :label="pp.phone">
              <n-input v-model:value="form.phone" :placeholder="ob.phonePlaceholder" dir="ltr" />
            </n-form-item>
            <n-form-item :label="pp.companyName">
              <n-input v-model:value="form.company_name" :placeholder="pp.companyNamePlaceholder" />
            </n-form-item>
          </n-form>
        </div>

        <div v-if="currentStep === 3" class="step-content">
          <h2 class="step-title">{{ ob.engineerTitle }}</h2>
          <p class="step-desc">{{ ob.engineerDesc }}</p>
          <n-form label-placement="top" class="onboarding-form">
            <n-form-item :label="pp.licenseNumber">
              <n-input v-model:value="form.inspector_number" placeholder="12345" dir="ltr" />
            </n-form-item>
            <div class="form-row">
              <n-form-item :label="pp.address">
                <n-input v-model:value="form.address" :placeholder="pp.addressPlaceholder" />
              </n-form-item>
              <n-form-item :label="pp.city">
                <n-input v-model:value="form.city" :placeholder="pp.cityPlaceholder" />
              </n-form-item>
            </div>
            <n-form-item :label="pp.vatNumber">
              <n-input v-model:value="form.company_registration" :placeholder="pp.vatPlaceholder" dir="ltr" />
            </n-form-item>
            <n-form-item :label="pp.inspectionStart">
              <n-input v-model:value="form.inspector_id_start" :placeholder="pp.exampleNumber" dir="ltr" />
              <template #feedback>
                <span v-if="form.inspector_number && form.inspector_id_start" class="id-preview">
                  {{ t("onboarding.firstInspection", {id: `${form.inspector_number}/${form.inspector_id_start}`}) }}
                </span>
              </template>
            </n-form-item>
          </n-form>
        </div>

        <div v-if="currentStep === 4" class="step-content">
          <h2 class="step-title">{{ ob.companyTitle }}</h2>
          <p class="step-desc">{{ ob.companyDesc }}</p>
          <n-form label-placement="top" class="onboarding-form">
            <n-form-item :label="ob.companyNameForReports">
              <n-input v-model:value="form.eng_company_name" :placeholder="form.company_name || pp.companyName" />
            </n-form-item>
            <n-form-item :label="pp.companySubtitle">
              <n-input v-model:value="form.company_subtitle" :placeholder="pp.companySubtitlePlaceholder" />
            </n-form-item>
            <div class="form-row">
              <n-form-item :label="pp.companyPhone" class="form-row__item">
                <n-input v-model:value="form.company_phone" :placeholder="ob.phonePlaceholder" dir="ltr" />
              </n-form-item>
              <n-form-item :label="ob.companyEmail" class="form-row__item">
                <n-input v-model:value="form.company_email" placeholder="name@company.com" dir="ltr" />
              </n-form-item>
            </div>
            <n-form-item :label="ob.emailFromName">
              <n-input
                v-model:value="form.email_from_name"
                :placeholder="form.eng_company_name || form.company_name || 'RemindOCR'"
              />
            </n-form-item>
            <n-form-item :label="pp.companyLogo">
              <div class="logo-upload">
                <button
                  type="button"
                  class="logo-drop"
                  :class="{'logo-drop--filled': logoPreview}"
                  @click="logoInput?.click()"
                  @dragover.prevent
                  @drop.prevent="onLogoDrop"
                >
                  <img v-if="logoPreview" :src="logoPreview" class="logo-preview" :alt="pp.companyLogoAlt" />
                  <span v-else class="logo-placeholder">
                    <n-icon :component="ImageOutline" :size="22" />
                    <span>{{ ob.uploadLogo }}</span>
                  </span>
                </button>
                <input
                  ref="logoInput"
                  type="file"
                  accept="image/*"
                  class="file-input"
                  @change="onLogoSelect"
                />
                <n-button size="small" secondary @click="logoInput?.click()">
                  {{ logoPreview ? pp.replaceLogo : ob.chooseFile }}
                </n-button>
              </div>
            </n-form-item>
          </n-form>
        </div>

        <div v-if="currentStep === 5" class="step-content">
          <h2 class="step-title">{{ ob.signatureTitle }}</h2>
          <p class="step-desc">{{ ob.signatureDesc }}</p>
          <button
            type="button"
            class="signature-upload-area"
            @click="sigInput?.click()"
            @dragover.prevent
            @drop.prevent="onSignatureDrop"
          >
            <img v-if="signaturePreview" :src="signaturePreview" class="signature-preview" :alt="pp.signatureAlt" />
            <div v-else class="signature-placeholder">
              <n-icon :component="CreateOutline" :size="28" />
              <span>{{ ob.signatureDrop }}</span>
              <span class="signature-placeholder__hint">{{ ob.signatureHint }}</span>
            </div>
            <n-button size="small" secondary style="margin-top: 12px" @click.stop="sigInput?.click()">
              {{ signaturePreview ? pp.replaceSignature : ob.chooseFile }}
            </n-button>
          </button>
          <input
            ref="sigInput"
            type="file"
            accept="image/*"
            class="file-input"
            @change="onSignatureSelect"
          />

          <div class="onboarding-summary">
            <h3>{{ ob.summaryTitle }}</h3>
            <div class="summary-grid">
              <div v-if="form.name" class="summary-item">
                <span class="summary-label">{{ ob.summaryName }}</span>
                <span>{{ form.name }}</span>
              </div>
              <div v-if="form.inspector_number" class="summary-item">
                <span class="summary-label">{{ ob.summaryInspector }}</span>
                <span>{{ form.inspector_number }}</span>
              </div>
              <div v-if="form.eng_company_name || form.company_name" class="summary-item">
                <span class="summary-label">{{ ob.summaryCompany }}</span>
                <span>{{ form.eng_company_name || form.company_name }}</span>
              </div>
              <div v-if="form.phone" class="summary-item">
                <span class="summary-label">{{ ob.summaryPhone }}</span>
                <span dir="ltr">{{ form.phone }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="onboarding-footer">
        <n-button v-if="currentStep > 1" quaternary @click="currentStep--">
          {{ l.common.back }}
        </n-button>
        <div class="onboarding-footer__spacer" />
        <n-button v-if="currentStep < 5" quaternary size="small" class="skip-btn" @click="skipAll">
          {{ ob.skip }}
        </n-button>
        <n-button type="primary" :loading="saving" @click="currentStep < 5 ? currentStep++ : finish()">
          {{ currentStep < 5 ? ob.next : ob.finish }}
        </n-button>
      </div>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from "vue";
import {NButton, NCard, NForm, NFormItem, NIcon, NInput, NModal, NStep, NSteps, useMessage} from "naive-ui";
import {
  CheckmarkCircleOutline,
  ClipboardOutline,
  CreateOutline,
  DiamondOutline,
  ImageOutline,
} from "@vicons/ionicons5";
import {useAuthStore} from "../stores/auth.js";
import {api} from "../services/apiService.js";
import {useI18n} from "../composables/useI18n.js";
import {getPricingPlanForLocale, resolveUserPlan} from "../shared/pricingPlans.js";

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();

const message = useMessage();
const authStore = useAuthStore();
const {l, t, dir, locale} = useI18n();
const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const pricingPlan = computed(() => {
  const resolved = authStore.user ? resolveUserPlan(authStore.user) : "trial";
  const id = resolved === "expired" ? "trial" : resolved;
  return getPricingPlanForLocale(id, locale.value);
});

const trialDaysLeft = computed(() => {
  if (!authStore.user || resolveUserPlan(authStore.user) !== "trial") return "";
  const ends = authStore.user.trial_ends_at;
  if (!ends) return "";
  const parsed = new Date(ends);
  if (Number.isNaN(parsed.getTime())) return "";
  const days = Math.max(0, Math.ceil((parsed.getTime() - Date.now()) / 86_400_000));
  return t("onboarding.trialDaysLeft", {n: days});
});

const ob = computed(() => l.value.onboarding);
const pp = computed(() => l.value.profilePersonal);

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
    form.value.company_name = (user as {company_name?: string}).company_name ?? "";
  }
  if (!authStore.user) return;
  await authStore.fetchMe();
  const p = authStore.user;
  if (!p) return;
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
});

function takeImageFile(file: File | undefined, kind: "logo" | "signature") {
  if (!file || !file.type.startsWith("image/")) return;
  if (kind === "logo") {
    logoFile.value = file;
    logoPreview.value = URL.createObjectURL(file);
  } else {
    sigFile.value = file;
    signaturePreview.value = URL.createObjectURL(file);
  }
}

function onLogoSelect(e: Event) {
  takeImageFile((e.target as HTMLInputElement).files?.[0], "logo");
}

function onSignatureSelect(e: Event) {
  takeImageFile((e.target as HTMLInputElement).files?.[0], "signature");
}

function onLogoDrop(e: DragEvent) {
  takeImageFile(e.dataTransfer?.files?.[0], "logo");
}

function onSignatureDrop(e: DragEvent) {
  takeImageFile(e.dataTransfer?.files?.[0], "signature");
}

async function finish() {
  saving.value = true;
  try {
    const savedUser = await authStore.save({
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

    const failedUploads: string[] = [];

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
        failedUploads.push(ob.value.logoNoun);
      }
    }

    if (sigFile.value) {
      try {
        const fd = new FormData();
        fd.append("signature", sigFile.value);
        const res = await fetch(`${SERVER}/api/profile/signature`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        failedUploads.push(ob.value.signatureNoun);
      }
    }

    if (form.value.email_from_name) {
      await api.userSettings.save({email_from_name: form.value.email_from_name});
    }

    const completed = Boolean(savedUser?.onboarding_completed);
    await authStore.fetchMe();
    emit("update:modelValue", false);
    if (failedUploads.length) {
      message.warning(t("onboarding.uploadFailed", {files: failedUploads.join(ob.value.uploadJoin)}));
    } else {
      message.success(completed ? ob.value.saveOk : ob.value.savePartial);
    }
  } catch (error) {
    console.error("[onboarding] finish failed", error);
    message.error(ob.value.saveError);
  } finally {
    saving.value = false;
  }
}

function skipAll() {
  emit("update:modelValue", false);
}
</script>

<style scoped>
.onboarding-card {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: var(--bg-card);
  color: var(--text-primary);
}

.onboarding-sr-title {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
  animation: fadeIn 0.22s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .step-content {
    animation: none;
  }
}

.welcome-hero {
  text-align: center;
  margin-bottom: 24px;
}

.welcome-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: color-mix(in srgb, var(--brand-color) 16%, transparent);
  color: var(--brand-color);
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
  margin: 0 auto;
  max-width: 36em;
}

.welcome-plan {
  padding: 16px;
  background: var(--bg-elevated, color-mix(in srgb, var(--text-primary) 4%, transparent));
  border-radius: 12px;
  border: 1px solid var(--border-color);
  text-align: start;
}

.welcome-plan__head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 10px;
}

.welcome-plan__icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand-color) 12%, transparent);
  color: var(--brand-color);
}

.welcome-plan__kicker {
  display: block;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.welcome-plan__name {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.welcome-plan__meta {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--brand-color);
}

.welcome-plan__blurb {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.welcome-plan__features {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.welcome-plan__features li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-primary);
}

.welcome-plan__features li :deep(.n-icon) {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--brand-color);
}

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
  line-height: 1.5;
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
  color: var(--brand-color);
  font-size: 12px;
}

.logo-upload {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo-drop {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 120px;
  min-height: 56px;
  padding: 6px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
}

.logo-drop--filled {
  border-style: solid;
  background: var(--bg-elevated, color-mix(in srgb, var(--text-primary) 4%, transparent));
}

.logo-preview {
  max-height: 56px;
  max-width: 180px;
  border-radius: 6px;
  object-fit: contain;
}

.logo-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.file-input {
  display: none;
}

.signature-upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding: 24px;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  margin-bottom: 20px;
  background: transparent;
  cursor: pointer;
  color: inherit;
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
  text-align: center;
}

.signature-placeholder__hint {
  font-size: 12px;
  opacity: 0.7;
}

.onboarding-summary {
  background: var(--bg-elevated, color-mix(in srgb, var(--text-primary) 4%, transparent));
  border-radius: 10px;
  padding: 16px;
  border: 1px solid var(--border-color);
}

.onboarding-summary h3 {
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

.onboarding-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.onboarding-footer__spacer {
  flex: 1;
}

.skip-btn {
  opacity: 0.7;
  font-size: 12px;
}

@media (max-width: 640px) {
  .form-row {
    flex-direction: column;
    gap: 0;
  }
  .summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
