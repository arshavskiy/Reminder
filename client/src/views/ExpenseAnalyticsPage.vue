<template>
  <div class="page2 expense-page" :dir="dir">
    <PageHeader
      :count="totalInvoices"
      :title="l.expenses.title"
      :subtitle="l.expenses.subtitle"
    >
      <template #hero>
        <n-dropdown
          :disabled="!exportAllowed || loading || exporting || !suppliers.length"
          :options="exportMenuOptions"
          placement="bottom-start"
          trigger="click"
          @select="exportTotals"
        >
          <button
            :class="{ 'rbtn--loading': exporting }"
            :disabled="!exportAllowed || loading || exporting || !suppliers.length"
            class="rbtn rbtn--ghost"
            type="button"
          >
            <n-icon :component="DownloadOutline" class="btn-icon" />
            {{ l.expensesMsg.export }}
          </button>
        </n-dropdown>
        <n-tooltip>
          <template #trigger>
            <button
              class="rbtn rbtn--ghost rbtn--icon"
              type="button"
              @click="showAlertsModal = true"
            >
              <n-icon :component="NotificationsOutline" :size="16" class="btn-icon" />
            </button>
          </template>
          {{ l.expensesMsg.spendingAlerts }}
        </n-tooltip>
        <button
          :disabled="loading"
          class="rbtn rbtn--ghost"
          type="button"
          @click="load(true)"
        >
          <n-icon :class="{ 'refresh-icon--spin': loading }" :component="RefreshOutline" class="btn-icon" />
          {{ l.expensesMsg.refresh }}
        </button>
      </template>
    </PageHeader>

    <SpendingAlertsModal
      v-model:show="showAlertsModal"
      :categories="availableCategories"
    />

    <InvoiceSectionNav />

    <div class="toolbar">
      <div class="proof-strip" role="tablist" :aria-label="l.expensesMsg.proofAria">
        <button
          v-for="item in proofFilterOptions"
          :key="item.value"
          :aria-pressed="proofFilter === item.value"
          :class="{ 'proof-strip__btn--active': proofFilter === item.value }"
          class="proof-strip__btn"
          type="button"
          @click="setProofFilter(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="toolbar__filters-row">
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
          :placeholder="l.expensesMsg.category"
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
          :placeholder="l.expensesMsg.suppliers"
          class="toolbar__supplier"
          @update:value="load(true)"
        />
      </div>
      <DateRangePresets v-model="dateRange" @change="load(true)" />
      <n-date-picker
        v-model:value="dateRange"
        type="daterange"
        clearable
        class="toolbar__dates"
        @update:value="load(true)"
      />
    </div>

    <n-spin :show="loading">
      <section class="expense-summary" :aria-label="isIncomeView ? l.expensesMsg.incomeSummary : l.expensesMsg.expenseSummary">
        <div class="expense-metric">
          <n-icon :component="WalletOutline" :size="18" class="expense-metric__icon" />
          <div>
            <span>{{ isIncomeView ? l.expensesMsg.incomeTotal : l.expensesMsg.expenseTotal }}</span>
            <strong>{{ formatMoney(totalAmount) }}</strong>
          </div>
        </div>
        <div class="expense-metric">
          <n-icon :component="PeopleOutline" :size="18" class="expense-metric__icon" />
          <div>
            <span>{{ l.expensesMsg.suppliersInChart }}</span>
            <strong>{{ `${namedChartSeries.length} / ${suppliers.length}` }}</strong>
          </div>
        </div>
        <div class="expense-metric">
          <n-icon :component="ReceiptOutline" :size="18" class="expense-metric__icon" />
          <div>
            <span>{{ l.expensesMsg.invoicesInChart }}</span>
            <strong>{{ totalInvoices }}</strong>
          </div>
        </div>
        <div v-if="!isIncomeView && householdTotal > 0" class="expense-metric expense-metric--link" role="button" tabindex="0" :title="l.expensesMsg.showHousehold" @click="showHousehold" @keydown.enter="showHousehold">
          <n-icon :component="HomeOutline" :size="18" class="expense-metric__icon" />
          <div>
            <span>{{ l.providerCategory.household }}</span>
            <strong>{{ formatMoney(householdTotal) }}</strong>
          </div>
        </div>
        <div class="expense-metric">
          <n-icon :component="CalendarOutline" :size="18" class="expense-metric__icon" />
          <div>
            <span>{{ l.expensesMsg.months }}</span>
            <strong>{{ months.length }}</strong>
          </div>
        </div>
      </section>

      <section class="expense-layout">
        <div class="expense-chart-panel">
          <header class="expense-panel__head">
            <div>
              <h2>{{ flowLabel(activeChartType.title) }}</h2>
              <p>{{ flowLabel(activeChartType.hint) }}</p>
            </div>
            <div class="expense-chart-types" role="group" :aria-label="l.expensesMsg.chartType">
              <n-tooltip v-for="item in chartTypeOptions" :key="item.id" placement="top">
                <template #trigger>
                  <button
                    :aria-label="item.label"
                    :aria-pressed="chartType === item.id"
                    :class="{ 'rbtn--ghost-active': chartType === item.id }"
                    class="rbtn rbtn--ghost rbtn--icon"
                    type="button"
                    @click="chartType = item.id"
                  >
                    <n-icon :component="item.icon" :size="16" class="btn-icon" />
                  </button>
                </template>
                {{ item.label }}
              </n-tooltip>
            </div>
          </header>
          <div v-if="!hasChartData" class="expense-empty">
            <n-icon :component="AnalyticsOutline" :size="40" class="expense-empty__icon" />
            <p>{{ l.expensesMsg.noData }}</p>
          </div>
          <div v-else ref="chartEl" class="expense-chart" role="img" :aria-label="flowLabel(activeChartType.ariaLabel)" />
        </div>

        <aside class="expense-legend" :aria-label="l.expensesMsg.suppliersInChart">
          <header class="expense-panel__head">
            <h2>{{ l.expensesMsg.bySupplier }}</h2>
            <button
              v-if="selectedSuppliers.length > 0"
              class="expense-legend__clear"
              type="button"
              @click="clearSupplierFilter()"
            >
              <n-icon :component="CloseOutline" :size="14" />
              {{ l.expensesMsg.showAll }}
            </button>
          </header>
          <div class="expense-legend__scroll">
            <button
              v-for="(series, index) in chartSeries"
              :key="series.supplier"
              :aria-pressed="series.isOther ? undefined : isFocusedSupplier(series.supplier)"
              :class="{
                'expense-legend__item--active': isFocusedSupplier(series.supplier),
                'expense-legend__item--static': series.isOther,
              }"
              class="expense-legend__item"
              type="button"
              @click="focusSupplier(series.supplier)"
            >
              <span class="expense-legend__swatch" :style="{ background: seriesColor(index, series) }" />
              <span class="expense-legend__name" dir="auto">{{ series.supplier }}</span>
              <strong>{{ formatMoney(series.total) }}</strong>
            </button>
          </div>
        </aside>
      </section>

      <section class="expense-supplier-table" :aria-label="supplierTableTitle">
        <header class="expense-panel__head">
          <div>
            <h2>{{ supplierTableTitle }}</h2>
            <p>{{ suppliers.length ? t("expensesMsg.supplierCount", {count: suppliers.length}) : l.expensesMsg.noSuppliers }}</p>
          </div>
        </header>
        <div v-if="supplierTableRows.length" class="expense-supplier-table__scroll">
          <table>
            <thead>
              <tr>
                <th>{{ l.expensesMsg.colSupplier }}</th>
                <th>{{ l.expensesMsg.colInvoices }}</th>
                <th>{{ l.expensesMsg.colAmount }}</th>
                <th>{{ l.expensesMsg.colShare }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in supplierTableRows"
                :key="row.name"
                :class="{ 'expense-supplier-table__row--active': isFocusedSupplier(row.name) }"
                tabindex="0"
                @click="focusSupplier(row.name)"
                @keydown.enter.prevent="focusSupplier(row.name)"
              >
                <td dir="auto">{{ row.name }}</td>
                <td>{{ row.count }}</td>
                <td>{{ formatMoney(row.total) }}</td>
                <td>{{ row.share }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="expense-supplier-table__empty">{{ l.expensesMsg.noData }}</p>
      </section>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useLocalStorage } from "@vueuse/core";
import { NDatePicker, NDropdown, NIcon, NSelect, NSpin, NTooltip, type SelectOption, useMessage } from "naive-ui";
import {
  AnalyticsOutline,
  BarChartOutline,
  CalendarOutline,
  CloseOutline,
  DownloadOutline,
  HomeOutline,
  LayersOutline,
  NotificationsOutline,
  PeopleOutline,
  PieChartOutline,
  RefreshOutline,
  ReceiptOutline,
  StatsChartOutline,
  WalletOutline,
} from "@vicons/ionicons5";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import PageHeader from "../components/PageHeader.vue";
import SpendingAlertsModal from "../components/SpendingAlertsModal.vue";
import {useI18n} from "../composables/useI18n.js";
import InvoiceSectionNav from "../components/InvoiceSectionNav.vue";
import DateRangePresets from "../components/DateRangePresets.vue";
import { resolveDateRangePreset } from "../shared/dateRangePresets.js";
import { usePersistedTableState } from "../composables/useTableState.js";
import { decodeDateRange, encodeDateRange, pickOne } from "../shared/tableState";
import { api, type InvoiceExpenseMonthlySeries } from "../services/apiService.js";
import {useAuthStore} from "../stores/auth.js";
import {featureFlagsForUser, resolveUserPlan} from "../shared/pricingPlans.js";

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, CanvasRenderer]);

