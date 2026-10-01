import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";

const mocks = vi.hoisted(() => ({ signedIn: true }));

vi.mock("../auth/middleware", () => ({
  requireAuth: async () => {
    if (!mocks.signedIn) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    return { userId: "user-1", user: { plan: "business" } };
  },
  HTTPException: class extends Error {},
}));
vi.mock("../db/db", async () => await import("./helpers/memoryDb"));
vi.mock("../gmail/searchProviders", () => ({ loadGmailSearchProviders: async () => [] }));
vi.mock("../reminders/emailSender", () => ({ sendEmailWithAttachments: async () => undefined }));

import { memory } from "./helpers/memoryDb";
import { registerInvoiceRoutes } from "../routes/invoices";

let server: Server;
let base: string;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const invoice = (id: string, due: string | null, extra: Record<string, unknown> = {}) => ({
  _id: id,
  user_id: "user-1",
  source: "gmail_inline",
  supplier_name: `Supplier ${id}`,
  document_category: "invoice",
  payment_due_date: due,
  amount_before_vat: 100,
  currency: "ILS",
  ...extra,
});

beforeAll(async () => {
  const app = express();
  registerInvoiceRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  memory.clear();
  mocks.signedIn = true;
});

describe("GET /api/invoices/due-soon", () => {
  it("requires a session", async () => {
    mocks.signedIn = false;
    expect((await fetch(`${base}/api/invoices/due-soon`)).status).toBe(401);
  });

  it("returns unpaid invoices due inside the window, soonest first, with daysLeft", async () => {
    memory.set("invoices", [
      invoice("later", iso(10)),
      invoice("soon", iso(2)),
      invoice("overdue", iso(-3)),
      invoice("too-far", iso(40)),
      invoice("no-date", null),
      invoice("paid", iso(1), { payment_status: "paid" }),
      { ...invoice("other-tenant", iso(1)), user_id: "user-2" },
    ]);
    const body = await (await fetch(`${base}/api/invoices/due-soon`)).json();
    expect(body.days).toBe(14);
    expect(body.items.map((item: any) => item.id)).toEqual(["overdue", "soon", "later"]);
    expect(body.items.map((item: any) => item.daysLeft)).toEqual([-3, 2, 10]);
    expect(body.items[0]).toHaveProperty("supplier_name", "Supplier overdue");
  });

  it("honours and clamps the days parameter", async () => {
    memory.set("invoices", [invoice("soon", iso(2)), invoice("later", iso(10))]);
    const narrow = await (await fetch(`${base}/api/invoices/due-soon?days=5`)).json();
    expect(narrow.days).toBe(5);
    expect(narrow.items.map((item: any) => item.id)).toEqual(["soon"]);
    expect((await (await fetch(`${base}/api/invoices/due-soon?days=9999`)).json()).days).toBe(90);
    expect((await (await fetch(`${base}/api/invoices/due-soon?days=0`)).json()).days).toBe(1);
  });

  it("caps the list at 20 items", async () => {
    memory.set("invoices", Array.from({ length: 30 }, (_, i) => invoice(`inv-${i}`, iso(1 + (i % 10)))));
    const body = await (await fetch(`${base}/api/invoices/due-soon?days=30`)).json();
    expect(body.items).toHaveLength(20);
  });
});
