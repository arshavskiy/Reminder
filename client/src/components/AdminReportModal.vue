<template>
  <n-modal :show="show" preset="card" :title="`דוח חודשי — ${userName}`" style="max-width: 640px; width: 95vw" @update:show="$emit('update:show', $event)">
    <div class="report-modal">
      <n-grid :cols="3" :x-gap="12" :y-gap="14">
        <n-gi>
          <n-form-item label="שנה" :show-feedback="false">
            <n-select v-model:value="year" :options="yearOptions" />
          </n-form-item>
        </n-gi>
        <n-gi>
          <n-form-item label="חודש" :show-feedback="false">
            <n-select v-model:value="month" :options="monthOptions" clearable placeholder="כל השנה" />
          </n-form-item>
        </n-gi>
        <n-gi>
          <n-form-item label="לקוח" :show-feedback="false">
            <n-select v-model:value="clientId" :options="clientOptions" :loading="loadingClients" clearable placeholder="כולם" />
          </n-form-item>
        </n-gi>
        <n-gi :span="3">
          <n-form-item label="נמענים (ריק = אימייל המשתמש)" :show-feedback="false">
            <n-input v-model:value="recipients" placeholder="email@example.com, another@example.com" />
          </n-form-item>
        </n-gi>
        <n-gi :span="3">
          <n-form-item label="קבצים מצורפים" :show-feedback="false">
            <n-space>
              <n-checkbox v-model:checked="docx">DOCX</n-checkbox>
              <n-checkbox v-model:checked="xlsx">XLSX</n-checkbox>
            </n-space>
          </n-form-item>
        </n-gi>
      </n-grid>

      <n-divider />

      <div class="field-selector">
        <div class="field-selector__head">
          <span>שדות בדוח: {{ selectedFields.length }} נבחרו</span>
          <n-space size="small">
            <n-button text size="small" @click="selectedFields = [...allFieldKeys]">בחר הכל</n-button>
            <n-button text size="small" @click="selectedFields = []">נקה</n-button>
          </n-space>
        </div>
        <n-checkbox-group v-model:value="selectedFields">
          <div class="field-selector__grid">
            <n-checkbox v-for="field in activeFieldOptions" :key="field.key" :value="field.key">{{ field.label }}</n-checkbox>
          </div>
        </n-checkbox-group>
      </div>

      <n-alert v-if="lastResult" :type="lastResult.success ? 'success' : 'error'" :show-icon="false" style="margin-top: 16px">
        {{ lastResult.success ? `נשלח (${lastResult.count ?? 0} רשומות)` : lastResult.error }}
      </n-alert>
    </div>

    <template #footer>
      <div style="display: flex; gap: 10px; justify-content: space-between; align-items: center; flex-wrap: wrap">
        <div style="display: flex; gap: 8px">
          <n-button :loading="downloading === 'docx'" :disabled="selectedFields.length === 0" @click="download('docx')">
            ⬇ DOCX
          </n-button>
          <n-button :loading="downloading === 'xlsx'" :disabled="selectedFields.length === 0" @click="download('xlsx')">
            ⬇ XLSX
          </n-button>
        </div>
        <div style="display: flex; gap: 8px">
          <n-button @click="$emit('update:show', false)">סגור</n-button>
          <n-button type="primary" :loading="sending" :disabled="!canSend" @click="send">שלח דוח</n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import {
  NAlert, NButton, NCheckbox, NCheckboxGroup, NDivider,
  NFormItem, NGi, NGrid, NInput, NModal, NSelect, NSpace,
  useMessage,
} from "naive-ui";

const props = defineProps<{
  show: boolean;
  userId: string;
  userName: string;
}>();
const emit = defineEmits<{ "update:show": [val: boolean] }>();
const message = useMessage();

const now = new Date();
const year = ref(now.getFullYear());
const month = ref<number | null>(now.getMonth() + 1);
const clientId = ref<string | null>(null);
const recipients = ref("");
const docx = ref(true);
const xlsx = ref(true);
const sending = ref(false);
const downloading = ref<"docx" | "xlsx" | null>(null);
const loadingClients = ref(false);
const clientOptions = ref<Array<{ label: string; value: string }>>([]);
const lastResult = ref<{ success: boolean; count?: number; error?: string } | null>(null);

