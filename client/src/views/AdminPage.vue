<template>
  <div class="admin-shell">
    <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
    <aside class="admin-sidebar">
      <div class="admin-sidebar__brand" @click="router.push('/')">
        <n-icon :component="BriefcaseOutline" :size="20" />
        <span>ReminderOCR</span>
      </div>

      <nav class="admin-sidebar__nav">
        <button
          v-for="item in sidebarItems"
          :key="item.key"
          class="admin-sidebar__item"
          :class="{ 'admin-sidebar__item--active': activeSection === item.key }"
          type="button"
          @click="switchSection(item.key)"
        >
          <n-icon :component="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="admin-sidebar__footer">
        <div class="admin-env-badge" :class="`admin-env-badge--${appEnv}`">
          <span class="admin-env-badge__dot" />
          <span>{{ appEnv === 'production' ? 'PRODUCTION' : appEnv.toUpperCase() }}</span>
          <span v-if="dbName" class="admin-env-badge__db">{{ dbName }}</span>
        </div>
        <button class="admin-sidebar__item" type="button" @click="router.push('/')">
          <n-icon :component="ArrowBackOutline" :size="18" />
          <span>חזור לאפליקציה</span>
        </button>
      </div>
    </aside>

    <!-- ── Main content ─────────────────────────────────────────────────── -->
    <div class="admin-main">
      <header class="admin-main__header">
        <div class="admin-main__title-row">
          <h1 class="admin-main__title">{{ currentItem?.label }}</h1>
          <n-button size="small" :loading="sectionLoading" @click="reloadSection">↻ רענן</n-button>
        </div>
        <div class="admin-main__meta">לוח ניהול מערכת</div>
      </header>

      <!-- ── Users ── -->
      <section v-if="activeSection === 'users'" class="admin-section">
        <div class="admin-section__toolbar">
          <n-input
            v-model:value="userSearch"
            placeholder="חיפוש לפי שם / אימייל..."
            clearable
            dir="rtl"
            style="max-width: 280px"
          >
            <template #prefix><n-icon :component="SearchOutline" /></template>
          </n-input>
        </div>

        <n-data-table
          :columns="userColumns"
          :data="filteredUsers"
          :loading="usersLoading"
          :bordered="false"
          :pagination="{ pageSize: 20 }"
          dir="rtl"
          size="small"
          style="margin-top: 16px"
        />
      </section>

      <!-- ── Stats ── -->
      <section v-if="activeSection === 'stats'" class="admin-section">
        <div class="admin-stats-grid">
          <div v-for="s in systemStats" :key="s.label" class="admin-stat-card">
            <n-icon :component="s.icon" :size="28" class="admin-stat-card__icon" />
            <div class="admin-stat-card__body">
              <div class="admin-stat-card__num">{{ s.value }}</div>
              <div class="admin-stat-card__label">{{ s.label }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Documents & Extraction ── -->
      <section v-if="activeSection === 'documents'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="docMonitor">
          <!-- Storage per user -->
          <div class="monitor-block">
            <div class="monitor-block__title">אחסון S3 לפי משתמש</div>
            <div class="admin-stats-grid" style="margin-top:10px">
              <div v-for="s in docMonitor.storage" :key="s.user_id" class="admin-stat-card">
                <n-icon :component="CloudUploadOutline" :size="24" class="admin-stat-card__icon" />
                <div class="admin-stat-card__body">
                  <div class="admin-stat-card__num">{{ formatBytes(s.total_bytes) }}</div>
                  <div class="admin-stat-card__label">{{ resolveUserEmail(s.user_id) }} · {{ s.doc_count }} קבצים</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Per-user status matrix -->
          <div class="monitor-block">
            <div class="monitor-block__title">סטטוס מסמכים לפי משתמש</div>
            <n-data-table
              :columns="docStatusColumns"
              :data="docStatusRows"
              :bordered="false"
              size="small"
              dir="rtl"
              style="margin-top:10px"
            />
          </div>

          <!-- Extracted field values per document -->
          <div class="monitor-block">
            <div class="monitor-block__title">ערכים שחולצו ממסמכים</div>
            <div style="display:flex;gap:10px;margin-top:10px;align-items:center;flex-wrap:wrap">
              <n-select
                v-model:value="extractionUserId"
                :options="userSelectOptions"
                placeholder="כל המשתמשים"
                clearable
                dir="rtl"
                style="width:220px"
              />
              <n-button :loading="extractionsLoading" size="small" @click="loadExtractions(1)">חפש</n-button>
              <span style="font-size:12px;color:var(--text-secondary)">{{ extractionsTotal }} מסמכים</span>
            </div>

            <n-data-table
              :columns="extractionColumns"
              :data="extractionDocs"
              :loading="extractionsLoading"
              :bordered="false"
              size="small"
              dir="rtl"
              style="margin-top:12px"
              :row-key="(row: any) => row.id"
              :expanded-row-keys="expandedRows"
              @update:expanded-row-keys="expandedRows = $event"
            >
              <template #expand="{ row }">
                <div class="extraction-fields">
                  <div
                    v-for="[k, v] in fieldEntries(row.fields)"
                    :key="k"
                    class="extraction-field"
                  >
                    <span class="extraction-field__key">{{ k }}</span>
                    <span class="extraction-field__val">{{ v }}</span>
                  </div>
                </div>
              </template>
            </n-data-table>

            <div v-if="extractionsTotal > extractionLimit" style="display:flex;justify-content:center;gap:8px;margin-top:12px">
              <n-button
                size="small"
                :disabled="extractionPage <= 1"
                @click="loadExtractions(extractionPage - 1)"
              >הקודם</n-button>
              <span style="font-size:12px;line-height:28px;color:var(--text-secondary)">
                עמוד {{ extractionPage }} / {{ Math.ceil(extractionsTotal / extractionLimit) }}
              </span>
              <n-button
                size="small"
                :disabled="extractionPage >= Math.ceil(extractionsTotal / extractionLimit)"
                @click="loadExtractions(extractionPage + 1)"
              >הבא</n-button>
            </div>
          </div>

          <!-- Failed extractions -->
            <div class="monitor-block__title">
              חילוץ נכשל
              <n-tag v-if="docMonitor.failed.length" type="error" size="small" round style="margin-right:8px">{{ docMonitor.failed.length }}</n-tag>
            </div>
            <n-data-table
              :columns="failedDocsColumns"
              :data="docMonitor.failed"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              dir="rtl"
              style="margin-top:10px"
              :row-class-name="() => 'row-error'"
            />
          </div>

          <!-- Stuck in queued -->
          <div class="monitor-block">
            <div class="monitor-block__title">
              תקוע בתור (מעל 10 דקות)
              <n-tag v-if="docMonitor.stuck.length" type="warning" size="small" round style="margin-right:8px">{{ docMonitor.stuck.length }}</n-tag>
            </div>
            <n-data-table
              :columns="stuckDocsColumns"
              :data="docMonitor.stuck"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              dir="rtl"
              style="margin-top:10px"
            />
          </div>
        </template>
      </section>

      <!-- ── Reminders ── -->
      <section v-if="activeSection === 'reminders'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="reminderMonitor">
          <!-- Status counts per user -->
          <div class="monitor-block">
            <div class="monitor-block__title">סטטוס תזכורות לפי משתמש</div>
            <n-data-table
              :columns="reminderStatusColumns"
              :data="reminderStatusRows"
              :bordered="false"
              size="small"
              dir="rtl"
              style="margin-top:10px"
            />
          </div>

          <!-- Pending reminders -->
          <div class="monitor-block">
            <div class="monitor-block__title">
              תזכורות ממתינות
              <n-tag v-if="reminderMonitor.pending.length" type="warning" size="small" round style="margin-right:8px">{{ reminderMonitor.pending.length }}</n-tag>
            </div>
            <n-data-table
              :columns="pendingReminderColumns"
              :data="reminderMonitor.pending"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              dir="rtl"
              style="margin-top:10px"
            />
          </div>

          <!-- Failed reminder sends -->
          <div class="monitor-block">
            <div class="monitor-block__title">
              שליחות נכשלו
              <n-tag v-if="reminderMonitor.failedSends.length" type="error" size="small" round style="margin-right:8px">{{ reminderMonitor.failedSends.length }}</n-tag>
            </div>
            <n-data-table
              :columns="failedSendsColumns"
              :data="reminderMonitor.failedSends"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              dir="rtl"
              style="margin-top:10px"
            />
          </div>
        </template>
      </section>

      <!-- ── Scheduler ── -->
      <section v-if="activeSection === 'scheduler'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="schedulerMonitor">
          <div class="admin-stats-grid" style="margin-bottom:24px">
            <div class="admin-stat-card">
              <n-icon :component="TimeOutline" :size="24" class="admin-stat-card__icon" />
              <div class="admin-stat-card__body">
                <div class="admin-stat-card__num" style="font-size:16px">{{ formatDate(schedulerMonitor.lastRunTime) }}</div>
                <div class="admin-stat-card__label">ריצה אחרונה</div>
              </div>
            </div>
            <div class="admin-stat-card">
              <n-icon :component="AlarmOutline" :size="24" class="admin-stat-card__icon" />
              <div class="admin-stat-card__body">
                <div class="admin-stat-card__num" style="font-size:16px">{{ formatDate(schedulerMonitor.nextRunTime) }}</div>
                <div class="admin-stat-card__label">ריצה הבאה (משוערת)</div>
              </div>
            </div>
            <div class="admin-stat-card">
              <n-icon :component="TimerOutline" :size="24" class="admin-stat-card__icon" />
              <div class="admin-stat-card__body">
                <div class="admin-stat-card__num">{{ formatInterval(schedulerMonitor.intervalSeconds) }}</div>
                <div class="admin-stat-card__label">מרווח בדיקה</div>
              </div>
            </div>
            <div class="admin-stat-card">
              <n-icon :component="CheckmarkCircleOutline" :size="24" class="admin-stat-card__icon" style="color:var(--success-color,#18a058)" />
              <div class="admin-stat-card__body">
                <div class="admin-stat-card__num">{{ schedulerMonitor.sentLastHour }}</div>
                <div class="admin-stat-card__label">נשלחו בשעה האחרונה</div>
              </div>
            </div>
            <div class="admin-stat-card">
              <n-icon :component="CloseCircleOutline" :size="24" class="admin-stat-card__icon" style="color:var(--error-color,#d03050)" />
              <div class="admin-stat-card__body">
                <div class="admin-stat-card__num">{{ schedulerMonitor.failedLastHour }}</div>
                <div class="admin-stat-card__label">נכשלו בשעה האחרונה</div>
              </div>
            </div>
          </div>

          <!-- Per-job health table -->
          <div class="monitor-block">
            <div class="monitor-block__title">בריאות שירותי Cron</div>
            <n-data-table
              :columns="cronJobColumns"
              :data="schedulerMonitor.jobs ?? []"
              :bordered="false"
              size="small"
              dir="rtl"
              style="margin-top:10px"
            />
          </div>

          <div class="monitor-block">
            <div class="monitor-block__title">לוח דוח חודשי לפי משתמש</div>
            <n-data-table
              :columns="monthlyScheduleColumns"
              :data="schedulerMonitor.monthlySchedule"
              :bordered="false"
              size="small"
              dir="rtl"
              style="margin-top:10px"
            />
          </div>
        </template>
      </section>

      <!-- ── Monthly Reports ── -->
      <section v-if="activeSection === 'monthly'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="monthlyMonitor">
          <div class="monitor-block">
            <div class="monitor-block__title">תצורת דוח חודשי לפי משתמש</div>
            <n-data-table
              :columns="monthlyScheduleDetailColumns"
              :data="monthlyMonitor.schedules"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              dir="rtl"
              style="margin-top:10px"
            />
          </div>

          <div class="monitor-block">
            <div class="monitor-block__title">
              כשלי משלוח דוחות חודשיים
              <n-tag v-if="monthlyMonitor.failedDeliveries.length" type="error" size="small" round style="margin-right:8px">{{ monthlyMonitor.failedDeliveries.length }}</n-tag>
            </div>
            <n-data-table
              :columns="failedSendsColumns"
              :data="monthlyMonitor.failedDeliveries"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              dir="rtl"
              style="margin-top:10px"
            />
          </div>
        </template>
      </section>
    </div>

    <!-- Role edit modal -->
    <n-modal v-model:show="showRoleModal" preset="dialog" title="שינוי תפקיד משתמש" style="width: 360px" :mask-closable="false">
      <div dir="rtl" style="padding: 8px 0">
        <p style="margin: 0 0 12px; font-size: 14px">
          <strong>{{ editingUser?.email }}</strong>
        </p>
        <n-select
          v-model:value="editingRole"
          :options="roleOptions"
          placeholder="בחר תפקיד"
          dir="rtl"
        />
      </div>
      <template #action>
        <n-button @click="showRoleModal = false">ביטול</n-button>
        <n-button type="primary" :loading="savingRole" @click="saveRole">שמור</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  NButton, NDataTable, NIcon, NInput, NModal, NSelect, NSpin, NTag, useMessage,
} from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import {
  AlarmOutline,
  ArrowBackOutline,
  BriefcaseOutline,
  CalendarOutline,
  CheckmarkCircleOutline,
  CloseCircleOutline,
  CloudUploadOutline,
  DocumentOutline,
  NotificationsOutline,
  PeopleOutline,
  SearchOutline,
  StatsChartOutline,
  TimeOutline,
  TimerOutline,
} from "@vicons/ionicons5";
import { api } from "../services/apiService.js";

