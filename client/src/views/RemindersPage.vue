<template>
  <div>
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
<!--      <n-h2 style="margin: 0">תזכורות</n-h2>-->
      <n-space>
        <n-button :loading="store.loading" @click="store.fetch({ status: statusFilter.value ?? undefined, limit: 100 }, true)">↻ רענן</n-button>
        <n-button @click="quickTest" :loading="testing" :disabled="!testEmail">
          🧪 תזכורת בדיקה
        </n-button>
        <n-button type="primary" @click="openCreate">+ תזכורת חדשה</n-button>
      </n-space>
    </n-space>

    <n-alert
      v-if="!testEmail"
      type="warning"
      style="margin-bottom: 16px"
      :show-icon="false"
    >
      להפעלת "תזכורת בדיקה" יש להגדיר כתובת לבדיקות ב-
      <router-link to="/settings" style="color: #63e2b7">הגדרות   אימייל</router-link>
    </n-alert>

    <n-space style="margin-bottom: 16px">
      <n-select
        v-model:value="statusFilter"
        :options="statusOptions"
        :virtual-scroll="false"
        placeholder="כל הסטטוסים"
        clearable
        style="width: 160px"
        @update:value="load"
      />
    </n-space>

    <n-data-table
      :columns="columns"
      :data="store.rows"
      :loading="store.loading"
      :pagination="{ pageSize: 20 }"
      :row-key="(r: any) => r.id"
    />

    <!-- Quick-test modal -->
    <n-modal v-model:show="showQuickTest" title="🧪 שליחת תזכורת בדיקה" :show-icon="false" preset="dialog" style="width: 420px">
      <n-form label-placement="top">
        <n-form-item label="נמען">
          <n-input :value="testEmail" disabled />
        </n-form-item>
        <n-form-item label="תבנית אימייל">
          <n-select
            v-model:value="quickTestTemplateId"
            :options="emailTemplateOptions"
            :virtual-scroll="false"
            placeholder="ברירת מחדל"
            clearable
          />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showQuickTest = false">ביטול</n-button>
        <n-button type="primary" :loading="testing" @click="doQuickTest">שלח</n-button>
      </template>
    </n-modal>

    <!-- Create reminder modal -->
    <n-modal v-model:show="showCreate" title="תזכורת חדשה" :show-icon="false" preset="dialog" style="width: 520px">
      <n-form label-placement="top" v-if="newReminder">
        <n-form-item label="לקוח" required>
          <n-select
            v-model:value="newReminder.client_id"
            :options="clientOptions"
            :virtual-scroll="false"
            placeholder="בחר לקוח..."
            filterable
            @update:value="onPickClient"
          />
        </n-form-item>
        <n-form-item label="תסקיר/חוזה (אופציונלי)">
          <n-select
            v-model:value="newReminderContractId"
            :options="contractOptions"
            :virtual-scroll="false"
            :loading="loadingContracts"
            :disabled="!newReminder.client_id"
            placeholder="בחר תסקיר/חוזה לשליפת נתונים..."
            filterable
            clearable
            @update:value="onPickContract"
          />
        </n-form-item>
        <n-form-item label="כותרת" required>
          <n-input v-model:value="newReminder.title" placeholder="לדוגמה: חידוש ביטוח רכב" />
        </n-form-item>
        <n-form-item label="תאריך תזכורת (מתי לשלוח)" required>
          <n-date-picker v-model:value="triggerDateMs" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="אימייל נמען" required>
          <n-input
            v-model:value="newReminder.email_to"
            :placeholder="emailPlaceholder"
          />
        </n-form-item>
        <n-form-item label="תבנית אימייל">
          <n-select
            v-model:value="newReminder.email_template_id"
            :options="emailTemplateOptions"
            :virtual-scroll="false"
            placeholder="ברירת מחדל"
            clearable
          />
        </n-form-item>
        <n-form-item label="תוכן">
          <n-input v-model:value="newReminder.body" type="textarea" :rows="3" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showCreate = false">ביטול</n-button>
        <n-button type="primary" :loading="creating" @click="doCreate">צור תזכורת</n-button>
      </template>
    </n-modal>

    <!-- Edit reminder modal -->
    <n-modal v-model:show="showEditDate" title="עריכת תזכורת" :show-icon="false" preset="dialog" style="width: 380px">
      <n-form label-placement="top" v-if="editingReminder">
        <n-form-item label="כותרת">
          <n-input :value="editingReminder.title" disabled />
        </n-form-item>
        <n-form-item label="תאריך שליחה" required>
          <n-date-picker v-model:value="editDateMs" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="אימייל נמען" required>
          <n-input v-model:value="editEmailTo" placeholder="כתובת אימייל אחת או יותר, מופרדות בפסיק" />
        </n-form-item>
        <n-form-item label="תבנית אימייל">
          <n-select
            v-model:value="editEmailTemplateId"
            :options="emailTemplateOptions"
            :virtual-scroll="false"
            placeholder="ברירת מחדל"
            clearable
          />
        </n-form-item>

        <n-divider style="margin: 4px 0 12px" title-placement="right">ציוד (יישלח בתבנית האימייל)</n-divider>
        <n-form-item label="סוג ציוד">
          <n-select
            v-model:value="editEquipmentType"
            :options="equipmentCategoryOptions"
            :virtual-scroll="false"
            placeholder="בחר קטגוריה"
            clearable
          />
        </n-form-item>
        <n-form-item label="יצרן">
          <n-input v-model:value="editManufacturer" placeholder="יצרן" />
        </n-form-item>
        <n-form-item label="דגם">
          <n-input v-model:value="editModel" placeholder="דגם" />
        </n-form-item>
        <n-form-item label='מס"ד סידורי'>
          <n-input v-model:value="editSerialNumber" placeholder='מס"ד סידורי' />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showEditDate = false">ביטול</n-button>
        <n-button type="primary" :loading="savingDate" @click="doSaveDate">שמור</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import {computed, h, onMounted, ref} from "vue";
