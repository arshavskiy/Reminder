<template>
  <button v-if="data" type="button" class="health-strip" :class="`health-strip--${overall}`" @click="emit('open')">
    <span class="status">
      <span class="label"><span class="dot" />{{ overallLabel }}</span>
      <span v-if="lastAlert" class="alert">{{ lastAlert.title }} · {{ ago(lastAlert.created_at) }}</span>
    </span>

    <span class="metric">
      <span class="k">Requests</span>
      <span class="v">{{ h.perMinute }}<small>/min</small></span>
      <span class="s">{{ data.http.last60.requests }} last hour</span>
    </span>
    <span class="metric" :class="`is-${lv.p95}`">
      <span class="k">Latency p95</span>
      <span class="v">{{ ms(h.p95Ms) }}</span>
      <span class="s">p50 {{ ms(h.p50Ms) }}</span>
    </span>
    <span class="metric" :class="`is-${lv.err}`">
      <span class="k">Server errors</span>
      <span class="v">{{ h.errorRatePct }}%</span>
      <span class="s">{{ h.s5xx }} × 5xx</span>
    </span>
    <span class="metric" :class="`is-${worse(lv.nf, lv.to)}`">
      <span class="k">404 / timeouts</span>
      <span class="v">{{ h.s404 }}<small> / {{ h.timeouts }}</small></span>
      <span class="s">last 5 min</span>
    </span>
    <span class="metric" :class="`is-${lv.cpu}`">
      <span class="k">CPU</span>
      <span class="v">{{ cpu }}%</span>
      <span class="s">load {{ data.system.last5.latest?.loadAvg1 ?? "—" }}</span>
    </span>
    <span class="metric" :class="`is-${lv.mem}`">
      <span class="k">Memory</span>
      <span class="v">{{ memText }}</span>
      <span class="s">{{ memPct.toFixed(1) }}% of limit</span>
    </span>
    <span class="metric" :class="`is-${lv.loop}`">
      <span class="k">Event loop</span>
      <span class="v">{{ data.system.last5.maxEventLoopLagMs }}<small>ms</small></span>
      <span class="s">max lag</span>
    </span>

    <span class="sparks">
      <span class="spark" :title="`Last 15 min — requests/min (bars, red = had a 5xx) peak ${traffic.peakReq}, p95 latency (line) peak ${ms(traffic.peakP95)}`">
        <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
          <rect v-for="(bar, i) in traffic.bars" :key="i" :x="bar.x" :y="bar.y" :width="bar.w" :height="bar.h" :class="bar.err ? 'bar bar--err' : 'bar'" />
          <polyline v-if="traffic.line" :points="traffic.line" class="line line--p95" />
        </svg>
        <span class="spark-label">
          <i class="sw sw--req" />req <b>{{ h.perMinute }}/min</b>
          <i class="sw sw--p95" />p95 <b>{{ ms(h.p95Ms) }}</b>
        </span>
      </span>
      <span class="spark" :title="`Last 15 min — CPU peak ${resources.peakCpu}%, memory peak ${resources.peakMemPct}% of limit`">
        <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
          <polyline v-if="resources.mem" :points="resources.mem" class="line line--mem" />
          <polyline v-if="resources.cpu" :points="resources.cpu" class="line line--cpu" />
        </svg>
        <span class="spark-label">
          <i class="sw sw--cpu" />CPU <b>{{ cpu }}%</b>
          <i class="sw sw--mem" />mem <b>{{ memPct.toFixed(1) }}%</b>
        </span>
      </span>
    </span>
  </button>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {api} from "../services/apiService";

const emit = defineEmits<{ open: [] }>();
const data = ref<any | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

const W = 130;
const H = 34;
/** The strip's mini charts cover the last 15 minutes; System Health has the full hour. */
const SPARK_MINUTES = 15;

type Level = "ok" | "warn" | "bad";
const level = (value: number, limit: number): Level => (value >= limit ? "bad" : value >= limit * 0.7 ? "warn" : "ok");
const rank: Record<Level, number> = {ok: 0, warn: 1, bad: 2};
const worse = (a: Level, b: Level): Level => (rank[a] >= rank[b] ? a : b);