const router = useRouter();
const message = useMessage();

const appEnv = ref("development");
const dbName = ref("");

// ── Sidebar ────────────────────────────────────────────────────────────────
const sidebarItems = [
  { key: "users",     label: "משתמשים",             icon: PeopleOutline },
  { key: "stats",     label: "סטטיסטיקות",          icon: StatsChartOutline },
  { key: "documents", label: "מסמכים וחילוץ",        icon: DocumentOutline },
  { key: "reminders", label: "תזכורות",              icon: NotificationsOutline },
  { key: "scheduler", label: "מתזמן",                icon: TimerOutline },
  { key: "monthly",   label: "דוחות חודשיים",        icon: CalendarOutline },
];
const activeSection = ref("users");
const currentItem = computed(() => sidebarItems.find((i) => i.key === activeSection.value));
const sectionLoading = ref(false);

// ── Users ──────────────────────────────────────────────────────────────────
const users = ref<any[]>([]);
const usersLoading = ref(false);
const userSearch = ref("");

const filteredUsers = computed(() => {
  const q = userSearch.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter(
    (u) => u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q),
  );
});

async function loadUsers() {
  usersLoading.value = true;
  try {
    users.value = await api.admin.listUsers();
  } catch {
    message.error("שגיאה בטעינת משתמשים");
  } finally {
    usersLoading.value = false;
  }
}

