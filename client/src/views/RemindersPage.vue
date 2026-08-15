<template>
  <div class="reminders-page">
    <header class="reminders-hero">
      <div class="reminders-hero__copy">
        <h1>תזכורות</h1>
        <p>מעקב, שליחה וניהול של תזכורות לפי לקוח, סטטוס ותאריך יעד.</p>
      </div>
      <div class="reminders-actions">
        <button class="rbtn rbtn--ghost" :disabled="store.loading" @click="load">
          <span class="refresh-icon" :class="{ 'refresh-icon--spin': store.loading }">↻</span>
          רענן
        </button>
        <button class="rbtn rbtn--primary" :disabled="loadingEmailTemplates" @click="openCreate">
          + תזכורת חדשה
        </button>
        <div class="bulk-action-anchor">
          <button
            class="rbtn rbtn--ghost"
            :class="{ 'rbtn--ghost-active': bulkMode }"
            title="בחירה מרובה"
            @click="toggleBulkMode"
          >
            ☑ בחירה מרובה
          </button>
          <div v-if="bulkMode && selectedReminderKeys.length > 0" class="bulk-action-anchor__actions">
            <button
              class="bulk-action-item bulk-action-item--primary"
              :class="{ 'bulk-action-item--loading': bulkSending }"
              :disabled="bulkSending"
              @click="bulkSendSelected"
            >
              <n-icon class="bulk-action-item__icon" :component="PaperPlaneOutline" />
              <span class="bulk-action-item__text">שלח נבחרים</span>
              <span class="bulk-action-item__count">{{ selectedReminderKeys.length }}</span>
            </button>
            <button
              class="bulk-action-item"
              :class="{ 'bulk-action-item--loading': bulkDismissing }"
              :disabled="bulkDismissing"
              @click="bulkDismissSelected"
            >
              <n-icon class="bulk-action-item__icon" :component="CloseCircleOutline" />
              <span class="bulk-action-item__text">בטל נבחרים</span>
              <span class="bulk-action-item__count">{{ selectedReminderKeys.length }}</span>
            </button>
            <button
              class="bulk-action-item bulk-action-item--danger"
              :class="{ 'bulk-action-item--loading': bulkDeleting }"
              :disabled="bulkDeleting"
              @click="bulkDeleteSelected"
            >
              <n-icon class="bulk-action-item__icon" :component="TrashOutline" />
              <span class="bulk-action-item__text">מחק נבחרים</span>
              <span class="bulk-action-item__count">{{ selectedReminderKeys.length }}</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <n-alert
      v-if="!testEmail"
      type="warning"
      class="reminders-alert"
      :show-icon="false"
    >
      להפעלת "תזכורת בדיקה" יש להגדיר כתובת לבדיקות ב-
      <router-link to="/settings" style="color: #63e2b7">הגדרות   אימייל</router-link>
    </n-alert>

    <section class="reminders-summary">
      <button
        v-for="item in reminderStats"
        :key="item.key"
        class="summary-card"
        :class="`summary-card--${item.tone}`"
        type="button"
        @click="applySummaryFilter(item)"
      >
        <span class="summary-card__label">{{ item.label }}</span>
        <strong>{{ item.count }}</strong>
      </button>
    </section>

    <section class="reminders-panel">
      <div class="reminders-panel__head">
        <div>
          <h2>רשימת תזכורות</h2>
          <p>{{ filteredRows.length }} מתוך {{ store.rows.length }} תזכורות</p>
        </div>
      </div>

      <div class="reminders-controls">
        <n-input
          v-model:value="search"
          class="reminders-search"
          clearable
          placeholder="חיפוש לפי כותרת, לקוח, אימייל או תסקיר..."
        />
        <n-select
          v-model:value="statusFilter"
          class="reminders-status-select"
          :options="statusOptions"
          :virtual-scroll="false"
          placeholder="כל הסטטוסים"
          clearable
          @update:value="load"
        />
      </div>

      <div class="quick-filterbar">
        <button
          v-for="f in dueFilters"
          :key="f.value"
          class="quick-pill"
          :class="{ 'quick-pill--active': dueFilter === f.value }"
          type="button"
          @click="dueFilter = f.value"
        >
          {{ f.label }}
          <span>{{ f.count }}</span>
        </button>
      </div>

      <n-data-table
        :columns="columns"
        :data="filteredRows"
        :loading="store.loading"
        :pagination="{ pageSize: 20 }"
        :row-key="(r: any) => r.id"
        :row-props="rowProps"
        :checked-row-keys="selectedReminderKeys"
        :scroll-x="900"
        class="reminders-table"
        size="small"
        @update:checked-row-keys="onSelectedReminderKeys"
      />
    </section>

    <!-- Quick-test modal -->
    <n-modal v-model:show="showQuickTest" title="🧪 שליחת תזכורת בדיקה" :show-icon="false" preset="dialog" style="width: 420px; max-width: 95vw">
      <n-form label-placement="top">
        <n-form-item label="נמען">
          <n-input :value="testEmail" disabled />
        </n-form-item>
        <n-form-item v-if="canSelectEmailTemplates" label="תבנית אימייל">
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
    <n-modal v-model:show="showCreate" title="תזכורת חדשה" :show-icon="false" preset="dialog" style="width: 520px; max-width: 95vw">
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
        <n-form-item label="מועד התזכורת הבאה" required>
          <n-select v-model:value="reminderDateMode" :options="reminderDateModeOptions" />
        </n-form-item>
        <n-form-item v-if="reminderDateMode === 'months'" label="בעוד כמה חודשים" required>
          <n-select v-model:value="reminderIntervalMonths" :options="reminderIntervalOptions" />
        </n-form-item>
        <n-form-item v-else label="תאריך תזכורת מותאם אישית" required>
          <n-date-picker v-model:value="reminderCustomDateMs" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="אימייל נמען" required>
          <n-input
            v-model:value="newReminder.email_to"
            :placeholder="emailPlaceholder"
          />
        </n-form-item>
        <n-form-item v-if="canSelectEmailTemplates" label="תבנית אימייל">
          <n-select
            v-model:value="newReminder.email_template_id"
            :options="emailTemplateOptions"
            :virtual-scroll="false"
            :loading="loadingEmailTemplates"
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
    <n-modal v-model:show="showEditDate" title="עריכת תזכורת" :show-icon="false" preset="dialog" style="width: 420px; max-width: 95vw">
      <n-form label-placement="top" v-if="editingReminder">
        <n-form-item label="כותרת">
          <n-input :value="editingReminder.title" disabled />
        </n-form-item>
        <n-form-item label="תאריך שליחה" required>
          <n-date-picker v-model:value="editDateMs" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="אימייל לשליחה" required>
          <n-input v-model:value="editEmailTo" placeholder="כתובת אימייל אחת או יותר, מופרדות בפסיק" />
        </n-form-item>
        <n-form-item label="אימייל שולח">
          <n-input :value="senderLabel" disabled placeholder="לא הוגדר אימייל שולח" />
        </n-form-item>
        <n-form-item v-if="canSelectEmailTemplates" label="תבנית אימייל">
          <n-select
            v-model:value="editEmailTemplateId"
            :options="emailTemplateOptions"
            :virtual-scroll="false"
            placeholder="ברירת מחדל"
            clearable
          />
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
import {NAlert, NDataTable, NDatePicker, NForm, NFormItem, NIcon, NInput, NModal, NSelect, useMessage,} from "naive-ui";
import {CloseCircleOutline, PaperPlaneOutline, TrashOutline,} from "@vicons/ionicons5";
import {useRemindersStore} from "../stores/reminders.js";
import {useSettingsStore} from "../stores/settings.js";
import {useClientsStore} from "../stores/clients.js";
import {useAuthStore} from "../stores/auth.js";
import {useFeaturesStore} from "../stores/features.js";
import {api} from "../services/apiService.js";
import {useConfirm} from "../composables/useConfirm.js";
import StatusBadge from "../components/StatusBadge.vue";
import {FEATURES} from "../shared/features.js";
import type {Client, ContractWithClient, EmailTemplate, EquipmentCategory, ReminderWithContext} from "@shared/types.js";

