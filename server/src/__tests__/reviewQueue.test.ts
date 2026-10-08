import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { ObjectId } from "mongodb";
import type { Server } from "http";

const mocks = vi.hoisted(() => ({ signedIn: true, userId: "user-1" }));

vi.mock("../auth/middleware", () => ({
  requireAuth: async () => {
    if (!mocks.signedIn) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    return { userId: mocks.userId, user: { plan: "business" } };
  },
  HTTPException: class extends Error {},
}));
vi.mock("../db/db", async () => await import("./helpers/memoryDb"));

import { memory, rows } from "./helpers/memoryDb";
import { registerReviewRoutes } from "../routes/review";
import { evaluateReviewForDocument } from "../review/reviewStore";

let server: Server;
let base: string;
const call = (method: string, path: string, body?: unknown) => fetch(`${base}${path}`, {
  method,
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const doc = (over: Record<string, unknown> = {}) => ({
  _id: new ObjectId(),
  user_id: "user-1",
  file_name: "invoice.pdf",
  document_type: "invoice",
  extracted_fields: "{}",
  import_source: "gmail",
  ...over,
});
const invoiceFor = (document: { _id: ObjectId }, over: Record<string, unknown> = {}) => ({
  _id: new ObjectId(),
  user_id: "user-1",
  document_id: document._id.toString(),
  supplier_name: "Acme",
  amount: 120,
  currency: "ILS",
  issue_date: "2026-09-01",
  ...over,
});
const find = (collection: string, id: ObjectId) => rows(collection).find((row) => row._id.toString() === id.toString())!;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerReviewRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  memory.clear();
  mocks.signedIn = true;
  mocks.userId = "user-1";
});

describe("evaluateReviewForDocument", () => {
  it("flags an automatic import with a missing amount and records why", async () => {
    const d = doc();
    memory.set("documents", [d]);
    memory.set("invoices", [invoiceFor(d, { amount: null })]);
    const result = await evaluateReviewForDocument(d._id.toString(), "user-1", "gmail");
    expect(result).toEqual({ flagged: true, reasons: ["missing_amount"] });
    expect(find("documents", d._id).review).toMatchObject({ status: "pending", reasons: ["missing_amount"], source: "gmail" });
  });

  it("leaves a clean import unmarked", async () => {
    const d = doc();
    memory.set("documents", [d]);
    memory.set("invoices", [invoiceFor(d)]);
    expect((await evaluateReviewForDocument(d._id.toString(), "user-1", "gmail")).flagged).toBe(false);
    expect(find("documents", d._id).review).toBeUndefined();
  });

  it("ignores manual uploads, however incomplete", async () => {
    const d = doc({ import_source: "upload" });
    memory.set("documents", [d]);
    memory.set("invoices", [invoiceFor(d, { amount: null })]);
    expect((await evaluateReviewForDocument(d._id.toString(), "user-1", "upload")).flagged).toBe(false);
  });

  it("does not put an approved or dismissed document back in the queue", async () => {
    for (const status of ["approved", "dismissed"]) {
      memory.clear();
      const d = doc({ review: { status, reasons: [], source: "gmail", flagged_at: new Date() } });
      memory.set("documents", [d]);
      memory.set("invoices", [invoiceFor(d, { amount: null })]);
      expect((await evaluateReviewForDocument(d._id.toString(), "user-1", "gmail")).flagged).toBe(false);
      expect(find("documents", d._id).review.status).toBe(status);
    }
  });

  it("flags an inspection report with no expiry date", async () => {
    const d = doc({ document_type: "תסקיר בדיקה", document_kind: "inspection_report", extracted_fields: JSON.stringify({ client_company: "X" }) });
    memory.set("documents", [d]);
    expect((await evaluateReviewForDocument(d._id.toString(), "user-1", "email")).reasons).toEqual(["no_expiry_date"]);
  });

  it("does nothing for unknown documents, other users' documents or a missing user", async () => {
    const d = doc({ user_id: "user-2" });
    memory.set("documents", [d]);
    expect((await evaluateReviewForDocument(d._id.toString(), "user-1", "gmail")).flagged).toBe(false);
    expect((await evaluateReviewForDocument(new ObjectId().toHexString(), "user-1", "gmail")).flagged).toBe(false);
    expect((await evaluateReviewForDocument(d._id.toString(), undefined, "gmail")).flagged).toBe(false);
  });
});

