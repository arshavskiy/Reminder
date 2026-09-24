<template>
  <button v-if="data" type="button" class="health-strip" :class="`health-strip--${overall}`" @click="emit('open')">
    <span class="dot" />
    <span class="label">{{ overallLabel }}</span>
    <span class="item"><span class="k">Req</span> {{ data.http.last5.perMinute }}/min</span>
    <span class="item" :class="`is-${lv.p95}`"><span class="k">p95</span> {{ ms(data.http.last5.p95Ms) }}</span>
    <span class="item" :class="`is-${lv.err}`"><span class="k">5xx</span> {{ data.http.last5.errorRatePct }}%</span>
    <span class="item" :class="`is-${lv.nf}`"><span class="k">404</span> {{ data.http.last5.s404 }}</span>
    <span class="item" :class="`is-${lv.to}`"><span class="k">Timeouts</span> {{ data.http.last5.timeouts }}</span>
    <span class="item" :class="`is-${lv.cpu}`"><span class="k">CPU</span> {{ cpu }}%</span>
    <span class="item" :class="`is-${lv.mem}`"><span class="k">Mem</span> {{ memText }}</span>
    <span v-if="lastAlert" class="item alert"><span class="k">Last alert</span> {{ lastAlert.title }} · {{ ago(lastAlert.created_at) }}</span>
    <span class="open">System Health →</span>
  </button>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {api} from "../services/apiService";

const emit = defineEmits<{ open: [] }>();
const data = ref<any | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

type Level = "ok" | "warn" | "bad";
const level = (value: number, limit: number): Level => (value >= limit ? "bad" : value >= limit * 0.7 ? "warn" : "ok");

const t = computed(() => data.value?.alerts.thresholds ?? {});
const cpu = computed(() => {
  const m = data.value?.railway.metrics;
  if (m?.cpuVcpu != null && m?.cpuLimitVcpu) return Math.round((m.cpuVcpu / m.cpuLimitVcpu) * 100);
  return Math.round(data.value?.system.last5.latest?.cpuPct ?? 0);
});
const memPct = computed(() => {
  const m = data.value?.railway.metrics;
  if (m?.memoryGb != null && m?.memoryLimitGb) return (m.memoryGb / m.memoryLimitGb) * 100;
  const latest = data.value?.system.last5.latest;
  return latest && data.value?.container.totalMemMb ? (latest.rssMb / data.value.container.totalMemMb) * 100 : 0;
});
const memText = computed(() => {
  const m = data.value?.railway.metrics;
  if (m?.memoryGb != null) return `${m.memoryGb.toFixed(2)} GB`;
  return `${data.value?.system.last5.latest?.rssMb ?? 0} MB`;
});
const lv = computed(() => {
  const h = data.value?.http.last5 ?? {};
  return {
    p95: h.requests >= 20 ? level(h.p95Ms ?? 0, t.value.p95Ms ?? 3000) : "ok",
    err: h.requests >= 20 ? level(h.errorRatePct ?? 0, t.value.errorRatePct ?? 5) : "ok",
    nf: level(h.s404 ?? 0, t.value.notFoundPer5Min ?? 150),
    to: level(h.timeouts ?? 0, t.value.timeoutsPer5Min ?? 3),
    cpu: level(cpu.value, t.value.cpuPct ?? 85),
    mem: level(memPct.value, t.value.memoryPct ?? 85),
  } as Record<string, Level>;
});
const overall = computed<Level>(() => {
  const values = Object.values(lv.value);
  return values.includes("bad") ? "bad" : values.includes("warn") ? "warn" : "ok";
});
const overallLabel = computed(() => ({ok: "Healthy", warn: "Watch", bad: "Attention"})[overall.value]);
const lastAlert = computed(() => {
  const alert = data.value?.alerts.recent?.[0];
  // Only surface alerts from the last 24 hours in the strip.
  return alert && Date.now() - new Date(alert.created_at).getTime() < 24 * 3600_000 ? alert : null;
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
  timer = setInterval(() => { if (!document.hidden) void load(); }, 30_000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.health-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
  width: 100%;
  margin: 0 0 14px;
  padding: 8px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.health-strip:hover {
  border-color: var(--brand-color);
}

.health-strip--warn { border-color: rgba(240, 160, 32, 0.6); }
.health-strip--bad { border-color: rgba(208, 48, 80, 0.7); }

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #18a058;
}

.health-strip--warn .dot { background: #f0a020; }
.health-strip--bad .dot { background: #d03050; }

.label {
  font-weight: 700;
}

.item {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.k {
  color: var(--text-secondary);
  margin-inline-end: 3px;
}

.item.is-warn { color: #f0a020; }
.item.is-bad { color: #d03050; font-weight: 700; }
.item.alert { color: #d03050; }

.open {
  margin-inline-start: auto;
  color: var(--text-secondary);
  white-space: nowrap;
}
</style>
