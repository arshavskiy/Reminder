import { describe, expect, it } from "vitest";
import { invoiceIsSettled, selectDueSoon } from "../invoices/dueSoon";

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