import {useRouter} from "vue-router";
import {
  NAlert,
  NButton,
  NDataTable,
  NDatePicker,
  NDivider,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSelect,
  NSpace,
  useMessage,
} from "naive-ui";
import {useRemindersStore} from "../stores/reminders.js";
import {useSettingsStore} from "../stores/settings.js";
import {useClientsStore} from "../stores/clients.js";
import {useAuthStore} from "../stores/auth.js";
import {api} from "../services/apiService.js";
import {useConfirm} from "../composables/useConfirm.js";
import StatusBadge from "../components/StatusBadge.vue";
import type {Client, EmailTemplate, EquipmentCategory, ReminderWithContext, ContractWithClient} from "@shared/types.js";

// Date-only strings (YYYY-MM-DD) must round-trip through the date picker using
// local calendar days, not UTC — new Date("2026-08-01").getTime() parses as
// UTC midnight, which n-date-picker then displays in local time. In any
// timezone behind UTC that silently shows (and can save) the previous day.
function localDateToMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
function msToLocalDateStr(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const store = useRemindersStore();
const settingsStore = useSettingsStore();
const clientsStore = useClientsStore();
const authStore = useAuthStore();
const { confirm } = useConfirm();

// testEmail: admin can configure a custom address in settings; all others default to their own email
const testEmail = ref<string | null>(authStore.user?.email || "");
const router = useRouter();
const message = useMessage();

const statusFilter = ref<string | null>("pending");
const showCreate = ref(false);
const showQuickTest = ref(false);
const quickTestTemplateId = ref<string | null>(null);
const creating = ref(false);
const testing = ref(false);
const triggerDateMs = ref<number | null>(Date.now());
const emailTemplates = ref<EmailTemplate[]>([]);
const newReminder = ref<{
  client_id: number | null;
  title: string;
  email_to: string;
  body: string;
  email_template_id: string | null;
} | null>(null);
const newReminderContractId = ref<string | null>(null);
const newReminderContracts = ref<ContractWithClient[]>([]);
const loadingContracts = ref(false);

const clientOptions = computed(() =>
  clientsStore.rows.map((c: Client) => ({
    label: c.email ? `${c.display_name}  ·  ${c.email}` : c.display_name,
    value: c.id,
  }))
);

const emailTemplateOptions = computed(() =>
  emailTemplates.value.map((t) => ({
    label: t.is_default ? `${t.name}  (ברירת מחדל)` : t.name,
    value: t.id,
  }))
);

const contractOptions = computed(() =>
  newReminderContracts.value.map((c) => {
    const parts = [
      c.contract_number || "ללא מספר",
      c.contract_type || "חוזה",
      c.expiry_date ? `תוקף עד ${c.expiry_date}` : null,
      contractEquipmentLabel(c),
    ].filter(Boolean);
    return {
      label: parts.join(" · "),
      value: String(c.id),
    };
  })
);

const emailPlaceholder = computed(() => {
  if (!newReminder.value?.client_id) return "ייקבע אוטומטית לפי הלקוח";
  const c = clientsStore.rows.find((x) => x.id === newReminder.value!.client_id);
  return c?.email ?? testEmail.value ?? "אין אימייל ללקוח";
});

const statusOptions = [
  { label: "ממתין", value: "pending" },
  { label: "נשלח", value: "sent" },
  { label: "נדחה", value: "snoozed" },
  { label: "בוטל", value: "dismissed" },
  { label: "שגיאה", value: "error" },
];

function load() {
  store.fetch({ status: statusFilter.value ?? undefined, limit: 100 }, true);
}

onMounted(async () => {
  const [, templates] = await Promise.all([
    clientsStore.rows.length ? Promise.resolve() : clientsStore.fetch({ limit: 500 }),
    api.emailTemplates.list(),
  ]);
  emailTemplates.value = templates;
  load();
});

// ── Create new reminder ─────────────────────────────────────────────────────
function openCreate() {
  // Default to the periodic-inspection template, since that's what most
  // manually-created reminders are for; fall back to whichever template is
  // marked is_default if it isn't found.
  const inspectionTpl = emailTemplates.value.find((t) => t.name === "תסקיר בדיקה תקופתית");
  const defaultTpl = inspectionTpl ?? emailTemplates.value.find((t) => t.is_default);
  newReminder.value = {
    client_id: null,
    title: "",
    email_to: "",
    body: "",
    email_template_id: defaultTpl?.id ?? null,
  };
  newReminderContractId.value = null;
  newReminderContracts.value = [];
  triggerDateMs.value = Date.now();
  showCreate.value = true;
}

// When the user picks a client, fetch their contracts and auto-fill email/title/body.
async function onPickClient(clientId: number | null) {
  if (!newReminder.value) return;
  const c = clientsStore.rows.find((x) => x.id === clientId);
  if (!c) return;
  if (c.email) newReminder.value.email_to = c.email;
  if (!newReminder.value.title.trim()) newReminder.value.title = `תזכורת עבור ${c.display_name}`;
  if (!newReminder.value.body.trim() && c.notes) newReminder.value.body = c.notes;

  // Fetch contracts for this client
  newReminderContractId.value = null;
  newReminderContracts.value = [];
  loadingContracts.value = true;
  try {
    const result = await api.contracts.list({ clientId: String(clientId), limit: 100 });
    newReminderContracts.value = result.rows;
  } catch {
    newReminderContracts.value = [];
  } finally {
    loadingContracts.value = false;
  }
}

// When the user picks a contract, auto-populate reminder fields from contract data.
function onPickContract(contractId: string | null) {
  if (!newReminder.value || !contractId) return;
  const contract = newReminderContracts.value.find((c) => String(c.id) === contractId);
  if (!contract) return;

  // Use contract type + number as default title if user hasn't typed one
  if (!newReminder.value.title.trim() || newReminder.value.title.startsWith("תזכורת עבור")) {
    const number = contract.contract_number ? ` ${contract.contract_number}` : "";
    newReminder.value.title = `${contract.contract_type || "תסקיר/חוזה"}${number}`.trim();
  }
  if (contract.expiry_date) triggerDateMs.value = localDateToMs(contract.expiry_date);
  if (contract.contact_email) newReminder.value.email_to = contract.contact_email;
  if (!newReminder.value.body.trim()) {
    newReminder.value.body = contractBody(contract);
  }
}

function contractEquipmentLabel(contract: ContractWithClient): string | null {
  const first = contract._equipment?.[0];
  return first?.name || contract.equipment_description || first?.model || first?.serial_number || null;
}

function contractBody(contract: ContractWithClient): string {
  const lines = [
    contract.contract_type ? `סוג: ${contract.contract_type}` : null,
    contract.contract_number ? `מספר: ${contract.contract_number}` : null,
    contract.start_date ? `תאריך התחלה: ${contract.start_date}` : null,
    contract.expiry_date ? `תאריך תפוגה: ${contract.expiry_date}` : null,
    contractEquipmentLabel(contract) ? `ציוד: ${contractEquipmentLabel(contract)}` : null,
    contract.summary,
  ].filter(Boolean);
  return lines.join("\n");
}

function selectedContract(): ContractWithClient | null {
  if (!newReminderContractId.value) return null;
  return newReminderContracts.value.find((c) => String(c.id) === newReminderContractId.value) ?? null;
}

function firstContractEquipment(contract: ContractWithClient | null) {
  return contract?._equipment?.[0] ?? null;
}

function normalizeEmailTo(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (t.startsWith("[")) return t;
  const list = t.split(",").map((s) => s.trim()).filter(Boolean);
  return JSON.stringify(list);
}

async function doCreate() {
  if (!newReminder.value) return;
  if (!newReminder.value.client_id) {
    message.warning("יש לבחור לקוח");
    return;
  }
  if (!newReminder.value.title.trim() || !triggerDateMs.value) {
    message.warning("יש להזין כותרת ותאריך");
    return;
  }
  if (!newReminder.value.email_to.trim()) {
    message.warning("יש להזין כתובת אימייל");
    return;
  }
  creating.value = true;
  try {
    const triggerDate = msToLocalDateStr(triggerDateMs.value);
    const contract = selectedContract();
    const equipment = firstContractEquipment(contract);
    await api.reminders.create({
      source_type: contract ? "contract_expiry" : "manual",
      source_id: contract?.id ?? null,
      client_id: newReminder.value.client_id,
      document_id: contract?.document_id ?? null,
      trigger_date: triggerDate,
      advance_days: 0,
      title: newReminder.value.title,
      body: newReminder.value.body || null,
      email_to: normalizeEmailTo(newReminder.value.email_to),
      email_template_id: newReminder.value.email_template_id,
      equipment_type: (equipment?.category as EquipmentCategory | undefined) ?? null,
      manufacturer: equipment?.manufacturer ?? null,
      model: equipment?.model ?? null,
      serial_number: equipment?.serial_number ?? null,
    });
    message.success("תזכורת נוצרה");
    showCreate.value = false;
    load();
  } catch (e) {
    message.error(String(e));
  } finally {
    creating.value = false;
  }
}

// ── Edit reminder (trigger_date + email_to) ─────────────────────────────────
const showEditDate = ref(false);
const savingDate = ref(false);
const editingReminder = ref<ReminderWithContext | null>(null);
const editDateMs = ref<number | null>(null);
const editEmailTo = ref("");
const editEmailTemplateId = ref<string | null>(null);
const editEquipmentType = ref<EquipmentCategory | null>(null);
const editManufacturer = ref("");
const editModel = ref("");
const editSerialNumber = ref("");

const equipmentCategoryOptions: { label: string; value: EquipmentCategory }[] = [
  { label: "מכונות הרמה", value: "lift" },
  { label: "אביזרי הרמה", value: "accessory" },
  { label: "פיגומים", value: "scaffold" },
  { label: "מעליות", value: "ladder" },
  { label: "מעלונים", value: "balloon" },
  { label: "קולטי אוויר", value: "intake" },
  { label: "קולטי קיטור", value: "extractor" },
  { label: "אחר", value: "other" },
];

function displayEmailTo(emailTo: string | null | undefined): string {
  if (!emailTo) return "";
  try {
    const parsed = JSON.parse(emailTo);
    return Array.isArray(parsed) ? parsed.join(", ") : String(parsed);
  } catch {
    return emailTo;
  }
}

async function openEditDate(row: ReminderWithContext) {
  editingReminder.value = row;
  editDateMs.value = row.trigger_date ? localDateToMs(row.trigger_date) : Date.now();
  editEmailTo.value = displayEmailTo(row.email_to);
  editEmailTemplateId.value = row.email_template_id ?? null;
  editEquipmentType.value = row.equipment_type ?? null;
  editManufacturer.value = row.manufacturer ?? "";
  editModel.value = row.model ?? "";
  editSerialNumber.value = row.serial_number ?? "";
  showEditDate.value = true;

  // If the reminder has no equipment snapshot yet, prefill from the linked
  // client's equipment so the user starts from real data instead of blanks.
  const hasSnapshot = row.equipment_type || row.manufacturer || row.model || row.serial_number;
  if (!hasSnapshot && row.client_id != null) {
    try {
      const eq = await api.equipment.list({ client_id: String(row.client_id) });
      const first = eq[0];
      if (first && editingReminder.value?.id === row.id) {
        editEquipmentType.value = (first.category as EquipmentCategory) ?? null;
        editManufacturer.value = first.manufacturer ?? "";
        editModel.value = first.model ?? "";
        editSerialNumber.value = first.serial_number ?? "";
      }
    } catch { /* ignore — leave fields blank */ }
  }
}

async function doSaveDate() {
  if (!editingReminder.value || !editDateMs.value) return;
  if (!editEmailTo.value.trim()) {
    message.warning("יש להזין כתובת אימייל");
    return;
  }
  savingDate.value = true;
  try {
    const triggerDate = msToLocalDateStr(editDateMs.value);
    await api.reminders.update(editingReminder.value.id, {
      trigger_date: triggerDate,
      email_to: normalizeEmailTo(editEmailTo.value),
      email_template_id: editEmailTemplateId.value,
      equipment_type: editEquipmentType.value,
      manufacturer: editManufacturer.value.trim() || null,
      model: editModel.value.trim() || null,
      serial_number: editSerialNumber.value.trim() || null,
    });
    message.success("התזכורת עודכנה");
    showEditDate.value = false;
    load();
  } catch (e) {
    message.error(String(e));
  } finally {
    savingDate.value = false;
  }
}

function confirmDelete(row: ReminderWithContext) {
  confirm({
    title: "מחיקת תזכורת",
    content: `למחוק את התזכורת "${row.title}"? פעולה זו אינה הפיכה.`,
    confirmText: "מחק",
    onConfirm: async () => {
      try {
        await store.remove(row.id);
        message.success("התזכורת נמחקה");
        load();
      } catch (e) {
        message.error(String(e));
      }
    },
  });
}

// ── Quick test: open modal to pick template, then send ─────────────────────
function quickTest() {
  if (!testEmail.value) return;
  const defaultTpl = emailTemplates.value.find((t) => t.is_default) ?? emailTemplates.value[0] ?? null;
  quickTestTemplateId.value = defaultTpl?.id ?? null;
  showQuickTest.value = true;
}

async function doQuickTest() {
  if (!testEmail.value) return;
  testing.value = true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const created = await api.reminders.create({
      source_type: "manual",
      trigger_date: today,
      advance_days: 0,
      title: `בדיקה — ${new Date().toLocaleString("he-IL")}`,
      body: "תזכורת בדיקה שנוצרה מתוך לוח הבקרה",
      email_to: JSON.stringify([testEmail.value]),
      email_template_id: quickTestTemplateId.value,
    });
    const sendResult = await api.reminders.sendNow(created.id);
    showQuickTest.value = false;
    if (sendResult.success) {
      message.success(`תזכורת בדיקה נשלחה ל-${testEmail.value}`);
    } else {
      message.error(sendResult.error ?? "שגיאה בשליחה");
    }
    load();
  } catch (e) {
    message.error(String(e));
  } finally {
    testing.value = false;
  }
}