// Must match server TRACKING_REPORT_FIELDS / MONTHLY_REPORT_FIELDS in monthlyReports.ts
const trackingFieldOptions = [
  { key: "tracking_date", label: "תאריך" },
  { key: "tracking_checked", label: "מה נבדק" },
  { key: "tracking_holder_contact", label: "תופש/איש קשר" },
  { key: "tracking_phone", label: "טלפון" },
  { key: "tracking_license_number", label: "מספר רישוי" },
  { key: "tracking_notes", label: "הערות" },
  { key: "tracking_relevant", label: "רלוונטי" },
];
const clientFieldOptions = [
  { key: "contract_number", label: "מספר חוזה" },
  { key: "contract_type", label: "סוג מסמך" },
  { key: "client", label: "לקוח" },
  { key: "contact_person", label: "איש קשר" },
  { key: "contact_phone", label: "טלפון" },
  { key: "contact_email", label: "אימייל" },
  { key: "client_address", label: "כתובת" },
  { key: "start_date", label: "תאריך התחלה" },
  { key: "expiry_date", label: "תאריך סיום / בדיקה הבאה" },
  { key: "status", label: "סטטוס" },
  { key: "amount", label: "סכום" },
  { key: "currency", label: "מטבע" },
  { key: "source_document", label: "מסמך מקור" },
  { key: "equipment", label: "ציוד" },
  { key: "reminders", label: "תזכורות" },
];
const allFieldOptions = [...trackingFieldOptions, ...clientFieldOptions];
const activeFieldOptions = computed(() => clientId.value ? clientFieldOptions : allFieldOptions);
const allFieldKeys = computed(() => activeFieldOptions.value.map((f) => f.key));
const selectedFields = ref<string[]>(allFieldKeys.value);

const yearOptions = Array.from({ length: 8 }, (_, i) => {
  const y = now.getFullYear() - 2 + i;
  return { label: String(y), value: y };
});
const monthOptions = [
  { label: "ינואר", value: 1 }, { label: "פברואר", value: 2 }, { label: "מרץ", value: 3 },
  { label: "אפריל", value: 4 }, { label: "מאי", value: 5 }, { label: "יוני", value: 6 },
  { label: "יולי", value: 7 }, { label: "אוגוסט", value: 8 }, { label: "ספטמבר", value: 9 },
  { label: "אוקטובר", value: 10 }, { label: "נובמבר", value: 11 }, { label: "דצמבר", value: 12 },
];

const canSend = computed(() => (docx.value || xlsx.value) && selectedFields.value.length > 0);

watch(() => props.show, async (open) => {
  if (!open) return;
  lastResult.value = null;
  clientId.value = null;
  selectedFields.value = allFieldOptions.map((f) => f.key);
  if (clientOptions.value.length) return;
  loadingClients.value = true;
  try {
    const res = await fetch(`/api/admin/users/${props.userId}/clients`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json() as Array<{ id: string | number; display_name: string }>;
      clientOptions.value = data.map((c) => ({ label: c.display_name, value: String(c.id) }));
    }
  } catch { /* no clients endpoint yet — that's fine */ } finally {
    loadingClients.value = false;
  }
});

watch(clientId, () => {
  selectedFields.value = [...allFieldKeys.value];
});

async function send() {
  sending.value = true;
  lastResult.value = null;
  try {
    const body: Record<string, unknown> = {
      year: year.value,
      month: month.value ?? undefined,
      formats: [...(docx.value ? ["docx"] : []), ...(xlsx.value ? ["xlsx"] : [])],
      fields: selectedFields.value,
      deliveryMode: clientId.value ? "client" : "combined",
    };
    if (clientId.value) body.clientId = clientId.value;
    const recipientList = recipients.value.split(/[;,\s]+/).map((e) => e.trim()).filter(Boolean);
    if (recipientList.length) body.recipients = recipientList;

    const res = await fetch(`/api/admin/monthly-reports/trigger/${props.userId}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { success: boolean; count?: number; error?: string };
    lastResult.value = data;
    if (data.success) message.success(`דוח נשלח (${data.count ?? 0} רשומות)`);
    else message.error(data.error ?? "שגיאה בשליחת הדוח");
  } catch (err) {
    lastResult.value = { success: false, error: String(err) };
    message.error(String(err));
  } finally {
    sending.value = false;
  }
}

async function download(format: "docx" | "xlsx") {
  if (selectedFields.value.length === 0) return;
  downloading.value = format;
  try {
    const params = new URLSearchParams({
      year: String(year.value),
      format,
      fields: selectedFields.value.join(","),
    });
    if (month.value != null) params.set("month", String(month.value));
    if (clientId.value) params.set("clientId", clientId.value);

    const res = await fetch(`/api/admin/monthly-reports/download/${props.userId}?${params}`, {
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Download failed" })) as { error?: string };
      throw new Error(err.error ?? "Download failed");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const period = month.value ? `${year.value}-${String(month.value).padStart(2, "0")}` : String(year.value);
    a.download = `report-${period}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(`דוח ${format.toUpperCase()} הורד`);
  } catch (err) {
    message.error(String(err));
  } finally {
    downloading.value = null;
  }
}
</script>

<style scoped>
.report-modal { direction: rtl; }
.field-selector {
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
</style>