const h = computed(() => data.value?.http.last5 ?? {});
const t = computed(() => data.value?.alerts.thresholds ?? {});
const railway = computed(() => data.value?.railway.metrics ?? null);
const cpu = computed(() => {
  const m = railway.value;
  if (m?.cpuVcpu != null && m?.cpuLimitVcpu) return Math.round((m.cpuVcpu / m.cpuLimitVcpu) * 1000) / 10;
  return data.value?.system.last5.latest?.cpuPct ?? 0;
});
const memPct = computed(() => {
  const m = railway.value;
  if (m?.memoryGb != null && m?.memoryLimitGb) return (m.memoryGb / m.memoryLimitGb) * 100;
  const latest = data.value?.system.last5.latest;
  return latest && data.value?.container.totalMemMb ? (latest.rssMb / data.value.container.totalMemMb) * 100 : 0;
});
const memText = computed(() => {
  const m = railway.value;
  if (m?.memoryGb != null) return `${m.memoryGb.toFixed(2)} GB`;
  return `${data.value?.system.last5.latest?.rssMb ?? 0} MB`;
});
const lv = computed(() => {
  const x = h.value;
  return {
    p95: x.requests >= 20 ? level(x.p95Ms ?? 0, t.value.p95Ms ?? 3000) : "ok",
    err: x.requests >= 20 ? level(x.errorRatePct ?? 0, t.value.errorRatePct ?? 5) : "ok",
    nf: level(x.s404 ?? 0, t.value.notFoundPer5Min ?? 150),
    to: level(x.timeouts ?? 0, t.value.timeoutsPer5Min ?? 3),
    cpu: level(cpu.value, t.value.cpuPct ?? 85),
    mem: level(memPct.value, t.value.memoryPct ?? 85),
    loop: level(data.value?.system.last5.maxEventLoopLagMs ?? 0, t.value.eventLoopLagMs ?? 500),
  } as Record<string, Level>;
});
const overall = computed<Level>(() => Object.values(lv.value).reduce(worse, "ok"));
const overallLabel = computed(() => ({ok: "Healthy", warn: "Watch", bad: "Attention"})[overall.value]);
const lastAlert = computed(() => {
  const alert = data.value?.alerts.recent?.[0];
  // Only surface alerts from the last 24 hours in the strip.
  return alert && Date.now() - new Date(alert.created_at).getTime() < 24 * 3600_000 ? alert : null;
});

/** Maps values onto the sparkline height, leaving a little headroom. */
function polyline(values: number[], xAt: (i: number) => number): string {
  if (values.length < 2) return "";
  const max = Math.max(1e-9, ...values);
  return values.map((v, i) => `${xAt(i).toFixed(1)},${(H - 2 - (v / max) * (H - 6)).toFixed(1)}`).join(" ");
}

/** Bars = requests per minute over the last 15 minutes (red when that minute had a 5xx), line = p95 latency. */
const traffic = computed(() => {
  const series = (data.value?.series.http ?? []) as any[];
  const slots = SPARK_MINUTES;
  const points = series.slice(-slots);
  if (!points.length) return {bars: [], line: "", peakReq: 0, peakP95: 0};
  const barW = W / slots;
  const offset = slots - points.length;
  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const bars = points.map((p, i) => {
    const hgt = Math.max(p.count ? 1.5 : 0, (p.count / maxCount) * (H - 4));
    return {x: (offset + i) * barW + 0.3, y: H - hgt, w: Math.max(0.6, barW - 0.6), h: hgt, err: p.s5xx > 0};
  });
  return {
    bars,
    line: polyline(points.map((p) => p.p95Ms), (i) => (offset + i) * barW + barW / 2),
    peakReq: maxCount,
    peakP95: Math.max(0, ...points.map((p) => p.p95Ms)),
  };
});