type ExpenseChartType = "stacked" | "grouped" | "line" | "pie";

const message = useMessage();
const {l, dir, t, locale, intl} = useI18n();
const intlLocale = computed(() => (intl.value));
const tooltipCss = computed(() => (dir.value === "rtl"
  ? "direction: rtl; text-align: right; max-width: 280px;"
  : "direction: ltr; text-align: left; max-width: 280px;"));
const authStore = useAuthStore();
const chartEl = ref<HTMLDivElement | null>(null);
const loading = ref(false);
const dateBasis = useLocalStorage<"invoice" | "import">("expenseAnalytics.dateBasis", "invoice");
type ProofFilter = "all" | "paid" | "requested" | "income";
const proofFilter = ref<ProofFilter>("paid");
const category = useLocalStorage<string | null>("expenseAnalytics.category", null);
const selectedSuppliers = useLocalStorage<string[]>("expenseAnalytics.selectedSuppliers", []);
const dateRange = ref<[number, number] | null>(resolveDateRangePreset("3m"));
const months = ref<string[]>([]);
const suppliers = ref<{ name: string; total: number; count?: number }[]>([]);
const categories = ref<string[]>([]);
/** Total of the "חשבונות הבית" category (electricity, water, gas, telecom, municipal bills). */
const householdTotal = ref(0);
const supplierNames = ref<string[]>([]);
const chartSeries = ref<InvoiceExpenseMonthlySeries[]>([]);
const totalAmount = ref(0);
const totalInvoices = ref(0);
const exporting = ref(false);
const showAlertsModal = ref(false);
const exportAllowed = computed(() => featureFlagsForUser(authStore.user).excelExport);
const availableCategories = computed(() => categories.value.length ? categories.value : ["general"]);
const themeTick = ref(0);
const chartType = ref<ExpenseChartType>("stacked");
// Date range, proof filter and chart type are remembered too; category and
// suppliers already persist through useLocalStorage above.
usePersistedTableState("expense-analytics", {
  snapshot: () => ({ dateRange: encodeDateRange(dateRange.value), proof: proofFilter.value, chart: chartType.value }),
  restore: (saved) => {
    const range = decodeDateRange(saved.dateRange);
    if (range !== undefined) dateRange.value = range;
    proofFilter.value = pickOne(saved.proof, ["all", "paid", "requested", "income"] as ProofFilter[], "paid");
    chartType.value = pickOne(saved.chart, ["stacked", "grouped", "line", "pie"] as ExpenseChartType[], "stacked");
  },
});
const supplierColorIndex = ref<Record<string, number>>({});
let chart: echarts.EChartsType | null = null;
let chartResizeObserver: ResizeObserver | null = null;
let themeObserver: MutationObserver | null = null;

