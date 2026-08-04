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
          <span>Back to App</span>
        </button>
      </div>
    </aside>

    <!-- ── Main content ─────────────────────────────────────────────────── -->
    <div class="admin-main">
      <header class="admin-main__header">
        <div class="admin-main__title-row">
          <h1 class="admin-main__title">{{ currentItem?.label }}</h1>
          <n-button size="small" :loading="sectionLoading" @click="reloadSection">↻ Refresh</n-button>
        </div>
        <div class="admin-main__meta">System Admin Dashboard</div>
      </header>

      <!-- ── Users ── -->
      <section v-if="activeSection === 'users'" class="admin-section">
        <div class="admin-section__toolbar">
          <n-input
            v-model:value="userSearch"
            placeholder="Search by name / email..."
            clearable
            style="max-width: 280px; direction: ltr"
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
          <!-- Pipeline Summary Cards -->
          <div class="admin-stats-grid">
            <AdminStatCard
              title="Total Processed"
              :primary="pipelineStats.total"
              primary-label="Documents"
              :secondary="pipelineStats.processing"
              secondary-label="Processing"
              :status="pipelineStats.total === 0 ? 'default' : 'success'"
              :icon="DocumentOutline"
            />
            <AdminStatCard
              title="Success Rate"
              :primary="pipelineStats.successRate"
              primary-label="Completion %"
              :secondary="pipelineStats.done"
              secondary-label="Completed"
              :status="pipelineStats.successRate >= 80 ? 'success' : pipelineStats.successRate >= 50 ? 'warning' : 'error'"
              format="percent"
            />
            <AdminStatCard
              title="S3 Storage"
              :primary="pipelineStats.storage"
              :primary-label="`${docMonitor.storage.length} users`"
              format="bytes"
              :status="pipelineStats.storage > 5 * 1024 * 1024 * 1024 ? 'warning' : 'default'"
              :icon="CloudUploadOutline"
            />
            <AdminStatCard
              title="Failed Documents"
              :primary="pipelineStats.failed"
              primary-label="Extraction Errors"
              :secondary="pipelineStats.stuck"
              secondary-label="Stuck (>10min)"
              :status="pipelineStats.failed > 0 || pipelineStats.stuck > 0 ? 'error' : 'success'"
            />
          </div>

          <!-- Storage per user -->
          <div class="monitor-block" style="margin-top: 20px">
            <div class="monitor-block__title">S3 Storage by User</div>
            <div class="admin-stats-grid" style="margin-top:10px">
              <div v-for="s in docMonitor.storage" :key="s.user_id" class="admin-stat-card">
                <n-icon :component="CloudUploadOutline" :size="24" class="admin-stat-card__icon" />
                <div class="admin-stat-card__body">
                  <div class="admin-stat-card__num">{{ formatBytes(s.total_bytes) }}</div>
                  <div class="admin-stat-card__label">{{ resolveUserEmail(s.user_id) }} · {{ s.doc_count }} files</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Per-user status matrix -->
          <div class="monitor-block">
            <div class="monitor-block__title">Document Status by User</div>
            <n-data-table
              :columns="docStatusColumns"
              :data="docStatusRows"
              :bordered="false"
              size="small"
              style="margin-top:10px"
            />
          </div>

          <!-- Failed extractions -->
          <div class="monitor-block" v-if="docMonitor.failed.length > 0">
            <div class="monitor-block__title">
              Failed Extraction
              <n-tag v-if="docMonitor.failed.length" type="error" size="small" round style="margin-right:8px">{{ docMonitor.failed.length }}</n-tag>
            </div>
            <n-data-table
              :columns="failedDocsColumns"
              :data="docMonitor.failed"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
              :row-class-name="() => 'row-error'"
            />
          </div>

          <!-- Stuck documents -->
          <div class="monitor-block" v-if="docMonitor.stuck.length > 0">
            <div class="monitor-block__title">
              Stuck Documents (Queued > 10 min)
              <n-tag type="warning" size="small" round style="margin-right:8px">{{ docMonitor.stuck.length }}</n-tag>
            </div>
            <n-data-table
              :columns="stuckDocsColumns"
              :data="docMonitor.stuck"
              :bordered="false"
              size="small"
              style="margin-top:10px"
            />
          </div>

          <!-- Extracted field values per document -->
          <div class="monitor-block">
            <div class="monitor-block__title">Extracted Field Values</div>
            <div style="display:flex;gap:10px;margin-top:10px;align-items:center;flex-wrap:wrap">
              <n-select
                v-model:value="extractionUserId"
                :options="userSelectOptions"
                placeholder="All Users"
                clearable
                style="width:220px; direction: rtl"
                @update:value="loadExtractions(1)"
              />
              <span style="font-size:12px;color:var(--text-secondary)">{{ extractionsTotal }} documents</span>
            </div>

            <n-data-table
              :columns="extractionColumns"
              :data="extractionTreeData"
              :loading="extractionsLoading"
              :bordered="false"
              size="small"
              style="margin-top:12px"
              :row-key="(row: any) => row._rowKey"
            />

            <div v-if="extractionsTotal > extractionLimit" style="display:flex;justify-content:center;gap:8px;margin-top:12px">
              <n-button
                size="small"
                :disabled="extractionPage <= 1"
                @click="loadExtractions(extractionPage - 1)"
              >Previous</n-button>
              <span style="font-size:12px;line-height:28px;color:var(--text-secondary)">
                Page {{ extractionPage }} / {{ Math.ceil(extractionsTotal / extractionLimit) }}
              </span>
              <n-button
                size="small"
                :disabled="extractionPage >= Math.ceil(extractionsTotal / extractionLimit)"
                @click="loadExtractions(extractionPage + 1)"
              >Next</n-button>
            </div>
          </div>

          <!-- Failed extractions -->
          <div class="monitor-block">
            <div class="monitor-block__title">
              Failed Extraction
              <n-tag v-if="docMonitor.failed.length" type="error" size="small" round style="margin-right:8px">{{ docMonitor.failed.length }}</n-tag>
            </div>
            <n-data-table
              :columns="failedDocsColumns"
              :data="docMonitor.failed"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
              :row-class-name="() => 'row-error'"
            />
          </div>

          <!-- Stuck in queued -->
          <div class="monitor-block">
            <div class="monitor-block__title">
              Stuck in Queue (over 10 minutes)
              <n-tag v-if="docMonitor.stuck.length" type="warning" size="small" round style="margin-right:8px">{{ docMonitor.stuck.length }}</n-tag>
            </div>
            <n-data-table
              :columns="stuckDocsColumns"
              :data="docMonitor.stuck"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
            />
          </div>
        </template>
      </section>

      <!-- ── Reminders ── -->
      <section v-if="activeSection === 'reminders'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="reminderMonitor">
          <!-- Email Delivery Summary Cards (MOST IMPORTANT) -->
          <div class="admin-stats-grid">
            <AdminStatCard
              title="Email Delivery Success"
              :primary="emailStats.successRate"
              primary-label="Success Rate %"
              :secondary="emailStats.sent"
              secondary-label="Sent Successfully"
              :status="emailStats.successRate >= 90 ? 'success' : emailStats.successRate >= 70 ? 'warning' : 'error'"
              format="percent"
            />
            <AdminStatCard
              title="Failed Email Sends"
              :primary="emailStats.failed"
              primary-label="Failed Attempts"
              :secondary="reminderMonitor.failedSends?.length ?? 0"
              secondary-label="Recent Failures"
              :status="emailStats.failed > 0 ? 'error' : 'success'"
            />
            <AdminStatCard
              title="Pending Reminders"
              :primary="emailStats.pending"
              primary-label="Waiting to Send"
              :secondary="reminderMonitor.pending?.length ?? 0"
              secondary-label="Upcoming Soon"
              :status="emailStats.pending > 100 ? 'warning' : 'default'"
            />
            <AdminStatCard
              title="Total Reminders"
              :primary="emailStats.total"
              primary-label="Sent + Failed"
              :status="'default'"
            />
          </div>

          <!-- ⚠️ CRITICAL: Failed Sends (at top for visibility) -->
          <div class="monitor-block" style="margin-top: 20px; border-color: rgba(208, 48, 80, 0.3); background: rgba(208, 48, 80, 0.02)">
            <div class="monitor-block__title" style="color: #d03050">
              🔴 Failed Email Deliveries
              <n-tag v-if="reminderMonitor.failedSends.length" type="error" size="small" round style="margin-right:8px">{{ reminderMonitor.failedSends.length }}</n-tag>
            </div>
            <div v-if="reminderMonitor.failedSends.length === 0" style="padding: 20px; text-align: center; color: var(--text-secondary)">
              ✅ No failed sends detected
            </div>
            <n-data-table
              v-else
              :columns="failedSendsColumns"
              :data="reminderMonitor.failedSends"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
              :row-class-name="() => 'row-error'"
            />
          </div>

          <!-- Status counts per user -->
          <div class="monitor-block">
            <div class="monitor-block__title">Reminder Status by User</div>
            <n-data-table
              :columns="reminderStatusColumns"
              :data="reminderStatusRows"
              :bordered="false"
              size="small"
              style="margin-top:10px"
            />
          </div>

          <!-- Pending reminders (those about to trigger) -->
          <div class="monitor-block">
            <div class="monitor-block__title">
              Pending Reminders (Waiting to Send)
              <n-tag v-if="reminderMonitor.pending.length" type="warning" size="small" round style="margin-right:8px">{{ reminderMonitor.pending.length }}</n-tag>
            </div>
            <n-data-table
              :columns="pendingReminderColumns"
              :data="reminderMonitor.pending"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
            />
          </div>
        </template>
      </section>

      <!-- ── Scheduler ── -->
      <section v-if="activeSection === 'scheduler'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="schedulerMonitor">
          <!-- Scheduler Health Summary Cards -->
          <div class="admin-stats-grid">
            <AdminStatCard
              title="Scheduler Health"
              :primary="schedulerMonitor.jobs.filter((j: any) => !j.last_error && (j.consecutive_failures ?? 0) === 0).length"
              :primary-label="`Healthy Jobs`"
              :secondary="schedulerMonitor.jobs.length"
              secondary-label="Total Jobs"
              :status="schedulerMonitor.jobs.some((j: any) => j.last_error || (j.consecutive_failures ?? 0) > 0) ? 'warning' : 'success'"
            />
            <AdminStatCard
              title="Emails Sent (Last Hour)"
              :primary="schedulerMonitor.sentLastHour"
              primary-label="Successful Sends"
              :secondary="schedulerMonitor.failedLastHour"
              secondary-label="Failed Attempts"
              :status="schedulerMonitor.failedLastHour === 0 ? 'success' : 'warning'"
            />
            <AdminStatCard
              title="Last Run"
              :primary="formatDate(schedulerMonitor.lastRunTime)"
              primary-label="Most Recent Tick"
              :secondary="formatDate(schedulerMonitor.nextRunTime)"
              secondary-label="Next Scheduled"
              :status="'default'"
            />
            <AdminStatCard
              title="Check Interval"
              :primary="formatInterval(schedulerMonitor.intervalSeconds)"
              primary-label="Scheduler Period"
              :status="'default'"
            />
          </div>

          <!-- Per-job health table -->
          <div class="monitor-block" style="margin-top: 20px">
            <div class="monitor-block__title">Cron Job Health</div>
            <n-data-table
              :columns="cronJobColumns"
              :data="schedulerMonitor.jobs ?? []"
              :bordered="false"
              size="small"
              style="margin-top:10px"
            />
          </div>

          <div class="monitor-block">
            <div class="monitor-block__title">Monthly Report Schedule by User</div>
            <n-data-table
              :columns="monthlyScheduleColumns"
              :data="schedulerMonitor.monthlySchedule"
              :bordered="false"
              size="small"
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
            <div class="monitor-block__title">Monthly Report Configuration by User</div>
            <n-data-table
              :columns="monthlyScheduleDetailColumns"
              :data="monthlyMonitor.schedules"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
            />
          </div>

          <div class="monitor-block">
            <div class="monitor-block__title">
              Monthly Report Send Failures
              <n-tag v-if="monthlyMonitor.failedDeliveries.length" type="error" size="small" round style="margin-right:8px">{{ monthlyMonitor.failedDeliveries.length }}</n-tag>
            </div>
            <n-data-table
              :columns="failedSendsColumns"
              :data="monthlyMonitor.failedDeliveries"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
            />
          </div>
        </template>
      </section>
    </div>

    <!-- Document preview modal -->
    <n-modal
      v-model:show="showDocModal"
      :mask-closable="true"
      title="Document Details"
      :show-icon="true"
      preset="card"
      size="huge"
      style="width:92vw;max-width:1200px"
      dir="rtl"
      @after-leave="docModalId = null"
    >
      <div style="max-height:76vh;overflow-y:auto;padding:0 8px 8px">
        <DocumentDetailPage v-if="docModalId" :doc-id="docModalId" />
      </div>
    </n-modal>

    <!-- Role edit modal -->
    <n-modal v-model:show="showRoleModal" preset="dialog" title="Change User Role" style="width: 360px" :mask-closable="false" dir="rtl">
      <div style="padding: 8px 0">
        <p style="margin: 0 0 12px; font-size: 14px">
          <strong>{{ editingUser?.email }}</strong>
        </p>
        <n-select
          v-model:value="editingRole"
          :options="roleOptions"
          placeholder="Select role"
          style="direction: rtl"
        />
      </div>
      <template #action>
        <n-button @click="showRoleModal = false">Cancel</n-button>
        <n-button type="primary" :loading="savingRole" @click="saveRole">Save</n-button>
      </template>
    </n-modal>

    <!-- Error Detail Modal -->
    <n-modal v-model:show="showErrorModal" preset="dialog" title="Error Details" style="width: 500px; max-width:90vw">
      <div v-if="errorDetail" style="padding: 12px 0">
        <div style="margin-bottom: 16px">
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px">EMAIL / RECIPIENT</div>
          <div style="font-size: 13px; font-family: monospace; padding: 8px; background: var(--bg-elevated); border-radius: 6px">
            {{ errorDetail.recipient || errorDetail.email || "—" }}
          </div>
        </div>

        <div style="margin-bottom: 16px">
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px">ERROR MESSAGE</div>
          <div style="font-size: 13px; padding: 10px; background: rgba(208, 48, 80, 0.05); border-left: 3px solid #d03050; border-radius: 4px; overflow-x: auto">
            {{ errorDetail.error || errorDetail.error_message || errorDetail.last_error || "Unknown error" }}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px">
          <div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px">TIMESTAMP</div>
            <div style="font-size: 13px">
              {{ errorDetail.sent_at || errorDetail.created_at ? new Date(errorDetail.sent_at || errorDetail.created_at).toLocaleString("en-US") : "—" }}
            </div>
          </div>
          <div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px">USER</div>
            <div style="font-size: 13px">
              {{ resolveUserEmail(errorDetail.user_id) }}
            </div>
          </div>
        </div>

        <div v-if="errorDetail.reminder_id || errorDetail.filename" style="margin-bottom: 16px">
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px">CONTEXT</div>
          <div style="font-size: 13px; color: var(--text-secondary)">
            {{ errorDetail.reminder_id ? `Reminder: ${errorDetail.reminder_id.slice(-6)}` : "" }}
            {{ errorDetail.filename ? `Document: ${errorDetail.filename}` : "" }}
          </div>
        </div>
      </div>
      <template #action>
        <n-button @click="showErrorModal = false">Close</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import {computed, h, onMounted, ref} from "vue";
