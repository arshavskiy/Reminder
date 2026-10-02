import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { ObjectId } from "mongodb";
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
vi.mock("../invoices/fxRates", () => ({ toIlsMany: async (rows: unknown[]) => rows }));

import { memory, rows } from "./helpers/memoryDb";
import { registerInvoiceRoutes } from "../routes/invoices";
import { linkPair, pairInvoiceById, scanPairs, unlinkPair } from "../invoices/pairingStore";

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const doc = (kind: "invoice" | "receipt", over: Record<string, unknown> = {}) => ({
  _id: new ObjectId(),
  user_id: "user-1",
  source: "gmail_inline",
  supplier_name: "Acme Ltd",
  amount: 100,
  currency: "ILS",
  issue_date: iso(-20),
  document_subtype: kind === "receipt" ? "קבלה" : "חשבונית",
  ...over,
});
const id = (row: { _id: ObjectId }) => row._id.toString();
const find = (target: ObjectId) => rows("invoices").find((row) => row._id.toString() === target.toString())!;

let server: Server;
let base: string;
const call = (method: string, path: string, body?: unknown) => fetch(`${base}${path}`, {
  method,
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

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
});

describe("pairInvoiceById", () => {
  it("links a receipt to the invoice it paid, from either side", async () => {
    const inv = doc("invoice");
    const rec = doc("receipt", { issue_date: iso(-12) });
    memory.set("invoices", [inv, rec]);
    const result = await pairInvoiceById("user-1", id(rec));
    expect(result).toMatchObject({ linked: true, with: id(inv) });
    expect(find(inv._id)).toMatchObject({ paired_with: id(rec), pair_status: "auto" });
    expect(find(rec._id)).toMatchObject({ paired_with: id(inv), pair_status: "auto" });
    expect((await pairInvoiceById("user-1", id(inv))).reason).toBe("already_paired");
  });

  it("leaves unrelated documents alone", async () => {
    const inv = doc("invoice");
    const other = doc("receipt", { supplier_name: "Someone Else" });
    const wrongAmount = doc("receipt", { amount: 101 });
    memory.set("invoices", [inv, other, wrongAmount]);
    expect((await pairInvoiceById("user-1", id(inv))).reason).toBe("no_match");
    expect(find(inv._id).paired_with).toBeUndefined();
  });

  it("does not guess between two equally good receipts", async () => {
    const inv = doc("invoice");
    memory.set("invoices", [inv, doc("receipt", { issue_date: iso(-12) }), doc("receipt", { issue_date: iso(-12) })]);
    expect((await pairInvoiceById("user-1", id(inv))).linked).toBe(false);
  });

  it("never reaches into another user's documents", async () => {
    const inv = doc("invoice");
    memory.set("invoices", [inv, doc("receipt", { user_id: "user-2", issue_date: iso(-12) })]);
    expect((await pairInvoiceById("user-1", id(inv))).linked).toBe(false);
  });

  it("ignores credit notes and documents without an amount", async () => {
    const credit = doc("invoice", { document_subtype: "זיכוי" });
    const noAmount = doc("invoice", { amount: null });
    memory.set("invoices", [credit, noAmount, doc("receipt")]);
    expect((await pairInvoiceById("user-1", id(credit))).reason).toBe("not_pairable");
    expect((await pairInvoiceById("user-1", id(noAmount))).reason).toBe("not_pairable");
  });

  it("reports an unknown or malformed id", async () => {
    expect((await pairInvoiceById("user-1", "nope")).reason).toBe("not_found");
    expect((await pairInvoiceById("user-1", new ObjectId().toHexString())).reason).toBe("not_found");
  });
});

describe("unlinkPair / linkPair / scanPairs", () => {
  it("unlinking breaks the pair on both sides and stops the matcher re-linking them", async () => {
    const inv = doc("invoice");
    const rec = doc("receipt", { issue_date: iso(-12) });
    memory.set("invoices", [inv, rec]);
    await pairInvoiceById("user-1", id(rec));
    const result = await unlinkPair("user-1", id(inv));
    expect(result).toEqual({ ok: true, partner: id(rec) });
    expect(find(inv._id).paired_with).toBeUndefined();
    expect(find(rec._id).paired_with).toBeUndefined();
    expect(find(inv._id).pair_rejected_with).toEqual([id(rec)]);
    expect((await pairInvoiceById("user-1", id(rec))).linked).toBe(false);
  });

  it("scan links every unpaired receipt it can and reports the counts", async () => {
    const invA = doc("invoice", { amount: 100 });
    const recA = doc("receipt", { amount: 100, issue_date: iso(-12) });
    const invB = doc("invoice", { amount: 250, supplier_name: "Beta" });
    const recB = doc("receipt", { amount: 250, supplier_name: "Beta", issue_date: iso(-12) });
    const lone = doc("receipt", { amount: 999 });
    memory.set("invoices", [invA, recA, invB, recB, lone]);
    expect(await scanPairs("user-1")).toEqual({ scanned: 3, linked: 2 });
    expect(find(invB._id).paired_with).toBe(id(recB));
    expect(find(lone._id).paired_with).toBeUndefined();
    expect(await scanPairs("user-1")).toEqual({ scanned: 1, linked: 0 });
  });

  it("linkPair rejects ids that are not ObjectIds", async () => {
    expect(await linkPair("user-1", "x", "y", "confirmed")).toBe(false);
  });
});