describe("review routes", () => {
  function seedQueue() {
    const a = doc({ file_name: "a.pdf", review: { status: "pending", reasons: ["missing_amount"], source: "gmail", flagged_at: new Date("2026-10-02T10:00:00Z") } });
    const b = doc({ file_name: "b.pdf", review: { status: "pending", reasons: ["unknown_supplier", "missing_date"], source: "email", flagged_at: new Date("2026-10-03T10:00:00Z") } });
    const done = doc({ file_name: "done.pdf", review: { status: "approved", reasons: [], source: "gmail", flagged_at: new Date() } });
    const other = doc({ file_name: "other.pdf", user_id: "user-2", review: { status: "pending", reasons: ["low_confidence"], source: "gmail", flagged_at: new Date() } });
    memory.set("documents", [a, b, done, other]);
    memory.set("invoices", [invoiceFor(a, { amount: null }), invoiceFor(b, { supplier_name: "", amount: 55.5, issue_date: null })]);
    return { a, b, done, other };
  }

  it("require a session", async () => {
    mocks.signedIn = false;
    expect((await call("GET", "/api/review")).status).toBe(401);
    expect((await call("GET", "/api/review/count")).status).toBe(401);
    expect((await call("POST", "/api/review/approve", { ids: ["x"] })).status).toBe(401);
    expect((await call("POST", `/api/review/${new ObjectId()}/dismiss`)).status).toBe(401);
  });

  it("lists pending items newest first, with their reasons and invoice details, only for the caller", async () => {
    const { a, b } = seedQueue();
    const body = await (await call("GET", "/api/review")).json();
    expect(body.total).toBe(2);
    expect(body.items.map((item: any) => item.file_name)).toEqual(["b.pdf", "a.pdf"]);
    expect(body.items[0]).toMatchObject({ id: b._id.toString(), source: "email", reasons: ["unknown_supplier", "missing_date"], amount_display: "55.5 ₪" });
    expect(body.items[1]).toMatchObject({ id: a._id.toString(), reasons: ["missing_amount"], amount_display: null, supplier: "Acme" });
  });

  it("lists other statuses and pages the result", async () => {
    seedQueue();
    const approved = await (await call("GET", "/api/review?status=approved")).json();
    expect(approved.items.map((item: any) => item.file_name)).toEqual(["done.pdf"]);
    const page = await (await call("GET", "/api/review?limit=1&offset=1")).json();
    expect(page.total).toBe(2);
    expect(page.items.map((item: any) => item.file_name)).toEqual(["a.pdf"]);
    expect((await (await call("GET", "/api/review?status=bogus")).json()).total).toBe(2);
  });

  it("counts pending items for the badge", async () => {
    seedQueue();
    expect(await (await call("GET", "/api/review/count")).json()).toEqual({ pending: 2 });
  });

  it("approves several at once and reports what is left", async () => {
    const { a, b } = seedQueue();
    const body = await (await call("POST", "/api/review/approve", { ids: [a._id.toString(), b._id.toString(), "not-an-id"] })).json();
    expect(body).toMatchObject({ ok: true, approved: 2, pending: 0 });
    expect(find("documents", a._id).review.status).toBe("approved");
  });

  it("approving a possible non-invoice makes it count as an invoice", async () => {
    const d = doc({ review: { status: "pending", reasons: ["possible_not_invoice"], source: "gmail", flagged_at: new Date() } });
    memory.set("documents", [d]);
    const inv = invoiceFor(d, { possible_not_invoice: true });
    memory.set("invoices", [inv]);
    await call("POST", "/api/review/approve", { ids: [d._id.toString()] });
    expect(find("invoices", inv._id).possible_not_invoice).toBe(false);
  });

  it("will not approve another user's item or without ids", async () => {
    const { other } = seedQueue();
    expect((await (await call("POST", "/api/review/approve", { ids: [other._id.toString()] })).json()).approved).toBe(0);
    expect(find("documents", other._id).review.status).toBe("pending");
    expect((await call("POST", "/api/review/approve", {})).status).toBe(400);
  });

  it("dismissing archives the invoice and dismisses the reminders made from the document", async () => {
    const { a } = seedQueue();
    const id = a._id.toString();
    memory.set("reminders", [
      { _id: new ObjectId(), user_id: "user-1", document_id: id, status: "pending" },
      { _id: new ObjectId(), user_id: "user-1", document_id: id, status: "sent" },
      { _id: new ObjectId(), user_id: "user-1", document_id: "someone-else", status: "pending" },
    ]);
    const body = await (await call("POST", `/api/review/${id}/dismiss`)).json();
    expect(body).toMatchObject({ ok: true, remindersDismissed: 1, pending: 1 });
    expect(find("documents", a._id).review.status).toBe("dismissed");
    expect(rows("invoices").find((row) => row.document_id === id)!.status).toBe("archived");
    expect(rows("reminders").map((row) => row.status)).toEqual(["dismissed", "sent", "pending"]);
  });

  it("dismissing something not in the queue is a 404", async () => {
    const { done, other } = seedQueue();
    expect((await call("POST", `/api/review/${done._id}/dismiss`)).status).toBe(404);
    expect((await call("POST", `/api/review/${other._id}/dismiss`)).status).toBe(404);
    expect((await call("POST", "/api/review/bad/dismiss")).status).toBe(404);
  });
});


