<template>
  <div class="page2" :dir="dir">
    <PageHeader :title="l.importHistoryMsg.title" :subtitle="l.importHistoryMsg.subtitle">
      <template #hero>
        <button class="rbtn rbtn--ghost" type="button" :class="{ 'rbtn--loading': loading }" @click="load(true)">
          <n-icon :component="RefreshOutline" class="btn-icon" />
          {{ l.expensesMsg.refresh }}
        </button>
      </template>
      <template #title-extra>
        <n-spin v-if="loading" :size="18" class="title-loader" />
      </template>
    </PageHeader>

    <div v-if="retryableCount > 0 || rejectedCount > 0" class="retry-bar">
      <n-button
        v-if="retryableCount > 0"
        size="small"
        :loading="retrying === 'failed'"
        :disabled="!!retrying"
        @click="retry('failed')"
      >
        <template #icon><n-icon :component="RefreshCircleOutline" /></template>
        {{ l.importHistoryMsg.retryFailed }} ({{ retryableCount }})
      </n-button>
      <n-button
        v-if="rejectedCount > 0"
        size="small"
        :loading="retrying === 'rejected'"
        :disabled="!!retrying"
        @click="retry('rejected')"
      >
        <template #icon><n-icon :component="RefreshCircleOutline" /></template>
        {{ l.importHistoryMsg.retryRejected }} ({{ rejectedCount }})
      </n-button>
    </div>

    <n-spin :show="loading && !items.length">
      <div v-if="items.length" class="history-list">
        <div v-for="item in items" :key="item.message_id" class="history-row">
          <button class="history-row__head" type="button" @click="toggle(item.message_id)">
            <n-icon :component="expanded.has(item.message_id) ? ChevronDownOutline : ChevronForwardOutline" :size="14" class="history-row__chevron" />
            <span class="history-row__subject" dir="auto">{{ item.subject || '—' }}</span>
            <span class="history-row__date">{{ fmtDate(item.imported_at) }}</span>
            <span class="history-row__badge-group">
              <span v-for="(count, status) in statusSummary(item)" :key="status" class="status-badge" :class="`status-badge--${status}`">{{ count }}</span>
            </span>
          </button>
          <div v-if="expanded.has(item.message_id)" class="history-row__files">
            <div v-for="(file, fi) in (item.files ?? [])" :key="fi" class="file-row">
              <span class="file-row__name" dir="auto">{{ file.filename }}</span>
              <span class="file-row__status status-badge" :class="`status-badge--${file.import_status ?? 'unknown'}`">{{ statusLabel(file.import_status) }}</span>
              <span v-if="file.import_explanation" class="file-row__explanation">{{ file.import_explanation }}</span>
              <router-link v-if="file.document?.invoice_id" :to="`/invoices/${file.document.invoice_id}`" class="file-row__link">
                <n-icon :component="ReceiptOutline" :size="13" class="btn-icon" />
                {{ l.importHistoryMsg.openInvoice }}
              </router-link>
            </div>
            <div v-if="!item.files?.length" class="file-row file-row--empty">—</div>
          </div>
        </div>
      </div>
      <div v-else-if="!loading" class="history-empty">
        <n-icon :component="MailOutline" :size="40" class="history-empty__icon" />
        <p>{{ l.importHistoryMsg.empty }}</p>
      </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { NButton, NIcon, NSpin, useMessage } from "naive-ui";
import { ChevronDownOutline, ChevronForwardOutline, MailOutline, ReceiptOutline, RefreshCircleOutline, RefreshOutline } from "@vicons/ionicons5";
import PageHeader from "../components/PageHeader.vue";
import { useI18n } from "../composables/useI18n.js";
import { api, type GmailImportHistoryItem } from "../services/apiService.js";

const { l, dir, intl } = useI18n();
const message = useMessage();

const items = ref<GmailImportHistoryItem[]>([]);
const loading = ref(false);
const retrying = ref<string | null>(null);
const expanded = ref(new Set<string>());

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat(intl.value, { dateStyle: "medium" }).format(new Date(iso));
}

function statusLabel(status?: string): string {
  const m = l.value.importHistoryMsg;
  const map: Record<string, string> = {
    invoice: m.statusInvoice,
    stored: m.statusStored,
    rejected: m.statusRejected,
    failed: m.statusFailed,
    ocr_failed: m.statusOcrFailed,
    skipped: m.statusSkipped,
    quota_limited: m.statusQuota,
  };
  return map[status ?? ""] ?? m.statusUnknown;
}

function statusSummary(item: GmailImportHistoryItem): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of item.files ?? []) {
    const s = file.import_status ?? "unknown";
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
}

const retryableCount = computed(() =>
  items.value.reduce((n, item) =>
    n + (item.files ?? []).filter((f) => f.retryable && f.import_status === "failed").length, 0)
);

const rejectedCount = computed(() =>
  items.value.reduce((n, item) =>
    n + (item.files ?? []).filter((f) => f.import_status === "rejected").length, 0)
);

function toggle(messageId: string) {
  if (expanded.value.has(messageId)) expanded.value.delete(messageId);
  else expanded.value.add(messageId);
}

async function load(_force = false) {
  loading.value = true;
  try {
    const result = await api.gmail.importHistory();
    items.value = result.history;
  } catch {
    message.error(l.value.importHistoryMsg.loadError);
  } finally {
    loading.value = false;
  }
}

async function retry(mode: "failed" | "rejected") {
  retrying.value = mode;
  try {
    await api.gmail.importRetry(mode);
    message.success(l.value.importHistoryMsg.retryDone);
    await load(true);
  } catch {
    message.error(l.value.importHistoryMsg.retryError);
  } finally {
    retrying.value = null;
  }
}

onMounted(() => load());
</script>

<style scoped>
.title-loader { margin-inline-start: 8px; vertical-align: middle; }

.retry-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-row {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  overflow: hidden;
}

.history-row__head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  text-align: start;
}

.history-row__head:hover { background: var(--bg-elevated); }

.history-row__chevron { flex-shrink: 0; color: var(--text-secondary); }

.history-row__subject {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.history-row__date {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.history-row__badge-group {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.history-row__files {
  border-top: 1px solid var(--border-color);
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 4px 0;
  flex-wrap: wrap;
}

.file-row__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
}

.file-row__explanation {
  color: var(--text-secondary);
  font-size: 11px;
}

.file-row__link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--brand-color);
  text-decoration: none;
  font-size: 12px;
}

.file-row__link:hover { text-decoration: underline; }

.file-row--empty { color: var(--text-secondary); }

.status-badge {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.status-badge--invoice { background: color-mix(in srgb, var(--brand-color) 18%, transparent); color: var(--brand-color); }
.status-badge--stored { background: color-mix(in srgb, var(--brand-color) 12%, transparent); color: var(--brand-color); }
.status-badge--rejected { background: color-mix(in srgb, #f59e0b 15%, transparent); color: #b45309; }
.status-badge--failed, .status-badge--ocr_failed { background: color-mix(in srgb, var(--error-color) 15%, transparent); color: var(--error-color); }
.status-badge--skipped, .status-badge--quota_limited, .status-badge--unknown { background: color-mix(in srgb, var(--text-secondary) 12%, transparent); color: var(--text-secondary); }

@media (prefers-color-scheme: dark) {
  .status-badge--rejected { color: #fbbf24; }
}

.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--text-secondary);
}

.history-empty__icon { color: var(--brand-color); opacity: 0.6; }
</style>
