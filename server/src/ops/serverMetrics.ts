import os from "os";
import express from "express";
import {monitorEventLoopDelay} from "perf_hooks";
import {col} from "../db/db";
import {logger} from "../logger";
import {sendPushToAdmins} from "../push/pushService";

/**
 * Live server metrics for the admin System Health page, plus threshold alerts
 * pushed to admins. Everything here is measured inside this container, so with
 * several replicas each one reports its own numbers; Railway's container
 * metrics (fetched with RAILWAY_API_TOKEN) are the fleet-level view.
 */

const SAMPLE_EVERY_MS = 15_000;
/** Minute buckets kept in memory. Longer graph ranges use hourly rollups. */
const MINUTE_HISTORY = 8 * 60;
const HOUR_HISTORY = 31 * 24;
const DETAIL_MINUTES = 15;
const MAX_DURATIONS_PER_MINUTE = 2_000;
/** A request still open after this long counts as a timeout even if it later finishes. */
const TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_ALERT_MS ?? 30_000) || 30_000;

interface MinuteBucket {
  minute: number; // epoch ms, floored to the minute
  count: number;
  s2xx: number;
  s3xx: number;
  s4xx: number;
  s404: number;
  s5xx: number;
  timeouts: number;
  aborted: number;
  durations: number[];
  paths404: Map<string, number>;
  slow: Map<string, {count: number; totalMs: number; maxMs: number}>;
  p95Ms?: number;
  closed?: boolean;
}

interface HourRollup {
  hour: number;
  count: number;
  s4xx: number;
  s404: number;
  s5xx: number;
  timeouts: number;
  p95Ms: number;
}

interface SystemHour {
  hour: number;
  cpuSum: number;
  rssSum: number;
  n: number;
  cpuPct: number;
  rssMb: number;
}

interface SystemSample {
  ts: number;
  cpuPct: number; // share of the container's CPUs this process used since the last sample
  rssMb: number;
  heapUsedMb: number;
  systemMemUsedPct: number;
  loadAvg1: number;
  eventLoopLagMs: number; // p99 over the sample
}

const buckets: MinuteBucket[] = [];
const samples: SystemSample[] = [];
const hourRollups: HourRollup[] = [];
const systemHours: SystemHour[] = [];
let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();
const loopDelay = monitorEventLoopDelay({resolution: 20});
loopDelay.enable();
let samplerTimer: ReturnType<typeof setInterval> | null = null;
let alertTimer: ReturnType<typeof setInterval> | null = null;

function currentBucket(now = Date.now()): MinuteBucket {
  const minute = Math.floor(now / 60_000) * 60_000;
  let bucket = buckets[buckets.length - 1];
  if (!bucket || bucket.minute !== minute) {
    bucket = {minute, count: 0, s2xx: 0, s3xx: 0, s4xx: 0, s404: 0, s5xx: 0, timeouts: 0, aborted: 0, durations: [], paths404: new Map(), slow: new Map()};
    if (buckets.length) closeMinute(buckets[buckets.length - 1]);
    buckets.push(bucket);
    const cutoff = minute - MINUTE_HISTORY * 60_000;
    while (buckets.length && buckets[0].minute < cutoff) buckets.shift();
    compactOldBuckets(now);
  }
  return bucket;
}

function closeMinute(bucket: MinuteBucket) {
  if (bucket.closed) return;
  bucket.closed = true;
  bucket.p95Ms = percentile(bucket.durations, 95);
  const hour = Math.floor(bucket.minute / 3_600_000) * 3_600_000;
  let roll = hourRollups[hourRollups.length - 1];
  if (!roll || roll.hour !== hour) {
    roll = {hour, count: 0, s4xx: 0, s404: 0, s5xx: 0, timeouts: 0, p95Ms: 0};
    hourRollups.push(roll);
    while (hourRollups.length > HOUR_HISTORY) hourRollups.shift();
  }
  roll.count += bucket.count;
  roll.s4xx += bucket.s4xx;
  roll.s404 += bucket.s404;
  roll.s5xx += bucket.s5xx;
  roll.timeouts += bucket.timeouts;
  roll.p95Ms = Math.max(roll.p95Ms, bucket.p95Ms);
}