function resolveUserEmail(userId: string) {
  return users.value.find((u) => u.id === userId)?.email ?? userId?.slice(-6) ?? "—";
}

const roleOptions = [
  { label: "משתמש רגיל", value: "user" },
  { label: "Pro",        value: "pro"  },
  { label: "מנהל",       value: "admin"},
];

const roleTagType: Record<string, "default" | "info" | "warning"> = {
  user:  "default",
  pro:   "info",
  admin: "warning",
};
const roleLabel: Record<string, string> = {
  user:  "משתמש",
  pro:   "Pro",
  admin: "מנהל",
};

const showRoleModal = ref(false);
const editingUser = ref<any>(null);
const editingRole = ref<string>("");
const savingRole = ref(false);

function openRoleModal(user: any) {
  editingUser.value = user;
  editingRole.value = user.role;
  showRoleModal.value = true;
}

async function saveRole() {
  if (!editingUser.value) return;
  savingRole.value = true;
  try {
    const updated = await api.admin.updateUser(editingUser.value.id, { role: editingRole.value });
    users.value = users.value.map((u) => (u.id === updated.id ? updated : u));
    showRoleModal.value = false;
    message.success("התפקיד עודכן");
  } catch {
    message.error("שגיאה בעדכון התפקיד");
  } finally {
    savingRole.value = false;
  }
}