/** CPU % and memory % of limit over the last 15 minutes — Railway's container series when available, else this process. */
const resources = computed(() => {
  const since = Date.now() - SPARK_MINUTES * 60_000;
  const rs = railway.value?.series;
  const m = railway.value;
  let cpuValues: number[];
  let memValues: number[];
  if (rs?.CPU_USAGE?.length || rs?.MEMORY_USAGE_GB?.length) {
    // Railway timestamps are in seconds; convert vCPU and GB to % of the service limits.
    const recent = (points: any[] = []) => points.filter((p) => p.ts * 1000 >= since).map((p) => p.value as number);
    cpuValues = recent(rs.CPU_USAGE).map((v) => (m?.cpuLimitVcpu ? (v / m.cpuLimitVcpu) * 100 : v));
    memValues = recent(rs.MEMORY_USAGE_GB).map((v) => (m?.memoryLimitGb ? (v / m.memoryLimitGb) * 100 : v));
  } else {
    const totalMb = data.value?.container.totalMemMb || 1;
    const samples = ((data.value?.series.system ?? []) as any[]).filter((s) => s.ts >= since);
    cpuValues = samples.map((s) => s.cpuPct);
    memValues = samples.map((s) => (s.rssMb / totalMb) * 100);
  }
  const xAt = (count: number) => (i: number) => (count <= 1 ? W : (i / (count - 1)) * W);
  const peak = (values: number[]) => Math.round(Math.max(0, ...values) * 10) / 10;
  return {
    cpu: polyline(cpuValues, xAt(cpuValues.length)),
    mem: polyline(memValues, xAt(memValues.length)),
    peakCpu: peak(cpuValues),
    peakMemPct: peak(memValues),
  };
});

function ms(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

async function load() {
  try {
    data.value = await api.admin.monitorServerLive();
  } catch { /* the strip stays on its last reading */ }
}

onMounted(() => {
  void load();
  timer = setInterval(() => { if (!document.hidden) void load(); }, 10_000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
/* Sits above the admin header, outside the scrolling section, so it stays pinned. */
.health-strip {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 8px 16px;
  width: auto;
  margin: 12px 24px 0;
  padding: 8px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.health-strip:hover {
  border-color: var(--brand-color);
}

.health-strip--warn { border-color: rgba(240, 160, 32, 0.6); }
.health-strip--bad { border-color: rgba(208, 48, 80, 0.7); }

.status {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 82px;
}

.label {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
}

.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-inline-end: 7px;
  border-radius: 50%;
  background: #18a058;
  box-shadow: 0 0 0 3px rgba(24, 160, 88, 0.16);
}

.health-strip--warn .dot { background: #f0a020; box-shadow: 0 0 0 3px rgba(240, 160, 32, 0.18); }
.health-strip--bad .dot { background: #d03050; box-shadow: 0 0 0 3px rgba(208, 48, 80, 0.18); }

.alert {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #d03050;
}

.metric {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 76px;
  padding-inline-start: 12px;
  border-inline-start: 1px solid var(--border-color);
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
}

.k {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
  white-space: nowrap;
}

.v {
  font-size: 16px;
  font-weight: 700;
  color: var(--brand-color);
  white-space: nowrap;
}

.v small {
  font-size: 11px;
  font-weight: 600;
  margin-inline-start: 1px;
}

.s {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.metric.is-warn .v { color: #f0a020; }
.metric.is-bad .v { color: #d03050; }

.sparks {
  display: flex;
  gap: 12px;
  margin-inline-start: auto;
}

.spark {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.spark svg {
  width: 130px;
  height: 34px;
  display: block;
}

.bar { fill: rgba(24, 160, 88, 0.5); }
.bar--err { fill: #d03050; }

.line {
  fill: none;
  stroke-width: 1.4;
  stroke-linejoin: round;
}

.line--p95 { stroke: #2080f0; }
.line--cpu { stroke: #f0a020; }
.line--mem { stroke: #63e2b7; }

.spark-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-secondary);
}

.spark-label b {
  font-weight: 700;
  color: var(--text-primary);
  margin-inline-end: 4px;
  font-variant-numeric: tabular-nums;
}

.sw {
  display: inline-block;
  width: 8px;
  height: 3px;
  border-radius: 2px;
}

.sw--req { background: rgba(24, 160, 88, 0.7); }
.sw--p95 { background: #2080f0; margin-inline-start: 4px; }
.sw--cpu { background: #f0a020; }
.sw--mem { background: #63e2b7; margin-inline-start: 4px; }
</style>
