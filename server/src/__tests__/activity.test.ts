import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import express from "express";
import type {Server} from "http";

const mocks = vi.hoisted(() => ({
  userId: "tenant-a",
  data: new Map<string, Record<string, any>[]>(),
}));

vi.mock("../auth/middleware", () => ({
  requireAuth: async () => ({userId: mocks.userId, user: {plan: "business"}}),
  HTTPException: class extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));

vi.mock("../db/db", () => ({
  col: (name: string) => {
    const rows = mocks.data.get(name) ?? [];
    const matches = (row: any, filter: any): boolean =>
      Object.entries(filter ?? {}).every(([key, cond]: [string, any]) => {
        if (key === "$or") return (cond as any[]).some((sub) => matches(row, sub));
        if (cond && typeof cond === "object" && "$in" in cond) return cond.$in.includes(row[key]);
        if (cond && typeof cond === "object" && "$exists" in cond) return (row[key] !== undefined) === cond.$exists;
        return row[key] === cond;
      });
    const chain = (list: any[]) => ({
      sort: () => chain(list),
      limit: (n: number) => chain(list.slice(0, n)),
      toArray: async () => list,
    });
    return {find: (filter: any) => chain(rows.filter((row) => matches(row, filter)))};
  },
}));

import {registerActivityRoutes} from "../routes/activity";

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  registerActivityRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  mocks.userId = "tenant-a";
  mocks.data.clear();
  mocks.data.set("reminders", [{_id: "rem-1", user_id: "tenant-a"}]);
  mocks.data.set("clients", [{_id: "client-1", user_id: "tenant-a", display_name: "לקוח לדוגמה"}]);
  mocks.data.set("documents", [{_id: "doc-1", file_name: "report.pdf"}]);
  mocks.data.set("email_log", [
    {_id: "log-1", user_id: "tenant-a", log_type: "send", subject: "Sent one", to_address: "a@x.com", sent_at: new Date("2026-03-02T10:00:00Z"), success: 1},
    {_id: "log-2", user_id: "tenant-a", log_type: "bounce", subject: "Bounced", to_address: "b@x.com", sent_at: new Date("2026-03-03T10:00:00Z"), success: 1},
    // Predates the user_id column — reachable only through the user's reminder ids.
    {_id: "log-3", reminder_id: "rem-1", subject: "Legacy row", to_address: "c@x.com", sent_at: new Date("2026-03-01T10:00:00Z"), success: 1},
    {_id: "log-4", user_id: "tenant-b", log_type: "send", subject: "Other tenant", sent_at: new Date("2026-03-09T10:00:00Z"), success: 1},
  ]);
  mocks.data.set("timeline_events", [
    // source_id still resolves to a live document — gets a name and a link.
    {_id: "ev-1", client_id: "client-1", title: "Document added", description: null, source_type: "document", source_id: "doc-1", event_date: new Date("2026-03-04T10:00:00Z")},
    // source_id points at a document that no longer exists — no link, but the
    // client name still resolves.
    {_id: "ev-2", client_id: "client-1", title: "Document added", description: null, source_type: "document", source_id: "doc-deleted", event_date: new Date("2026-03-05T10:00:00Z")},
    {_id: "ev-3", client_id: "client-other", title: "Other tenant doc", description: "nope.pdf", event_date: new Date("2026-03-08T10:00:00Z")},
  ]);
});

describe("GET /api/activity", () => {
  it("merges both sources newest first and keeps other tenants out", async () => {
    const body = await (await fetch(`${base}/api/activity`)).json();
    expect(body.rows.map((r: any) => r.id)).toEqual(["ev-2", "ev-1", "log-2", "log-1", "log-3"]);
    expect(body.rows.map((r: any) => r.kind)).toEqual(["document", "document", "email", "email", "email"]);
  });

  it("resolves the client name and document name for a document event", async () => {
    const body = await (await fetch(`${base}/api/activity`)).json();
    const row = body.rows.find((r: any) => r.id === "ev-1");
    expect(row.detail).toBe("לקוח לדוגמה · report.pdf");
    expect(row.document_id).toBe("doc-1");
  });

  it("resolves the client name but drops the link when the source document is gone", async () => {
    const body = await (await fetch(`${base}/api/activity`)).json();
    const row = body.rows.find((r: any) => r.id === "ev-2");
    expect(row.detail).toBe("לקוח לדוגמה");
    expect(row.document_id).toBeNull();
  });

  it("includes email_log rows that predate the user_id column", async () => {
    const body = await (await fetch(`${base}/api/activity`)).json();
    expect(body.rows.some((r: any) => r.id === "log-3")).toBe(true);
  });

  it("marks bounces as failed and document events as info", async () => {
    const body = await (await fetch(`${base}/api/activity`)).json();
    const byId = Object.fromEntries(body.rows.map((r: any) => [r.id, r.status]));
    expect(byId["log-2"]).toBe("failed");
    expect(byId["log-1"]).toBe("ok");
    expect(byId["ev-1"]).toBe("info");
  });

  it("returns nothing for a user that owns no reminders or clients", async () => {
    mocks.userId = "tenant-z";
    const body = await (await fetch(`${base}/api/activity`)).json();
    expect(body.rows).toEqual([]);
  });

  it("filters to one kind on request", async () => {
    const body = await (await fetch(`${base}/api/activity?kind=email`)).json();
    expect(body.rows.every((r: any) => r.kind === "email")).toBe(true);
  });
});
