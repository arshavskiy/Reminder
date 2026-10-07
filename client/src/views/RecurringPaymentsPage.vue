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


    <div class="recurring-search">
      <n-input
        v-model:value="searchQ"
        :placeholder="l.invoices.searchPlaceholder"
        clearable
        size="small"
        class="recurring-search__input"
      />
    </div>

    <n-spin :show="loading && !items.length">
      <div v-if="filteredItems.length" class="recurring-table-wrap">
        <table class="recurring-table">
          <thead>
            <tr>
              <th>
                <button class="sort-btn" @click="setSortBy('supplier')">
                  {{ l.recurring.colSupplier }}
                  <n-icon :component="sortBy === 'supplier' ? (sortDir === 'asc' ? ArrowUpOutline : ArrowDownOutline) : SwapVerticalOutline" :size="13" />
                </button>
              </th>
              <th>
                <button class="sort-btn" @click="setSortBy('category')">
                  {{ l.recurring.colCategory }}
                  <n-icon :component="sortBy === 'category' ? (sortDir === 'asc' ? ArrowUpOutline : ArrowDownOutline) : SwapVerticalOutline" :size="13" />
                </button>
              </th>
              <th class="recurring-num">
                <button class="sort-btn sort-btn--end" @click="setSortBy('occurrences')">
                  {{ l.recurring.colOccurrences }}
                  <n-icon :component="sortBy === 'occurrences' ? (sortDir === 'asc' ? ArrowUpOutline : ArrowDownOutline) : SwapVerticalOutline" :size="13" />
                </button>
              </th>
              <th class="recurring-num">
                <button class="sort-btn sort-btn--end" @click="setSortBy('months_active')">
                  {{ l.recurring.colMonths }}
                  <n-icon :component="sortBy === 'months_active' ? (sortDir === 'asc' ? ArrowUpOutline : ArrowDownOutline) : SwapVerticalOutline" :size="13" />
                </button>
              </th>
              <th class="recurring-num">
                <button class="sort-btn sort-btn--end" @click="setSortBy('avg_amount')">
                  {{ l.recurring.colAvgAmount }}
                  <n-icon :component="sortBy === 'avg_amount' ? (sortDir === 'asc' ? ArrowUpOutline : ArrowDownOutline) : SwapVerticalOutline" :size="13" />
                </button>
              </th>
              <th class="recurring-num">{{ l.recurring.colRange }}</th>
              <th class="recurring-num">
                <button class="sort-btn sort-btn--end" @click="setSortBy('last_date')">
                  {{ l.recurring.colLastSeen }}
                  <n-icon :component="sortBy === 'last_date' ? (sortDir === 'asc' ? ArrowUpOutline : ArrowDownOutline) : SwapVerticalOutline" :size="13" />
                </button>
              </th>
              <th class="recurring-stable">{{ l.recurring.colStable }}</th>
              <th class="recurring-num">{{ l.recurring.colNextCharge }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredItems" :key="item.supplier" :class="{ 'recurring-row--stable': item.amount_stable }">
              <td class="recurring-supplier">
                <span dir="auto" class="recurring-truncate" :title="item.supplier">{{ item.supplier }}</span>
              </td>
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
              <td class="recurring-num recurring-predicted">
                <span v-if="item.next_predicted_date" class="predicted-date">{{ item.next_predicted_date }}</span>
                <span v-else class="predicted-none">—</span>
              </td>
              <td class="recurring-action">
                <n-tooltip :disabled="!item.next_predicted_date" placement="top">
                  <template #trigger>
                    <button
                      class="btn btn--ghost btn--xs icon-btn"
                      :disabled="!item.next_predicted_date || remindingSet.has(item.supplier)"
                      @click="createReminder(item)"
                    >
                      <n-icon :component="remindingSet.has(item.supplier) ? CheckmarkOutline : AlarmOutline" :size="15" />
                    </button>
                  </template>
                  {{ l.recurring.remindMe }}
                </n-tooltip>
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
import { computed, onMounted, ref } from "vue";
import { NIcon, NInput, NSpin, NTag, NTooltip, useMessage } from "naive-ui";
import { AlarmOutline, ArrowDownOutline, ArrowUpOutline, CheckmarkOutline, RefreshOutline, RepeatOutline, SwapVerticalOutline } from "@vicons/ionicons5";
import PageHeader from "../components/PageHeader.vue";
import { useI18n } from "../composables/useI18n.js";
import { api, type RecurringPaymentItem } from "../services/apiService.js";

const { l, dir, intl } = useI18n();
const message = useMessage();

const items = ref<RecurringPaymentItem[]>([]);
const loading = ref(false);
const searchQ = ref("");
const remindingSet = ref(new Set<string>());
const sortBy = ref<keyof RecurringPaymentItem>("occurrences");
const sortDir = ref<"asc" | "desc">("desc");

function setSortBy(key: keyof RecurringPaymentItem) {
  if (sortBy.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortBy.value = key;
    sortDir.value = key === "supplier" || key === "category" ? "asc" : "desc";
  }
}

const filteredItems = computed(() => {
  let list = items.value;
  const q = searchQ.value.trim().toLowerCase();
  if (q) list = list.filter(i => i.supplier.toLowerCase().includes(q) || (i.category ?? "").toLowerCase().includes(q));
  return [...list].sort((a, b) => {
    const av = a[sortBy.value] ?? "";
    const bv = b[sortBy.value] ?? "";
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir.value === "asc" ? cmp : -cmp;
  });
});

function formatMoney(value: number): string {
  return new Intl.NumberFormat(intl.value, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(value);
}

function categoryLabel(key: string): string {
  const cats = l.value.providerCategory as Record<string, string>;
  return cats[key] ?? key;
}

async function createReminder(item: RecurringPaymentItem) {
  if (!item.next_predicted_date) {
    message.warning(l.value.recurring.noPrediction);
    return;
  }
  try {
    const title = l.value.recurring.remindTitle.replace("{supplier}", item.supplier);
    await api.reminders.createPersonal({
      title,
      target_date: item.next_predicted_date,
      advance_days: [3, 1],
      email_self: true,
      origin: "discovery",
    });
    remindingSet.value = new Set([...remindingSet.value, item.supplier]);
    message.success(l.value.recurring.remindCreated);
  } catch {
    message.error(l.value.recurring.remindError);
  }
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

.recurring-search {
  margin-bottom: 12px;
}

.recurring-search__input {
  max-width: 320px;
}

.sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.sort-btn--end {
  justify-content: flex-end;
  width: 100%;
}

.recurring-table-wrap {
  min-width: 0;
  max-width: 100%;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.recurring-table {
  width: 100%;
  min-width: 820px;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}

.recurring-table th,
.recurring-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-color);
  text-align: start;
  white-space: nowrap;
  vertical-align: middle;
}

.recurring-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.recurring-table tbody tr:last-child td {
  border-bottom: none;
}

.recurring-table tbody tr:hover td {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
}

.recurring-supplier {
  font-weight: 500;
}

.recurring-truncate {
  display: block;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recurring-table .recurring-num {
  font-variant-numeric: tabular-nums;
  text-align: end;
}

.recurring-range {
  font-size: 12px;
  color: var(--text-secondary);
}

.recurring-table .recurring-stable {
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

.recurring-predicted {
  color: var(--text-secondary);
  font-size: 12px;
}

.predicted-date {
  color: var(--brand-color);
  font-weight: 500;
}

.recurring-action {
  text-align: center;
  padding-inline: 8px;
}
</style>
