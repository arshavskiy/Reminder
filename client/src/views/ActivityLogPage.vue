<template>
  <div class="activity-page" :dir="dir">
    <PageHeader :title="l.activity.title" :subtitle="l.activity.subtitle">
      <template #breadcrumb>
        <router-link v-if="route.query.kind === 'document'" :to="href('/documents')">{{ l.chrome.nav.documents }}</router-link>
        <router-link v-else :to="href('/reminders')">{{ l.chrome.nav.reminders }}</router-link>
        <span class="sep">/</span>
        <span>{{ l.activity.title }}</span>
      </template>
      <template #tools>
        <n-tooltip placement="bottom">
          <template #trigger>
            <button
              class="rbtn rbtn--ghost rbtn--icon"
              type="button"
              :disabled="loading"
              :aria-label="l.common.refresh"
              @click="load"
            >
              <n-icon :class="{ 'refresh-icon--spin': loading }" :component="RefreshOutline" :size="18" />
            </button>
          </template>
          {{ l.common.refresh }}
        </n-tooltip>
      </template>
    </PageHeader>

    <div class="quick-filterbar">
      <ResponsiveFilterButton
        v-for="option in kindFilters"
        :key="option.value"
        class="quick-pill"
        :class="{ 'quick-pill--active': kind === option.value }"
        type="button"
        @click="selectKind(option.value)"

        :aria-pressed="kind === option.value"
        :filter-key="option.value"
        :label="option.label"
      />
    </div>

    <n-data-table
      :columns="columns"
      :data="rows"
      :loading="loading"
      :pagination="{ pageSize: 20 }"
      :row-key="(r: ActivityRow) => r.id"
      :scroll-x="980"
      size="small"
      class="activity-table"
    />
  </div>
</template>

<script setup lang="ts">
import ResponsiveFilterButton from "../components/ResponsiveFilterButton.vue";
import {computed, h, onMounted, ref} from "vue";
import {useRoute, useRouter} from "vue-router";
import {NDataTable, NIcon, NTooltip, useMessage} from "naive-ui";
import {RefreshOutline} from "@vicons/ionicons5";
import {api} from "../services/apiService.js";
import PageHeader from "../components/PageHeader.vue";
import {useI18n} from "../composables/useI18n.js";

type ActivityRow = {
  id: string;
  kind: "email" | "document";
  title: string;
  detail: string | null;
  at: string;
  status: "ok" | "failed" | "info";
  document_id: string | null;
  client_name?: string | null;
  recipient?: string | null;
  subject?: string | null;
  file_name?: string | null;
  note?: string | null;
  channel?: "email" | "system";
};
type KindFilter = "all" | "email" | "document";

const route = useRoute();
const {l, href, dir} = useI18n();
const router = useRouter();
const rows = ref<ActivityRow[]>([]);
const loading = ref(false);
const kind = ref<KindFilter>(route.query.kind === "document" || route.query.kind === "email" ? route.query.kind : "all");
const message = useMessage();

const kindFilters = computed<Array<{ label: string; value: KindFilter }>>(() => [
  {label: l.value.activity.filterAll, value: "all"},
  {label: l.value.activity.filterReminders, value: "email"},
  {label: l.value.activity.filterDocuments, value: "document"},
]);

function formatWhen(value: string): {time: string; day: string} | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return {
    time: date.toLocaleTimeString("he-IL", {hour: "2-digit", minute: "2-digit"}),
    day: date.toLocaleDateString("he-IL"),
  };
}

function cellStack(primary: ReturnType<typeof h>, lines: Array<string | null | undefined>) {
  const subs = lines.filter((line): line is string => !!line && line.trim().length > 0);
  return h("div", {class: "cell-stack"}, [
    primary,
    ...subs.map((line, index) => h("div", {class: index === subs.length - 1 && subs.length > 1 ? "cell-meta" : "cell-sub"}, line)),
  ]);
}

function selectKind(value: KindFilter) {
  kind.value = value;
  load();
}

