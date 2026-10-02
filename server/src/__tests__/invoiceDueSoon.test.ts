import { describe, expect, it } from "vitest";
import {invoiceIsSettled, selectDueSoon, selectDueInRange} from "../invoices/dueSoon";

const TODAY = "2026-10-01";
const row = (over: Record<string, unknown>) => ({ id: "x", document_category: "invoice", cash_flow: "expense", payment_status: null, payment_due_date: "2026-10-05", ...over }) as any;

describe("selectDueSoon", () => {
  it("keeps unpaid invoices inside the window, soonest first", () => {
    const rows = [row({ id: "b", payment_due_date: "2026-10-10" }), row({ id: "a", payment_due_date: "2026-10-02" })];
    expect(selectDueSoon(rows, TODAY).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("reports negative days for overdue and drops old or far dates", () => {
    const rows = [
      row({ id: "late", payment_due_date: "2026-09-25" }),
      row({ id: "ancient", payment_due_date: "2026-07-01" }),
      row({ id: "far", payment_due_date: "2026-12-01" }),
    ];
    const result = selectDueSoon(rows, TODAY);
    expect(result.map((r) => r.id)).toEqual(["late"]);
    expect(result[0].daysLeft).toBe(-6);
  });

  it("skips paid, receipts, income, archived and undated rows", () => {
    const rows = [
      row({ id: "paid", payment_status: "paid" }),
      row({ id: "hebrew-paid", payment_status: "שולם" }),
      row({ id: "receipt", document_category: "receipt" }),
      row({ id: "income", cash_flow: "income" }),
      row({ id: "archived", status: "archived" }),
      row({ id: "undated", payment_due_date: null }),
      row({ id: "credit", document_category: "credit_note" }),
    ];
    expect(selectDueSoon(rows, TODAY)).toEqual([]);
  });

  it("includes payment requests and bills", () => {
    const rows = [row({ id: "pr", document_category: "payment_request" }), row({ id: "bill", document_category: "bill" })];
    expect(selectDueSoon(rows, TODAY)).toHaveLength(2);
  });
});

describe("invoiceIsSettled", () => {
  it("treats standing orders and card charges as settled", () => {
    expect(invoiceIsSettled({ payment_status: "הוראת קבע" })).toBe(true);
    expect(invoiceIsSettled({ payment_status: "לתשלום" })).toBe(false);
  });
});

describe("selectDueInRange", () => {
  const row = (id: string, payment_due_date: string | null, extra: Record<string, unknown> = {}) => ({ id, payment_due_date, ...extra });

  it("returns unpaid invoices due inside the range, in date order, inclusive of both ends", () => {
    const rows = [row("c", "2026-10-31"), row("a", "2026-10-01"), row("b", "2026-10-15"), row("out", "2026-11-01"), row("before", "2026-09-30")];
    const picked = selectDueInRange(rows, "2026-10-01", "2026-10-31", "2026-10-10");
    expect(picked.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(picked.map((r) => r.daysLeft)).toEqual([-9, 5, 21]);
  });

  it("keeps old overdue invoices when the range covers them", () => {
    const picked = selectDueInRange([row("old", "2026-01-05")], "2026-01-01", "2026-01-31", "2026-10-10");
    expect(picked).toHaveLength(1);
    expect(picked[0].daysLeft).toBeLessThan(-200);
  });

  it("skips paid, receipts, income, archived and undated rows", () => {
    const rows = [
      row("paid", "2026-10-05", { payment_status: "paid" }),
      row("receipt", "2026-10-05", { document_category: "receipt" }),
      row("income", "2026-10-05", { cash_flow: "income" }),
      row("archived", "2026-10-05", { status: "archived" }),
      row("undated", null),
      row("ok", "2026-10-05"),
    ];
    expect(selectDueInRange(rows, "2026-10-01", "2026-10-31", "2026-10-02").map((r) => r.id)).toEqual(["ok"]);
  });

  it("returns nothing for a malformed or reversed range", () => {
    const rows = [row("a", "2026-10-05")];
    expect(selectDueInRange(rows, "nope", "2026-10-31", "2026-10-02")).toEqual([]);
    expect(selectDueInRange(rows, "2026-10-31", "2026-10-01", "2026-10-02")).toEqual([]);
  });
});
