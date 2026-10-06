<template>
  <div class="reports-page" :dir="dir">
    <PageHeader
      :title="l.reports.title"
      :subtitle="l.reports.subtitle"
    >
      <template #actions>
        <div class="reports-status" :class="{ 'is-active': form.enabled && autoReportsAllowed }">
          <span class="status-dot" aria-hidden="true"></span>
          <span>{{ autoReportsAllowed && form.enabled ? l.reports.autoOn : autoReportsAllowed ? l.reports.autoOff : l.reports.autoMissing }}</span>
        </div>
      </template>
    </PageHeader>

    <n-spin :show="loading">
      <div class="reports-layout">
      <section class="reports-panel reports-panel--generator">
        <div class="reports-panel__header">
          <div>
            <h2>{{ l.reports.generateTitle }}</h2>
            <p>{{ l.reports.generateBody }}</p>
          </div>
        </div>
        <div class="generator-controls">
          <n-form-item :label="l.reports.year" :show-feedback="false">
            <n-select v-model:value="reportYear" :options="yearOptions"/>
          </n-form-item>
          <n-form-item :label="l.reports.month" :show-feedback="false">
            <n-select v-model:value="reportMonth" :options="monthOptions" clearable :placeholder="l.reports.allYear"/>
          </n-form-item>
          <n-form-item :label="l.common.client" :show-feedback="false">
            <n-select v-model:value="selectedClientId" :options="clientOptions"/>
          </n-form-item>
        </div>
        <p v-if="selectedClientEmail" class="generator-recipient">{{ t("reports.recipientClient", {period: selectedPeriodLabel, email: selectedClientEmail}) }}</p>
        <p v-else-if="selectedReportClientId" class="generator-recipient generator-recipient--warning">{{ t("reports.recipientNoEmail", {period: selectedPeriodLabel}) }}</p>
        <p v-else class="generator-recipient">{{ l.reports.recipientAll }}</p>
        <div :class="{ 'field-selector--collapsed': !fieldsOpen }" class="field-selector">
          <div class="field-selector__head">
            <button
                :aria-expanded="fieldsOpen"
                class="field-selector__toggle"
                type="button"
                @click="fieldsOpen = !fieldsOpen"
            >
              <span :class="{ 'field-selector__caret--open': fieldsOpen }" class="field-selector__caret">▾</span>
              <span>{{ t("reports.fieldsSelected", {n: selectedFields.length}) }}</span>
            </button>
            <n-space v-if="fieldsOpen" size="small">
              <n-button text size="small" @click="selectedFields = [...defaultReportFields]">{{ l.reports.selectAll }}</n-button>
              <n-button text size="small" @click="selectedFields = []">{{ l.common.clear }}</n-button>
            </n-space>
          </div>
          <n-checkbox-group v-if="fieldsOpen" v-model:value="selectedFields">
            <div class="field-selector__grid">
              <n-checkbox v-for="field in activeReportFieldOptions" :key="field.key" :value="field.key">
                {{ field.label }}
              </n-checkbox>
            </div>
          </n-checkbox-group>
        </div>
        <div class="reports-actions reports-actions--generator">
          <n-tooltip v-if="!exportAllowed">
            <template #trigger>
              <span>
                <n-button :disabled="true" type="primary">{{ l.reports.downloadDocx }}</n-button>
              </span>
            </template>
            {{ exportLockedMessage }}
          </n-tooltip>
          <n-button v-else :loading="downloading === 'docx'" :disabled="!hasFields" type="primary" @click="downloadReport('docx')">{{ l.reports.downloadDocx }}</n-button>
          <n-tooltip v-if="!excelAllowed || !exportAllowed">
            <template #trigger>
              <span>
                <n-button :disabled="true" type="primary">{{ l.common.downloadXlsx }}</n-button>
              </span>
            </template>
            {{ exportAllowed ? excelLockedMessage : exportLockedMessage }}
          </n-tooltip>
          <n-button v-else :loading="downloading === 'xlsx'" :disabled="!hasFields" type="primary" @click="downloadReport('xlsx')">{{ l.common.downloadXlsx }}</n-button>
          <n-tooltip v-if="!autoReportsAllowed">
            <template #trigger>
              <span>
                <n-button :disabled="true" type="primary">{{ sendButtonLabel }}</n-button>
              </span>
            </template>
            {{ autoReportsLockedMessage }}
          </n-tooltip>
          <n-button v-else :loading="sending" :disabled="!canSendReport" type="primary" @click="sendNow">
            {{ sendButtonLabel }}
          </n-button>
        </div>
        <div class="generator-note">{{ t("reports.generatorNote", {period: selectedPeriodLabel}) }}</div>
      </section>
      <section class="reports-panel reports-panel--schedule">
        <div class="reports-panel__header">
          <div>
            <h2>{{ l.reports.emailTitle }}</h2>
            <p>{{ l.reports.emailBody }}</p>
            <p v-if="!autoReportsAllowed" class="hint">{{ autoReportsLockedMessage }}</p>
          </div>
          <n-switch v-model:value="form.enabled" :disabled="!autoReportsAllowed"/>
        </div>

        <n-divider/>
        <n-grid :cols="2" :x-gap="20" :y-gap="16" responsive="screen">
          <n-gi :span="2">
            <n-form-item :label="l.reports.recipients" :show-feedback="false">
              <n-input v-model:value="form.recipients" placeholder="email@example.com, another@example.com"/>
            </n-form-item>
            <p class="hint">{{ l.reports.recipientsHint }}</p>
          </n-gi>
          <n-gi>
            <n-form-item :label="l.reports.dayOfMonth">
              <n-select v-model:value="form.day" :options="dayOptions"/>
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item :label="l.reports.sendHour">
              <n-select v-model:value="form.hour" :options="hourOptions"/>
            </n-form-item>
          </n-gi>
          <n-gi :span="2">
            <n-form-item :label="l.reports.attachments">
              <n-space>
                <n-checkbox v-model:checked="form.docx">DOCX</n-checkbox>
                <n-checkbox v-model:checked="form.xlsx" :disabled="!excelAllowed || !exportAllowed">XLSX</n-checkbox>
              </n-space>
            </n-form-item>
          </n-gi>
        </n-grid>

        <n-alert v-if="form.lastSent" type="success" :show-icon="false" class="report-status">
          {{ t("reports.lastSent", {detail: formatLastSent(form.lastSent)}) }}
        </n-alert>
        <n-alert v-if="form.lastError" type="error" :show-icon="false" class="report-status">
          {{ t("reports.lastError", {error: form.lastError}) }}
        </n-alert>

        <div class="reports-actions">
          <n-button
            :loading="saving"
            type="primary"
            :disabled="!autoReportsAllowed"
            @click="saveSettings"
          >{{ l.reports.saveSettings }}</n-button>
          <n-button
            v-if="!autoReportsAllowed"
            ghost
            tag="a"
            href="https://remindocr.com/pricing"
          >{{ l.reports.upgrade }}</n-button>
        </div>
      </section>
      </div>
    </n-spin>
  </div>
