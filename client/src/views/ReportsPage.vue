<template>
  <div class="reports-page">
    <header class="reports-hero">
      <div>
        <div class="reports-hero__eyebrow">מרכז הדוחות</div>
        <h1>דוחות</h1>
        <p>הפקה, הורדה ושליחה חודשית של נתוני חוזים ותסקירים.</p>
      </div>
      <div class="reports-hero__status" :class="{ 'is-active': form.enabled }">
        <span class="status-dot" aria-hidden="true"></span>
        <span>{{ form.enabled ? "שליחה אוטומטית פעילה" : "שליחה אוטומטית כבויה" }}</span>
      </div>
    </header>

    <n-spin :show="loading">
      <div class="reports-layout">
      <section class="reports-panel reports-panel--generator">
        <div class="reports-panel__header">
          <div>
            <h2>הפקת דוח</h2>
            <p>הורד את נתוני החוזים והתסקירים של חודש מסוים.</p>
          </div>
        </div>
        <div class="generator-controls">
          <n-form-item label="שנת הדוח" :show-feedback="false">
            <n-select v-model:value="reportYear" :options="yearOptions"/>
          </n-form-item>
          <n-form-item label="חודש הדוח" :show-feedback="false">
            <n-select v-model:value="reportMonth" :options="monthOptions" clearable placeholder="כל השנה"/>
          </n-form-item>
          <n-form-item label="לקוח" :show-feedback="false">
            <n-select v-model:value="selectedClientId" :options="clientOptions"/>
          </n-form-item>
          <n-button :loading="downloading === 'docx'" :disabled="!hasFields" @click="downloadReport('docx')">הורד DOCX</n-button>
          <n-button :loading="downloading === 'xlsx'" :disabled="!hasFields" @click="downloadReport('xlsx')">הורד XLSX</n-button>
        </div>
        <p v-if="selectedClientEmail" class="generator-recipient">דוח לקוח {{ selectedPeriodLabel }} יישלח ללקוח: {{ selectedClientEmail }} וגם לנמענים/כתובת החשבון.</p>
        <p v-else-if="selectedReportClientId" class="generator-recipient generator-recipient--warning">ללקוח הנבחר לא מוגדר אימייל. דוח הלקוח {{ selectedPeriodLabel }} יישלח רק לנמענים/כתובת החשבון.</p>
        <p v-else class="generator-recipient">דוח כולל לכל הלקוחות יישלח רק לנמענים או לכתובת החשבון שלך.</p>
        <div class="field-selector">
          <div class="field-selector__head">
            <span>שדות בדוח: {{ selectedFields.length }} נבחרו</span>
            <n-space size="small">
              <n-button text size="small" @click="selectedFields = [...defaultReportFields]">בחר הכל</n-button>
              <n-button text size="small" @click="selectedFields = []">נקה</n-button>
            </n-space>
          </div>
          <n-checkbox-group v-model:value="selectedFields">
            <div class="field-selector__grid">
              <n-checkbox v-for="field in activeReportFieldOptions" :key="field.key" :value="field.key">
                {{ field.label }}
              </n-checkbox>
            </div>
          </n-checkbox-group>
        </div>
        <div class="reports-actions reports-actions--generator">
          <n-button :loading="sending" :disabled="!canSendReport" type="primary" @click="sendNow">
            {{ sendButtonLabel }}
          </n-button>
        </div>
        <div class="generator-note">הקבצים כוללים את פרטי הלקוח, תאריכים, ציוד ותזכורות המשויכים לרשומות עם בדיקה הבאה {{ selectedPeriodLabel }}.</div>
      </section>
      <section class="reports-panel reports-panel--schedule">
        <div class="reports-panel__header">
          <div>
            <h2>דוח חודשי במייל</h2>
            <p>המערכת תיצור את הקבצים ותשלח אותם אוטומטית פעם בחודש.</p>
          </div>
          <n-switch v-model:value="form.enabled"/>
        </div>

        <n-divider/>
        <n-grid :cols="2" :x-gap="20" :y-gap="16" responsive="screen">
          <n-gi :span="2">
            <n-form-item label="נמענים" :show-feedback="false">
              <n-input v-model:value="form.recipients" placeholder="email@example.com, another@example.com"/>
            </n-form-item>
            <p class="hint">השאר ריק כדי לשלוח לכתובת החשבון. אפשר להפריד כתובות בפסיק.</p>
          </n-gi>
          <n-gi>
            <n-form-item label="יום בחודש">
              <n-select v-model:value="form.day" :options="dayOptions"/>
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="שעת שליחה">
              <n-select v-model:value="form.hour" :options="hourOptions"/>
            </n-form-item>
          </n-gi>
          <n-gi :span="2">
            <n-form-item label="קבצים מצורפים">
              <n-space>
                <n-checkbox v-model:checked="form.docx">DOCX</n-checkbox>
                <n-checkbox v-model:checked="form.xlsx">XLSX</n-checkbox>
              </n-space>
            </n-form-item>
          </n-gi>
        </n-grid>

        <n-alert v-if="form.lastSent" type="success" :show-icon="false" class="report-status">
          הדוח האחרון נשלח עבור {{ form.lastSent }}.
        </n-alert>
        <n-alert v-if="form.lastError" type="error" :show-icon="false" class="report-status">
          השליחה האחרונה נכשלה: {{ form.lastError }}
        </n-alert>

        <div class="reports-actions">
          <n-button :loading="saving" type="primary" @click="saveSettings">שמור הגדרות</n-button>
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
  useMessage,
} from "naive-ui";
import {api} from "../services/apiService.js";

