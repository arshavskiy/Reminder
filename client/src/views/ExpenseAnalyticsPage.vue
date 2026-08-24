<template>
  <div class="expense-page" dir="rtl">
    <PageHeader
      :count="totalInvoices"
      title="הוצאות לפי ספק"
      subtitle="גרף חודשי לפי תאריך חשבונית או תאריך ייבוא"
    />

    <InvoiceSectionNav />

    <section class="expense-controls" aria-label="סינון גרף הוצאות">
      <n-select
        v-model:value="dateBasis"
        :options="dateBasisOptions"
        class="expense-control expense-control--small"
        @update:value="load(true)"
      />
      <n-select
        v-model:value="category"
        :options="categoryOptions"
        clearable
        filterable
        placeholder="קטגוריה"
        class="expense-control"
        @update:value="load(true)"
      />
      <n-select
        v-model:value="selectedSuppliers"
        :options="supplierOptions"
        clearable
        filterable
        multiple
        max-tag-count="responsive"
        placeholder="ספקים"
        class="expense-control expense-control--wide"
        @update:value="load(true)"
      />
      <n-date-picker
        v-model:value="dateRange"
        type="daterange"
        clearable
        class="expense-control expense-control--dates"
        @update:value="load(true)"
      />
    </section>

    <n-spin :show="loading">
      <section class="expense-summary">
        <div class="expense-metric">
          <span>סה״כ בתקופה</span>
          <strong>{{ formatMoney(totalAmount) }}</strong>
        </div>
        <div class="expense-metric">
          <span>ספקים מוצגים</span>
          <strong>{{ chartSeries.length }}</strong>
        </div>
        <div class="expense-metric">
          <span>חודשים</span>
          <strong>{{ months.length }}</strong>
        </div>
      </section>

      <section class="expense-layout">
        <div class="expense-chart-panel">
          <div v-if="!chartSeries.length || !months.length" class="expense-empty">
            <p>אין נתונים להצגה עבור הסינון הנוכחי</p>
          </div>
          <svg v-else class="expense-chart" viewBox="0 0 920 420" role="img" aria-label="גרף הוצאות חודשי לפי ספק">
            <g class="expense-grid">
              <line v-for="tick in yTicks" :key="`grid-${tick.value}`" x1="64" :y1="tick.y" x2="880" :y2="tick.y" />
            </g>
            <g class="expense-axis">
              <text v-for="tick in yTicks" :key="`y-${tick.value}`" x="56" :y="tick.y + 4" text-anchor="end">
                {{ compactMoney(tick.value) }}
              </text>
              <text v-for="label in xLabels" :key="label.month" :x="label.x" y="398" text-anchor="middle">
                {{ formatMonth(label.month) }}
              </text>
            </g>
            <g v-for="(series, index) in chartSeries" :key="series.supplier">
              <polyline
                class="expense-line"
                :points="linePoints(series)"
                :stroke="seriesColor(index)"
              />
              <circle
                v-for="point in plottedPoints(series)"
                :key="`${series.supplier}-${point.month}`"
                class="expense-point"
                r="4"
                :cx="point.x"
                :cy="point.y"
                :fill="seriesColor(index)"
              >
                <title>{{ series.supplier }} · {{ formatMonth(point.month) }} · {{ formatMoney(point.total) }}</title>
              </circle>
            </g>
          </svg>
        </div>

        <aside class="expense-legend" aria-label="ספקים בגרף">
          <button
            v-for="(series, index) in chartSeries"
            :key="series.supplier"
            class="expense-legend__item"
            type="button"
            @click="focusSupplier(series.supplier)"
          >
            <span class="expense-legend__swatch" :style="{ background: seriesColor(index) }" />
            <span class="expense-legend__name" dir="auto">{{ series.supplier }}</span>
            <strong>{{ formatMoney(series.total) }}</strong>
          </button>
        </aside>
      </section>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { NDatePicker, NSelect, NSpin, type SelectOption, useMessage } from "naive-ui";
import PageHeader from "../components/PageHeader.vue";
import InvoiceSectionNav from "../components/InvoiceSectionNav.vue";
import { api, type InvoiceExpenseMonthlySeries } from "../services/apiService.js";

const message = useMessage();
const loading = ref(false);
const dateBasis = ref<"invoice" | "import">("invoice");
const category = ref<string | null>(null);
const selectedSuppliers = ref<string[]>([]);
const dateRange = ref<[number, number] | null>(null);
const months = ref<string[]>([]);
const suppliers = ref<{ name: string; total: number }[]>([]);
const categories = ref<string[]>([]);
const chartSeries = ref<InvoiceExpenseMonthlySeries[]>([]);

const dateBasisOptions: SelectOption[] = [
  { label: "תאריך חשבונית", value: "invoice" },
  { label: "תאריך ייבוא", value: "import" },
];

const supplierOptions = computed<SelectOption[]>(() =>
  suppliers.value.map((supplier) => ({
    label: `${supplier.name} · ${formatMoney(supplier.total)}`,
    value: supplier.name,
  })),
);

const categoryOptions = computed<SelectOption[]>(() =>
  categories.value.map((value) => ({ label: providerCategoryLabel(value), value })),
);