import {useRouter} from "vue-router";
import type {DataTableColumns} from "naive-ui";
import {NButton, NDataTable, NIcon, NInput, NModal, NSelect, NSpin, NTag, useMessage,} from "naive-ui";
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
import {api} from "../services/apiService.js";
import DocumentDetailPage from "./DocumentDetailPage.vue";
import AdminStatCard from "../components/AdminStatCard.vue";

const router = useRouter();
const message = useMessage();

const appEnv = ref("development");
const dbName = ref("");

// ── Sidebar ────────────────────────────────────────────────────────────────
const sidebarItems = [
  { key: "users",     label: "Users",                 icon: PeopleOutline },
  { key: "stats",     label: "Statistics",            icon: StatsChartOutline },
  { key: "documents", label: "Documents & Extraction",icon: DocumentOutline },
  { key: "reminders", label: "Reminders",             icon: NotificationsOutline },
  { key: "scheduler", label: "Scheduler",             icon: TimerOutline },
  { key: "monthly",   label: "Monthly Reports",       icon: CalendarOutline },
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
    message.error("Error loading users");
  } finally {
    usersLoading.value = false;
  }
}

function resolveUserEmail(userId: string) {
  return users.value.find((u) => u.id === userId)?.email ?? userId?.slice(-6) ?? "—";
}

