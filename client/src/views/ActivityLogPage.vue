<template>
  <div class="activity-page">
    <PageHeader :title="l.activity.title" :subtitle="l.activity.subtitle">
      <template #breadcrumb>
        <router-link v-if="route.query.kind === 'document'" :to="href('/documents')">{{ l.chrome.nav.documents }}</router-link>
        <router-link v-else :to="href('/reminders')">{{ l.chrome.nav.reminders }}</router-link>
        <span class="sep">/</span>
        <span>{{ l.activity.title }}</span>
      </template>
      <template #actions>
        <button class="rbtn rbtn--ghost" :disabled="loading" @click="load">
          <n-icon :class="{ 'refresh-icon--spin': loading }" :component="RefreshOutline" class="btn-icon" />
          {{ l.common.refresh }}
        </button>
      </template>
    </PageHeader>

    <div class="quick-filterbar">
      <button
        v-for="option in kindFilters"
        :key="option.value"
        class="quick-pill"
        :class="{ 'quick-pill--active': kind === option.value }"
        type="button"
        @click="selectKind(option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <n-data-table
      :columns="columns"
      :data="rows"
      :loading="loading"
      :pagination="{ pageSize: 25 }"
      :row-key="(r: ActivityRow) => r.id"
      :scroll-x="820"
      size="small"
      class="activity-table"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, h, onMounted, ref} from "vue";
import {useRoute, useRouter} from "vue-router";
import {NDataTable, NIcon, NTag, useMessage} from "naive-ui";
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
};
type KindFilter = "all" | "email" | "document";

const route = useRoute();
const {l, href} = useI18n();
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

function formatAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("he-IL", {dateStyle: "short", timeStyle: "short"});
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
      title: l.value.activity.colKind,
      key: "kind",
      width: 90,
      render: (row: ActivityRow) => KIND_LABEL[row.kind],
    },
    {
      title: l.value.activity.colTitle,
      key: "title",
      minWidth: 220,
      sorter: (a: ActivityRow, b: ActivityRow) => a.title.localeCompare(b.title),
      render: (row: ActivityRow) =>
        row.document_id
          ? h(
            "a",
            {
              href: `/documents/${row.document_id}`,
              class: "activity-link",
              onClick: (event: MouseEvent) => {
                event.preventDefault();
                router.push(`/documents/${row.document_id}?from=activity`);
              },
            },
            row.title,
          )
          : row.title,
    },
    {
      title: l.value.activity.colDetail,
      key: "detail",
      minWidth: 260,
      render: (row: ActivityRow) => row.detail ?? "—",
    },
    {
      title: l.value.activity.colStatus,
      key: "status",
      width: 100,
      render: (row: ActivityRow) => h(NTag, {type: STATUS_TAG[row.status].type, size: "small"}, {default: () => STATUS_TAG[row.status].label}),
    },
    {
      title: l.value.activity.colAt,
      key: "at",
      width: 160,
      defaultSortOrder: "descend" as const,
      sorter: (a: ActivityRow, b: ActivityRow) => a.at.localeCompare(b.at),
      render: (row: ActivityRow) => formatAt(row.at),
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

.activity-table {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 14px;
}

@media (max-width: 600px) {
  .activity-table :deep(.n-data-table-wrapper) {
    overflow-x: auto;
  }
}
</style>