const dateBasisOptions = computed<SelectOption[]>(() => [
  { label: l.value.expensesMsg.invoiceDate, value: "invoice" },
  { label: l.value.expensesMsg.importDate, value: "import" },
]);
const proofFilterOptions = computed<{ label: string; value: ProofFilter }[]>(() => [
  { label: l.value.expensesMsg.proofAll, value: "all" },
  { label: l.value.expensesMsg.proofPaid, value: "paid" },
  { label: l.value.expensesMsg.proofRequested, value: "requested" },
  { label: l.value.expensesMsg.proofIncome, value: "income" },
]);
const exportMenuOptions = computed(() => [
  { label: `Excel — ${l.value.expensesMsg.totalsBySupplier}`, key: "xlsx" },
  { label: `CSV — ${l.value.expensesMsg.totalsBySupplier}`, key: "csv" },
]);
const chartTypeOptions = computed(() => {
  const m = l.value.expensesMsg;
  return [
    { id: "stacked" as const, label: m.stackedLabel, icon: LayersOutline, title: m.monthlyTrend, hint: m.stackedHint, ariaLabel: m.stackedAria },
    { id: "grouped" as const, label: m.groupedLabel, icon: BarChartOutline, title: m.monthlyComparison, hint: m.groupedHint, ariaLabel: m.groupedAria },
    { id: "line" as const, label: m.lineLabel, icon: StatsChartOutline, title: m.monthlyTrend, hint: m.lineHint, ariaLabel: m.lineAria },
    { id: "pie" as const, label: m.pieLabel, icon: PieChartOutline, title: m.pieTitle, hint: m.pieHint, ariaLabel: m.pieAria },
  ];
});
const activeChartType = computed(() => chartTypeOptions.value.find((item) => item.id === chartType.value) ?? chartTypeOptions.value[0]);
const isIncomeView = computed(() => proofFilter.value === "income");
const supplierTableTitle = computed(() => (isIncomeView.value ? l.value.expensesMsg.incomeBySupplier : l.value.expensesMsg.expensesBySupplier));
const supplierTableRows = computed(() => {
  const total = totalAmount.value;
  return suppliers.value.map((row) => ({
    name: row.name,
    total: row.total,
    count: row.count ?? 0,
    share: total > 0 ? `${Math.round((row.total / total) * 100)}%` : "0%",
  }));
});

