<template>
  <div class="page2" :dir="dir">
    <PageHeader :title="l.recurring.title" :subtitle="l.recurring.subtitle">
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


    <n-spin :show="loading && !items.length">
      <div v-if="items.length" class="recurring-table-wrap">
        <table class="recurring-table">
          <thead>
            <tr>
              <th>{{ l.recurring.colSupplier }}</th>
              <th>{{ l.recurring.colCategory }}</th>
              <th>{{ l.recurring.colOccurrences }}</th>
              <th>{{ l.recurring.colMonths }}</th>
              <th>{{ l.recurring.colAvgAmount }}</th>
              <th>{{ l.recurring.colRange }}</th>
              <th>{{ l.recurring.colLastSeen }}</th>
              <th>{{ l.recurring.colStable }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.supplier" :class="{ 'recurring-row--stable': item.amount_stable }">
              <td dir="auto" class="recurring-supplier">{{ item.supplier }}</td>
              <td>{{ categoryLabel(item.category) }}</td>
              <td class="recurring-num">{{ item.occurrences }}</td>
              <td class="recurring-num">{{ item.months_active }}</td>
              <td class="recurring-num">{{ formatMoney(item.avg_amount) }}</td>
              <td class="recurring-num recurring-range">
                <span v-if="item.min_amount === item.max_amount">—</span>
                <span v-else>{{ formatMoney(item.min_amount) }} – {{ formatMoney(item.max_amount) }}</span>
              </td>
              <td class="recurring-num">{{ item.last_date }}</td>
              <td class="recurring-stable">
                <n-tag v-if="item.amount_stable" type="success" size="small">{{ l.recurring.stable }}</n-tag>
                <n-tag v-else type="warning" size="small">{{ l.recurring.variable }}</n-tag>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="!loading" class="recurring-empty">
        <n-icon :component="RepeatOutline" :size="40" class="recurring-empty__icon" />
        <p>{{ l.recurring.empty }}</p>
      </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { NIcon, NSpin, NTag, useMessage } from "naive-ui";
import { RefreshOutline, RepeatOutline } from "@vicons/ionicons5";
import PageHeader from "../components/PageHeader.vue";
import { useI18n } from "../composables/useI18n.js";
import { api, type RecurringPaymentItem } from "../services/apiService.js";

const { l, dir, intl } = useI18n();
const message = useMessage();

const items = ref<RecurringPaymentItem[]>([]);
const loading = ref(false);

function formatMoney(value: number): string {
  return new Intl.NumberFormat(intl.value, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(value);
}

function categoryLabel(key: string): string {
  const cats = l.value.providerCategory as Record<string, string>;
  return cats[key] ?? key;
}

async function load(force = false) {
  loading.value = true;
  try {
    const result = await api.invoices.recurringPayments();
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

.recurring-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.recurring-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.recurring-table thead th {
  padding: 10px 14px;
  text-align: start;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}

.recurring-table tbody tr {
  border-bottom: 1px solid var(--border-color);
  transition: background 0.15s;
}

.recurring-table tbody tr:last-child {
  border-bottom: none;
}

.recurring-table tbody tr:hover {
  background: var(--bg-elevated);
}

.recurring-table td {
  padding: 10px 14px;
  vertical-align: middle;
}

.recurring-supplier {
  font-weight: 500;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recurring-num {
  font-variant-numeric: tabular-nums;
  text-align: end;
}

.recurring-range {
  font-size: 12px;
  color: var(--text-secondary);
}

.recurring-stable {
  text-align: center;
}

.recurring-row--stable .recurring-supplier {
  color: var(--brand-color);
}

.recurring-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--text-secondary);
}

.recurring-empty__icon {
  color: var(--text-muted, var(--text-secondary));
  opacity: 0.5;
}
</style>