const roleOptions = [
  { label: "Regular User", value: "user" },
  { label: "Pro",          value: "pro"  },
  { label: "Admin",        value: "admin"},
];

const roleTagType: Record<string, "default" | "info" | "warning"> = {
  user:  "default",
  pro:   "info",
  admin: "warning",
};
const roleLabel: Record<string, string> = {
  user:  "User",
  pro:   "Pro",
  admin: "Admin",
};

const showRoleModal = ref(false);
const showDocModal = ref(false);
const docModalId = ref<string | null>(null);
const showErrorModal = ref(false);
const errorDetail = ref<any>(null);

function openDocModal(id: string) {
  docModalId.value = id;
  showDocModal.value = true;
}

function openErrorModal(error: any) {
  errorDetail.value = error;
  showErrorModal.value = true;
}
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
    message.success("Role updated");
  } catch {
    message.error("Error updating role");
  } finally {
    savingRole.value = false;
  }
}

async function toggleActive(user: any) {
  const newActive = user.is_active === 0 ? 1 : 0;
  try {
    const updated = await api.admin.updateUser(user.id, { is_active: newActive });
    users.value = users.value.map((u) => (u.id === updated.id ? updated : u));
    message.success(newActive ? "User activated" : "User deactivated");
  } catch {
    message.error("Error updating status");
  }
}