async function toggleActive(user: any) {
  const newActive = user.is_active === 0 ? 1 : 0;
  try {
    const updated = await api.admin.updateUser(user.id, { is_active: newActive });
    users.value = users.value.map((u) => (u.id === updated.id ? updated : u));
    message.success(newActive ? "המשתמש הופעל" : "המשתמש הושבת");
  } catch {
    message.error("שגיאה בעדכון הסטטוס");
  }
}

const userColumns: DataTableColumns<any> = [
  {
    title: "אימייל", key: "email", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:13px" }, row.email ?? "—"),
  },
  {
    title: "שם", key: "name", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:13px" }, row.name ?? "—"),
  },
  {
    title: "תפקיד", key: "role", align: "right", width: 100,
    render: (row) =>
      h(NTag, { type: roleTagType[row.role] ?? "default", size: "small", round: true },
        { default: () => roleLabel[row.role] ?? row.role }),
  },
  {
    title: "סטטוס", key: "is_active", align: "right", width: 90,
    render: (row) =>
      h(NTag, { type: row.is_active === 0 ? "error" : "success", size: "small", round: true },
        { default: () => row.is_active === 0 ? "מושבת" : "פעיל" }),
  },
  {
    title: "נרשם", key: "created_at", align: "right", width: 110,
    render: (row) =>
      h("span", { style: "font-size:12px; color: var(--text-secondary)" },
        row.created_at ? new Date(row.created_at).toLocaleDateString("he-IL") : "—"),
  },
  {
    title: "פעולות", key: "actions", align: "center", width: 160,
    render: (row) =>
      h("div", { style: "display:flex; gap:6px; justify-content:center" }, [
        h(NButton, { size: "tiny", onClick: () => openRoleModal(row) }, { default: () => "שנה תפקיד" }),
        h(NButton, {
          size: "tiny", type: row.is_active === 0 ? "primary" : "error", ghost: true,
          onClick: () => toggleActive(row),
        }, { default: () => row.is_active === 0 ? "הפעל" : "השבת" }),
      ]),
  },
];

