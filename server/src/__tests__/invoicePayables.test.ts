import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { invoiceIsPayable } from "../invoices/dueSoon";

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
vi.mock("../invoices/fxRates", () => ({ toIlsMany: async (rows: unknown[]) => rows }));

import { memory, rows } from "./helpers/memoryDb";
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
  issue_date: iso(-5),
  ...extra,
});
const list = async (query = "") => (await fetch(`${base}/api/invoices${query ? `?${query}` : ""}`)).json();

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerInvoiceRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  memory.clear();
  mocks.signedIn = true;
  memory.set("invoices", [
    invoice("late", iso(30)),
    invoice("soon", iso(2)),
    invoice("overdue", iso(-10)),
    invoice("paid", iso(1), { payment_status: "paid" }),
    invoice("no-date", null),
  ]);
});

describe("invoiceIsPayable", () => {
  it("is false for archived, income, non-payable and settled rows", () => {
    expect(invoiceIsPayable({ status: "new", cash_flow: "expense", document_category: "invoice", payment_status: null })).toBe(true);
    expect(invoiceIsPayable({ status: "archived" })).toBe(false);
    expect(invoiceIsPayable({ cash_flow: "income" })).toBe(false);
    expect(invoiceIsPayable({ document_category: "receipt" })).toBe(false);
    expect(invoiceIsPayable({ payment_status: "paid" })).toBe(false);
  });
});

describe("GET /api/invoices — to-pay view", () => {
  it("counts unpaid invoices that have a payment date", async () => {
    const body = await list();
    expect(body.unpaidDueCount).toBe(3);
  });

  it("unpaidOnly lists just those", async () => {
    const body = await list("unpaidOnly=1&sortBy=dueDate&sortDir=asc");
    expect(body.rows.map((r: any) => r.id)).toEqual(["overdue", "soon", "late"]);
    expect(body.total).toBe(3);
  });

  it("sorts by payment date, rows without one always last", async () => {
    const asc = await list("sortBy=dueDate&sortDir=asc");
    expect(asc.rows.map((r: any) => r.id)).toEqual(["overdue", "paid", "soon", "late", "no-date"]);
    const desc = await list("sortBy=dueDate&sortDir=desc");
    expect(desc.rows.map((r: any) => r.id)).toEqual(["late", "soon", "paid", "overdue", "no-date"]);
  });

  it("drops an invoice from the to-pay view once it is marked paid", async () => {
    rows("invoices").find((r) => r._id === "soon")!.payment_status = "paid";
    const body = await list("unpaidOnly=1");
    expect(body.rows.map((r: any) => r.id).sort()).toEqual(["late", "overdue"]);
    expect(body.unpaidDueCount).toBe(2);
  });
});