// Date-only strings (YYYY-MM-DD) must round-trip through the date picker using
// local calendar days, not UTC — new Date("2026-08-01").getTime() parses as
// UTC midnight, which n-date-picker then displays in local time. In any
// timezone behind UTC that silently shows (and can save) the previous day.
function localDateToMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
function addMonths(ms: number, months: number): number {
  const date = new Date(ms);
  date.setMonth(date.getMonth() + months);
  return date.getTime();
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
const featuresStore = useFeaturesStore();
const { confirm } = useConfirm();

// testEmail: admin can configure a custom address in settings; all others default to their own email
const testEmail = ref<string | null>(authStore.user?.email || "");
const router = useRouter();
const message = useMessage();

const statusFilter = ref<string | null>(null);
type DueFilter = "all" | "overdue" | "month" | "sent" | "no_email";
const dueFilter = ref<DueFilter>("all");
const search = ref("");
const bulkMode = ref(false);
const selectedReminderKeys = ref<Array<string | number>>([]);
const bulkSending = ref(false);
const bulkDismissing = ref(false);
const bulkDeleting = ref(false);
const showCreate = ref(false);
const showQuickTest = ref(false);
const quickTestTemplateId = ref<string | null>(null);
const creating = ref(false);
const testing = ref(false);
const triggerDateMs = ref<number | null>(Date.now());
const reminderDateMode = ref<"months" | "date">("months");
const reminderCustomDateMs = ref<number | null>(null);
const reminderIntervalMonths = ref<4 | 6 | 12 | 14>(4);
const reminderDateModeOptions = [
  { label: "בעוד מספר חודשים מהיום", value: "months" },
  { label: "בתאריך מותאם אישית", value: "date" },
];
const reminderIntervalOptions = [
  { label: "4 חודשים", value: 4 },
  { label: "6 חודשים", value: 6 },
  { label: "12 חודשים", value: 12 },
  { label: "14 חודשים", value: 14 },
];
const emailTemplates = ref<EmailTemplate[]>([]);
const loadingEmailTemplates = ref(false);
let emailTemplatesPromise: Promise<void> | null = null;
const canSelectEmailTemplates = computed(() => featuresStore.hasFeature(FEATURES.pages.emailTemplates));
const newReminder = ref<{
  client_id: string | null;
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
  emailTemplates.value.length
    ? emailTemplates.value.map((t) => ({
    label: t.is_default ? `${t.name}  (ברירת מחדל)` : t.name,
    value: t.id,
  }))
    : [{ label: "אין תבניות אימייל זמינות", value: "__empty__", disabled: true }]
);

const contractOptions = computed(() =>
  {
    if (loadingContracts.value) {
      return [{ label: "טוען תסקירים/חוזים...", value: "__loading__", disabled: true }];
    }
    if (newReminder.value?.client_id && newReminderContracts.value.length === 0) {
      return [{ label: "אין תסקירים/חוזים ללקוח שנבחר", value: "__empty__", disabled: true }];
    }
    return newReminderContracts.value.map((c) => {
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
    });
  }
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

function todayIso(): string {
  return msToLocalDateStr(Date.now());
}

function monthRangeIso() {
  const now = new Date();
  return {
    from: msToLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1).getTime()),
    to: msToLocalDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime()),
  };
}

