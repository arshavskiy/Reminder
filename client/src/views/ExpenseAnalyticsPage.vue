<template>
  <div class="page2 expense-page" dir="rtl">
    <PageHeader
      :count="totalInvoices"
      title="הוצאות לפי ספק"
      subtitle="גרף חודשי לפי תאריך חשבונית או תאריך ייבוא"
    >
      <template #hero>
        <button
          :disabled="loading"
          class="rbtn rbtn--ghost"
          type="button"
          @click="load(true)"
        >
          <n-icon :class="{ 'refresh-icon--spin': loading }" :component="RefreshOutline" class="btn-icon" />
          רענן
        </button>
      </template>
    </PageHeader>

    <InvoiceSectionNav />

    <div class="toolbar">
      <n-select
        v-model:value="dateBasis"
        :options="dateBasisOptions"
        class="toolbar__type"
        @update:value="load(true)"
      />
      <n-select
        v-model:value="category"
        :options="categoryOptions"
        clearable
        filterable
        placeholder="קטגוריה"
        class="toolbar__type"
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
        class="toolbar__supplier"
        @update:value="load(true)"
      />
      <n-date-picker
        v-model:value="dateRange"
        type="daterange"
        clearable
        class="toolbar__dates"
        @update:value="load(true)"
      />
    </div>

    <n-spin :show="loading">
      <section class="expense-summary" aria-label="סיכום הוצאות">
        <div class="expense-metric">
          <n-icon :component="WalletOutline" :size="18" class="expense-metric__icon" />
          <div>
            <span>סה״כ הוצאות עם סכום ותאריך</span>
            <strong>{{ formatMoney(totalAmount) }}</strong>
          </div>
        </div>
        <div class="expense-metric">
          <n-icon :component="PeopleOutline" :size="18" class="expense-metric__icon" />
          <div>
            <span>ספקים מוצגים</span>
            <strong>{{ chartSeries.length }}</strong>
          </div>
        </div>
        <div class="expense-metric">
          <n-icon :component="ReceiptOutline" :size="18" class="expense-metric__icon" />
          <div>
            <span>חשבוניות בגרף</span>
            <strong>{{ totalInvoices }}</strong>
          </div>
        </div>
        <div class="expense-metric">
          <n-icon :component="CalendarOutline" :size="18" class="expense-metric__icon" />
          <div>
            <span>חודשים</span>
            <strong>{{ months.length }}</strong>
          </div>
        </div>
      </section>

      <section class="expense-layout">
        <div class="expense-chart-panel">
          <header class="expense-panel__head">
            <h2>מגמה חודשית</h2>
            <p>כל קו מייצג ספק. עמודת הספקים מאפשרת לבודד ספק אחד.</p>
          </header>
          <div v-if="!chartSeries.length || !months.length" class="expense-empty">
            <n-icon :component="AnalyticsOutline" :size="40" class="expense-empty__icon" />
            <p>אין נתונים להצגה עבור הסינון הנוכחי</p>
          </div>
          <div v-else ref="chartEl" class="expense-chart" role="img" aria-label="גרף הוצאות חודשי לפי ספק" />
        </div>

        <aside class="expense-legend" aria-label="ספקים בגרף">
          <header class="expense-panel__head">
            <h2>לפי ספק</h2>
            <button
              v-if="selectedSuppliers.length"
              class="expense-legend__clear"
              type="button"
              @click="clearSupplierFilter"
            >
              <n-icon :component="CloseOutline" :size="14" />
              הצג הכל
            </button>
          </header>
          <button
            v-for="(series, index) in chartSeries"
            :key="series.supplier"
            :aria-pressed="isFocusedSupplier(series.supplier)"
            :class="{ 'expense-legend__item--active': isFocusedSupplier(series.supplier) }"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { NDatePicker, NIcon, NSelect, NSpin, type SelectOption, useMessage } from "naive-ui";
