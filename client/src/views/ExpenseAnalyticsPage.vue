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
            ייצוא
          </button>
        </n-dropdown>
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
      <div class="proof-strip" role="tablist" aria-label="סוג מסמך בגרף">
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
            <span>ספקים בגרף</span>
            <strong>{{ `${namedChartSeries.length} / ${suppliers.length}` }}</strong>
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
            <div>
              <h2>{{ activeChartType.title }}</h2>
              <p>{{ activeChartType.hint }}</p>
            </div>
            <div class="expense-chart-types" role="group" aria-label="סוג גרף">
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
            <p>אין נתונים להצגה עבור הסינון הנוכחי</p>
          </div>
          <div v-else ref="chartEl" class="expense-chart" role="img" :aria-label="activeChartType.ariaLabel" />
        </div>

        <aside class="expense-legend" aria-label="ספקים בגרף">
          <header class="expense-panel__head">
            <h2>לפי ספק</h2>
            <button
              v-if="selectedSuppliers.length > 0"
              class="expense-legend__clear"
              type="button"
              @click="clearSupplierFilter()"
            >
              <n-icon :component="CloseOutline" :size="14" />
              הצג הכל
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
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { NDatePicker, NDropdown, NIcon, NSelect, NSpin, NTooltip, type SelectOption, useMessage } from "naive-ui";
import {
  AnalyticsOutline,
  BarChartOutline,
  CalendarOutline,
  CloseOutline,
  DownloadOutline,
  LayersOutline,
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
import {useI18n} from "../composables/useI18n.js";
import InvoiceSectionNav from "../components/InvoiceSectionNav.vue";
import DateRangePresets from "../components/DateRangePresets.vue";
import { api, type InvoiceExpenseMonthlySeries } from "../services/apiService.js";
import {useAuthStore} from "../stores/auth.js";
import {featureFlagsForUser, resolveUserPlan} from "../shared/pricingPlans.js";

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, CanvasRenderer]);

type ExpenseChartType = "stacked" | "grouped" | "line" | "pie";

const message = useMessage();
const {l, dir} = useI18n();
const authStore = useAuthStore();
const chartEl = ref<HTMLDivElement | null>(null);
const loading = ref(false);
const dateBasis = ref<"invoice" | "import">("invoice");
const proofFilter = ref<"all" | "paid" | "requested">("all");
const category = ref<string | null>(null);
const selectedSuppliers = ref<string[]>([]);
const dateRange = ref<[number, number] | null>(null);
const months = ref<string[]>([]);
const suppliers = ref<{ name: string; total: number; count?: number }[]>([]);
const categories = ref<string[]>([]);
const supplierNames = ref<string[]>([]);
const chartSeries = ref<InvoiceExpenseMonthlySeries[]>([]);
const totalAmount = ref(0);
const totalInvoices = ref(0);
const exporting = ref(false);
const exportAllowed = computed(() => featureFlagsForUser(authStore.user).excelExport);
const themeTick = ref(0);
const chartType = ref<ExpenseChartType>("stacked");
const supplierColorIndex = ref<Record<string, number>>({});
let chart: echarts.EChartsType | null = null;
let chartResizeObserver: ResizeObserver | null = null;
let themeObserver: MutationObserver | null = null;

