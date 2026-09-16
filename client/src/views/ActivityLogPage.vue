<template>
  <div class="activity-page">
    <header class="activity-hero">
      <div>
        <h1>יומן פעילות</h1>
        <p>היסטוריית שליחת תזכורות ומסמכים שנוספו, מהחדש לישן.</p>
      </div>
      <button class="rbtn rbtn--ghost" :disabled="loading" @click="load">
        <n-icon :class="{ 'refresh-icon--spin': loading }" :component="RefreshOutline" class="btn-icon" />
        רענן
      </button>
    </header>

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
import {h, onMounted, ref} from "vue";
import {NDataTable, NIcon, NTag, useMessage} from "naive-ui";
import {RefreshOutline} from "@vicons/ionicons5";
import {api} from "../services/apiService.js";

type ActivityRow = {
  id: string;
  kind: "email" | "document";
  title: string;
  detail: string | null;
  at: string;
  status: "ok" | "failed" | "info";
};
type KindFilter = "all" | "email" | "document";

const rows = ref<ActivityRow[]>([]);
const loading = ref(false);
const kind = ref<KindFilter>("all");
const message = useMessage();

const kindFilters: Array<{ label: string; value: KindFilter }> = [
  {label: "הכל", value: "all"},
  {label: "תזכורות", value: "email"},
  {label: "מסמכים", value: "document"},
];

function formatAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("he-IL", {dateStyle: "short", timeStyle: "short"});
}

function selectKind(value: KindFilter) {
  kind.value = value;
  load();
}

const KIND_LABEL: Record<ActivityRow["kind"], string> = {email: "תזכורת", document: "מסמך"};
const STATUS_TAG: Record<ActivityRow["status"], {type: "success" | "error" | "default"; label: string}> = {
  ok: {type: "success", label: "בוצע"},
  failed: {type: "error", label: "נכשל"},
  info: {type: "default", label: "מידע"},
};

const columns = [
  {
    title: "סוג",
    key: "kind",
    width: 90,
    render: (row: ActivityRow) => KIND_LABEL[row.kind],
  },
  {
    title: "כותרת",
    key: "title",
    minWidth: 220,
    sorter: (a: ActivityRow, b: ActivityRow) => a.title.localeCompare(b.title),
  },
  {
    title: "פירוט",
    key: "detail",
    minWidth: 260,
    render: (row: ActivityRow) => row.detail ?? "—",
  },
  {
    title: "סטטוס",
    key: "status",
    width: 100,
    render: (row: ActivityRow) => h(NTag, {type: STATUS_TAG[row.status].type, size: "small"}, {default: () => STATUS_TAG[row.status].label}),
  },
  {
    title: "מועד",
    key: "at",
    width: 160,
    defaultSortOrder: "descend" as const,
    sorter: (a: ActivityRow, b: ActivityRow) => a.at.localeCompare(b.at),
    render: (row: ActivityRow) => formatAt(row.at),
  },
];

async function load() {
  loading.value = true;
  try {
    const result = await api.reminders.activity(
      {limit: 200, kind: kind.value === "all" ? undefined : kind.value},
      true,
    );
    rows.value = result.rows;
  } catch (err) {
    message.error(err instanceof Error ? err.message : "טעינת יומן הפעילות נכשלה");
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

.activity-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.activity-hero h1 {
  margin: 0;
  font-size: 24px;
  color: var(--text-primary);
}

.activity-hero p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
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