const userColumns: DataTableColumns<any> = [
  {
    title: "Email", key: "email", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:13px" }, row.email ?? "—"),
  },
  {
    title: "Name", key: "name", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:13px" }, row.name ?? "—"),
  },
  {
    title: "Role", key: "role", align: "right", width: 100,
    render: (row) =>
      h(NTag, { type: roleTagType[row.role] ?? "default", size: "small", round: true },
        { default: () => roleLabel[row.role] ?? row.role }),
  },
  {
    title: "Status", key: "is_active", align: "right", width: 90,
    render: (row) =>
      h(NTag, { type: row.is_active === 0 ? "error" : "success", size: "small", round: true },
        { default: () => row.is_active === 0 ? "Inactive" : "Active" }),
  },
  {
    title: "Registered", key: "created_at", align: "right", width: 110,
    render: (row) =>
      h("span", { style: "font-size:12px; color: var(--text-secondary)" },
        row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—"),
  },
  {
    title: "Actions", key: "actions", align: "center", width: 160,
    render: (row) =>
      h("div", { style: "display:flex; gap:6px; justify-content:center" }, [
        h(NButton, { size: "tiny", onClick: () => openRoleModal(row) }, { default: () => "Change Role" }),
        h(NButton, {
          size: "tiny", type: row.is_active === 0 ? "primary" : "error", ghost: true,
          onClick: () => toggleActive(row),
        }, { default: () => row.is_active === 0 ? "Activate" : "Deactivate" }),
      ]),
  },
];

// ── Stats ──────────────────────────────────────────────────────────────────
const systemStats = computed(() => [
  { label: "Total Users",   value: users.value.length,                                  icon: PeopleOutline },
  { label: "Admins",        value: users.value.filter((u) => u.role === "admin").length, icon: PeopleOutline },
  { label: "Pro Users",     value: users.value.filter((u) => u.role === "pro").length,   icon: PeopleOutline },
  { label: "Inactive",      value: users.value.filter((u) => u.is_active === 0).length,  icon: PeopleOutline },
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
const userSelectOptions = computed(() =>
  users.value.map((u) => ({ label: u.email ?? u.id, value: u.id })),
);


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
  } catch {
    message.error("Error loading extractions");
  } finally {
    extractionsLoading.value = false;
  }
}

// Group extraction docs by user for tree-table display
const extractionTreeData = computed(() => {
  const groups: Record<string, any[]> = {};
  for (const doc of extractionDocs.value) {
    const uid = doc.user_id ?? "unknown";
    if (!groups[uid]) groups[uid] = [];
    groups[uid].push(doc);
  }
  return Object.entries(groups).map(([uid, docs]) => ({
    _rowKey: `user-${uid}`,
    _isGroup: true,
    user_id: uid,
    filename: `${resolveUserEmail(uid)} (${docs.length})`,
    document_type: null,
    created_at: null,
    id: null,
    children: docs.map((d) => ({ ...d, _rowKey: d.id })),
  }));
});

const extractionColumns: DataTableColumns<any> = [
  {
    title: "File / User", key: "filename", align: "right", ellipsis: { tooltip: true },
    render: (row) => row._isGroup
      ? h("span", { style: "font-size:12px;font-weight:600;color:var(--text-primary)" }, row.filename)
      : h("span", { style: "font-size:12px" }, row.filename ?? "—"),
  },
  {
    title: "Document Type", key: "document_type", align: "right", width: 140,
    render: (row) => h("span", { style: "font-size:12px" }, row._isGroup ? "" : (row.document_type ?? "—")),
  },
  {
    title: "Date", key: "created_at", align: "right", width: 110,
    render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" },
      row._isGroup ? "" : (row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—")),
  },
  {
    title: "", key: "actions", align: "center", width: 70,
    render: (row) => row._isGroup ? null : h(NButton, {
      size: "tiny",
      onClick: () => openDocModal(row.id),
    }, { default: () => "📄 Open" }),
  },
];

const DOC_STATUSES = ["queued", "processing", "done", "error"];
const STATUS_HE: Record<string, string> = {
  queued: "Queued", processing: "Processing", done: "Completed", error: "Error",
};

const docStatusRows = computed(() => {
  if (!docMonitor.value) return [];
  return Object.entries(docMonitor.value.byUserStatus).map(([userId, counts]: [string, any]) => ({
    user: resolveUserEmail(userId),
    ...counts,
  }));
});

// Pipeline statistics for summary cards
const pipelineStats = computed(() => {
  if (!docMonitor.value) return {
    total: 0, done: 0, failed: 0, stuck: 0, processing: 0,
    successRate: 0, storage: 0, storageUsage: "0 B",
  };

  const counts = Object.entries(docMonitor.value.byUserStatus).reduce(
    (acc, [_, statuses]: [string, any]) => {
      acc.done += statuses.done ?? 0;
      acc.failed += statuses.error ?? 0;
      acc.processing += statuses.processing ?? 0;
      acc.queued += statuses.queued ?? 0;
      return acc;
    },
    { done: 0, failed: 0, processing: 0, queued: 0 }
  );

  const total = counts.done + counts.failed + counts.processing + counts.queued;
  const storageBytes = docMonitor.value.storage.reduce((sum: number, s: any) => sum + (s.total_bytes ?? 0), 0);
  
  return {
    total,
    done: counts.done,
    failed: counts.failed,
    processing: counts.processing,
    stuck: docMonitor.value.stuck?.length ?? 0,
    successRate: total > 0 ? Math.round((counts.done / total) * 100) : 0,
    storage: storageBytes,
    storageUsage: formatBytes(storageBytes),
  };
});

// Email delivery statistics
const emailStats = computed(() => {
  if (!reminderMonitor.value) return {
    total: 0, sent: 0, failed: 0, successRate: 0, pending: 0,
  };

  const statuses = Object.entries(reminderMonitor.value.byUserStatus).reduce(
    (acc, [_, counts]: [string, any]) => {
      acc.sent += counts.sent ?? 0;
      acc.failed += counts.error ?? 0;
      acc.pending += counts.pending ?? 0;
      return acc;
    },
    { sent: 0, failed: 0, pending: 0 }
  );

  const total = statuses.sent + statuses.failed;
  return {
    total,
    sent: statuses.sent,
    failed: statuses.failed,
    pending: statuses.pending,
    successRate: total > 0 ? Math.round((statuses.sent / total) * 100) : 0,
  };
});

const docStatusColumns: DataTableColumns<any> = [
  { title: "User", key: "user", align: "right", ellipsis: { tooltip: true } },
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
    title: "User", key: "user_id", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "File", key: "filename", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—"),
  },
  {
    title: "Error", key: "error", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color: var(--error-color,#d03050)" }, row.error ?? "—"),
  },
  {
    title: "Date", key: "created_at", align: "right", width: 110,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—"),
  },
  {
    title: "Action", key: "action", align: "center", width: 100,
    render: (row) => h("n-button", {
      text: true,
      type: "primary",
      size: "small",
      onClick: () => openErrorModal(row),
    }, "View Error"),
  },
];

const stuckDocsColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "File", key: "filename", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—"),
  },
  {
    title: "Upload Date", key: "created_at", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.created_at ? new Date(row.created_at).toLocaleString("en-US") : "—"),
  },
];