const columns = computed(() => {
  const KIND_LABEL: Record<ActivityRow["kind"], string> = {email: l.value.activity.kindReminder, document: l.value.activity.kindDocument};
  const STATUS_TAG: Record<ActivityRow["status"], {type: "success" | "error" | "default"; label: string}> = {
    ok: {type: "success", label: l.value.activity.statusOk},
    failed: {type: "error", label: l.value.activity.statusFailed},
    info: {type: "default", label: l.value.activity.statusInfo},
  };

  return [
    {
      title: l.value.activity.colTitle,
      key: "title",
      minWidth: 220,
      sorter: (a: ActivityRow, b: ActivityRow) => a.title.localeCompare(b.title),
      render: (row: ActivityRow) => {
        const label = row.kind === "document" ? (row.file_name || row.title) : row.title;
        const primary = row.document_id
          ? h(
            "a",
            {
              href: `/documents/${row.document_id}`,
              class: "activity-link cell-primary",
              onClick: (event: MouseEvent) => {
                event.preventDefault();
                router.push(`/documents/${row.document_id}?from=activity`);
              },
            },
            label,
          )
          : h("div", {class: "cell-primary"}, label);
        return cellStack(primary, [row.kind === "email" ? row.subject : null]);
      },
    },
    {
      title: l.value.activity.colParty,
      key: "client_name",
      minWidth: 200,
      render: (row: ActivityRow) => cellStack(
        h("div", {class: "cell-primary"}, row.client_name || "—"),
        [row.recipient],
      ),
    },
    {
      title: l.value.activity.colKind,
      key: "kind",
      width: 120,
      render: (row: ActivityRow) => h("div", {class: "cell-primary"}, KIND_LABEL[row.kind]),
    },
    {
      title: l.value.activity.colStatus,
      key: "status",
      width: 110,
      render: (row: ActivityRow) => h(
        "span",
        {class: `status-pill status-pill--${row.status}`},
        STATUS_TAG[row.status].label,
      ),
    },
    {
      title: l.value.activity.colAt,
      key: "at",
      width: 140,
      defaultSortOrder: "descend" as const,
      sorter: (a: ActivityRow, b: ActivityRow) => a.at.localeCompare(b.at),
      render: (row: ActivityRow) => {
        const when = formatWhen(row.at);
        if (!when) return row.at;
        return cellStack(
          h("div", {class: "cell-primary cell-primary--time"}, when.time),
          [when.day],
        );
      },
    },
    {
      title: l.value.activity.colDetail,
      key: "note",
      minWidth: 160,
      render: (row: ActivityRow) => h(
        "div",
        {class: row.note ? "cell-sub" : "cell-muted"},
        row.note || l.value.activity.noNote,
      ),
    },
  ];
});

async function load() {
  loading.value = true;
  try {
    const result = await api.reminders.activity(
      {limit: 200, kind: kind.value === "all" ? undefined : kind.value},
      true,
    );
    rows.value = result.rows;
  } catch (err) {
    message.error(err instanceof Error ? err.message : l.value.activity.loadFailed);
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.activity-page {
  max-width: 100%;
  display: grid;
  gap: 16px;
  font-family: inherit;
}

.rbtn {
  display: inline-flex;
  align-items: center;
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
  white-space: nowrap;
}

.rbtn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.rbtn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.rbtn--icon {
  width: 36px;
  min-width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  justify-content: center;
  border-radius: 10px;
}

.refresh-icon--spin {
  animation: activity-spin 0.9s linear infinite;
}

@keyframes activity-spin {
  to { transform: rotate(360deg); }
}

.quick-filterbar {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 5px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
}

.quick-pill {
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
}

.quick-pill--active {
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.activity-table :deep(.activity-link) {
  color: var(--brand-color);
  text-decoration: none;
}
.activity-table :deep(.activity-link:hover) {
  text-decoration: underline;
}

.activity-table :deep(.n-data-table-th) {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.activity-table :deep(.n-data-table-td) {
  vertical-align: top;
  padding-top: 14px;
  padding-bottom: 14px;
  color: var(--text-primary);
}

.activity-table :deep(.cell-stack) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.activity-table :deep(.cell-primary) {
  font-weight: 400;
  color: var(--text-primary);
  line-height: 1.35;
}

.activity-table :deep(.cell-primary--time) {
  font-variant-numeric: tabular-nums;
}

.activity-table :deep(.cell-sub),
.activity-table :deep(.cell-meta),
.activity-table :deep(.cell-muted) {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--text-secondary);
}

.activity-table :deep(.status-pill) {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 400;
  background: color-mix(in srgb, var(--brand-color) 16%, transparent);
  color: var(--brand-color);
}

.activity-table :deep(.status-pill--failed) {
  background: rgba(208, 48, 80, 0.12);
  color: #d03050;
}

.activity-table :deep(.status-pill--info) {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.activity-table {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

@media (max-width: 600px) {
  .activity-table :deep(.n-data-table-wrapper) {
    overflow-x: auto;
  }
}
</style>
