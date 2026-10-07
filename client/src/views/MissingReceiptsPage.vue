<template>
  <div class="page2" :dir="dir">
    <PageHeader :title="l.missingReceipts.title" :subtitle="l.missingReceipts.subtitle">
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


    <p class="missing-hint">{{ l.missingReceipts.hint }}</p>

    <n-spin :show="loading && !items.length">
      <div v-if="items.length" class="missing-table-wrap">
        <table class="missing-table">
          <thead>
            <tr>
              <th>{{ l.missingReceipts.colSupplier }}</th>
              <th>{{ l.missingReceipts.colDate }}</th>
              <th>{{ l.missingReceipts.colAmount }}</th>
              <th>{{ l.missingReceipts.colSearch }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td dir="auto" class="missing-supplier">{{ item.supplier_name ?? l.invoices.unknownSupplier }}</td>
              <td class="missing-date">{{ item.issue_date ?? '—' }}</td>
              <td class="missing-amount">{{ item.amount != null ? formatMoney(item.amount, item.currency) : '—' }}</td>
              <td>
                <a :href="item.gmail_search_url" target="_blank" rel="noopener" class="missing-gmail-link">
                  <n-icon :component="MailOutline" :size="14" class="btn-icon" />
                  {{ l.missingReceipts.searchGmail }}
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="!loading" class="missing-empty">
        <n-icon :component="CheckmarkCircleOutline" :size="40" class="missing-empty__icon" />
        <p>{{ l.missingReceipts.empty }}</p>
      </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { NIcon, NSpin, useMessage } from "naive-ui";
import { CheckmarkCircleOutline, MailOutline, RefreshOutline } from "@vicons/ionicons5";
import PageHeader from "../components/PageHeader.vue";
import { useI18n } from "../composables/useI18n.js";
import { api, type MissingReceiptItem } from "../services/apiService.js";

const { l, dir, intl } = useI18n();
const message = useMessage();

const items = ref<MissingReceiptItem[]>([]);
const loading = ref(false);

function formatMoney(value: number, currency = "ILS"): string {
  return new Intl.NumberFormat(intl.value, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

async function load(_force = false) {
  loading.value = true;
  try {
    const result = await api.invoices.missingReceipts({ limit: 100 });
    items.value = result.items;
  } catch {
    message.error(l.value.expensesMsg.loadError);
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());
</script>

<style scoped>
.title-loader { margin-inline-start: 8px; vertical-align: middle; }

.missing-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 16px;
}

.missing-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.missing-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.missing-table thead th {
  padding: 10px 14px;
  text-align: start;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}

.missing-table tbody tr {
  border-bottom: 1px solid var(--border-color);
  transition: background 0.15s;
}

.missing-table tbody tr:last-child { border-bottom: none; }
.missing-table tbody tr:hover { background: var(--bg-elevated); }

.missing-table td {
  padding: 10px 14px;
  vertical-align: middle;
}

.missing-supplier {
  font-weight: 500;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.missing-date, .missing-amount {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: end;
}

.missing-gmail-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--brand-color);
  text-decoration: none;
  font-size: 12px;
}

.missing-gmail-link:hover { text-decoration: underline; }

.missing-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--text-secondary);
}

.missing-empty__icon {
  color: var(--brand-color);
  opacity: 0.6;
}
</style>