function flowLabel(text: string): string {
  if (!isIncomeView.value) return text;
  return text.replaceAll("הוצאות", "הכנסות").replaceAll("expenses", "income").replaceAll("Expenses", "Income");
}

// `suppliers` is narrowed by the active supplier filter, so it cannot drive the
// picker on its own — selecting one supplier would hide all the others.
// `supplierNames` carries the unnarrowed list; totals are shown where known.
const supplierOptions = computed<SelectOption[]>(() => {
  const totals = new Map(suppliers.value.map((supplier) => [supplier.name, supplier.total]));
  const names = supplierNames.value.length
    ? supplierNames.value
    : suppliers.value.map((supplier) => supplier.name);
  return names.map((name) => {
    const total = totals.get(name);
    return {
      label: total === undefined ? name : `${name} · ${formatMoney(total)}`,
      value: name,
    };
  });
});

const EXPENSE_PROVIDER_CATEGORIES = [
  "household", "transport", "parking", "fuel", "tv",
  "marketplace", "food", "payment", "government", "insurance",
  "finance", "travel", "healthcare", "education", "retail", "electronics",
  "nonprofit", "digital", "development", "general",
];
const categoryOptions = computed<SelectOption[]>(() => {
  const values = [...EXPENSE_PROVIDER_CATEGORIES];
  for (const value of categories.value) {
    if (value && !values.includes(value)) values.push(value);
  }
  return values.map((value) => ({ label: providerCategoryLabel(value), value }));
});
const namedChartSeries = computed(() => chartSeries.value.filter((series) => !series.isOther));
const hasChartData = computed(() => chartType.value === "pie"
  ? chartSeries.value.length > 0
  : chartSeries.value.length > 0 && months.value.length > 0);