// ── Table columns ───────────────────────────────────────────────────────────
const columns = [
  { title: "כותרת", key: "title" },
  {
    title: "לקוח",
    key: "client_name",
    render: (row: ReminderWithContext) =>
      row.client_id
        ? h("a", { style: "cursor:pointer;color:#63e2b7", onClick: () => router.push(`/clients/${row.client_id}`) }, row.client_name ?? "—")
        : (row.client_name ?? "—"),
  },
  { title: "תאריך תזכורת", key: "trigger_date", width: 140 },
  { title: "ימים מראש", key: "advance_days", width: 100 },
  {
    title: "סטטוס",
    key: "status",
    render: (row: ReminderWithContext) => h(StatusBadge, { status: row.status }),
  },
  {
    title: "פעולות",
    key: "actions",
    width: 380,
    render: (row: ReminderWithContext) =>
      h(NSpace, { size: "small" }, {
        default: () => [
          row.status === "pending"
            ? h(NButton, {
                size: "small",
                type: "primary",
                onClick: async () => {
                  const r = await store.sendNow(row.id);
                  if (r.success) { message.success("נשלח בהצלחה"); load(); }
                  else message.error(r.error ?? "שגיאה");
                },
              }, { default: () => "שלח עכשיו" })
            : null,
          row.status === "pending"
            ? h(NButton, {
                size: "small",
                onClick: () => openEditDate(row),
              }, { default: () => "✏️ ערוך" })
            : null,
          row.status === "pending"
            ? h(NButton, {
                size: "small",
                type: "error",
                onClick: async () => { await store.dismiss(row.id); load(); },
              }, { default: () => "בטל" })
            : null,
          h(NButton, {
            size: "small",
            type: "error",
            ghost: true,
            onClick: () => confirmDelete(row),
          }, { default: () => "🗑 מחק" }),
        ],
      }),
  },
];
</script>