// ── Reminders monitor ──────────────────────────────────────────────────────
const reminderMonitor = ref<any>(null);

const REMINDER_STATUSES = ["pending", "sent", "snoozed", "dismissed", "error"];
const REMINDER_STATUS_HE: Record<string, string> = {
  pending: "Pending", sent: "Sent", snoozed: "Snoozed", dismissed: "Dismissed", error: "Error",
};

const reminderStatusRows = computed(() => {
  if (!reminderMonitor.value) return [];
  return Object.entries(reminderMonitor.value.byUserStatus).map(([userId, counts]: [string, any]) => ({
    user: resolveUserEmail(userId),
    ...counts,
  }));
});

const reminderStatusColumns: DataTableColumns<any> = [
  { title: "User", key: "user", align: "right", ellipsis: { tooltip: true } },
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
    title: "User", key: "user_id", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "Type", key: "doc_type", align: "right", width: 110,
    render: (row) => h("span", { style: "font-size:12px" }, row.doc_type ?? "—"),
  },
  {
    title: "Note", key: "note", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.note ?? "—"),
  },
  {
    title: "Trigger Date", key: "trigger_date", align: "right", width: 120,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.trigger_date ? new Date(row.trigger_date).toLocaleDateString("en-US") : "—"),
  },
];

const failedSendsColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "Recipient", key: "recipient", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.recipient ?? "—"),
  },
  {
    title: "Error", key: "error", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color: var(--error-color,#d03050)" }, row.error ?? "—"),
  },
  {
    title: "Date", key: "sent_at", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.sent_at ? new Date(row.sent_at).toLocaleString("en-US") : "—"),
  },
  {
    title: "Action", key: "action", align: "center", width: 100,
    render: (row) => h("n-button", {
      text: true,
      type: "primary",
      size: "small",
      onClick: () => openErrorModal(row),
    }, "View Error"),
  },
];

