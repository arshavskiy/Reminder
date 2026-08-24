import { describe, expect, it } from "vitest";
import { inferInvoiceCashFlow, normalizeCashFlow, resolveVatAmount } from "../invoices/cashFlow";

describe("normalizeCashFlow", () => {
  it("accepts Hebrew and English values", () => {
    expect(normalizeCashFlow("הכנסה")).toBe("income");
    expect(normalizeCashFlow("income")).toBe("income");
    expect(normalizeCashFlow("הוצאה")).toBe("expense");
    expect(normalizeCashFlow("expense")).toBe("expense");
    expect(normalizeCashFlow("")).toBeNull();
  });
});

describe("inferInvoiceCashFlow", () => {
  it("keeps a stored cash flow", () => {
    expect(inferInvoiceCashFlow({ cash_flow: "income", document_subtype: "חשבונית" })).toBe("income");
  });

  it("treats a Hebrew receipt as income", () => {
    expect(inferInvoiceCashFlow({ document_subtype: "קבלה" })).toBe("income");
  });

  it("treats vendor receipts and periodic bills as expenses", () => {
    expect(inferInvoiceCashFlow({ document_subtype: "קבלה", notes: "GitHub subscription receipt" })).toBe("expense");
    expect(inferInvoiceCashFlow({ document_subtype: "חשבון תקופתי" })).toBe("expense");
    expect(inferInvoiceCashFlow({ document_subtype: "קבלה", provider_id: "hot" })).toBe("expense");
  });

  it("defaults unknown invoices to expense", () => {
    expect(inferInvoiceCashFlow({ document_subtype: "חשבונית" })).toBe("expense");
  });
});

describe("resolveVatAmount", () => {
  it("uses extracted VAT when present", () => {
    expect(resolveVatAmount({ amount: 7000, vat_amount: 1067.8 })).toBe(1067.8);
  });

  it("computes 18% VAT included in the total", () => {
    expect(resolveVatAmount({ amount: 7000 })).toBe(1067.8);
  });

  it("derives VAT from amount before VAT", () => {
    expect(resolveVatAmount({ amount: 80.9, amount_before_vat: 69.15 })).toBe(11.75);
  });
});
