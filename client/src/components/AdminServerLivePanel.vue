<template>
  <section class="server-live" aria-label="Live server metrics">
    <div class="monitor-block">
      <div class="block-head">
        <div class="head-row">
          <div class="monitor-block__title">Live server</div>
          <span class="live-dot" :class="{ 'live-dot--stale': stale }" />
          <span class="title-note">{{ stale ? "not updating" : `updated ${secondsAgo}s ago · every 10s` }}</span>
          <span class="spacer" />
          <template v-if="pushSupported">
            <n-switch :value="pushSubscribed" :loading="pushBusy" size="small" @update:value="togglePush" />
            <span class="title-note">Push on this device</span>
          </template>
          <span v-else class="title-note">{{ isIos ? "iPhone: add the app to the Home Screen to get push" : "Push not supported in this browser" }}</span>
          <n-tooltip>
            <template #trigger>
              <n-button size="small" :loading="testing" @click="sendTest">
                <template #icon><n-icon :component="NotificationsOutline" /></template>
                Test alert
              </n-button>
            </template>
            Sends a push notification to every admin with notifications on
          </n-tooltip>
        </div>
        <div v-if="data" class="title-note">
          <template v-if="data.railway.onRailway">
            Railway · {{ [data.railway.projectName, data.railway.serviceName, data.railway.environmentName].filter(Boolean).join(" / ") }}
            <span v-if="data.railway.replicaId"> · replica {{ short(data.railway.replicaId) }}<span v-if="data.railway.replicaRegion"> ({{ data.railway.replicaRegion }})</span></span>
            <span v-if="data.railway.gitCommit"> · {{ data.railway.gitBranch }}@{{ data.railway.gitCommit }}</span>
            <span v-if="data.railway.deployment?.createdAt"> · last deploy {{ deployWhen(data.railway.deployment.createdAt) }}<span v-if="data.railway.deployment.status"> ({{ data.railway.deployment.status }})</span></span>
            <span v-else-if="data.railway.deploymentId"> · deploy {{ short(data.railway.deploymentId) }}</span>
          </template>
          <template v-else>Not running on Railway (local server)</template>
          · replica up {{ uptime(data.container.uptimeSeconds) }} · Node {{ data.container.node }} · {{ data.container.cpus }} CPU
        </div>
        <div v-if="deploySubject" class="title-note">{{ deploySubject }}</div>
      </div>

      <n-alert v-if="data && !data.railway.metricsConfigured && data.railway.onRailway" type="info" style="margin-bottom:12px">
        Railway container CPU/RAM needs a <code>RAILWAY_API_TOKEN</code> service variable (Railway → Account → Tokens). Until then CPU/RAM below is this server process.
      </n-alert>
      <n-alert v-if="data?.railway.metrics?.error" type="warning" style="margin-bottom:12px">
        Railway metrics unavailable: {{ data.railway.metrics.error }}
      </n-alert>

      <div v-if="data" class="cards">
        <AdminStatCard title="Requests" :primary="data.http.last5.perMinute" primary-label="per min (5 min)" :secondary="data.http.last60.requests" secondary-label="last hour" :icon="SwapHorizontalOutline" />
        <AdminStatCard
          title="Latency p95"
          :primary="`${data.http.last5.p95Ms} ms`"
          primary-label="last 5 min"
          :secondary="`${data.http.last5.p50Ms} ms`"
          secondary-label="p50"
          format="custom"
          :status="level(data.http.last5.p95Ms, t.p95Ms)"
          :icon="SpeedometerOutline"
        />
        <AdminStatCard
          title="Server errors"
          :primary="`${data.http.last5.errorRatePct}%`"
          primary-label="5xx (5 min)"
          :secondary="data.http.last5.s5xx"
          secondary-label="count"
          format="custom"
          :status="level(data.http.last5.errorRatePct, t.errorRatePct)"
          :icon="AlertCircleOutline"
        />
        <AdminStatCard
          title="404 / timeouts"
          :primary="data.http.last5.s404"
          primary-label="404 (5 min)"
          :secondary="data.http.last5.timeouts"
          secondary-label="timeouts"
          :status="data.http.last5.timeouts >= t.timeoutsPer5Min ? 'error' : level(data.http.last5.s404, t.notFoundPer5Min)"
          :icon="HelpCircleOutline"
        />
        <AdminStatCard
          title="CPU"
          :primary="`${cpuNow}%`"
          :primary-label="railwayCpu != null ? 'container (Railway)' : 'this process'"
          :secondary="data.system.last5.latest?.loadAvg1 ?? '—'"
          secondary-label="load avg"
          format="custom"
          :status="level(cpuNow, t.cpuPct)"
          :icon="HardwareChipOutline"
        />
        <AdminStatCard
          title="Memory"
          :primary="memoryText"
          :primary-label="railwayMem ? 'container (Railway)' : 'process RSS'"
          :secondary="`${memPct}%`"
          secondary-label="of limit"
          format="custom"
          :status="level(memPct, t.memoryPct)"
          :icon="ServerOutline"
        />
        <AdminStatCard
          title="Event loop"
          :primary="`${data.system.last5.maxEventLoopLagMs} ms`"
          primary-label="max lag (5 min)"
          format="custom"
          :status="level(data.system.last5.maxEventLoopLagMs, t.eventLoopLagMs)"
          :icon="PulseOutline"
        />
      </div>

      <div class="charts-toolbar">
        <div class="field-label">Graph range</div>
        <div class="range-picks" role="group" aria-label="Graph time range">
          <button
            v-for="opt in RANGE_OPTIONS"
            :key="opt.id"
            type="button"
            :class="{ on: range === opt.id }"
            @click="setRange(opt.id)"
          >{{ opt.id }}</button>
        </div>
      </div>
      <div class="charts">
        <div class="chart-box">
          <div class="field-label">Requests and p95 latency ({{ rangeLabel }})</div>
          <div ref="httpChartEl" class="chart" />
        </div>
        <div class="chart-box">
          <div class="field-label">{{ sysChartTitle }}</div>
          <div ref="sysChartEl" class="chart" />
        </div>
      </div>
    </div>

    <div v-if="data" class="tables">
      <div class="monitor-block">
        <div class="monitor-block__title">Slowest routes <span class="title-note">(15 min, by average)</span></div>
        <n-data-table :columns="slowColumns" :data="data.slowest" size="small" :bordered="false" :pagination="false" />
      </div>
      <div class="monitor-block">
        <div class="monitor-block__title">Top 404 paths <span class="title-note">(24 h)</span></div>
        <n-data-table :columns="notFoundColumns" :data="data.top404" size="small" :bordered="false" :pagination="false" />
      </div>
    </div>

    <div v-if="data" class="monitor-block">
      <div class="monitor-block__title">
        Alerts
        <span class="title-note">
          {{ data.alerts.enabled ? "push to admins on" : "off on this server (runs in production, or set SERVER_ALERTS_ENABLED=true)" }}
          · CPU ≥ {{ t.cpuPct }}% · memory ≥ {{ t.memoryPct }}% · p95 ≥ {{ t.p95Ms }} ms · 5xx ≥ {{ t.errorRatePct }}% ·
          404 ≥ {{ t.notFoundPer5Min }}/5 min · timeouts ≥ {{ t.timeoutsPer5Min }}/5 min · event loop ≥ {{ t.eventLoopLagMs }} ms ·
          repeat after {{ t.cooldownMinutes }} min
        </span>
      </div>
      <n-data-table :columns="alertColumns" :data="data.alerts.recent" size="small" :bordered="false" :pagination="false" :max-height="260" />
    </div>
  </section>