const chartOption = computed<echarts.EChartsCoreOption>(() => {
  themeTick.value;
  const type = chartType.value;
  const colors = chartPalette();
  const text = cssVar("--text-secondary", "#64748b");
  const border = cssVar("--border-color", "#d9dee8");
  const tooltipBg = cssVar("--bg-elevated", "#ffffff");
  const tooltipText = cssVar("--text-primary", "#2c3e50");
  const lastIndex = chartSeries.value.length - 1;
  const shared = {
    color: colors,
    textStyle: {
      fontFamily: cssVar("--font-ui", "Segoe UI, Arial, sans-serif"),
      color: text,
    },
  };

  if (type === "pie") {
    return {
      ...shared,
      tooltip: {
        trigger: "item",
        confine: true,
        backgroundColor: tooltipBg,
        borderColor: border,
        textStyle: { color: tooltipText },
        extraCssText: tooltipCss.value,
        formatter: (raw: unknown) => formatPieTooltip(raw),
      },
      series: [{
        type: "pie",
        radius: ["46%", "72%"],
        center: ["50%", "54%"],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          borderColor: tooltipBg,
          borderWidth: 2,
        },
        // Reuses chartSeries (top suppliers plus an "אחרים" bucket) and the
        // shared supplier colour index, so a supplier keeps the same colour
        // when switching between the bar, line and pie views.
        data: chartSeries.value.map((series, index) => ({
          name: series.supplier,
          value: series.total,
          itemStyle: { color: seriesColor(index, series) },
        })),
      }],
    };
  }

  return {
    ...shared,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: type === "line" ? "line" : "shadow" },
      confine: true,
      backgroundColor: tooltipBg,
      borderColor: border,
      textStyle: { color: tooltipText },
      extraCssText: tooltipCss.value,
      formatter: (raw: unknown) => formatStackTooltip(raw, border),
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
      boundaryGap: type !== "line",
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
      position: dir.value === "rtl" ? "right" : "left",
      axisLabel: {
        color: text,
        formatter: (value: number) => compactMoney(value),
      },
      splitLine: { lineStyle: { color: border, type: "dashed" } },
    },
    series: chartSeries.value.map((series, index) => {
      const color = seriesColor(index, series);
      if (type === "line") {
        return {
          name: series.supplier,
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 7,
          emphasis: { focus: "series" },
          lineStyle: { width: 3, color },
          itemStyle: { color },
          areaStyle: { color, opacity: 0.08 },
          data: series.points.map((point) => point.total),
        };
      }
      return {
        name: series.supplier,
        type: "bar",
        stack: type === "stacked" ? "expenses" : undefined,
        barMaxWidth: type === "stacked" ? 44 : 18,
        barGap: type === "grouped" ? "20%" : undefined,
        emphasis: { focus: "series" },
        itemStyle: {
          color,
          borderRadius: type === "stacked" && index === lastIndex ? [4, 4, 0, 0] : [3, 3, 0, 0],
        },
        data: series.points.map((point) => point.total),
      };
    }),
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

watch(chartType, () => {
  chart?.dispose();
  chart = null;
  nextTick(renderChart);
});

watch(chartOption, () => {
  renderChart();
}, { deep: true });

function showHousehold() {
  if (category.value === "household") return;
  category.value = "household";
  void load(true);
}