</template>

<script lang="ts" setup>
import {computed, onMounted, reactive, ref, watch} from "vue";
import {
  NAlert,
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NDivider,
  NFormItem,
  NGi,
  NGrid,
  NInput,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTooltip,
  useMessage,
} from "naive-ui";
import {api} from "../services/apiService.js";
import {useUserSettingsStore} from "../stores/userSettings.js";
import {useAuthStore} from "../stores/auth.js";
import {
  planAllowsAutomaticMonthlyReports,
  planAllowsExcelExport,
  resolveUserPlan,
  PLAN_GATE_MESSAGES,
  featureFlagsForUser,
} from "../shared/pricingPlans.js";
import PageHeader from "../components/PageHeader.vue";
import {useI18n} from "../composables/useI18n.js";

const message = useMessage();
const {l, t, dir} = useI18n();
const userSettingsStore = useUserSettingsStore();
const authStore = useAuthStore();
const autoReportsAllowed = computed(() =>
  userSettingsStore.settings?.plan_entitlements?.automaticMonthlyReports
  ?? planAllowsAutomaticMonthlyReports(resolveUserPlan(authStore.user)),
);
const excelAllowed = computed(() =>
  userSettingsStore.settings?.plan_entitlements?.excelExport
  ?? planAllowsExcelExport(resolveUserPlan(authStore.user)),
);
const exportAllowed = computed(() => featureFlagsForUser(authStore.user).excelExport);
const autoReportsLockedMessage = PLAN_GATE_MESSAGES.automaticMonthlyReports;
const excelLockedMessage = PLAN_GATE_MESSAGES.excelExport;
const exportLockedMessage = "ייצוא דוחות זמין במסלולי בסיסי ועסקי בלבד.";
const loading = ref(true);
const saving = ref(false);
const sending = ref(false);
const downloading = ref<"docx" | "xlsx" | null>(null);
const now = new Date();
const reportYear = ref(now.getFullYear());
const reportMonth = ref<number | null>(now.getMonth() + 1);
const allClientsValue = "__all__";
const selectedClientId = ref<string>(allClientsValue);
const clientOptions = ref<Array<{label: string; value: string}>>([]);
const clientEmailById = ref<Record<string, string>>({});
const trackingReportFieldOptions = computed(() => {
  const f = l.value.reports.fields;
  return [
    {key: "tracking_date", label: f.trackingDate},
    {key: "tracking_checked", label: f.trackingChecked},
    {key: "tracking_holder_contact", label: f.trackingHolder},
    {key: "tracking_phone", label: f.trackingPhone},
    {key: "tracking_license_number", label: f.trackingLicense},
    {key: "tracking_notes", label: f.trackingNotes},
    {key: "tracking_relevant", label: f.trackingRelevant},
  ] as const;
});
const clientReportFieldOptions = computed(() => {
  const f = l.value.reports.fields;
  return [
    {key: "contract_number", label: f.contractNumber},
    {key: "contract_type", label: f.contractType},
    {key: "client", label: f.client},
    {key: "contact_person", label: f.contactPerson},
    {key: "contact_phone", label: f.contactPhone},
    {key: "contact_email", label: f.contactEmail},
    {key: "client_address", label: f.clientAddress},
    {key: "start_date", label: f.startDate},
    {key: "expiry_date", label: f.expiryDate},
    {key: "status", label: f.status},
    {key: "source_document", label: f.sourceDocument},
    {key: "equipment", label: f.equipment},
    {key: "reminders", label: f.reminders},
  ] as const;
});
const defaultTrackingReportFields = ["tracking_date", "tracking_checked", "tracking_holder_contact", "tracking_phone", "tracking_license_number", "tracking_notes", "tracking_relevant"];
const defaultClientReportFields = [
  "contract_number", "contract_type", "client", "contact_person", "contact_phone", "contact_email",
  "client_address", "start_date", "expiry_date", "status", "source_document", "equipment", "reminders",
];
const allClientReportFieldOptions = computed(() => [...trackingReportFieldOptions.value, ...clientReportFieldOptions.value]);
const defaultAllReportFields = [
  "tracking_date", "tracking_checked", "client","contact_person", "tracking_phone",
  "tracking_license_number", "tracking_relevant", "tracking_notes",
];
const selectedReportClientId = computed(() => selectedClientId.value === allClientsValue ? undefined : selectedClientId.value);
const activeReportFieldOptions = computed(() => selectedReportClientId.value ? clientReportFieldOptions.value : allClientReportFieldOptions.value);
const defaultReportFields = computed(() => selectedReportClientId.value ? defaultClientReportFields : defaultAllReportFields);
const selectedFields = ref<string[]>([...defaultAllReportFields]);
// Collapsed by default — the preselected defaults still apply, the list is just hidden.
const fieldsOpen = ref(false);
const form = reactive({
  enabled: false,
  recipients: "",
  day: 1,
  hour: 8,
  docx: true,
  xlsx: true,
  lastSent: null as string | null,
  lastError: null as string | null,
});

