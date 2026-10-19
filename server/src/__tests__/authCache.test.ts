import {afterEach, describe, expect, it, vi} from "vitest";
import express from "express";
import http, {type Server} from "node:http";
import {registerAuthRoutes} from "../routes/auth";

vi.mock("../auth/session", () => ({
  resolveSession: vi.fn().mockResolvedValue(null),
  consumeMagicLinkToken: vi.fn(),
  createSession: vi.fn(),
  clearSessionCookie: vi.fn(),
  revokeSession: vi.fn(),
  setActingAsUser: vi.fn(),
}));

let server: Server;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("auth response caching", () => {
  it("returns a fresh session response even with a matching cache validator", async () => {
    const app = express();
    registerAuthRoutes(app);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as {port: number}).port;
    const get = (headers: Record<string, string> = {}) => new Promise<{
      status: number; headers: http.IncomingHttpHeaders; body: string;
    }>((resolve, reject) => {
      http.get({hostname: "127.0.0.1", port, path: "/api/auth/me", headers}, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({status: res.statusCode!, headers: res.headers, body}));
      }).on("error", reject);
    });
    const first = await get();
    const second = await get({"If-None-Match": first.headers.etag ?? "*"});
    expect(second.status).toBe(200);
    expect(JSON.parse(second.body)).toEqual({user: null});
    expect(second.headers["cache-control"]).toContain("no-store");
    expect(second.headers.vary).toContain("Cookie");
  });
});