// ── Stats ──────────────────────────────────────────────────────────────────
const systemStats = computed(() => [
  { label: "סה\"כ משתמשים",  value: users.value.length,                                  icon: PeopleOutline },
  { label: "מנהלים",         value: users.value.filter((u) => u.role === "admin").length, icon: PeopleOutline },
  { label: "משתמשי Pro",     value: users.value.filter((u) => u.role === "pro").length,   icon: PeopleOutline },
  { label: "מושבתים",        value: users.value.filter((u) => u.is_active === 0).length,  icon: PeopleOutline },
]);

// ── Documents monitor ──────────────────────────────────────────────────────
const docMonitor = ref<any>(null);

// Extractions sub-section
const extractionDocs = ref<any[]>([]);
const extractionsTotal = ref(0);
const extractionPage = ref(1);
const extractionLimit = 50;
const extractionUserId = ref<string | null>(null);
const extractionsLoading = ref(false);
const expandedRows = ref<string[]>([]);

const userSelectOptions = computed(() =>
  users.value.map((u) => ({ label: u.email ?? u.id, value: u.id })),
);

const FIELD_LABEL: Record<string, string> = {
  client_name: "שם לקוח", date: "תאריך", expiry_date: "תאריך פקיעה",
  license_number: "מספר רישוי", document_type: "סוג מסמך",
  contract_number: "מספר חוזה", inspector: "בודק", pass_fail: "תוצאה",
  id_number: "ח.פ / ת.ז", address: "כתובת", phone: "טלפון", email: "אימייל",
};

function fieldEntries(fields: Record<string, any>): [string, string][] {
  const SKIP = new Set(["_confidence", "_raw", "document_kind"]);
  return Object.entries(fields ?? {})
    .filter(([k, v]) => !SKIP.has(k) && v !== null && v !== undefined && v !== "")
    .map(([k, v]) => [FIELD_LABEL[k] ?? k, String(v)]);
}

async function loadExtractions(page = 1) {
  extractionsLoading.value = true;
  try {
    const res = await api.admin.monitorExtractions({
      user_id: extractionUserId.value ?? undefined,
      page,
      limit: extractionLimit,
    });
    extractionDocs.value = res.docs;
    extractionsTotal.value = res.total;
    extractionPage.value = res.page;
    expandedRows.value = [];
  } catch {
    message.error("שגיאה בטעינת חילוצים");
  } finally {
    extractionsLoading.value = false;
  }
}

const extractionColumns: DataTableColumns<any> = [
  { type: "expand" },
  {
    title: "משתמש", key: "user_id", align: "right", width: 140,
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "קובץ", key: "filename", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—"),
  },
  {
    title: "סוג מסמך", key: "document_type", align: "right", width: 140,
    render: (row) => h("span", { style: "font-size:12px" }, row.document_type ?? "—"),
  },
  {
    title: "תאריך", key: "created_at", align: "right", width: 110,
    render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" },
      row.created_at ? new Date(row.created_at).toLocaleDateString("he-IL") : "—"),
  },
];