describe("pairing routes", () => {
  it("require a session", async () => {
    mocks.signedIn = false;
    expect((await call("POST", "/api/invoices/pairs/scan")).status).toBe(401);
    expect((await call("POST", `/api/invoices/${new ObjectId()}/pair`, { with: String(new ObjectId()) })).status).toBe(401);
    expect((await call("DELETE", `/api/invoices/${new ObjectId()}/pair`)).status).toBe(401);
  });

  it("POST /pairs/scan backfills", async () => {
    const inv = doc("invoice");
    const rec = doc("receipt", { issue_date: iso(-12) });
    memory.set("invoices", [inv, rec]);
    expect(await (await call("POST", "/api/invoices/pairs/scan")).json()).toEqual({ scanned: 1, linked: 1 });
  });

  it("POST /:id/pair confirms a pair by hand and replaces an earlier one", async () => {
    const inv = doc("invoice", { supplier_name: "Acme" });
    const wrong = doc("receipt", { supplier_name: "Other", amount: 55 });
    const right = doc("receipt", { supplier_name: "Different Name", amount: 100 });
    memory.set("invoices", [inv, wrong, right]);
    await linkPair("user-1", id(inv), id(wrong), "auto");

    const res = await call("POST", `/api/invoices/${id(inv)}/pair`, { with: id(right) });
    expect(res.status).toBe(200);
    expect(find(inv._id)).toMatchObject({ paired_with: id(right), pair_status: "confirmed" });
    expect(find(right._id)).toMatchObject({ paired_with: id(inv), pair_status: "confirmed" });
    expect(find(wrong._id).paired_with).toBeUndefined();
  });

  it("POST /:id/pair refuses two invoices, unknown ids and bad input", async () => {
    const a = doc("invoice");
    const b = doc("invoice", { amount: 5 });
    memory.set("invoices", [a, b]);
    expect((await call("POST", `/api/invoices/${id(a)}/pair`, { with: id(b) })).status).toBe(400);
    expect((await call("POST", `/api/invoices/${id(a)}/pair`, { with: new ObjectId().toHexString() })).status).toBe(404);
    expect((await call("POST", `/api/invoices/${id(a)}/pair`, { with: "bad" })).status).toBe(400);
    expect((await call("POST", `/api/invoices/${id(a)}/pair`, { with: id(a) })).status).toBe(400);
  });

  it("DELETE /:id/pair unlinks", async () => {
    const inv = doc("invoice");
    const rec = doc("receipt");
    memory.set("invoices", [inv, rec]);
    await linkPair("user-1", id(inv), id(rec), "auto");
    const res = await call("DELETE", `/api/invoices/${id(rec)}/pair`);
    expect(await res.json()).toEqual({ ok: true, unpaired: id(inv) });
    expect(find(inv._id).paired_with).toBeUndefined();
    expect((await call("DELETE", `/api/invoices/${new ObjectId()}/pair`)).status).toBe(404);
    expect((await call("DELETE", "/api/invoices/bad/pair")).status).toBe(400);
  });
});

describe("effects of a pair", () => {
  it("a paid invoice leaves the to-pay and due-soon lists and is no longer a duplicate", async () => {
    const inv = doc("invoice", { payment_due_date: iso(3), issue_date: iso(-10) });
    const rec = doc("receipt", { issue_date: iso(-10), payment_due_date: null });
    memory.set("invoices", [inv, rec]);

    let list = await (await call("GET", "/api/invoices")).json();
    expect(list.unpaidDueCount).toBe(1);
    expect(list.duplicatesCount).toBe(2); // same amount and date, not yet recognised as a pair

    await linkPair("user-1", id(inv), id(rec), "auto");
    list = await (await call("GET", "/api/invoices")).json();
    expect(list.unpaidDueCount).toBe(0);
    expect(list.duplicatesCount).toBe(0);
    const row = list.rows.find((r: any) => r.id === id(inv));
    expect(row).toMatchObject({ paired_with: id(rec), pair_status: "auto", pair_role: "invoice" });

    const due = await (await call("GET", "/api/invoices/due-soon")).json();
    expect(due.items).toEqual([]);
  });

  it("counts a paid payment once in expenses (the receipt, not the invoice)", async () => {
    const inv = doc("invoice", { document_subtype: "חשבונית מס", issue_date: iso(-10) });
    const rec = doc("receipt", { issue_date: iso(-8) });
    memory.set("invoices", [inv, rec]);
    const expenses = (proof: string) => call("GET", `/api/invoices/expenses/monthly?proofFilter=${proof}`).then((r) => r.json());

    expect((await expenses("paid")).totalInvoices).toBe(2);
    await linkPair("user-1", id(inv), id(rec), "auto");
    expect((await expenses("paid")).totalInvoices).toBe(1);
  });
});