const totalAmount = computed(() => chartSeries.value.reduce((sum, series) => sum + series.total, 0));
const totalInvoices = computed(() => chartSeries.value.reduce((sum, series) => (
  sum + series.points.reduce((pointSum, point) => pointSum + point.count, 0)
), 0));
const maxValue = computed(() => Math.max(1, ...chartSeries.value.flatMap((series) => series.points.map((point) => point.total))));
const yTicks = computed(() => {
  const ticks = 4;
  return Array.from({ length: ticks + 1 }, (_, index) => {
    const value = (maxValue.value / ticks) * (ticks - index);
    return { value, y: chartY(value) };
  });
});
const xLabels = computed(() => months.value.map((month, index) => ({ month, x: chartX(index) })));

onMounted(() => {
  load();
});

async function load(force = false) {
  loading.value = true;
  try {
    const [dateFrom, dateTo] = dateRange.value ?? [];
    const result = await api.invoices.expenseMonthly({
      dateBasis: dateBasis.value,
      category: category.value ?? undefined,
      supplier: selectedSuppliers.value.length ? selectedSuppliers.value.join("||") : undefined,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString().slice(0, 10) : undefined,
      dateTo: dateTo ? new Date(dateTo).toISOString().slice(0, 10) : undefined,
      top: selectedSuppliers.value.length ? 20 : 8,
    }, force);
    months.value = result.months;
    suppliers.value = result.suppliers;
    categories.value = result.categories;
    chartSeries.value = result.series.filter((series) => series.total > 0);
  } catch {
    message.error("שגיאה בטעינת גרף ההוצאות");
  } finally {
    loading.value = false;
  }
}

function focusSupplier(supplier: string) {
  selectedSuppliers.value = [supplier];
  load(true);
}

function chartX(index: number): number {
  if (months.value.length <= 1) return 472;
  return 64 + (index / (months.value.length - 1)) * 816;
}

function chartY(value: number): number {
  return 40 + (1 - value / maxValue.value) * 320;
}

function linePoints(series: InvoiceExpenseMonthlySeries): string {
  return plottedPoints(series).map((point) => `${point.x},${point.y}`).join(" ");
}

function plottedPoints(series: InvoiceExpenseMonthlySeries) {
  return series.points.map((point, index) => ({
    ...point,
    x: chartX(index),
    y: chartY(point.total),
  }));
}

function seriesColor(index: number): string {
  const colors = ["#18a058", "#2563eb", "#dc2626", "#9333ea", "#0f766e", "#ea580c", "#64748b", "#be123c"];
  return colors[index % colors.length];
}

function formatMonth(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  if (!year || !monthIndex) return month;
  return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString("he-IL", { month: "short", year: "2-digit" });
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(value);
}

function compactMoney(value: number): string {
  return new Intl.NumberFormat("he-IL", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function providerCategoryLabel(value: string): string {
  const labels: Record<string, string> = {
    electricity: "חשמל",
    telecom: "תקשורת",
    water: "מים",
    transport: "תחבורה",
    parking: "חניה",
    fuel: "דלק",
    gas: "גז",
    tv: "טלוויזיה וסטרימינג",
    marketplace: "קניות",
    food: "מזון",
    payment: "תשלומים וחשבוניות",
    government: "ממשלה",
    municipality: "עירייה",
    insurance: "ביטוח",
    finance: "פיננסים",
    travel: "תיירות",
    healthcare: "בריאות",
    education: "לימודים",
    retail: "קמעונאות",
    nonprofit: "עמותות",
    digital: "דיגיטל",
    development: "פיתוח",
    general: "כללי",
  };
  return labels[value] ?? value;
}
</script>

<style scoped>
.expense-page {
  display: grid;
  gap: 18px;
}

.expense-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.expense-control {
  min-width: 180px;
}

.expense-control--small {
  min-width: 150px;
}

.expense-control--wide {
  min-width: 280px;
  flex: 1;
}

.expense-control--dates {
  min-width: 260px;
}

.expense-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.expense-metric {
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
}

.expense-metric span {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
}

.expense-metric strong {
  display: block;
  margin-top: 4px;
  color: var(--text-primary);
  font-size: 22px;
}

.expense-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 16px;
}

.expense-chart-panel,
.expense-legend {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.expense-chart-panel {
  min-height: 420px;
  padding: 16px;
  overflow-x: auto;
}

.expense-chart {
  display: block;
  width: 100%;
  min-width: 760px;
  height: auto;
}

.expense-grid line {
  stroke: color-mix(in srgb, var(--border-color) 72%, transparent);
}

.expense-axis text {
  fill: var(--text-secondary);
  font-size: 12px;
}

.expense-line {
  fill: none;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.expense-point {
  stroke: var(--bg-card);
  stroke-width: 2;
}

.expense-empty {
  display: grid;
  place-items: center;
  min-height: 360px;
  color: var(--text-secondary);
}

.expense-legend {
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 12px;
}

.expense-legend__item {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 38px;
  padding: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  text-align: right;
}

.expense-legend__item:hover {
  background: color-mix(in srgb, var(--brand-color) 7%, transparent);
}

.expense-legend__swatch {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.expense-legend__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expense-legend strong {
  direction: ltr;
  font-size: 12px;
}

@media (max-width: 980px) {
  .expense-layout {
    grid-template-columns: 1fr;
  }

  .expense-summary {
    grid-template-columns: 1fr;
  }
}
</style>