</template>

<script setup lang="ts">
import {computed, h, nextTick, onBeforeUnmount, onMounted, ref} from "vue";
import {NAlert, NButton, NDataTable, NIcon, NSwitch, NTooltip, useMessage, type DataTableColumns} from "naive-ui";
import {
  AlertCircleOutline, HardwareChipOutline, HelpCircleOutline, NotificationsOutline, PulseOutline, ServerOutline,
  SpeedometerOutline, SwapHorizontalOutline,
} from "@vicons/ionicons5";
import * as echarts from "echarts/core";
import {BarChart, LineChart} from "echarts/charts";
import {GridComponent, LegendComponent, TooltipComponent} from "echarts/components";
import {CanvasRenderer} from "echarts/renderers";
import AdminStatCard from "./AdminStatCard.vue";
import {api} from "../services/apiService";
import {useAdminPush} from "../composables/useAdminPush";

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const message = useMessage();
const {supported: pushSupported, subscribed: pushSubscribed, busy: pushBusy, refreshState, enablePush, disablePush} = useAdminPush();
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

async function togglePush(next: boolean) {
  try {
    if (next) {
      await enablePush();
      message.success("Push on for this device");
    } else {
      await disablePush();
      message.success("Push off for this device");
    }
  } catch (err: any) {
    message.error(err?.message ?? "Could not change push");
  }
}
const RANGE_OPTIONS = [
  {id: "1h", label: "1 hour"},
  {id: "8h", label: "8 hours"},
  {id: "1d", label: "1 day"},
  {id: "7d", label: "7 days"},
  {id: "1m", label: "1 month"},
] as const;
type GraphRange = (typeof RANGE_OPTIONS)[number]["id"];
const range = ref<GraphRange>("1h");
const rangeLabel = computed(() => data.value?.rangeLabel ?? RANGE_OPTIONS.find((opt) => opt.id === range.value)?.label ?? "1 hour");
const data = ref<any | null>(null);
const lastOkAt = ref(0);
const nowTick = ref(Date.now());
const testing = ref(false);
const httpChartEl = ref<HTMLElement | null>(null);
const sysChartEl = ref<HTMLElement | null>(null);
let httpChart: echarts.EChartsType | null = null;
let sysChart: echarts.EChartsType | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;

