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
        <n-form-item label="כותרת" required>
          <n-input v-model:value="newReminder.title" placeholder="לדוגמה: חידוש ביטוח רכב" />
        </n-form-item>
        <n-form-item label="תאריך תזכורת (מתי לשלוח)" required>
          <n-date-picker v-model:value="triggerDateMs" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="אימייל נמען">
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
        <n-form-item label="אימייל נמען">
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
import type {Client, EmailTemplate, ReminderWithContext} from "@shared/types.js";

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
  triggerDateMs.value = Date.now();
  showCreate.value = true;
}

// When the user picks a client, auto-fill from that client's data — email,
// a default title, and notes as the body — but only into fields still empty,
// so nothing the user already typed gets overwritten.
function onPickClient(clientId: number | null) {
  if (!newReminder.value) return;
  const c = clientsStore.rows.find((x) => x.id === clientId);
  if (!c) return;
  if (c.email) newReminder.value.email_to = c.email;
  if (!newReminder.value.title.trim()) newReminder.value.title = `תזכורת עבור ${c.display_name}`;
  if (!newReminder.value.body.trim() && c.notes) newReminder.value.body = c.notes;
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
  creating.value = true;
  try {
    const triggerDate = new Date(triggerDateMs.value).toISOString().slice(0, 10);
    await api.reminders.create({
      source_type: "manual",
      client_id: newReminder.value.client_id,
      trigger_date: triggerDate,
      advance_days: 0,
      title: newReminder.value.title,
      body: newReminder.value.body || null,
      email_to: normalizeEmailTo(newReminder.value.email_to),
      email_template_id: newReminder.value.email_template_id,
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

function displayEmailTo(emailTo: string | null | undefined): string {
  if (!emailTo) return "";
  try {
    const parsed = JSON.parse(emailTo);
    return Array.isArray(parsed) ? parsed.join(", ") : String(parsed);
  } catch {
    return emailTo;
  }
}

function openEditDate(row: ReminderWithContext) {
  editingReminder.value = row;
  editDateMs.value = row.trigger_date ? new Date(row.trigger_date).getTime() : Date.now();
  editEmailTo.value = displayEmailTo(row.email_to);
  editEmailTemplateId.value = row.email_template_id ?? null;
  showEditDate.value = true;
}

async function doSaveDate() {
  if (!editingReminder.value || !editDateMs.value) return;
  savingDate.value = true;
  try {
    const triggerDate = new Date(editDateMs.value).toISOString().slice(0, 10);
    await api.reminders.update(editingReminder.value.id, {
      trigger_date: triggerDate,
      email_to: normalizeEmailTo(editEmailTo.value),
      email_template_id: editEmailTemplateId.value,
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
