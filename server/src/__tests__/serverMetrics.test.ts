import {EventEmitter} from "events";
import {describe, expect, it} from "vitest";
import {httpSummary, metricsMiddleware} from "../ops/serverMetrics";

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