const t = computed(() => data.value?.alerts.thresholds ?? {
  cpuPct: 85, memoryPct: 85, p95Ms: 3000, errorRatePct: 5, notFoundPer5Min: 150, timeoutsPer5Min: 3, eventLoopLagMs: 500, cooldownMinutes: 30,
});
const secondsAgo = computed(() => Math.max(0, Math.round((nowTick.value - lastOkAt.value) / 1000)));
const stale = computed(() => !lastOkAt.value || secondsAgo.value > 35);

const railway = computed(() => data.value?.railway.metrics ?? null);
const railwaySeries = computed(() => {
  const series = railway.value?.series;
  return series && (series.CPU_USAGE?.length || series.MEMORY_USAGE_GB?.length) ? series : null;
});
const sysChartTitle = computed(() => `${railwaySeries.value ? "Container CPU and memory (Railway)" : "Process CPU and memory"}, ${rangeLabel.value}`);
const railwayCpu = computed(() => railway.value?.cpuVcpu != null && railway.value?.cpuLimitVcpu
  ? Math.round((railway.value.cpuVcpu / railway.value.cpuLimitVcpu) * 1000) / 10
  : null);
const railwayMem = computed(() => railway.value?.memoryGb != null && railway.value?.memoryLimitGb ? railway.value : null);
const cpuNow = computed(() => railwayCpu.value ?? data.value?.system.last5.latest?.cpuPct ?? 0);
const memPct = computed(() => {
  if (railwayMem.value) return Math.round((railwayMem.value.memoryGb / railwayMem.value.memoryLimitGb) * 1000) / 10;
  const latest = data.value?.system.last5.latest;
  const total = data.value?.container.totalMemMb;
  return latest && total ? Math.round((latest.rssMb / total) * 1000) / 10 : 0;
});
const memoryText = computed(() => railwayMem.value
  ? `${railwayMem.value.memoryGb.toFixed(2)} / ${railwayMem.value.memoryLimitGb.toFixed(0)} GB`
  : `${data.value?.system.last5.latest?.rssMb ?? 0} MB`);