// ── Scheduler monitor ──────────────────────────────────────────────────────
const schedulerMonitor = ref<any>(null);

const JOB_NAME_HE: Record<string, string> = {
  tick: "Main Loop",
  checkReminders: "Check Reminders",
  checkMonthlyReports: "Monthly Reports",
  checkEscalations: "Escalations",
};

const cronJobColumns: DataTableColumns<any> = [
  {
    title: "Service", key: "name", align: "right",
    render: (row) => h("span", { style: "font-size:13px; font-weight:500" }, JOB_NAME_HE[row.name] ?? row.name),
  },
  {
    title: "Status", key: "status", align: "center", width: 90,
    render: (row) => {
      const ok = !row.last_error && (row.consecutive_failures ?? 0) === 0;
      return h(NTag, { type: ok ? "success" : "error", size: "small", round: true },
        { default: () => ok ? "Healthy" : `${row.consecutive_failures} failures` });
    },
  },
  {
    title: "Last Run", key: "last_run_at", align: "right", width: 150,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.last_run_at ? new Date(row.last_run_at).toLocaleString("en-US") : "—"),
  },
  {
    title: "Last Success", key: "last_success_at", align: "right", width: 150,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.last_success_at ? new Date(row.last_success_at).toLocaleString("en-US") : "—"),
  },
  {
    title: "Last Error", key: "last_error", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color:var(--error-color,#d03050)" }, row.last_error ?? "—"),
  },
];

const monthlyScheduleColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", align: "right",
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "Enabled", key: "enabled", align: "center", width: 70,
    render: (row) =>
      h(NTag, { type: row.enabled ? "success" : "default", size: "small", round: true },
        { default: () => row.enabled ? "Yes" : "No" }),
  },
  {
    title: "Day of Month", key: "day", align: "center", width: 100,
    render: (row) => h("span", { style: "font-size:12px" }, row.day ?? "—"),
  },
  {
    title: "Hour", key: "hour", align: "center", width: 70,
    render: (row) => h("span", { style: "font-size:12px" }, row.hour != null ? `${row.hour}:00` : "—"),
  },
  {
    title: "Last Sent", key: "last_sent", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.last_sent ? new Date(row.last_sent).toLocaleDateString("en-US") : "—"),
  },
  {
    title: "Last Error", key: "last_error", align: "right", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color: var(--error-color,#d03050)" }, row.last_error ?? "—"),
  },
];

// ── Monthly reports monitor ────────────────────────────────────────────────
const monthlyMonitor = ref<any>(null);

const monthlyScheduleDetailColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", align: "right",
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "Enabled", key: "enabled", align: "center", width: 70,
    render: (row) =>
      h(NTag, { type: row.enabled ? "success" : "default", size: "small", round: true },
        { default: () => row.enabled ? "Yes" : "No" }),
  },
  {
    title: "Day", key: "day", align: "center", width: 70,
    render: (row) => h("span", { style: "font-size:12px" }, row.day ?? "—"),
  },
  {
    title: "Hour", key: "hour", align: "center", width: 70,
    render: (row) => h("span", { style: "font-size:12px" }, row.hour != null ? `${row.hour}:00` : "—"),
  },
  {
    title: "Formats", key: "formats", align: "right", width: 110,
    render: (row) => {
      let formats = row.formats ?? [];
      if (typeof formats === "string") { try { formats = JSON.parse(formats); } catch { formats = []; } }
      return h("span", { style: "font-size:12px" }, Array.isArray(formats) ? formats.join(", ") || "—" : "—");
    },
  },
  {
    title: "Recipients", key: "recipients", align: "right", ellipsis: { tooltip: true },
    render: (row) => {
      let recipients = row.recipients ?? [];
      if (typeof recipients === "string") { try { recipients = JSON.parse(recipients); } catch { recipients = []; } }
      return h("span", { style: "font-size:12px" }, Array.isArray(recipients) ? recipients.join(", ") || "—" : "—");
    },
  },
  {
    title: "Last Sent", key: "last_sent", align: "right", width: 130,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.last_sent ? new Date(row.last_sent).toLocaleDateString("en-US") : "—"),
  },
  {
    title: "Error", key: "last_error", align: "right", ellipsis: { tooltip: true },
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
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) {
    const m = Math.round(seconds / 60);
    return m === 1 ? "minute" : `${m} minutes`;
  }
  const h = Math.round(seconds / 3600);
  return h === 1 ? "hour" : `${h} hours`;
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
    message.error("Error loading data");
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
  direction: rtl;
  text-align: right;
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


.admin-env-badge__db {
  font-weight: 400;
  opacity: 0.75;
  margin-right: 2px;
}
</style>

