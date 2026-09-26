import { beforeEach, describe, expect, it, vi } from "vitest";
import type express from "express";
const mocks = vi.hoisted(() => ({ findOne: vi.fn(), auth: vi.fn(), enabled: vi.fn() }));
vi.mock("../db/db", () => ({ col: () => ({ findOne: mocks.findOne }) }));
vi.mock("../auth/middleware", () => ({ requireAuth: mocks.auth }));
vi.mock("../features", () => ({ isFeatureEnabledForUser: mocks.enabled }));
vi.mock("../routes/gmail", () => ({ gmailFetch: vi.fn(), resolveGmailToken: vi.fn(), retryWithRefresh: vi.fn() }));
vi.mock("../pipeline/pdfParser", () => ({ parsePdf: vi.fn() }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { registerGmailObligationRoutes } from "../routes/gmailObligations";

describe("discovery source access", () => {
  const handlers = new Map<string, Function>();
  const app = Object.fromEntries(["get", "post", "put", "use"].map(method => [method, (path: string, handler: Function) => handlers.set(`${method} ${path}`, handler)]));
  beforeEach(() => { vi.clearAllMocks(); registerGmailObligationRoutes(app as unknown as express.Application); });
  function response() {
    const res = { locals: { discoveryUserId: "owner" }, status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
    res.status.mockReturnValue(res); return res;
  }
  it("blocks the endpoints when the page feature is disabled", async () => {
    mocks.auth.mockResolvedValue({ userId: "owner" }); mocks.enabled.mockResolvedValue(false);
    const res = response(); const next = vi.fn();
    await handlers.get("use /api/gmail/obligation")!({ headers: {} }, res, next);
    expect(mocks.enabled).toHaveBeenCalledWith("owner", "pages.discovery");
    expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
  });
  it.each(["get /api/gmail/obligation/saved/:id", "get /api/gmail/obligation/saved/:id/pdf/:fileId"])("requires record ownership for %s", async route => {
    mocks.findOne.mockResolvedValue(null);
    const res = response();
    await handlers.get(route)!({ params: { id: "another-users-record", fileId: "pdf" } }, res);
    expect(mocks.findOne).toHaveBeenCalledWith({ _id: "another-users-record", user_id: "owner" });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