function reminderMatchesDueFilter(row: ReminderWithContext, filter: DueFilter): boolean {
  const trigger = row.trigger_date?.slice(0, 10);
  if (filter === "overdue") return row.status === "pending" && Boolean(trigger && trigger < todayIso());
  if (filter === "month") {
    const range = monthRangeIso();
    return Boolean(trigger && trigger >= range.from && trigger <= range.to);
  }
  if (filter === "sent") return row.status === "sent";
  if (filter === "no_email") return !effectiveEmailTo(row);
  return true;
}

const dueFilters = computed(() => {
  const rows = store.rows ?? [];
  return [
    { label: "הכל", value: "all" as DueFilter, count: rows.length },
    { label: "באיחור", value: "overdue" as DueFilter, count: rows.filter((row) => reminderMatchesDueFilter(row, "overdue")).length },
    { label: "החודש", value: "month" as DueFilter, count: rows.filter((row) => reminderMatchesDueFilter(row, "month")).length },
    { label: "נשלחו", value: "sent" as DueFilter, count: rows.filter((row) => reminderMatchesDueFilter(row, "sent")).length },
    { label: "חסר אימייל", value: "no_email" as DueFilter, count: rows.filter((row) => reminderMatchesDueFilter(row, "no_email")).length },
  ];
});