import {
  AnalyticsOutline,
  CalendarOutline,
  CloseOutline,
  PeopleOutline,
  RefreshOutline,
  ReceiptOutline,
  WalletOutline,
} from "@vicons/ionicons5";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import PageHeader from "../components/PageHeader.vue";
import InvoiceSectionNav from "../components/InvoiceSectionNav.vue";
import { api, type InvoiceExpenseMonthlySeries } from "../services/apiService.js";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const message = useMessage();
const chartEl = ref<HTMLDivElement | null>(null);
const loading = ref(false);
const dateBasis = ref<"invoice" | "import">("invoice");
const category = ref<string | null>(null);
const selectedSuppliers = ref<string[]>([]);
const dateRange = ref<[number, number] | null>(null);
const months = ref<string[]>([]);
const suppliers = ref<{ name: string; total: number }[]>([]);
const categories = ref<string[]>([]);
const chartSeries = ref<InvoiceExpenseMonthlySeries[]>([]);
const totalAmount = ref(0);
const totalInvoices = ref(0);
const themeTick = ref(0);
let chart: echarts.EChartsType | null = null;
let chartResizeObserver: ResizeObserver | null = null;
let themeObserver: MutationObserver | null = null;

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

const chartOption = computed<echarts.EChartsCoreOption>(() => {
  themeTick.value;
  const colors = chartPalette();
  const text = cssVar("--text-secondary", "#64748b");
  const border = cssVar("--border-color", "#d9dee8");
  const tooltipBg = cssVar("--bg-elevated", "#ffffff");
  const tooltipText = cssVar("--text-primary", "#2c3e50");
  return {
    color: colors,
    textStyle: {
      fontFamily: cssVar("--font-ui", "Segoe UI, Arial, sans-serif"),
      color: text,
    },
    tooltip: {
      trigger: "axis",
      confine: true,
      backgroundColor: tooltipBg,
      borderColor: border,
      textStyle: { color: tooltipText },
      extraCssText: "direction: rtl; text-align: right;",
      valueFormatter: (value) => formatMoney(Number(value ?? 0)),
    },
    grid: {
      top: 18,
      right: 12,
      left: 12,
      bottom: 28,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: months.value.map(formatMonth),
      axisLabel: {
        color: text,
        hideOverlap: true,
        rotate: months.value.length > 8 ? 28 : 0,
      },
      axisLine: { lineStyle: { color: border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      position: "right",
      axisLabel: {
        color: text,
        formatter: (value: number) => compactMoney(value),
      },
      splitLine: { lineStyle: { color: border, type: "dashed" } },
    },
    series: chartSeries.value.map((series, index) => ({
      name: series.supplier,
      type: "line",
      smooth: true,
      symbol: "circle",
      symbolSize: 7,
      emphasis: { focus: "series" },
      lineStyle: { width: 3 },
      areaStyle: { color: colors[index % colors.length], opacity: 0.08 },
      data: series.points.map((point) => point.total),
    })),
  };
});

onMounted(() => {
  window.addEventListener("resize", resizeChart);
  themeObserver = new MutationObserver(() => {
    themeTick.value += 1;
    chart?.dispose();
    chart = null;
    renderChart();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  load();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeChart);
  chartResizeObserver?.disconnect();
  chartResizeObserver = null;
  themeObserver?.disconnect();
  themeObserver = null;
  chart?.dispose();
  chart = null;
});

watch(chartOption, () => {
  renderChart();
}, { deep: true });

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
    totalAmount.value = result.totalAmount;
    totalInvoices.value = result.totalInvoices;
    await nextTick();
    renderChart();
  } catch {
    message.error("שגיאה בטעינת גרף ההוצאות");
  } finally {
    loading.value = false;
  }
}

function isFocusedSupplier(supplier: string): boolean {
  return selectedSuppliers.value.length === 1 && selectedSuppliers.value[0] === supplier;
}

function focusSupplier(supplier: string) {
  selectedSuppliers.value = isFocusedSupplier(supplier) ? [] : [supplier];
  load(true);
}

function clearSupplierFilter() {
  selectedSuppliers.value = [];
  load(true);
}

function renderChart() {
  if (!chartEl.value || !chartSeries.value.length || !months.value.length) return;
  if (!chart) {
    chart = echarts.init(chartEl.value);
    chartResizeObserver?.disconnect();
    chartResizeObserver = new ResizeObserver(() => chart?.resize());
    chartResizeObserver.observe(chartEl.value);
  }
  chart.setOption(chartOption.value, true);
  chart.resize();
}

function resizeChart() {
  chart?.resize();
}

function chartPalette(): string[] {
  const brand = cssVar("--brand-color", "#18a058");
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  return dark
    ? [brand, "#70c0e8", "#e88080", "#c084fc", "#5eead4", "#fb923c", "#94a3b8", "#fb7185"]
    : [brand, "#2080f0", "#d03050", "#7c3aed", "#0f766e", "#ea580c", "#64748b", "#be123c"];
}

function seriesColor(index: number): string {
  return chartPalette()[index % chartPalette().length];
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

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
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
.expense-page :deep(.invoice-section-nav) {
  margin-top: 2px;
}

.rbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  line-height: 1;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  white-space: nowrap;
}

.rbtn:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.rbtn:active {
  transform: scale(0.97);
}

.rbtn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.refresh-icon--spin {
  animation: expense-spin 0.8s linear infinite;
}

@keyframes expense-spin {
  to {
    transform: rotate(360deg);
  }
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0 16px;
  flex-wrap: wrap;
}

.toolbar__type {
  width: 200px;
}

.toolbar__supplier {
  width: 260px;
  flex: 1 1 260px;
}

.toolbar__dates {
  width: 260px;
}

.expense-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.expense-metric {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 88px;
  padding: 16px 18px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.expense-metric__icon {
  flex: 0 0 auto;
  color: var(--brand-color);
  opacity: 0.85;
  margin-top: 2px;
}

.expense-metric span {
  display: block;
  color: var(--text-secondary);
  font-size: 13px;
}

.expense-metric strong {
  display: block;
  margin-top: 6px;
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.3px;
}

.expense-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 16px;
  align-items: start;
}

.expense-chart-panel,
.expense-legend {
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.expense-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 0;
}

.expense-panel__head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.expense-panel__head p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.45;
}