function level(value: number, limit: number): "success" | "warning" | "error" {
  if (value >= limit) return "error";
  if (value >= limit * 0.7) return "warning";
  return "success";
}

function short(id: string) {
  return id.slice(0, 8);
}

const deploySubject = computed(() => String(data.value?.railway?.gitMessage ?? "").split("\n")[0].trim());

function deployWhen(iso: string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const seconds = Math.max(0, Math.round((nowTick.value - then) / 1000));
  const clock = new Date(iso).toLocaleString("en-GB", {day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"});
  return `${uptime(seconds)} ago · ${clock}`;
}

function uptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${hrs}h` : hrs ? `${hrs}h ${min}m` : `${min}m`;
}

function timeLabel(ts: number | string) {
  const date = new Date(ts);
  if (range.value === "1m") return date.toLocaleDateString("en-GB", {day: "2-digit", month: "short"});
  if (range.value === "7d") return date.toLocaleString("en-GB", {day: "2-digit", month: "short", hour: "2-digit"});
  if (range.value === "1d") return date.toLocaleString("en-GB", {day: "2-digit", hour: "2-digit", minute: "2-digit"});
  return date.toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit"});
}
const muted = (text: string) => h("span", {style: "font-size:12px;color:var(--text-secondary)"}, text);

const slowColumns: DataTableColumns<any> = [
  {title: "Route", key: "route", ellipsis: {tooltip: true}},
  {title: "Avg", key: "avgMs", width: 80, render: (row) => `${row.avgMs} ms`},
  {title: "Max", key: "maxMs", width: 80, render: (row) => `${row.maxMs} ms`},
  {title: "Calls", key: "count", width: 70},
];
const notFoundColumns: DataTableColumns<any> = [
  {title: "Path", key: "path", ellipsis: {tooltip: true}},
  {title: "Count", key: "count", width: 80},
];
const alertColumns: DataTableColumns<any> = [
  {title: "When", key: "created_at", width: 160, render: (row) => muted(new Date(row.created_at).toLocaleString("en-GB"))},
  {title: "Alert", key: "title", width: 170, render: (row) => h("span", {style: "color:#d03050;font-weight:600"}, row.title)},
  {title: "Details", key: "body", ellipsis: {tooltip: true}},
  {title: "Where", key: "where", width: 180, render: (row) => muted(row.where ?? "—")},
];

function renderCharts() {
  const d = data.value;
  if (!d) return;
  if (httpChartEl.value && !httpChart) httpChart = echarts.init(httpChartEl.value);
  if (sysChartEl.value && !sysChart) sysChart = echarts.init(sysChartEl.value);
  const axisText = {color: "#8a94a0", fontSize: 10};
  const http = d.series.http as any[];
  httpChart?.setOption({
    grid: {left: 40, right: 44, top: 28, bottom: 24},
    tooltip: {trigger: "axis"},
    legend: {top: 0, textStyle: axisText, itemWidth: 10, itemHeight: 8},
    xAxis: {type: "category", data: http.map((b) => timeLabel(b.ts)), axisLabel: {...axisText, hideOverlap: true}},
    yAxis: [
      {type: "value", name: "req", axisLabel: axisText, splitLine: {lineStyle: {opacity: 0.15}}},
      {type: "value", name: "ms", axisLabel: axisText, splitLine: {show: false}},
    ],
    series: [
      {name: "OK", type: "bar", stack: "req", data: http.map((b) => b.count - b.s4xx - b.s5xx), itemStyle: {color: "#18a058"}},
      {name: "4xx", type: "bar", stack: "req", data: http.map((b) => b.s4xx), itemStyle: {color: "#f0a020"}},
      {name: "5xx", type: "bar", stack: "req", data: http.map((b) => b.s5xx), itemStyle: {color: "#d03050"}},
      {name: "p95 ms", type: "line", yAxisIndex: 1, smooth: true, showSymbol: false, connectNulls: true, data: http.map((b) => b.p95Ms), itemStyle: {color: "#2080f0"}},
    ],
  }, true);

  const rs = railwaySeries.value;
  const cpuPoints: [number, number][] = rs
    ? (rs.CPU_USAGE ?? []).map((p: any) => [p.ts * 1000, d.railway.metrics.cpuLimitVcpu ? Math.round((p.value / d.railway.metrics.cpuLimitVcpu) * 1000) / 10 : p.value])
    : (d.series.system as any[]).map((s) => [s.ts, s.cpuPct]);
  const memPoints: [number, number][] = rs
    ? (rs.MEMORY_USAGE_GB ?? []).map((p: any) => [p.ts * 1000, Math.round(p.value * 1024)])
    : (d.series.system as any[]).map((s) => [s.ts, s.rssMb]);
  sysChart?.setOption({
    grid: {left: 40, right: 50, top: 28, bottom: 24},
    tooltip: {trigger: "axis"},
    legend: {top: 0, textStyle: axisText, itemWidth: 10, itemHeight: 8},
    xAxis: {type: "time", axisLabel: {...axisText, hideOverlap: true, formatter: (v: number) => timeLabel(v)}},
    yAxis: [
      {type: "value", name: "CPU %", axisLabel: axisText, splitLine: {lineStyle: {opacity: 0.15}}},
      {type: "value", name: "MB", axisLabel: axisText, splitLine: {show: false}},
    ],
    series: [
      {name: "CPU %", type: "line", smooth: true, showSymbol: false, data: cpuPoints, itemStyle: {color: "#f0a020"}, areaStyle: {opacity: 0.12}},
      {name: "Memory MB", type: "line", yAxisIndex: 1, smooth: true, showSymbol: false, data: memPoints, itemStyle: {color: "#63e2b7"}},
    ],
  }, true);
}

async function load() {
  try {
    data.value = await api.admin.monitorServerLive(range.value);
    lastOkAt.value = Date.now();
    await nextTick();
    renderCharts();
  } catch (err: any) {
    if (!data.value) message.error(err?.message ?? "Failed to load server metrics");
  }
}

async function sendTest() {
  testing.value = true;
  try {
    await api.admin.sendTestServerAlert();
    message.success("Test alert sent — check your notifications");
  } catch (err: any) {
    message.error(err?.message ?? "Could not send test alert");
  } finally {
    testing.value = false;
  }
}

function setRange(next: GraphRange) {
  if (range.value === next) return;
  range.value = next;
  void load();
}

function onResize() {
  httpChart?.resize();
  sysChart?.resize();
}

onMounted(() => {
  void refreshState();
  void load();
  pollTimer = setInterval(() => { if (!document.hidden) void load(); }, 10_000);
  clockTimer = setInterval(() => { nowTick.value = Date.now(); }, 1_000);
  window.addEventListener("resize", onResize);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (clockTimer) clearInterval(clockTimer);
  window.removeEventListener("resize", onResize);
  httpChart?.dispose();
  sysChart?.dispose();
});
</script>

<style scoped>
.server-live {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

.monitor-block {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px 20px;
  min-width: 0;
}

.monitor-block__title {
  font-family: var(--font-ui);
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.block-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.head-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.head-row .monitor-block__title {
  margin-bottom: 0;
}

.spacer {
  flex: 1;
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #18a058;
  box-shadow: 0 0 0 3px rgba(24, 160, 88, 0.18);
}

.live-dot--stale {
  background: #d03050;
  box-shadow: 0 0 0 3px rgba(208, 48, 80, 0.18);
}

.title-note {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.charts-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.range-picks {
  display: flex;
  gap: 4px;
}

.range-picks button {
  appearance: none;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.range-picks button.on {
  background: var(--brand-color);
  border-color: transparent;
  color: #10231c;
}

.charts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.tables {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

@media (max-width: 1000px) {
  .charts, .tables { grid-template-columns: minmax(0, 1fr); }
}

.chart-box {
  min-width: 0;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.chart {
  width: 100%;
  height: 240px;
}
</style>