const message = useMessage();
const loading = ref(true);
const saving = ref(false);
const sending = ref(false);
const downloading = ref<"docx" | "xlsx" | null>(null);
const now = new Date();
const reportYear = ref(now.getFullYear());
const reportMonth = ref<number | null>(now.getMonth() + 1);
const allClientsValue = "__all__";
const selectedClientId = ref<string>(allClientsValue);
const clientOptions = ref<Array<{label: string; value: string}>>([{label: "כל הלקוחות", value: allClientsValue}]);
const clientEmailById = ref<Record<string, string>>({});
const trackingReportFieldOptions = [
  {key: "tracking_date", label: "תאריך"},
  {key: "tracking_checked", label: "מה נבדק"},
  {key: "tracking_holder_contact", label: "תופש/איש קשר"},
  {key: "tracking_phone", label: "טלפון"},
  {key: "tracking_license_number", label: "מספר רישוי"},
  {key: "tracking_notes", label: "הערות"},
  {key: "tracking_relevant", label: "רלוונטי"},
] as const;
const clientReportFieldOptions = [
  {key: "contract_number", label: "מספר חוזה"},
  {key: "contract_type", label: "סוג מסמך"},
  {key: "client", label: "לקוח"},
  {key: "contact_person", label: "איש קשר"},
  {key: "contact_phone", label: "טלפון"},
  {key: "contact_email", label: "אימייל"},
  {key: "client_address", label: "כתובת"},
  {key: "start_date", label: "תאריך התחלה"},
  {key: "expiry_date", label: "תאריך סיום / בדיקה הבאה"},
  {key: "status", label: "סטטוס"},
  {key: "amount", label: "סכום"},
  {key: "currency", label: "מטבע"},
  {key: "source_document", label: "מסמך מקור"},
  {key: "equipment", label: "ציוד"},
  {key: "reminders", label: "תזכורות"},
] as const;
const defaultTrackingReportFields = trackingReportFieldOptions.map((field) => field.key);
const defaultClientReportFields = clientReportFieldOptions.map((field) => field.key);
const allClientReportFieldOptions = [...trackingReportFieldOptions, ...clientReportFieldOptions] as const;
const defaultAllReportFields = [
  "tracking_date", "tracking_phone", "tracking_license_number", "tracking_notes",
  "tracking_relevant", "contract_type", "contact_person",
];
const selectedReportClientId = computed(() => selectedClientId.value === allClientsValue ? undefined : selectedClientId.value);
const activeReportFieldOptions = computed(() => selectedReportClientId.value ? clientReportFieldOptions : allClientReportFieldOptions);
const defaultReportFields = computed(() => selectedReportClientId.value ? defaultClientReportFields : defaultAllReportFields);
const selectedFields = ref<string[]>([...defaultAllReportFields]);
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
const monthOptions = [
  {label: "ינואר", value: 1},
  {label: "פברואר", value: 2},
  {label: "מרץ", value: 3},
  {label: "אפריל", value: 4},
  {label: "מאי", value: 5},
  {label: "יוני", value: 6},
  {label: "יולי", value: 7},
  {label: "אוגוסט", value: 8},
  {label: "ספטמבר", value: 9},
  {label: "אוקטובר", value: 10},
  {label: "נובמבר", value: 11},
  {label: "דצמבר", value: 12},
];
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
const sendButtonLabel = computed(() => selectedReportClientId.value ? "שלח דוח לקוח" : "שלח דוח כולל אליי");
const selectedPeriodLabel = computed(() => reportMonth.value ? "בחודש שנבחר" : "בשנה שנבחרה");