.expense-chart-panel {
  min-height: 420px;
  padding-bottom: 12px;
}

.expense-chart {
  display: block;
  width: 100%;
  height: 360px;
}

.expense-empty {
  display: grid;
  place-items: center;
  justify-items: center;
  min-height: 320px;
  padding: 24px;
  color: var(--text-secondary);
  text-align: center;
}

.expense-empty__icon {
  color: var(--text-muted, var(--text-secondary));
  margin-bottom: 8px;
}

.expense-empty p {
  margin: 0;
  font-size: 14px;
}

.expense-legend {
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 0 10px 12px;
}

.expense-legend .expense-panel__head {
  padding-inline: 6px;
  margin-bottom: 6px;
}

.expense-legend__clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--brand-color);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.expense-legend__clear:hover,
.expense-legend__clear:focus-visible {
  background: color-mix(in srgb, var(--brand-color) 10%, transparent);
  outline: none;
}

.expense-legend__item {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 40px;
  padding: 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  text-align: right;
}

.expense-legend__item:hover,
.expense-legend__item:focus-visible {
  background: var(--bg-hover);
  outline: none;
}

.expense-legend__item--active {
  background: color-mix(in srgb, var(--brand-color) 12%, transparent);
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
  color: var(--text-secondary);
  font-weight: 700;
}

@media (max-width: 980px) {
  .expense-layout {
    grid-template-columns: 1fr;
  }

  .expense-summary {
    grid-template-columns: 1fr;
  }

  .toolbar__type,
  .toolbar__supplier,
  .toolbar__dates {
    width: 100%;
    min-width: 0;
  }
}

@media (max-width: 640px) {
  .expense-chart {
    height: 280px;
  }

  .expense-metric strong {
    font-size: 20px;
  }
}
</style>