async function load(force = false) {
  loading.value = true;
  try {
    const [dateFrom, dateTo] = dateRange.value ?? [];
    const result = await api.invoices.expenseMonthly({
      dateBasis: dateBasis.value,
      proofFilter: proofFilter.value,
      category: category.value ?? undefined,
      supplier: selectedSuppliers.value.length ? selectedSuppliers.value.join("||") : undefined,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString().slice(0, 10) : undefined,
      dateTo: dateTo ? new Date(dateTo).toISOString().slice(0, 10) : undefined,
      top: 8,
    }, force);
    months.value = result.months;
    suppliers.value = result.suppliers;
    supplierNames.value = result.supplierNames ?? [];
    categories.value = result.categories;
    householdTotal.value = (result.categorySeries ?? [])
      .filter((row) => row.category === "household")
      .reduce((sum, row) => sum + row.total, 0);
    chartSeries.value = result.series.filter((series) => series.total > 0);
    rememberSupplierColors(chartSeries.value);
    totalAmount.value = result.totalAmount;
    totalInvoices.value = result.totalInvoices;
    await nextTick();
    renderChart();
  } catch {
    message.error(l.value.expensesMsg.loadError);
  } finally {
    loading.value = false;
  }
}

function setProofFilter(value: ProofFilter) {
  if (proofFilter.value === value) return;
  proofFilter.value = value;
  load(true);
}


function isFocusedSupplier(supplier: string): boolean {
  return selectedSuppliers.value.length === 1 && selectedSuppliers.value[0] === supplier;
}

function focusSupplier(supplier: string) {
  if (chartSeries.value.find((series) => series.supplier === supplier)?.isOther) return;
  selectedSuppliers.value = isFocusedSupplier(supplier) ? [] : [supplier];
  load(true);
}

function clearSupplierFilter() {
  selectedSuppliers.value = [];
  load(true);
}

function totalsExportRows(): (string | number)[][] {
  const m = l.value.expensesMsg;
  const rows: (string | number)[][] = [[m.colSupplier, m.colAmount, m.invoiceCount]];
  for (const supplier of suppliers.value) {
    rows.push([supplier.name, supplier.total, supplier.count ?? 0]);
  }
  rows.push([m.total, totalAmount.value, totalInvoices.value]);
  return rows;
}

function monthlyExportRows(): (string | number)[][] {
  const m = l.value.expensesMsg;
  const rows: (string | number)[][] = [[m.colSupplier, ...months.value.map(formatMonth), m.total]];
  for (const series of chartSeries.value) {
    rows.push([series.supplier, ...series.points.map((point) => point.total), series.total]);
  }
  const monthSums = months.value.map((_, index) => (
    chartSeries.value.reduce((sum, series) => sum + (series.points[index]?.total ?? 0), 0)
  ));
  const visibleTotal = chartSeries.value.reduce((sum, series) => sum + series.total, 0);
  rows.push([m.totalInChart, ...monthSums, visibleTotal]);
  return rows;
}