function compactOldBuckets(now: number) {
  const detailAfter = now - DETAIL_MINUTES * 60_000;
  for (const bucket of buckets) {
    if (bucket.minute >= detailAfter) continue;
    closeMinute(bucket);
    if (bucket.durations.length) bucket.durations = [];
    if (bucket.paths404.size) bucket.paths404 = new Map();
    if (bucket.slow.size) bucket.slow = new Map();
  }
}

/** Collapses ids in paths (/api/documents/66f…) so slow-path stats group by route. */
function routeKey(req: express.Request): string {
  return `${req.method} ${req.path.replace(/\/[0-9a-f]{24}(?=\/|$)/gi, "/:id").replace(/\/\d+(?=\/|$)/g, "/:n")}`;
}

export function metricsMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path === "/health" || req.path.startsWith("/assets/")) { next(); return; }
  const start = Date.now();
  let settled = false;
  const timeoutTimer = setTimeout(() => {
    if (!settled) currentBucket().timeouts += 1;
  }, TIMEOUT_MS);
  timeoutTimer.unref?.();
  const finish = (aborted: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutTimer);
    const ms = Date.now() - start;
    const bucket = currentBucket();
    bucket.count += 1;
    if (aborted) { bucket.aborted += 1; return; }
    const status = res.statusCode;
    if (status >= 500) bucket.s5xx += 1;
    else if (status >= 400) bucket.s4xx += 1;
    else if (status >= 300) bucket.s3xx += 1;
    else bucket.s2xx += 1;
    if (status === 404) {
      bucket.s404 += 1;
      bucket.paths404.set(req.path, (bucket.paths404.get(req.path) ?? 0) + 1);
    }
    if (bucket.durations.length < MAX_DURATIONS_PER_MINUTE) bucket.durations.push(ms);
    const key = routeKey(req);
    const slow = bucket.slow.get(key) ?? {count: 0, totalMs: 0, maxMs: 0};
    slow.count += 1;
    slow.totalMs += ms;
    slow.maxMs = Math.max(slow.maxMs, ms);
    bucket.slow.set(key, slow);
  };
  res.on("finish", () => finish(false));
  res.on("close", () => finish(!res.writableFinished));
  next();
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function takeSample() {
  const now = Date.now();
  const cpu = process.cpuUsage(lastCpu);
  const elapsedMs = Math.max(1, now - lastCpuAt);
  lastCpu = process.cpuUsage();
  lastCpuAt = now;
  const cores = Math.max(1, os.availableParallelism?.() ?? os.cpus().length);
  const mem = process.memoryUsage();
  samples.push({
    ts: now,
    cpuPct: Math.round((((cpu.user + cpu.system) / 1000) / elapsedMs / cores) * 1000) / 10,
    rssMb: Math.round(mem.rss / 1048576),
    heapUsedMb: Math.round(mem.heapUsed / 1048576),
    systemMemUsedPct: Math.round((1 - os.freemem() / os.totalmem()) * 1000) / 10,
    loadAvg1: Math.round(os.loadavg()[0] * 100) / 100,
    eventLoopLagMs: Math.round(loopDelay.percentile(99) / 1e6),
  });
  loopDelay.reset();
  const cutoff = now - MINUTE_HISTORY * 60_000;
  while (samples.length && samples[0].ts < cutoff) samples.shift();
  const sample = samples[samples.length - 1];
  if (sample) foldSystemSample(sample);
}

function foldSystemSample(sample: SystemSample) {
  const hour = Math.floor(sample.ts / 3_600_000) * 3_600_000;
  let roll = systemHours[systemHours.length - 1];
  if (!roll || roll.hour !== hour) {
    roll = {hour, cpuSum: 0, rssSum: 0, n: 0, cpuPct: 0, rssMb: 0};
    systemHours.push(roll);
    while (systemHours.length > HOUR_HISTORY) systemHours.shift();
  }
  roll.cpuSum += sample.cpuPct;
  roll.rssSum += sample.rssMb;
  roll.n += 1;
  roll.cpuPct = Math.round((roll.cpuSum / roll.n) * 10) / 10;
  roll.rssMb = Math.round(roll.rssSum / roll.n);
}

// ── Aggregates ──────────────────────────────────────────────────────────────

export interface HttpWindowSummary {
  requests: number;
  perMinute: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  s4xx: number;
  s404: number;
  s5xx: number;
  errorRatePct: number; // 5xx share of requests
  timeouts: number;
  aborted: number;
}

