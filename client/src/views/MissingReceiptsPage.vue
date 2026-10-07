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

    <div class="missing-search">
      <n-input
        v-model:value="searchQ"
        :placeholder="l.invoices.searchPlaceholder"
        clearable
        size="small"
        class="missing-search__input"
      />
    </div>

    <n-spin :show="loading && !items.length">
      <div v-if="filteredItems.length" class="missing-table-wrap">
        <table class="missing-table">
          <thead>
            <tr>
              <th>
                <button class="sort-btn" @click="setSortBy('supplier_name')">
                  {{ l.missingReceipts.colSupplier }}
                  <n-icon :component="sortBy === 'supplier_name' ? (sortDir === 'asc' ? ArrowUpOutline : ArrowDownOutline) : SwapVerticalOutline" :size="13" />
                </button>
              </th>
              <th class="missing-date">
                <button class="sort-btn sort-btn--end" @click="setSortBy('issue_date')">
                  {{ l.missingReceipts.colDate }}
                  <n-icon :component="sortBy === 'issue_date' ? (sortDir === 'asc' ? ArrowUpOutline : ArrowDownOutline) : SwapVerticalOutline" :size="13" />
                </button>
              </th>
              <th class="missing-amount">
                <button class="sort-btn sort-btn--end" @click="setSortBy('amount')">
                  {{ l.missingReceipts.colAmount }}
                  <n-icon :component="sortBy === 'amount' ? (sortDir === 'asc' ? ArrowUpOutline : ArrowDownOutline) : SwapVerticalOutline" :size="13" />
                </button>
              </th>
              <th>{{ l.missingReceipts.colSearch }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredItems" :key="item.id">
              <td class="missing-supplier">
                <span dir="auto" class="missing-truncate" :title="item.supplier_name ?? undefined">
                  {{ item.supplier_name ?? l.invoices.unknownSupplier }}
                </span>
              </td>
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
import { computed, onMounted, ref } from "vue";
import { NIcon, NInput, NSpin, useMessage } from "naive-ui";
import { ArrowDownOutline, ArrowUpOutline, CheckmarkCircleOutline, MailOutline, RefreshOutline, SwapVerticalOutline } from "@vicons/ionicons5";
import PageHeader from "../components/PageHeader.vue";
import { useI18n } from "../composables/useI18n.js";
import { api, type MissingReceiptItem } from "../services/apiService.js";

const { l, dir, intl } = useI18n();
const message = useMessage();

const items = ref<MissingReceiptItem[]>([]);
const loading = ref(false);
const searchQ = ref("");
const sortBy = ref<keyof MissingReceiptItem>("issue_date");
const sortDir = ref<"asc" | "desc">("desc");

function setSortBy(key: keyof MissingReceiptItem) {
  if (sortBy.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortBy.value = key;
    sortDir.value = key === "supplier_name" ? "asc" : "desc";
  }
}

const filteredItems = computed(() => {
  let list = items.value;
  const q = searchQ.value.trim().toLowerCase();
  if (q) list = list.filter(i => (i.supplier_name ?? "").toLowerCase().includes(q));
  return [...list].sort((a, b) => {
    const av = a[sortBy.value] ?? "";
    const bv = b[sortBy.value] ?? "";
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir.value === "asc" ? cmp : -cmp;
  });
});

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

.missing-search {
  margin-bottom: 12px;
}

.missing-search__input {
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

.missing-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 16px;
}

.missing-table-wrap {
  min-width: 0;
  max-width: 100%;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.missing-table {
  width: 100%;
  min-width: 560px;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}

.missing-table th,
.missing-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-color);
  text-align: start;
  white-space: nowrap;
  vertical-align: middle;
}

.missing-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.missing-table tbody tr:last-child td { border-bottom: none; }
.missing-table tbody tr:hover td { background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card)); }

.missing-supplier {
  font-weight: 500;
}

.missing-truncate {
  display: block;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.missing-table .missing-date,
.missing-table .missing-amount {
  font-variant-numeric: tabular-nums;
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