async function exportTotals(format: string | number) {
  if (format !== "xlsx" && format !== "csv") return;
  if (!exportAllowed.value) {
    message.warning(l.value.invoicesMsg.exportPlanOnly);
    return;
  }
  if (!suppliers.value.length) {
    message.info(l.value.expensesMsg.nothingToExport);
    return;
  }
  exporting.value = true;
  try {
    const {utils, write, writeFile} = await import("xlsx");
    const stamp = new Date().toISOString().slice(0, 10);
    const totalsSheet = utils.aoa_to_sheet(totalsExportRows());
    totalsSheet["!cols"] = [{wch: 28}, {wch: 14}, {wch: 16}];
    if (format === "csv") {
      const wb = utils.book_new();
      utils.book_append_sheet(wb, totalsSheet, "totals");
      const csv = write(wb, {bookType: "csv", type: "string"});
      const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], {type: "text/csv;charset=utf-8;"}));
      const link = document.createElement("a");
      link.href = url;
      link.download = `expenses-totals-${stamp}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      message.success(l.value.expensesMsg.exportDone);
      return;
    }
    const wb = utils.book_new();
    wb.Workbook = {Views: [{RTL: dir.value === "rtl"}]};
    utils.book_append_sheet(wb, totalsSheet, l.value.expensesMsg.sheetTotals);
    if (chartSeries.value.length && months.value.length) {
      const monthlySheet = utils.aoa_to_sheet(monthlyExportRows());
      monthlySheet["!cols"] = [
        {wch: 28},
        ...months.value.map(() => ({wch: 12})),
        {wch: 14},
      ];
      utils.book_append_sheet(wb, monthlySheet, l.value.expensesMsg.sheetMonthly);
    }
    writeFile(wb, `expenses-totals-${stamp}.xlsx`);
    message.success(l.value.expensesMsg.exportDone);
  } catch {
    message.error(l.value.expensesMsg.exportError);
  } finally {
    exporting.value = false;
  }
}

function renderChart() {
  if (!chartEl.value || !hasChartData.value) return;
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


function rememberSupplierColors(seriesList: InvoiceExpenseMonthlySeries[]) {
  const named = seriesList.filter((series) => !series.isOther);
  if (named.length <= 1 && Object.keys(supplierColorIndex.value).length) return;
  supplierColorIndex.value = Object.fromEntries(named.map((series, index) => [series.supplier, index]));
}

function seriesColor(index: number, series?: InvoiceExpenseMonthlySeries): string {
  if (series?.isOther) return otherSeriesColor();
  const mapped = series ? supplierColorIndex.value[series.supplier] : undefined;
  return chartPalette()[(mapped ?? index) % chartPalette().length];
}

function otherSeriesColor(): string {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "#64748b" : "#94a3b8";
}

function formatStackTooltip(raw: unknown, border: string): string {
  const items = (Array.isArray(raw) ? raw : [raw]) as Array<{
    axisValueLabel?: string;
    marker?: string;
    seriesName?: string;
    value?: number;
  }>;
  const visible = items.filter((item) => Number(item.value ?? 0) > 0);
  const monthTotal = visible.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
  const title = visible[0]?.axisValueLabel ?? items[0]?.axisValueLabel ?? "";
  const rows = visible.map((item) => {
    const value = Number(item.value ?? 0);
    const percent = monthTotal ? Math.round((value / monthTotal) * 100) : 0;
    return `<div style="display:flex;gap:10px;justify-content:space-between;align-items:center;">
      <span>${item.marker ?? ""} ${item.seriesName ?? ""}</span>
      <span>${formatMoney(value)} · ${percent}%</span>
    </div>`;
  }).join("");
  return `<div style="min-width:190px">
    <div style="margin-bottom:8px;font-weight:700">${title}</div>
    ${rows || l.value.expensesMsg.noMonthExpenses}
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid ${border};font-weight:700">${l.value.expensesMsg.total} ${formatMoney(monthTotal)}</div>
  </div>`;
}

function formatPieTooltip(raw: unknown): string {
  const item = (Array.isArray(raw) ? raw[0] : raw) as {
    marker?: string;
    name?: string;
    value?: number;
    percent?: number;
  } | undefined;
  if (!item) return "";
  return `<div style="min-width:160px">
    <div>${item.marker ?? ""} ${item.name ?? ""}</div>
    <div style="margin-top:6px;font-weight:700">${formatMoney(Number(item.value ?? 0))} · ${Math.round(Number(item.percent ?? 0))}%</div>
  </div>`;
}

function formatMonth(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  if (!year || !monthIndex) return month;
  return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString(intlLocale.value, { month: "short", year: "2-digit" });
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat(intlLocale.value, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(value);
}

function compactMoney(value: number): string {
  return new Intl.NumberFormat(intlLocale.value, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function providerCategoryLabel(value: string): string {
  const labels: Record<string, string> = l.value.providerCategory;
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

.proof-strip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-elevated);
}

.proof-strip__btn {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
}

.proof-strip__btn--active {
  background: color-mix(in srgb, var(--brand-color) 14%, transparent);
  color: var(--brand-color);
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

.expense-metric--link {
  cursor: pointer;
}

.expense-metric--link:hover {
  border-color: var(--brand-color);
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

.expense-supplier-table {
  margin-top: 16px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.expense-supplier-table .expense-panel__head {
  padding-bottom: 12px;
}

.expense-supplier-table__scroll {
  overflow-x: auto;
  padding: 0 8px 8px;
}

.expense-supplier-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.expense-supplier-table th,
.expense-supplier-table td {
  padding: 10px 12px;
  text-align: start;
  border-top: 1px solid var(--border-color);
  white-space: nowrap;
}

.expense-supplier-table th {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.expense-supplier-table td:first-child {
  white-space: normal;
  color: var(--text-primary);
  font-weight: 600;
}

.expense-supplier-table tbody tr {
  cursor: pointer;
}

.expense-supplier-table tbody tr:hover,
.expense-supplier-table tbody tr:focus-visible {
  background: color-mix(in srgb, var(--brand-color) 8%, transparent);
  outline: none;
}

.expense-supplier-table__row--active {
  background: color-mix(in srgb, var(--brand-color) 14%, transparent);
}

.expense-supplier-table__empty {
  margin: 0;
  padding: 8px 16px 16px;
  color: var(--text-secondary);
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

.expense-chart-types {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-elevated);
  flex: 0 0 auto;
}

.expense-chart-types .rbtn {
  width: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 10px;
}

.expense-chart-types .rbtn--ghost-active {
  background: var(--bg-card);
  border-color: var(--brand-color);
  color: var(--brand-color);
}

.rbtn--icon {
  justify-content: center;
}

.rbtn--ghost-active {
  background: var(--bg-card);
  border-color: var(--brand-color);
  color: var(--brand-color);
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
  display: flex;
  flex-direction: column;
  max-height: 420px;
  min-height: 0;
  padding: 0 10px 12px;
  overflow: hidden;
}

.expense-legend .expense-panel__head {
  flex: 0 0 auto;
  padding-inline: 6px;
  margin-bottom: 6px;
}

.expense-legend__scroll {
  display: grid;
  align-content: start;
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
  padding-inline-end: 4px;
  scrollbar-gutter: stable;
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
  text-align: start;
}

.expense-legend__item:hover,
.expense-legend__item:focus-visible {
  background: var(--bg-hover);
  outline: none;
}

.expense-legend__item--active {
  background: color-mix(in srgb, var(--brand-color) 12%, transparent);
}

.expense-legend__item--static,
.expense-legend__item--static:hover,
.expense-legend__item--static:focus-visible {
  cursor: default;
  background: transparent;
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


.toolbar__filters-row {
  display: flex;
}

@media (max-width: 980px) {
  .expense-layout {
    grid-template-columns: 1fr;
  }

  .expense-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .toolbar__type,
  .toolbar__supplier,
  .toolbar__dates {
    width: 100%;
    min-width: 0;
  }
}

@media (max-width: 640px) {
  .expense-panel__head {
    flex-wrap: wrap;
  }

  .expense-chart {
    height: 280px;
  }

  .expense-metric {
    min-height: 0;
    padding: 10px 12px;
    gap: 8px;
  }

  .expense-metric__icon {
    display: none;
  }

  .expense-metric span {
    font-size: 11px;
  }

  .expense-metric strong {
    margin-top: 2px;
    font-size: 16px;
  }

  .toolbar {
    gap: 8px;
    margin: 10px 0 12px;
  }

  .toolbar__dates {
    width: 100%;
    min-width: 0;
  }

  .toolbar__filters-row {
    display: flex;
    flex-wrap: nowrap;
    width: 100%;
    gap: 6px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .toolbar__filters-row::-webkit-scrollbar {
    display: none;
  }

  .toolbar__filters-row .toolbar__type,
  .toolbar__filters-row .toolbar__supplier {
    flex: 0 0 auto;
    width: 140px;
    min-width: 140px;
  }
}
</style>