export function httpSummary(minutes: number): HttpWindowSummary {
  const since = Date.now() - minutes * 60_000;
  const recent = buckets.filter((b) => b.minute >= since - 60_000);
  const durations = recent.flatMap((b) => b.durations);
  const sum = (key: "count" | "s4xx" | "s404" | "s5xx" | "timeouts" | "aborted") => recent.reduce((acc, b) => acc + b[key], 0);
  const requests = sum("count");
  return {
    requests,
    perMinute: Math.round((requests / Math.max(1, minutes)) * 10) / 10,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    p99Ms: percentile(durations, 99),
    s4xx: sum("s4xx"),
    s404: sum("s404"),
    s5xx: sum("s5xx"),
    errorRatePct: requests ? Math.round((sum("s5xx") / requests) * 1000) / 10 : 0,
    timeouts: sum("timeouts"),
    aborted: sum("aborted"),
  };
}

function systemSummary(minutes: number) {
  const since = Date.now() - minutes * 60_000;
  const recent = samples.filter((s) => s.ts >= since);
  const avg = (key: keyof SystemSample) => recent.length ? recent.reduce((acc, s) => acc + (s[key] as number), 0) / recent.length : 0;
  const latest = samples[samples.length - 1] ?? null;
  return {
    latest,
    avgCpuPct: Math.round(avg("cpuPct") * 10) / 10,
    maxEventLoopLagMs: recent.reduce((m, s) => Math.max(m, s.eventLoopLagMs), 0),
  };
}

// ── Railway container metrics ───────────────────────────────────────────────

const RAILWAY_API = "https://backboard.railway.com/graphql/v2";
const railwayCache = new Map<string, {at: number; data: any}>();

export const GRAPH_RANGES = ["1h", "8h", "1d", "7d", "1m"] as const;
export type GraphRange = (typeof GRAPH_RANGES)[number];

const GRAPH_RANGE: Record<GraphRange, {ms: number; sampleRateSeconds: number; bucketMs: number; label: string}> = {
  "1h": {ms: 60 * 60_000, sampleRateSeconds: 60, bucketMs: 60_000, label: "1 hour"},
  "8h": {ms: 8 * 60 * 60_000, sampleRateSeconds: 300, bucketMs: 5 * 60_000, label: "8 hours"},
  "1d": {ms: 24 * 60 * 60_000, sampleRateSeconds: 900, bucketMs: 15 * 60_000, label: "1 day"},
  "7d": {ms: 7 * 24 * 60 * 60_000, sampleRateSeconds: 3600, bucketMs: 60 * 60_000, label: "7 days"},
  "1m": {ms: 30 * 24 * 60 * 60_000, sampleRateSeconds: 3 * 60 * 60, bucketMs: 6 * 60 * 60_000, label: "1 month"},
};

export function parseGraphRange(value: unknown): GraphRange {
  return GRAPH_RANGES.includes(value as GraphRange) ? value as GraphRange : "1h";
}

export function railwayInfo() {
  const e = process.env;
  return {
    onRailway: Boolean(e.RAILWAY_ENVIRONMENT_ID || e.RAILWAY_ENVIRONMENT),
    metricsConfigured: Boolean(e.RAILWAY_API_TOKEN && e.RAILWAY_SERVICE_ID && e.RAILWAY_ENVIRONMENT_ID),
    projectName: e.RAILWAY_PROJECT_NAME ?? null,
    serviceName: e.RAILWAY_SERVICE_NAME ?? null,
    environmentName: e.RAILWAY_ENVIRONMENT_NAME ?? e.RAILWAY_ENVIRONMENT ?? null,
    deploymentId: e.RAILWAY_DEPLOYMENT_ID ?? null,
    replicaId: e.RAILWAY_REPLICA_ID ?? null,
    replicaRegion: e.RAILWAY_REPLICA_REGION ?? null,
    publicDomain: e.RAILWAY_PUBLIC_DOMAIN ?? null,
    gitCommit: e.RAILWAY_GIT_COMMIT_SHA ? e.RAILWAY_GIT_COMMIT_SHA.slice(0, 7) : null,
    gitBranch: e.RAILWAY_GIT_BRANCH ?? null,
    gitMessage: e.RAILWAY_GIT_COMMIT_MESSAGE ?? null,
  };
}