type ReminderStat = {
  key: string;
  label: string;
  count: number;
  tone: "neutral" | "warning" | "success" | "danger";
  due?: DueFilter;
  status?: string | null;
};

const reminderStats = computed<ReminderStat[]>(() => {
  const rows = store.rows ?? [];
  return [
    { key: "all", label: "סה\"כ", count: rows.length, tone: "neutral", due: "all", status: null },
    { key: "pending", label: "ממתינות", count: rows.filter((row) => row.status === "pending").length, tone: "warning", status: "pending" },
    { key: "overdue", label: "באיחור", count: rows.filter((row) => reminderMatchesDueFilter(row, "overdue")).length, tone: "danger", due: "overdue", status: null },
    { key: "sent", label: "נשלחו", count: rows.filter((row) => row.status === "sent").length, tone: "success", due: "sent", status: null },
  ];
});

function applySummaryFilter(item: ReminderStat) {
  dueFilter.value = item.due ?? "all";
  statusFilter.value = item.status ?? null;
  selectedReminderKeys.value = [];
  load();
}

const filteredRows = computed(() =>
  (store.rows ?? [])
    .filter((row) => reminderMatchesDueFilter(row, dueFilter.value))
    .filter((row) => {
      const q = search.value.trim().toLowerCase();
      if (!q) return true;
      return [
        row.title,
        row.client_name,
        row.contract_number,
        row.document_name,
        displayEmailTo(effectiveEmailTo(row)),
      ].some((value) => String(value ?? "").toLowerCase().includes(q));
    }),
);

function load() {
  selectedReminderKeys.value = selectedReminderKeys.value.filter((id) =>
    filteredRows.value.some((row) => row.id === id)
  );
  store.fetch({ status: statusFilter.value ?? undefined, limit: 100 }, true);
}

function toggleBulkMode() {
  bulkMode.value = !bulkMode.value;
  if (!bulkMode.value) selectedReminderKeys.value = [];
}

function onSelectedReminderKeys(keys: Array<string | number>) {
  selectedReminderKeys.value = keys;
}

function selectedReminders(): ReminderWithContext[] {
  const selected = new Set(selectedReminderKeys.value);
  return filteredRows.value.filter((row) => selected.has(row.id));
}

function toggleReminderSelection(row: ReminderWithContext) {
  const selected = new Set(selectedReminderKeys.value);
  if (selected.has(row.id)) selected.delete(row.id);
  else selected.add(row.id);
  selectedReminderKeys.value = [...selected];
}

async function loadEmailTemplates() {
  if (!canSelectEmailTemplates.value) {
    emailTemplates.value = [];
    return;
  }
  if (emailTemplates.value.length) return;
  if (!emailTemplatesPromise) {
    loadingEmailTemplates.value = true;
    emailTemplatesPromise = api.emailTemplates.list()
      .then((templates) => {
        emailTemplates.value = templates;
      })
      .finally(() => {
        loadingEmailTemplates.value = false;
        emailTemplatesPromise = null;
      });
  }
  await emailTemplatesPromise;
}

onMounted(async () => {
  await featuresStore.fetchFeatures().catch(() => {});
  await Promise.all([
    clientsStore.rows.length ? Promise.resolve() : clientsStore.fetch({ limit: 500 }),
    loadEmailTemplates(),
    loadSenderInfo(),
  ]);
  load();
});

async function loadSenderInfo() {
  try {
    senderInfo.value = await api.reminders.senderInfo();
  } catch {
    senderInfo.value = null;
  }
}