const DOC_STATUSES = ["queued", "processing", "done", "error"];
const STATUS_HE: Record<string, string> = {
  queued: "בתור", processing: "מעבד", done: "הושלם", error: "שגיאה",
};

const docStatusRows = computed(() => {
  if (!docMonitor.value) return [];
  return Object.entries(docMonitor.value.byUserStatus).map(([userId, counts]: [string, any]) => ({
    user: resolveUserEmail(userId),
    ...counts,
  }));
});

const docStatusColumns: DataTableColumns<any> = [
  { title: "משתמש", key: "user", align: "right", ellipsis: { tooltip: true } },
  ...DOC_STATUSES.map((s) => ({
    title: STATUS_HE[s] ?? s,
    key: s,
    align: "center" as const,
    width: 80,
    render: (row: any) => h("span", { style: row[s] ? "font-weight:600" : "color:var(--text-secondary)" }, row[s] ?? "0"),
  })),
];

const failedDocsColumns: DataTableColumns<any> = [
  {
    title: "משתמש", key: "user_id", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "קובץ", key: "filename", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—"),
  },
  {
    title: "שגיאה", key: "error", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color: var(--error-color,#d03050)" }, row.error ?? "—"),
  },
  {
    title: "תאריך", key: "created_at", align: "right", width: 110,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.created_at ? new Date(row.created_at).toLocaleDateString("he-IL") : "—"),
  },
];

const stuckDocsColumns: DataTableColumns<any> = [
  {
    title: "משתמש", key: "user_id", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "קובץ", key: "filename", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—"),
  },
  {
    title: "תאריך העלאה", key: "created_at", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.created_at ? new Date(row.created_at).toLocaleString("he-IL") : "—"),
  },
];

// ── Reminders monitor ──────────────────────────────────────────────────────
const reminderMonitor = ref<any>(null);

const REMINDER_STATUSES = ["pending", "sent", "snoozed", "dismissed", "error"];
const REMINDER_STATUS_HE: Record<string, string> = {
  pending: "ממתין", sent: "נשלח", snoozed: "דחוי", dismissed: "בוטל", error: "שגיאה",
};

const reminderStatusRows = computed(() => {
  if (!reminderMonitor.value) return [];
  return Object.entries(reminderMonitor.value.byUserStatus).map(([userId, counts]: [string, any]) => ({
    user: resolveUserEmail(userId),
    ...counts,
  }));
});

const reminderStatusColumns: DataTableColumns<any> = [
  { title: "משתמש", key: "user", align: "right", ellipsis: { tooltip: true } },
  ...REMINDER_STATUSES.map((s) => ({
    title: REMINDER_STATUS_HE[s] ?? s,
    key: s,
    align: "center" as const,
    width: 75,
    render: (row: any) => h("span", { style: row[s] ? "font-weight:600" : "color:var(--text-secondary)" }, row[s] ?? "0"),
  })),
];

const pendingReminderColumns: DataTableColumns<any> = [
  {
    title: "משתמש", key: "user_id", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "סוג", key: "doc_type", align: "right", width: 110,
    render: (row) => h("span", { style: "font-size:12px" }, row.doc_type ?? "—"),
  },
  {
    title: "הערה", key: "note", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.note ?? "—"),
  },
  {
    title: "תאריך טריגר", key: "trigger_date", align: "right", width: 120,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.trigger_date ? new Date(row.trigger_date).toLocaleDateString("he-IL") : "—"),
  },
];

const failedSendsColumns: DataTableColumns<any> = [
  {
    title: "משתמש", key: "user_id", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "נמען", key: "recipient", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.recipient ?? "—"),
  },
  {
    title: "שגיאה", key: "error", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color: var(--error-color,#d03050)" }, row.error ?? "—"),
  },
  {
    title: "תאריך", key: "sent_at", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.sent_at ? new Date(row.sent_at).toLocaleString("he-IL") : "—"),
  },
];

// ── Scheduler monitor ──────────────────────────────────────────────────────
const schedulerMonitor = ref<any>(null);

const JOB_NAME_HE: Record<string, string> = {
  tick: "לולאה ראשית",
  checkReminders: "בדיקת תזכורות",
  checkMonthlyReports: "דוחות חודשיים",
  checkEscalations: "הסלמות",
};