describe("review corrections", () => {
  const changes = {supplier_name: "Corrected supplier", amount: 42.5, currency: "usd", issue_date: "2026-10-07"};
  it("saves both invoice and extraction fields without approving", async () => {
    const d = doc({review: {status: "pending"}, extracted_fields: JSON.stringify({invoice_number: "KEEP"})});
    const inv = invoiceFor(d, {fields: {invoice_number: "KEEP"}});
    rows("documents").push(d); rows("invoices").push(inv);
    const response = await call("PUT", `/api/review/${d._id}/corrections`, changes);
    expect(response.status).toBe(200);
    expect(find("invoices", inv._id)).toMatchObject({amount: 42.5, currency: "USD", supplier_name: changes.supplier_name});
    expect(JSON.parse(find("documents", d._id).extracted_fields)).toMatchObject({invoice_number: "KEEP", amount: 42.5});
    expect(find("documents", d._id).review.status).toBe("pending");
    expect(find("documents", d._id).manual_field_keys).toContain("amount");
  });
  it("rejects invalid amounts and impossible dates", async () => {
    for (const body of [{...changes, amount: "42"}, {...changes, issue_date: "2026-02-30"}, {...changes, supplier_name: " "}]) {
      expect((await call("PUT", `/api/review/${new ObjectId()}/corrections`, body)).status).toBe(400);
    }
  });
  it("cannot modify another user's invoice or a completed review", async () => {
    const d = doc({user_id: "other", review: {status: "pending"}});
    rows("documents").push(d); rows("invoices").push(invoiceFor(d, {user_id: "other"}));
    expect((await call("PUT", `/api/review/${d._id}/corrections`, changes)).status).toBe(404);
    d.user_id = "user-1"; d.review.status = "approved";
    expect((await call("PUT", `/api/review/${d._id}/corrections`, changes)).status).toBe(404);
    mocks.signedIn = false;
    expect((await call("PUT", `/api/review/${d._id}/corrections`, changes)).status).toBe(401);
  });
});