const yearOptions = Array.from({length: 8}, (_, index) => {
  const year = now.getFullYear() - 2 + index;
  return {label: String(year), value: year};
});
const monthOptions = computed(() =>
  l.value.reports.months.map((label, index) => ({label, value: index + 1})),
);
const dayOptions = Array.from({length: 28}, (_, i) => ({
  label: `${i + 1}`,
  value: i + 1,
}));
const hourOptions = Array.from({length: 24}, (_, hour) => ({
  label: `${String(hour).padStart(2, "0")}:00`,
  value: hour
}));
const hasFormat = computed(() => form.docx || form.xlsx);
const hasFields = computed(() => selectedFields.value.length > 0);
const canSendReport = computed(() => hasFormat.value && hasFields.value);
const selectedClientEmail = computed(() => selectedReportClientId.value ? clientEmailById.value[selectedReportClientId.value] ?? null : null);
const sendButtonLabel = computed(() => selectedReportClientId.value ? l.value.reports.sendClient : l.value.reports.sendCombined);
const selectedPeriodLabel = computed(() => reportMonth.value ? l.value.reports.periodMonth : l.value.reports.periodYear);

watch(selectedClientId, () => {
  selectedFields.value = fieldsForCurrentMode();
});

function currentReportMode(): "all" | "client" {
  return selectedReportClientId.value ? "client" : "all";
}

function fieldsForCurrentMode(): string[] {
  const config = userSettingsStore.settings?.report_config;
  const saved = currentReportMode() === "client" ? config?.client_fields : config?.all_fields;
  return Array.isArray(saved) && saved.length ? [...saved] : [...defaultReportFields.value];
}