// ── Create new reminder ─────────────────────────────────────────────────────
async function openCreate() {
  await loadEmailTemplates();
  // Default to the periodic-inspection template, since that's what most
  // manually-created reminders are for; fall back to whichever template is
  // marked is_default if it isn't found.
  newReminder.value = {
    client_id: null,
    title: "",
    email_to: "",
    body: "",
    email_template_id: canSelectEmailTemplates.value ? pickEmailTemplate()?.id ?? null : null,
  };
  newReminderContractId.value = null;
  newReminderContracts.value = [];
  triggerDateMs.value = Date.now();
  reminderDateMode.value = "months";
  reminderCustomDateMs.value = null;
  reminderIntervalMonths.value = 4;
  showCreate.value = true;
}

// When the user picks a client, fetch their contracts and auto-fill email/title/body.
async function onPickClient(clientId: string | null) {
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
  if (contract.expiry_date) {
    reminderDateMode.value = "date";
    reminderCustomDateMs.value = localDateToMs(contract.expiry_date);
  }
  if (contract.contact_email) newReminder.value.email_to = contract.contact_email;
  newReminder.value.email_template_id = canSelectEmailTemplates.value
    ? pickEmailTemplate(contract)?.id ?? newReminder.value.email_template_id
    : null;
  if (!newReminder.value.body.trim()) {
    newReminder.value.body = contractBody(contract);
  }
}

function pickEmailTemplate(contract?: ContractWithClient | null): EmailTemplate | null {
  const text = `${contract?.contract_type ?? ""} ${contract?.document_name ?? ""}`;
  const isInspection = /תסקיר|בדיקה|inspection/i.test(text);
  const isContract = /חוזה|contract/i.test(text);
  if (isInspection) {
    return emailTemplates.value.find((t) => t.name.includes("תסקיר בדיקה תקופתית")) ??
      emailTemplates.value.find((t) => t.name.includes("תסקיר")) ??
      emailTemplates.value.find((t) => t.is_default) ??
      emailTemplates.value[0] ??
      null;
  }
  if (isContract) {
    return emailTemplates.value.find((t) => t.name.includes("חוזה")) ??
      emailTemplates.value.find((t) => t.is_default) ??
      emailTemplates.value[0] ??
      null;
  }
  return emailTemplates.value.find((t) => t.name.includes("תסקיר בדיקה תקופתית")) ??
    emailTemplates.value.find((t) => t.is_default) ??
    emailTemplates.value[0] ??
    null;
}

function contractEquipmentLabel(contract: ContractWithClient): string | null {
  const first = contract._equipment?.[0];
  return first?.name || contract.equipment_description || first?.model || first?.serial_number || null;
}