const dateBasisOptions: SelectOption[] = [
  { label: "תאריך חשבונית", value: "invoice" },
  { label: "תאריך ייבוא", value: "import" },
];
const proofFilterOptions = [
  { label: "הכל", value: "all" as const },
  { label: "הוכחת תשלום", value: "paid" as const },
  { label: "דרישות תשלום", value: "requested" as const },
];
const exportMenuOptions = [
  { label: "Excel — סה״כ לפי ספק", key: "xlsx" },
  { label: "CSV — סה״כ לפי ספק", key: "csv" },
];
const chartTypeOptions = [
  { id: "stacked" as const, label: "עמודות מוערמות", icon: LayersOutline, title: "מגמה חודשית", hint: "כל עמודה היא חודש. הגובה הוא סה״כ ההוצאות, והצבעים הם הספקים.", ariaLabel: "עמודות מוערמות של הוצאות חודשיות לפי ספק" },
  { id: "grouped" as const, label: "עמודות מקובצות", icon: BarChartOutline, title: "השוואה חודשית", hint: "כל קבוצה היא חודש, וכל עמודה היא ספק.", ariaLabel: "עמודות מקובצות של הוצאות חודשיות לפי ספק" },
  { id: "line" as const, label: "קווים", icon: StatsChartOutline, title: "מגמה חודשית", hint: "כל קו מייצג ספק לאורך החודשים.", ariaLabel: "גרף קווים של הוצאות חודשיות לפי ספק" },
  { id: "pie" as const, label: "עוגה לפי ספק", icon: PieChartOutline, title: "התפלגות לפי ספק", hint: "כל פלח הוא סכום ההוצאות של ספק.", ariaLabel: "גרף עוגה של הוצאות לפי ספק" },
];
const activeChartType = computed(() => chartTypeOptions.find((item) => item.id === chartType.value) ?? chartTypeOptions[0]);

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

const categoryOptions = computed<SelectOption[]>(() =>
  categories.value.map((value) => ({ label: providerCategoryLabel(value), value })),
);
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
        extraCssText: "direction: rtl; text-align: right; max-width: 280px;",
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
      extraCssText: "direction: rtl; text-align: right; max-width: 280px;",
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
      position: "right",
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
    chartSeries.value = result.series.filter((series) => series.total > 0);
    rememberSupplierColors(chartSeries.value);
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

function setProofFilter(value: "all" | "paid" | "requested") {
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
  const rows: (string | number)[][] = [["ספק", "סכום", "מספר חשבוניות"]];
  for (const supplier of suppliers.value) {
    rows.push([supplier.name, supplier.total, supplier.count ?? 0]);
  }
  rows.push(["סה״כ", totalAmount.value, totalInvoices.value]);
  return rows;
}

function monthlyExportRows(): (string | number)[][] {
  const rows: (string | number)[][] = [["ספק", ...months.value.map(formatMonth), "סה״כ"]];
  for (const series of chartSeries.value) {
    rows.push([series.supplier, ...series.points.map((point) => point.total), series.total]);
  }
  const monthSums = months.value.map((_, index) => (
    chartSeries.value.reduce((sum, series) => sum + (series.points[index]?.total ?? 0), 0)
  ));
  const visibleTotal = chartSeries.value.reduce((sum, series) => sum + series.total, 0);
  rows.push(["סה״כ בגרף", ...monthSums, visibleTotal]);
  return rows;
}

async function exportTotals(format: string | number) {
  if (format !== "xlsx" && format !== "csv") return;
  if (!exportAllowed.value) {
    message.warning("ייצוא זמין במסלולים בסיסי ועסקי בלבד");
    return;
  }
  if (!suppliers.value.length) {
    message.info("אין סכומים לייצוא");
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
      message.success("הקובץ כולל סה״כ לפי ספק");
      return;
    }
    const wb = utils.book_new();
    wb.Workbook = {Views: [{RTL: true}]};
    utils.book_append_sheet(wb, totalsSheet, "סהכ לפי ספק");
    if (chartSeries.value.length && months.value.length) {
      const monthlySheet = utils.aoa_to_sheet(monthlyExportRows());
      monthlySheet["!cols"] = [
        {wch: 28},
        ...months.value.map(() => ({wch: 12})),
        {wch: 14},
      ];
      utils.book_append_sheet(wb, monthlySheet, "פירוט חודשי");
    }
    writeFile(wb, `expenses-totals-${stamp}.xlsx`);
    message.success("הקובץ כולל סה״כ לפי ספק");
  } catch {
    message.error("שגיאה בייצוא ההוצאות");
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
    ${rows || "אין הוצאות בחודש זה"}
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid ${border};font-weight:700">סה״כ ${formatMoney(monthTotal)}</div>
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
  .expense-panel__head {
    flex-wrap: wrap;
  }

  .expense-chart {
    height: 280px;
  }

  .expense-metric strong {
    font-size: 20px;
  }
}
</style>