const cronJobColumns: DataTableColumns<any> = [
  {
    title: "שירות", key: "name", align: "right",
    render: (row) => h("span", { style: "font-size:13px; font-weight:500" }, JOB_NAME_HE[row.name] ?? row.name),
  },
  {
    title: "סטטוס", key: "status", align: "center", width: 90,
    render: (row) => {
      const ok = !row.last_error && (row.consecutive_failures ?? 0) === 0;
      return h(NTag, { type: ok ? "success" : "error", size: "small", round: true },
        { default: () => ok ? "תקין" : `${row.consecutive_failures} כשלים` });
    },
  },
  {
    title: "ריצה אחרונה", key: "last_run_at", align: "right", width: 150,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.last_run_at ? new Date(row.last_run_at).toLocaleString("he-IL") : "—"),
  },
  {
    title: "הצלחה אחרונה", key: "last_success_at", align: "right", width: 150,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.last_success_at ? new Date(row.last_success_at).toLocaleString("he-IL") : "—"),
  },
  {
    title: "שגיאה אחרונה", key: "last_error", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color:var(--error-color,#d03050)" }, row.last_error ?? "—"),
  },
];

const monthlyScheduleColumns: DataTableColumns<any> = [
  {
    title: "משתמש", key: "user_id", align: "right",
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "פעיל", key: "enabled", align: "center", width: 70,
    render: (row) =>
      h(NTag, { type: row.enabled ? "success" : "default", size: "small", round: true },
        { default: () => row.enabled ? "כן" : "לא" }),
  },
  {
    title: "יום בחודש", key: "day", align: "center", width: 100,
    render: (row) => h("span", { style: "font-size:12px" }, row.day ?? "—"),
  },
  {
    title: "שעה", key: "hour", align: "center", width: 70,
    render: (row) => h("span", { style: "font-size:12px" }, row.hour != null ? `${row.hour}:00` : "—"),
  },
  {
    title: "נשלח לאחרונה", key: "last_sent", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.last_sent ? new Date(row.last_sent).toLocaleDateString("he-IL") : "—"),
  },
  {
    title: "שגיאה אחרונה", key: "last_error", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color: var(--error-color,#d03050)" }, row.last_error ?? "—"),
  },
];

// ── Monthly reports monitor ────────────────────────────────────────────────
const monthlyMonitor = ref<any>(null);

