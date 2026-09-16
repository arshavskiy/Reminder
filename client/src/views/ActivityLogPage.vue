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

    <n-spin :show="loading">
      <ul v-if="rows.length" class="activity-list">
        <li v-for="row in rows" :key="row.id" class="activity-row" :class="`activity-row--${row.status}`">
          <span class="activity-row__dot" aria-hidden="true" />
          <div class="activity-row__body">
            <strong class="activity-row__title">{{ row.title }}</strong>
            <span v-if="row.detail" class="activity-row__detail">{{ row.detail }}</span>
          </div>
          <time class="activity-row__at" :dateTime="row.at">{{ formatAt(row.at) }}</time>
        </li>
      </ul>
      <p v-else-if="!loading" class="activity-empty">אין פעילות להצגה.</p>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import {onMounted, ref} from "vue";
import {NIcon, NSpin, useMessage} from "naive-ui";
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

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.activity-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.activity-row__dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--text-secondary);
}

.activity-row--ok .activity-row__dot { background: var(--brand-color, #18a058); }
.activity-row--failed .activity-row__dot { background: var(--color-error, #d03050); }

.activity-row__body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
}

.activity-row__title {
  font-size: 13px;
  color: var(--text-primary);
}

.activity-row__detail {
  font-size: 12px;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.activity-row__at {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.activity-empty {
  padding: 32px;
  text-align: center;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

@media (max-width: 600px) {
  .activity-row {
    flex-wrap: wrap;
  }

  .activity-row__at {
    width: 100%;
  }
}
</style>