watch(selectedClientId, () => {
  selectedFields.value = [...defaultReportFields.value];
});

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
      api.userSettings.get(),
      api.clients.list({limit: 1000}),
    ]);
    clientOptions.value = [
      {label: "כל הלקוחות", value: allClientsValue},
      ...clients.rows.map((client) => ({label: client.display_name, value: String(client.id)})),
    ];
    clientEmailById.value = Object.fromEntries(clients.rows.filter((client) => Boolean(client.email)).map((client) => [String(client.id), String(client.email)]));
    const formats = parseFormats(settings.monthly_report_formats);
    form.enabled = Boolean(settings.monthly_report_enabled);
    form.recipients = settings.monthly_report_recipients ?? "";
    form.day = Math.min(28, Math.max(1, Number(settings.monthly_report_day ?? 1)));
    form.hour = Number(settings.monthly_report_hour ?? 8);
    form.docx = formats.length ? formats.includes("docx") : true;
    form.xlsx = formats.length ? formats.includes("xlsx") : true;
    form.lastSent = settings.monthly_report_last_sent ?? null;
    form.lastError = settings.monthly_report_last_error ?? null;
  } catch (error) {
    message.error(String(error));
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  if (!hasFormat.value) {
    message.warning("יש לבחור לפחות סוג קובץ אחד");
    return;
  }
  saving.value = true;
  try {
    const saved = await api.userSettings.save({
      monthly_report_enabled: form.enabled,
      monthly_report_recipients: form.recipients,
      monthly_report_day: form.day,
      monthly_report_hour: form.hour,
      monthly_report_formats: JSON.stringify([...(form.docx ? ["docx"] : []), ...(form.xlsx ? ["xlsx"] : [])]),
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
  downloading.value = format;
  try {
    await api.reports.downloadMonthly({year: reportYear.value, month: reportMonth.value ?? undefined, format, fields: selectedFields.value, clientId: selectedReportClientId.value});
    message.success(`דוח ${format.toUpperCase()} הורד בהצלחה`);
  } catch (error) {
    message.error(String(error));
  } finally {
    downloading.value = null;
  }
}

async function sendNow() {
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
  padding: 32px 28px 56px;
}

.reports-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 28px;
  padding: 4px 2px;
}

.reports-hero__eyebrow {
  color: var(--brand-color);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}

.reports-hero h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: 30px;
  font-weight: 750;
  line-height: 1.15;
}

.reports-hero p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.reports-hero__status {
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

.reports-hero__status.is-active {
  border-color: #9edfc7;
  color: #08734e;
  background: #effbf6;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a7afb8;
}

.is-active .status-dot { background: #18a66a; }

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
  align-items: center;
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

.field-selector__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 12px;
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
  .reports-page { padding: 24px 16px 40px; }
  .reports-hero { align-items: flex-start; flex-direction: column; gap: 16px; }
  .reports-layout { grid-template-columns: 1fr; }
}

@media (max-width: 520px) {
  .reports-page {
    padding: 18px 10px 34px;
  }

  .reports-hero__status {
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