function nextReportConfig() {
  const existing = userSettingsStore.settings?.report_config ?? {};
  return currentReportMode() === "client"
    ? {...existing, client_fields: [...selectedFields.value]}
    : {...existing, all_fields: [...selectedFields.value], client_fields: [...selectedFields.value]};
}

function parseFormats(raw: unknown): string[] {
  try {
    const parsed = Array.isArray(raw) ? raw : JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(parsed)) return ["docx", "xlsx"];
    const selected = parsed
      .map((format) => format === "doc" ? "docx" : format)
      .filter((format) => format === "docx" || format === "xlsx");
    return selected.length ? selected : ["docx", "xlsx"];
  } catch {
    return ["docx", "xlsx"];
  }
}

async function loadSettings() {
  loading.value = true;
  try {
    const [settings, clients] = await Promise.all([
      userSettingsStore.load(),
      api.clients.list({limit: 1000}),
    ]);
    if (!settings) throw new Error("Settings unavailable");
    clientOptions.value = [
      {label: l.value.documents.allClients, value: allClientsValue},
      ...clients.rows.map((client) => ({label: client.display_name, value: String(client.id)})),
    ];
    clientEmailById.value = Object.fromEntries(clients.rows.filter((client) => Boolean(client.email)).map((client) => [String(client.id), String(client.email)]));
    const formats = parseFormats(settings.monthly_report_formats);
    form.enabled = Boolean(settings.monthly_report_enabled) && autoReportsAllowed.value;
    form.recipients = settings.monthly_report_recipients ?? "";
    form.day = Math.min(28, Math.max(1, Number(settings.monthly_report_day ?? 1)));
    form.hour = Number(settings.monthly_report_hour ?? 8);
    form.docx = formats.length ? formats.includes("docx") : true;
    form.xlsx = excelAllowed.value && (formats.length ? formats.includes("xlsx") : true);
    form.lastSent = settings.monthly_report_last_sent ?? null;
    form.lastError = settings.monthly_report_last_error ?? null;
    selectedFields.value = fieldsForCurrentMode();
  } catch (error) {
    message.error(String(error));
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  if (!autoReportsAllowed.value) {
    message.warning(PLAN_GATE_MESSAGES.automaticMonthlyReports);
    return;
  }
  if (!hasFormat.value) {
    message.warning("יש לבחור לפחות סוג קובץ אחד");
    return;
  }
  saving.value = true;
  try {
    const saved = await userSettingsStore.save({
      monthly_report_enabled: form.enabled,
      monthly_report_recipients: form.recipients,
      monthly_report_day: form.day,
      monthly_report_hour: form.hour,
      monthly_report_formats: JSON.stringify([...(form.docx ? ["docx"] : []), ...(form.xlsx ? ["xlsx"] : [])]),
      report_config: nextReportConfig(),
    });
    form.lastSent = saved.monthly_report_last_sent ?? form.lastSent;
    form.lastError = saved.monthly_report_last_error ?? null;
    message.success("הגדרות הדוחות נשמרו");
  } catch (error) {
    message.error(String(error));
  } finally {
    saving.value = false;
  }
}

async function downloadReport(format: "docx" | "xlsx") {
  if (!exportAllowed.value) {
    message.warning(exportLockedMessage);
    return;
  }
  if (format === "xlsx" && !excelAllowed.value) {
    message.warning(PLAN_GATE_MESSAGES.excelExport);
    return;
  }
  downloading.value = format;
  try {
    await userSettingsStore.save({report_config: nextReportConfig()});
    await api.reports.downloadMonthly({year: reportYear.value, month: reportMonth.value ?? undefined, format, fields: selectedFields.value, clientId: selectedReportClientId.value});
    message.success(`דוח ${format.toUpperCase()} הורד בהצלחה`);
  } catch (error) {
    message.error(String(error));
  } finally {
    downloading.value = null;
  }
}

function formatLastSent(raw: string): string {
  const match = raw.match(/\((.+)\)$/);
  const locale = dir.value === "ltr" ? "en-GB" : "he-IL";
  if (match) {
    const d = new Date(match[1]);
    if (!isNaN(d.getTime())) {
      const period = raw.split(" ")[0];
      return t("reports.lastSentDate", {
        period,
        date: d.toLocaleDateString(locale),
        time: d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
      });
    }
  }
  return raw;
}

async function sendNow() {
  if (!autoReportsAllowed.value) {
    message.warning(PLAN_GATE_MESSAGES.automaticMonthlyReports);
    return;
  }
  if (!hasFormat.value) {
    message.warning("יש לבחור לפחות סוג קובץ אחד");
    return;
  }
  if (!hasFields.value) {
    message.warning("יש לבחור לפחות שדה אחד לדוח");
    return;
  }
  sending.value = true;
  try {
    await userSettingsStore.save({report_config: nextReportConfig()});
    const result = await api.reports.sendMonthly({
      year: reportYear.value,
      month: reportMonth.value ?? undefined,
      formats: [...(form.docx ? ["docx"] : []), ...(form.xlsx ? ["xlsx"] : [])],
      recipients: form.recipients.split(/[;,\s]+/).map((value) => value.trim()).filter(Boolean),
      clientId: selectedReportClientId.value,
      fields: selectedFields.value,
      deliveryMode: selectedReportClientId.value ? "client" : "combined",
    });
    if (!result.success) throw new Error(result.error ?? "Report delivery failed");
    message.success(selectedReportClientId.value
      ? `דוח הלקוח נשלח (${result.count ?? 0} רשומות)`
      : `הדוח הכולל נשלח אליך (${result.count ?? 0} רשומות)`);
    await loadSettings();
  } catch (error) {
    message.error(String(error));
  } finally {
    sending.value = false;
  }
}

onMounted(loadSettings);
</script>

<style scoped>
.reports-page {
  max-width: 1120px;
  margin: 0 auto;
}

.reports-status {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 9px 13px;
  color: var(--text-secondary);
  background: var(--bg-card);
  font-size: 13px;
  white-space: nowrap;
}

.reports-status.is-active {
  border-color: color-mix(in srgb, var(--color-success) 45%, var(--border-color));
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 12%, var(--bg-card));
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
}

