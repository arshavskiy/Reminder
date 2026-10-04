import {EventEmitter} from "events";
import {describe, expect, it} from "vitest";
import {bucketSeries, httpSummary, metricsMiddleware} from "../ops/serverMetrics";

function fakeRequest(path: string, status: number) {
  const req = {path, method: "GET"} as any;
  const res = Object.assign(new EventEmitter(), {statusCode: status, writableFinished: true}) as any;
  metricsMiddleware(req, res, () => undefined);
  res.emit("finish");
  res.emit("close");
}

describe("server request metrics", () => {
  it("counts statuses once per request, 404s separately", () => {
    const before = httpSummary(5);
    fakeRequest("/api/ok", 200);
    fakeRequest("/api/missing", 404);
    fakeRequest("/api/boom", 500);
    const after = httpSummary(5);
    expect(after.requests - before.requests).toBe(3);
    expect(after.s404 - before.s404).toBe(1);
    expect(after.s4xx - before.s4xx).toBe(1);
    expect(after.s5xx - before.s5xx).toBe(1);
  });

  it("skips health checks and static assets", () => {
    const before = httpSummary(5).requests;
    fakeRequest("/health", 200);
    fakeRequest("/assets/app.js", 200);
    expect(httpSummary(5).requests).toBe(before);
  });

  it("counts a connection closed before the response as aborted, not as a status", () => {
    const before = httpSummary(5);
    const req = {path: "/api/slow", method: "GET"} as any;
    const res = Object.assign(new EventEmitter(), {statusCode: 200, writableFinished: false}) as any;
    metricsMiddleware(req, res, () => undefined);
    res.emit("close");
    const after = httpSummary(5);
    expect(after.aborted - before.aborted).toBe(1);
    expect(after.s5xx).toBe(before.s5xx);
  });
});

describe("graph buckets", () => {
  const HOUR = 3_600_000;
  const now = Date.UTC(2026, 9, 3, 4, 30);
  const point = (ts: number, count: number, p95Ms: number | null = 100) => ({ts, count, s4xx: 0, s404: 0, s5xx: 0, timeouts: 0, p95Ms});

  it("covers the whole 7-day range with hourly buckets even when only two hours have data", () => {
    const series = bucketSeries([point(now - HOUR, 500), point(now, 40)], now, 7 * 24 * HOUR, HOUR);
    expect(series).toHaveLength(168);
    expect(series[series.length - 1].ts).toBe(Date.UTC(2026, 9, 3, 4));
    expect(series[0].ts).toBe(Date.UTC(2026, 9, 3, 4) - 167 * HOUR);
    expect(series.filter((b) => b.count > 0).map((b) => b.count)).toEqual([500, 40]);
    expect(series[0].p95Ms).toBeNull();
  });

  it("sums replicas in the same bucket and drops points outside the range", () => {
    const series = bucketSeries([point(now, 10, 200), point(now, 5, 900), point(now - 40 * 24 * HOUR, 99)], now, 30 * 24 * HOUR, 6 * HOUR);
    expect(series).toHaveLength(120);
    expect(series[series.length - 1]).toMatchObject({count: 15, p95Ms: 900});
    expect(series.reduce((sum, b) => sum + b.count, 0)).toBe(15);
  });
});