function contractBody(contract: ContractWithClient): string {
  const lines = [
    contract.contract_type ? `סוג: ${contract.contract_type}` : null,
    contract.contract_number ? `מספר: ${contract.contract_number}` : null,
    contract.start_date ? `תאריך תסקיר: ${contract.start_date}` : null,
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
  if (!newReminder.value.title.trim()) {
    message.warning("יש להזין כותרת ותאריך");
    return;
  }
  if (reminderDateMode.value === "date" && !reminderCustomDateMs.value) {
    message.warning("יש לבחור תאריך תזכורת");
    return;
  }
  if (!newReminder.value.email_to.trim()) {
    message.warning("יש להזין כתובת אימייל");
    return;
  }
  creating.value = true;
  try {
    const triggerDateMsValue = reminderDateMode.value === "date"
      ? reminderCustomDateMs.value!
      : addMonths(Date.now(), reminderIntervalMonths.value);
    const triggerDate = msToLocalDateStr(triggerDateMsValue);
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
      email_template_id: canSelectEmailTemplates.value ? newReminder.value.email_template_id : null,
      equipment_type: (equipment?.category as EquipmentCategory | undefined) ?? null,
      manufacturer: equipment?.manufacturer ?? null,
      model: equipment?.model ?? null,
      serial_number: equipment?.serial_number ?? null,
      license_number: equipment?.license_number ?? null,
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
const senderInfo = ref<{ email: string | null; name: string } | null>(null);

const senderLabel = computed(() => {
  if (!senderInfo.value?.email) return "";
  return senderInfo.value.name
    ? `${senderInfo.value.name} <${senderInfo.value.email}>`
    : senderInfo.value.email;
});

function displayEmailTo(emailTo: string | null | undefined): string {
  if (!emailTo) return "";
  try {
    const parsed = JSON.parse(emailTo);
    return Array.isArray(parsed) ? parsed.join(", ") : String(parsed);
  } catch {
    return emailTo;
  }
}

function effectiveEmailTo(row: ReminderWithContext): string | null {
  return row.email_to || row.client_email || null;
}

async function openEditDate(row: ReminderWithContext) {
  editingReminder.value = row;
  editDateMs.value = row.trigger_date ? localDateToMs(row.trigger_date) : Date.now();
  editEmailTo.value = displayEmailTo(effectiveEmailTo(row));
  editEmailTemplateId.value = canSelectEmailTemplates.value ? row.email_template_id ?? null : null;
  showEditDate.value = true;
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
      email_template_id: canSelectEmailTemplates.value ? editEmailTemplateId.value : null,
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

function doDeleteFiltered() {
  const rowsToDelete = [...filteredRows.value];
  const count = rowsToDelete.length;
  if (!count) return;
  confirm({
    title: "מחיקת תזכורות",
    content: `למחוק ${count} תזכורות מתוך הסינון הנוכחי? פעולה זו אינה הפיכה.`,
    confirmText: "מחק",
    onConfirm: async () => {
      try {
        await Promise.all(rowsToDelete.map((row) => store.remove(row.id)));
        message.success(`${count} תזכורות נמחקו`);
      } catch (e) {
        message.error(String(e));
      }
    },
  });
}

async function bulkSendSelected() {
  const rows = selectedReminders().filter((row) => row.status !== "dismissed");
  if (!rows.length) {
    message.warning("אין תזכורות נבחרות לשליחה");
    return;
  }
  bulkSending.value = true;
  try {
    const results = await Promise.allSettled(rows.map((row) => store.sendNow(row.id)));
    const sent = results.filter((result) => result.status === "fulfilled" && (result.value as any).success).length;
    const failed = results.length - sent;
    if (sent) message.success(`${sent} תזכורות נשלחו`);
    if (failed) message.error(`${failed} תזכורות נכשלו`);
    selectedReminderKeys.value = [];
    load();
  } finally {
    bulkSending.value = false;
  }
}

function bulkDismissSelected() {
  const rows = selectedReminders().filter((row) => row.status === "pending");
  const count = rows.length;
  if (!count) {
    message.warning("אין תזכורות ממתינות לביטול");
    return;
  }
  confirm({
    title: "ביטול תזכורות",
    content: `לבטל ${count} תזכורות נבחרות?`,
    confirmText: "בטל תזכורות",
    onConfirm: async () => {
      bulkDismissing.value = true;
      try {
        await Promise.all(rows.map((row) => store.dismiss(row.id)));
        message.success(`${count} תזכורות בוטלו`);
        selectedReminderKeys.value = [];
        load();
      } catch (e) {
        message.error(String(e));
      } finally {
        bulkDismissing.value = false;
      }
    },
  });
}

function bulkDeleteSelected() {
  const rows = selectedReminders();
  const count = rows.length;
  if (!count) return;
  confirm({
    title: "מחיקת תזכורות",
    content: `למחוק ${count} תזכורות נבחרות? פעולה זו אינה הפיכה.`,
    confirmText: "מחק",
    onConfirm: async () => {
      bulkDeleting.value = true;
      try {
        await Promise.all(rows.map((row) => store.remove(row.id)));
        message.success(`${count} תזכורות נמחקו`);
        selectedReminderKeys.value = [];
        load();
      } catch (e) {
        message.error(String(e));
      } finally {
        bulkDeleting.value = false;
      }
    },
  });
}

// ── Quick test: open modal to pick template, then send ─────────────────────
function quickTest() {
  if (!testEmail.value) return;
  const defaultTpl = emailTemplates.value.find((t) => t.is_default) ?? emailTemplates.value[0] ?? null;
  quickTestTemplateId.value = canSelectEmailTemplates.value ? defaultTpl?.id ?? null : null;
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
      email_template_id: canSelectEmailTemplates.value ? quickTestTemplateId.value : null,
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
function formatReminderDate(value: string | null | undefined): string {
  if (!value) return "—";
  const part = value.includes("T") ? value.split("T")[0] : value;
  const [y, m, d] = part.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const target = localDateToMs(value.slice(0, 10));
  const today = localDateToMs(todayIso());
  return Math.round((target - today) / 86400000);
}

function dueTone(row: ReminderWithContext): string {
  const days = daysUntil(row.trigger_date);
  if (row.status === "sent") return "sent";
  if (days == null) return "muted";
  if (days < 0) return "overdue";
  if (days <= 7) return "soon";
  return "future";
}

function rowProps(row: ReminderWithContext) {
  return {
    class: `reminder-row reminder-row--${dueTone(row)}${bulkMode.value ? " reminder-row--selectable" : ""}`,
    onClick: (event: MouseEvent) => {
      if (!bulkMode.value) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, .n-checkbox")) return;
      toggleReminderSelection(row);
    },
  };
}

const baseColumns = [
  {
    title: "אימייל",
    key: "email_to",
    width: 240,
    minWidth: 240,
    render: (row: ReminderWithContext) =>
      h("span", { class: "reminder-email-cell" }, displayEmailTo(effectiveEmailTo(row)) || "אין אימייל"),
  },
  {
    title: "לקוח",
    key: "client_name",
    width: 220,
    minWidth: 220,
    render: (row: ReminderWithContext) =>
      h("div", { class: "reminder-client-cell" }, [
        row.client_id
          ? h("button", {
              class: "link-button",
              onClick: (event: MouseEvent) => {
                event.stopPropagation();
                router.push(`/clients/${row.client_id}`);
              },
            }, row.client_name ?? "—")
          : h("span", row.client_name ?? "—"),
      ]),
  },
  {
    title: "תסקיר",
    key: "contract_number",
    width: 180,
    minWidth: 180,
    render: (row: ReminderWithContext) =>
      h("span", { class: "reminder-source-cell" }, row.contract_number || row.document_name || "—"),
  },
  {
    title: "תאריך",
    key: "trigger_date",
    width: 130,
    minWidth: 130,
    render: (row: ReminderWithContext) =>
      h("div", { class: "reminder-date-cell" }, [
        h("span", { class: "reminder-date-cell__date" }, formatReminderDate(row.trigger_date)),
      ]),
  },
  {
    title: "סטטוס",
    key: "status",
    width: 120,
    render: (row: ReminderWithContext) => h(StatusBadge, { status: row.status }),
  },
];

const columns = computed(() =>
  bulkMode.value
    ? [{ type: "selection", width: 46, fixed: "right" }, ...baseColumns]
    : baseColumns
);
</script>

<style scoped>
.reminders-page {
  max-width: 100%;
  display: grid;
  gap: 16px;
  font-family: inherit;
}

.reminders-hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 8px;
}

.reminders-hero__copy h1 {
  margin: 0 0 4px;
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.reminders-hero__copy p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.reminders-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.rbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  white-space: nowrap;
}

.rbtn:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.rbtn:active {
  transform: scale(0.97);
}

.rbtn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.rbtn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 600;
}

.rbtn--danger {
  background: transparent;
  border-color: rgba(208, 48, 80, 0.35);
  color: #d03050;
}

.rbtn--ghost-active {
  background: var(--bg-elevated);
  border-color: var(--brand-color);
  color: var(--brand-color);
}

.bulk-action-anchor {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  position: relative;
}

.bulk-action-anchor > .rbtn {
  width: 100%;
}

.bulk-action-anchor__actions {
  display: grid;
  gap: 8px;
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: var(--shadow-lg, 0 14px 32px rgba(15, 23, 42, 0.14));
}

.bulk-action-anchor__actions::before {
  content: "";
  position: absolute;
  top: -6px;
  right: 24px;
  width: 10px;
  height: 10px;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  transform: rotate(-45deg);
}

.bulk-action-item {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: start;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.bulk-action-item + .bulk-action-item {
  border-top: 1px solid var(--border-color);
  border-radius: 0;
}

.bulk-action-item:hover {
  background: var(--bg-hover);
}

.bulk-action-item:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.bulk-action-item--primary {
  color: var(--brand-color);
}

.bulk-action-item--danger {
  color: #d03050;
}

.bulk-action-item__icon {
  display: inline-flex;
  justify-content: center;
  width: 26px;
  font-size: 19px;
  line-height: 1;
}

.bulk-action-item__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bulk-action-item__count {
  min-width: 24px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.bulk-action-item--loading .bulk-action-item__icon {
  width: 14px;
  height: 14px;
  margin-inline: 4px;
  border: 2px solid currentColor;
  border-inline-start-color: transparent;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
  color: inherit;
  font-size: 0;
}

.bulk-action-item--loading .bulk-action-item__icon :deep(svg) {
  display: none;
}

.refresh-icon {
  display: inline-flex;
  line-height: 1;
}

.refresh-icon--spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.reminders-alert {
  margin: 0;
}

.reminders-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.summary-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-family: inherit;
  text-align: start;
  transition: border-color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast);
}

.summary-card:hover {
  border-color: var(--brand-color);
  box-shadow: var(--shadow-sm);
}

.summary-card__label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.summary-card strong {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}

.summary-card--warning strong { color: #b7791f; }
.summary-card--success strong { color: #18a058; }
.summary-card--danger strong { color: #d03050; }

.reminders-panel {
  display: grid;
  gap: 14px;
  padding: 16px 18px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.reminders-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}

.reminders-panel__head h2 {
  margin: 0 0 4px;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 700;
}

.reminders-panel__head p {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.reminders-controls {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 180px;
  gap: 10px;
  align-items: center;
}

.reminders-search :deep(.n-input),
.reminders-status-select :deep(.n-base-selection) {
  border-radius: 12px;
}

.quick-filterbar {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 5px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: transparent;
}

.quick-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 6px 13px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  transition: background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
}

.quick-pill span {
  min-width: 22px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-primary);
  text-align: center;
  font-weight: 700;
}

.quick-pill:hover,
.quick-pill--active {
  color: var(--text-primary);
}

.quick-pill--active {
  background: var(--bg-card);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.reminders-table {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 14px;
}

.reminders-table :deep(.n-data-table-th) {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.reminders-table :deep(.n-data-table-td) {
  padding-top: 12px;
  padding-bottom: 12px;
  vertical-align: top;
}

.reminders-table :deep(.reminder-row--selectable) {
  cursor: pointer;
}

.reminders-table :deep(.reminder-row--selectable:hover td) {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
}

.reminder-client-cell,
.reminder-date-cell {
  display: grid;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}

.reminder-email-cell,
.reminder-source-cell {
  display: block;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reminder-email-cell {
  direction: ltr;
  text-align: right;
}

.reminder-source-cell {
  color: var(--text-secondary);
  font-weight: 600;
}

.link-button {
  width: fit-content;
  max-width: 100%;
  border: 0;
  background: transparent;
  color: var(--brand-color);
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  padding: 0;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-button:hover {
  text-decoration: underline;
}

.reminder-date-cell__date {
  display: block;
  color: var(--text-primary);
  font-weight: 700;
  line-height: 1.45;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .reminders-hero {
    flex-direction: column;
    align-items: stretch;
  }

  .reminders-actions,
  .rbtn {
    width: 100%;
  }

  .reminders-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .reminders-controls {
    grid-template-columns: 1fr;
  }

  .quick-filterbar {
    width: 100%;
  }

  .quick-filterbar {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .quick-filterbar::-webkit-scrollbar {
    display: none;
  }

  .quick-pill {
    flex: 0 0 auto;
  }

  .reminders-table :deep(.n-data-table-wrapper) {
    overflow-x: auto;
  }

  :deep(.n-dialog__action) {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  :deep(.n-dialog__action .n-button) {
    width: 100%;
  }
}

@media (max-width: 460px) {
  .reminders-summary {
    grid-template-columns: 1fr;
  }
}
</style>