.is-active .status-dot { background: var(--color-success); }

.reports-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  align-items: start;
  gap: 18px;
}

.reports-panel {
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 24px;
  background: var(--bg-card);
  box-shadow: 0 2px 9px rgb(26 37 49 / 4%);
}

.reports-panel--generator {
  border-top: 3px solid #3c82c4;
}

.reports-panel--schedule {
  border-top: 3px solid #18a66a;
}

.reports-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.reports-panel__header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  line-height: 1.3;
}

.reports-panel__header p {
  max-width: 440px;
  margin: 7px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.generator-controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  gap: 10px;
  margin-top: 24px;
}

.generator-controls :deep(.n-form-item) { margin: 0; }
.generator-controls :deep(.n-button) { min-height: 38px; width: 100%; }
.generator-controls :deep(.n-select) { width: 100%; }

.generator-recipient {
  margin: 14px 0 0;
  color: #08734e;
  font-size: 12px;
}

.generator-recipient--warning { color: #9a6700; }
.generator-note {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.reports-panel :deep(.n-divider) { margin: 22px 0; }
.reports-panel :deep(.n-form-item-label) { font-weight: 650; }
.reports-panel :deep(.n-checkbox) { margin-inline-end: 18px; }

.hint {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.field-selector {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  background: var(--bg-elevated);
}

.field-selector__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.field-selector__caret {
  display: inline-block;
  transition: transform 0.15s;
  font-size: 11px;
}

.field-selector__caret--open {
  transform: rotate(180deg);
}

.field-selector__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 12px;
}

/* Collapsed the panel is just its header, so drop the padding and the head's
   bottom margin that would otherwise leave an empty framed box. */
.field-selector--collapsed {
  padding: 8px 12px;
}

.field-selector--collapsed .field-selector__head {
  margin-bottom: 0;
}

.field-selector__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 16px;
}

.field-selector__grid :deep(.n-checkbox) { margin: 0; }
.report-status {
  margin-top: 18px;
}

.reports-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}

@media (max-width: 820px) {
  .reports-layout { grid-template-columns: 1fr; }
}

@media (max-width: 520px) {
  .reports-status {
    justify-content: center;
    width: 100%;
    white-space: normal;
    text-align: center;
  }

  .reports-panel { padding: 18px; }
  .reports-panel__header {
    align-items: stretch;
    flex-direction: column;
  }
  .generator-controls { grid-template-columns: 1fr; }
  .field-selector__head {
    align-items: stretch;
    flex-direction: column;
  }
  .field-selector__grid { grid-template-columns: 1fr; }
  .reports-panel :deep(.n-grid) {
    grid-template-columns: 1fr !important;
  }
  .reports-panel :deep(.n-gi) {
    grid-column: span 1 / span 1 !important;
  }
  .generator-controls :deep(.n-button) { width: 100%; }
  .reports-actions :deep(.n-button) { width: 100%; }
}
</style>