const monthlyScheduleDetailColumns: DataTableColumns<any> = [
  {
    title: "משתמש", key: "user_id", align: "right",
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "פעיל", key: "enabled", align: "center", width: 70,
    render: (row) =>
      h(NTag, { type: row.enabled ? "success" : "default", size: "small", round: true },
        { default: () => row.enabled ? "כן" : "לא" }),
  },
  {
    title: "יום", key: "day", align: "center", width: 70,
    render: (row) => h("span", { style: "font-size:12px" }, row.day ?? "—"),
  },
  {
    title: "שעה", key: "hour", align: "center", width: 70,
    render: (row) => h("span", { style: "font-size:12px" }, row.hour != null ? `${row.hour}:00` : "—"),
  },
  {
    title: "פורמטים", key: "formats", align: "right", width: 110,
    render: (row) => {
      let formats = row.formats ?? [];
      if (typeof formats === "string") { try { formats = JSON.parse(formats); } catch { formats = []; } }
      return h("span", { style: "font-size:12px" }, Array.isArray(formats) ? formats.join(", ") || "—" : "—");
    },
  },
  {
    title: "נמענים", key: "recipients", align: "right", ellipsis: { tooltip: true },
    render: (row) => {
      let recipients = row.recipients ?? [];
      if (typeof recipients === "string") { try { recipients = JSON.parse(recipients); } catch { recipients = []; } }
      return h("span", { style: "font-size:12px" }, Array.isArray(recipients) ? recipients.join(", ") || "—" : "—");
    },
  },
  {
    title: "נשלח לאחרונה", key: "last_sent", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.last_sent ? new Date(row.last_sent).toLocaleDateString("he-IL") : "—"),
  },
  {
    title: "שגיאה", key: "last_error", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color: var(--error-color,#d03050)" }, row.last_error ?? "—"),
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("he-IL");
}

function formatInterval(seconds: number): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds} שניות`;
  if (seconds < 3600) {
    const m = Math.round(seconds / 60);
    return m === 1 ? "דקה" : `${m} דקות`;
  }
  const h = Math.round(seconds / 3600);
  return h === 1 ? "שעה" : `${h} שעות`;
}

// ── Section switching & loading ────────────────────────────────────────────
async function switchSection(key: string) {
  activeSection.value = key;
  await loadSectionData(key);
}

async function reloadSection() {
  await loadSectionData(activeSection.value);
}

async function loadSectionData(key: string) {
  if (key === "users" || key === "stats") {
    if (users.value.length === 0) await loadUsers();
    return;
  }
  sectionLoading.value = true;
  try {
    if (key === "documents") {
      const [monitor] = await Promise.all([api.admin.monitorDocuments(), loadExtractions(1)]);
      docMonitor.value = monitor;
    } else if (key === "reminders") {
      reminderMonitor.value = await api.admin.monitorReminders();
    } else if (key === "scheduler") {
      schedulerMonitor.value = await api.admin.monitorScheduler();
    } else if (key === "monthly") {
      monthlyMonitor.value = await api.admin.monitorMonthlyReports();
    }
  } catch {
    message.error("שגיאה בטעינת נתונים");
  } finally {
    sectionLoading.value = false;
  }
}

onMounted(async () => {
  try {
    const cfg = await api.config.getAdmin();
    appEnv.value = cfg.appEnv ?? "development";
    dbName.value = cfg.dbName ?? "";
  } catch { /* non-critical */ }
  await loadUsers();
});
</script>

<style scoped>
.admin-shell {
  display: flex;
  height: 100vh;
  background: var(--bg-body);
  overflow: hidden;
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */
.admin-sidebar {
  width: 220px;
  flex: 0 0 220px;
  background: var(--bg-card);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
}

.admin-sidebar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 16px;
  font-size: 15px;
  font-weight: 700;
  color: var(--brand-color);
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
}

.admin-sidebar__nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
  gap: 4px;
}

.admin-sidebar__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  text-align: right;
  width: 100%;
  transition: background 0.15s, color 0.15s;
}

.admin-sidebar__item:hover {
  background: var(--bg-hover, rgba(99, 226, 183, 0.08));
  color: var(--text-primary);
}

.admin-sidebar__item--active {
  background: rgba(24, 160, 88, 0.12);
  color: var(--brand-color);
  font-weight: 600;
}

.admin-sidebar__footer {
  padding: 10px;
  border-top: 1px solid var(--border-color);
}

/* ── Main ────────────────────────────────────────────────────────────────── */
.admin-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.admin-main__header {
  padding: 20px 28px 14px;
  border-bottom: 1px solid var(--border-color);
  flex: 0 0 auto;
}

.admin-main__title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-main__title {
  margin: 0 0 2px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  flex: 1;
}

.admin-main__meta {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* ── Section ─────────────────────────────────────────────────────────────── */
.admin-section {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px 32px;
}

.admin-section__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ── Stats grid ──────────────────────────────────────────────────────────── */
.admin-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}

.admin-stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 18px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.admin-stat-card__icon {
  color: var(--brand-color);
  flex: 0 0 auto;
}

.admin-stat-card__num {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.admin-stat-card__label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* ── Monitor blocks ──────────────────────────────────────────────────────── */
.monitor-block {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px 20px;
  margin-bottom: 18px;
}

.monitor-block__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Env badge ───────────────────────────────────────────────────────────── */
.admin-env-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 10px 8px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: rgba(99, 226, 183, 0.1);
  color: var(--brand-color);
  border: 1px solid rgba(99, 226, 183, 0.25);
}

.admin-env-badge--production {
  background: rgba(208, 48, 80, 0.1);
  color: #d03050;
  border-color: rgba(208, 48, 80, 0.3);
}

.admin-env-badge__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex: 0 0 auto;
}

/* ── Extraction fields expand ────────────────────────────────────────────── */
.extraction-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 10px 16px;
}

.extraction-field {
  display: flex;
  gap: 6px;
  font-size: 12px;
}

.extraction-field__key {
  color: var(--text-secondary);
  white-space: nowrap;
}

.extraction-field__val {
  color: var(--text-primary);
  font-weight: 500;
  word-break: break-word;
}

.admin-env-badge__db {
  font-weight: 400;
  opacity: 0.75;
  margin-right: 2px;
}
</style>