/** CPU/memory/network for the service over the selected range, from Railway's API (cached 60s per range). */
export async function railwayMetrics(range: GraphRange = "1h"): Promise<any | null> {
  const e = process.env;
  if (!e.RAILWAY_API_TOKEN || !e.RAILWAY_SERVICE_ID || !e.RAILWAY_ENVIRONMENT_ID) return null;
  const cached = railwayCache.get(range);
  if (cached && Date.now() - cached.at < 60_000) return cached.data;
  const window = GRAPH_RANGE[range];
  const query = `query metrics($serviceId: String!, $environmentId: String!, $startDate: DateTime!, $measurements: [MetricMeasurement!]!, $sampleRateSeconds: Int) {
    metrics(serviceId: $serviceId, environmentId: $environmentId, startDate: $startDate, measurements: $measurements, sampleRateSeconds: $sampleRateSeconds) {
      measurement
      values { ts value }
    }
  }`;
  try {
    const res = await fetch(RAILWAY_API, {
      method: "POST",
      headers: {"Content-Type": "application/json", Authorization: `Bearer ${e.RAILWAY_API_TOKEN}`},
      body: JSON.stringify({
        query,
        variables: {
          serviceId: e.RAILWAY_SERVICE_ID,
          environmentId: e.RAILWAY_ENVIRONMENT_ID,
          startDate: new Date(Date.now() - window.ms).toISOString(),
          measurements: ["CPU_USAGE", "CPU_LIMIT", "MEMORY_USAGE_GB", "MEMORY_LIMIT_GB", "NETWORK_RX_GB", "NETWORK_TX_GB"],
          sampleRateSeconds: window.sampleRateSeconds,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json() as any;
    if (!res.ok || body.errors?.length) throw new Error(body.errors?.[0]?.message ?? `HTTP ${res.status}`);
    const series: Record<string, {ts: number; value: number}[]> = {};
    for (const m of body.data?.metrics ?? []) series[m.measurement] = m.values ?? [];
    const last = (key: string) => series[key]?.[series[key].length - 1]?.value ?? null;
    const data = {
      series,
      cpuVcpu: last("CPU_USAGE"),
      cpuLimitVcpu: last("CPU_LIMIT"),
      memoryGb: last("MEMORY_USAGE_GB"),
      memoryLimitGb: last("MEMORY_LIMIT_GB"),
      error: null as string | null,
    };
    railwayCache.set(range, {at: Date.now(), data});
    return data;
  } catch (err: any) {
    const data = {series: {}, error: err?.message ?? String(err)};
    railwayCache.set(range, {at: Date.now(), data});
    return data;
  }
}

// ── Alerts ──────────────────────────────────────────────────────────────────

const num = (name: string, fallback: number) => Number(process.env[name] ?? fallback) || fallback;
export function alertThresholds() {
  return {
    cpuPct: num("ALERT_CPU_PCT", 85),
    memoryPct: num("ALERT_MEMORY_PCT", 85),
    p95Ms: num("ALERT_P95_MS", 3000),
    errorRatePct: num("ALERT_5XX_PCT", 5),
    notFoundPer5Min: num("ALERT_404_PER_5MIN", 150),
    timeoutsPer5Min: num("ALERT_TIMEOUTS_PER_5MIN", 3),
    eventLoopLagMs: num("ALERT_EVENT_LOOP_MS", 500),
    cooldownMinutes: num("ALERT_COOLDOWN_MINUTES", 30),
  };
}

const lastFired = new Map<string, number>();

async function fireAlert(key: string, title: string, body: string, value: number, threshold: number) {
  const t = alertThresholds();
  const prev = lastFired.get(key) ?? 0;
  if (Date.now() - prev < t.cooldownMinutes * 60_000) return;
  lastFired.set(key, Date.now());
  const info = railwayInfo();
  const where = [info.serviceName, info.environmentName].filter(Boolean).join(" · ") || "server";
  logger.warn("server_alert", {key, value, threshold, where});
  try {
    await col<any>("server_alerts").insertOne({key, title, body, value, threshold, where, replica: info.replicaId, created_at: new Date()});
  } catch { /* alert storage is best effort */ }
  await sendPushToAdmins({title: `Server alert: ${title} (${where})`, body, data: {url: "/admin?section=system_health"}});
}

export async function evaluateAlerts() {
  const t = alertThresholds();
  const http = httpSummary(5);
  const sys = systemSummary(5);
  const railway = await railwayMetrics().catch(() => null);

  // Prefer Railway's container view for CPU/RAM; fall back to this process.
  const cpuPct = railway?.cpuVcpu != null && railway?.cpuLimitVcpu
    ? (railway.cpuVcpu / railway.cpuLimitVcpu) * 100
    : sys.avgCpuPct;
  const memPct = railway?.memoryGb != null && railway?.memoryLimitGb
    ? (railway.memoryGb / railway.memoryLimitGb) * 100
    : sys.latest?.systemMemUsedPct ?? 0;

  const checks: Array<[boolean, string, string, string, number, number]> = [
    [cpuPct >= t.cpuPct, "cpu", "High CPU", `CPU at ${cpuPct.toFixed(0)}% (limit ${t.cpuPct}%)`, cpuPct, t.cpuPct],
    [memPct >= t.memoryPct, "memory", "High memory", `Memory at ${memPct.toFixed(0)}% (limit ${t.memoryPct}%)`, memPct, t.memoryPct],
    [http.requests >= 20 && http.p95Ms >= t.p95Ms, "latency", "Slow responses", `p95 latency ${http.p95Ms} ms over the last 5 min (limit ${t.p95Ms} ms)`, http.p95Ms, t.p95Ms],
    [http.requests >= 20 && http.errorRatePct >= t.errorRatePct, "5xx", "Server errors", `${http.s5xx} of ${http.requests} requests failed (5xx) in 5 min`, http.errorRatePct, t.errorRatePct],
    [http.s404 >= t.notFoundPer5Min, "404", "Many 404s", `${http.s404} not-found responses in 5 min`, http.s404, t.notFoundPer5Min],
    [http.timeouts >= t.timeoutsPer5Min, "timeouts", "Request timeouts", `${http.timeouts} requests ran past ${Math.round(TIMEOUT_MS / 1000)}s in 5 min`, http.timeouts, t.timeoutsPer5Min],
    [sys.maxEventLoopLagMs >= t.eventLoopLagMs, "event_loop", "Event loop blocked", `Event loop lag up to ${sys.maxEventLoopLagMs} ms`, sys.maxEventLoopLagMs, t.eventLoopLagMs],
  ];
  for (const [breached, key, title, body, value, threshold] of checks) {
    if (breached) await fireAlert(key, title, body, value, threshold);
  }
}

export function alertsEnabled(): boolean {
  if (process.env.SERVER_ALERTS_ENABLED === "false") return false;
  return process.env.SERVER_ALERTS_ENABLED === "true" || (process.env.APP_ENV ?? "development") === "production";
}

export function startServerMetrics() {
  if (!samplerTimer) {
    takeSample();
    samplerTimer = setInterval(takeSample, SAMPLE_EVERY_MS);
    samplerTimer.unref?.();
  }
  if (!alertTimer && alertsEnabled()) {
    alertTimer = setInterval(() => { void evaluateAlerts().catch((err) => logger.warn("server_alert_eval_failed", {error: String(err)})); }, 60_000);
    alertTimer.unref?.();
    logger.info("server_alerts_started", {thresholds: alertThresholds()});
  }
}

// ── Snapshot for the admin page ─────────────────────────────────────────────

interface HttpPoint {
  ts: number;
  count: number;
  s4xx: number;
  s404: number;
  s5xx: number;
  timeouts: number;
  p95Ms: number;
}

function minutePoint(bucket: MinuteBucket): HttpPoint {
  return {
    ts: bucket.minute,
    count: bucket.count,
    s4xx: bucket.s4xx,
    s404: bucket.s404,
    s5xx: bucket.s5xx,
    timeouts: bucket.timeouts,
    p95Ms: bucket.durations.length ? percentile(bucket.durations, 95) : (bucket.p95Ms ?? 0),
  };
}

function aggregatePoints(points: HttpPoint[], bucketMs: number): HttpPoint[] {
  const grouped = new Map<number, HttpPoint>();
  for (const point of points) {
    const ts = Math.floor(point.ts / bucketMs) * bucketMs;
    const acc = grouped.get(ts) ?? {ts, count: 0, s4xx: 0, s404: 0, s5xx: 0, timeouts: 0, p95Ms: 0};
    acc.count += point.count;
    acc.s4xx += point.s4xx;
    acc.s404 += point.s404;
    acc.s5xx += point.s5xx;
    acc.timeouts += point.timeouts;
    acc.p95Ms = Math.max(acc.p95Ms, point.p95Ms);
    grouped.set(ts, acc);
  }
  return [...grouped.values()].sort((a, b) => a.ts - b.ts);
}

function httpSeries(range: GraphRange): HttpPoint[] {
  const spec = GRAPH_RANGE[range];
  const since = Date.now() - spec.ms;
  const oldestMinute = buckets[0]?.minute ?? Date.now();
  const fromMinutes = buckets.filter((b) => b.minute >= since).map(minutePoint);
  const fromHours: HttpPoint[] = hourRollups
    .filter((h) => h.hour >= since && h.hour < oldestMinute)
    .map((h) => ({ts: h.hour, count: h.count, s4xx: h.s4xx, s404: h.s404, s5xx: h.s5xx, timeouts: h.timeouts, p95Ms: h.p95Ms}));
  return aggregatePoints([...fromHours, ...fromMinutes], spec.bucketMs);
}

function systemSeries(range: GraphRange): {ts: number; cpuPct: number; rssMb: number}[] {
  const spec = GRAPH_RANGE[range];
  const since = Date.now() - spec.ms;
  const oldestSample = samples[0]?.ts ?? Date.now();
  const recent = samples
    .filter((s) => s.ts >= since)
    .map((s) => ({ts: s.ts, cpuPct: s.cpuPct, rssMb: s.rssMb}));
  const older = systemHours
    .filter((h) => h.hour >= since && h.hour < oldestSample)
    .map((h) => ({ts: h.hour, cpuPct: h.cpuPct, rssMb: h.rssMb}));
  const points = [...older, ...recent].sort((a, b) => a.ts - b.ts);
  if (points.length <= 180) return points;
  const step = Math.ceil(points.length / 180);
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

export async function liveSnapshot(range: GraphRange = "1h") {
  const topEntries = <T>(map: Map<string, T>, score: (v: T) => number, n: number) =>
    [...map.entries()].sort((a, b) => score(b[1]) - score(a[1])).slice(0, n);
  const recent = buckets.filter((b) => b.minute >= Date.now() - 15 * 60_000);
  const paths404 = new Map<string, number>();
  const slow = new Map<string, {count: number; totalMs: number; maxMs: number}>();
  for (const b of recent) {
    for (const [p, c] of b.paths404) paths404.set(p, (paths404.get(p) ?? 0) + c);
    for (const [k, v] of b.slow) {
      const agg = slow.get(k) ?? {count: 0, totalMs: 0, maxMs: 0};
      agg.count += v.count; agg.totalMs += v.totalMs; agg.maxMs = Math.max(agg.maxMs, v.maxMs);
      slow.set(k, agg);
    }
  }
  const alerts = await col("server_alerts").find({}).sort({created_at: -1}).limit(20).toArray().catch(() => []);
  const ranged = await railwayMetrics(range);
  const latest = range === "1h" ? ranged : await railwayMetrics("1h");
  const metrics = ranged && latest ? {...latest, series: ranged.series ?? {}, error: ranged.error ?? latest.error} : (ranged ?? latest);
  return {
    now: new Date().toISOString(),
    range,
    rangeLabel: GRAPH_RANGE[range].label,
    railway: {...railwayInfo(), metrics},
    container: {
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      cpus: os.availableParallelism?.() ?? os.cpus().length,
      totalMemMb: Math.round(os.totalmem() / 1048576),
    },
    http: {last5: httpSummary(5), last60: httpSummary(60)},
    system: {last5: systemSummary(5)},
    series: {
      http: httpSeries(range),
      system: systemSeries(range),
    },
    top404: topEntries(paths404, (v) => v, 8).map(([path, count]) => ({path, count})),
    slowest: topEntries(slow, (v) => v.totalMs / v.count, 8).map(([route, v]) => ({route, count: v.count, avgMs: Math.round(v.totalMs / v.count), maxMs: v.maxMs})),
    alerts: {
      enabled: alertsEnabled(),
      thresholds: alertThresholds(),
      recent: alerts.map(({_id, ...a}: any) => ({id: String(_id), ...a})),
    },
  };
}
