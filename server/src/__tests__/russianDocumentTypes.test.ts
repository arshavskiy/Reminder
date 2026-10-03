import { describe, expect, it } from "vitest";
import { invoiceDocumentCategory } from "../invoices/documentCategory";
import { isPaymentProofDocument, isPaymentRequestDocument, matchesExpenseProofFilter } from "../invoices/documentProof";

describe("invoiceDocumentCategory — Russian documents", () => {
  const cases: Array<[string, string]> = [
    ["Кассовый чек", "receipt"],
    ["Товарный чек № 14", "receipt"],
    ["Чек", "receipt"],
    ["чек-ордер Сбербанк", "receipt"],
    ["Маршрутная квитанция электронного билета", "receipt"],
    ["Подтверждение оплаты", "receipt"],
    ["Единый платежный документ (ЕПД)", "bill"],
    ["Квитанция на оплату услуг ЖКХ", "bill"],
    ["Счёт за электроэнергию", "bill"],
    ["Счет на оплату № 77 от 01.10.2026", "payment_request"],
    ["Счёт-оферта", "payment_request"],
    ["Счет-фактура № 5", "invoice"],
    ["Счёт-фактура", "invoice"],
    ["УПД", "invoice"],
    ["Акт выполненных работ", "invoice"],
    ["Кредит-нота", "credit_note"],
    ["Корректировочный счёт-фактура", "credit_note"],
    ["Сторно", "credit_note"],
  ];

  it.each(cases)("%s -> %s", (text, expected) => {
    expect(invoiceDocumentCategory(text)).toBe(expected);
  });

  it("is not fooled by words that merely contain 'чек'", () => {
    expect(invoiceDocumentCategory("Лечебный центр")).toBe("invoice");
    expect(invoiceDocumentCategory("человек")).toBe("invoice");
  });

  it("keeps the Hebrew and English rules working", () => {
    expect(invoiceDocumentCategory("קבלה")).toBe("receipt");
    expect(invoiceDocumentCategory("חשבונית זיכוי")).toBe("credit_note");
    expect(invoiceDocumentCategory("Receipt")).toBe("receipt");
    expect(invoiceDocumentCategory("דרישת תשלום")).toBe("payment_request");
    expect(invoiceDocumentCategory("חשבונית מס")).toBe("invoice");
  });
});

describe("proof of payment — Russian documents", () => {
  it("treats receipts, cash receipts and tax invoices as proof", () => {
    for (const text of ["Кассовый чек", "Квитанция", "Чек", "Счет-фактура", "Счёт-фактура № 9", "УПД", "Подтверждение оплаты"]) {
      expect(isPaymentProofDocument(text), text).toBe(true);
    }
  });

  it("does not treat a utility bill that says 'квитанция' as proof", () => {
    expect(isPaymentProofDocument("Квитанция на оплату")).toBe(false);
    expect(isPaymentProofDocument("Единый платежный документ")).toBe(false);
    expect(isPaymentRequestDocument("Квитанция на оплату")).toBe(true);
  });

  it("never treats a credit note as proof or as a request", () => {
    expect(isPaymentProofDocument("Кредит-нота")).toBe(false);
    expect(isPaymentRequestDocument("Кредит-нота")).toBe(false);
  });

  it("recognises a payment request and filters accordingly", () => {
    expect(isPaymentRequestDocument("Счет на оплату")).toBe(true);
    expect(matchesExpenseProofFilter("Счет на оплату", "requested")).toBe(true);
    expect(matchesExpenseProofFilter("Счет на оплату", "paid")).toBe(false);
    expect(matchesExpenseProofFilter("Кассовый чек", "paid")).toBe(true);
  });
});

import { buildPromptForTemplate } from "../templates/buildPrompt";

describe("extraction prompt — Russian invoices", () => {
  const template = (kind: string, name: string) => ({
    id: "1", name, description: null, document_kind: kind, match_keywords: [name], expiry_field: null,
    cached_system_prompt: null, is_default: 0, is_builtin: 0, created_at: "", updated_at: "",
    fields: [{ key: "amount", label_he: "סכום", type: "number" }],
  }) as never;

  it("teaches the model Russian labels, amounts, dates and currency for invoice templates", () => {
    const prompt = buildPromptForTemplate(template("invoice", "חשבונית"));
    for (const hint of ["Кассовый чек", "Итого", "1 250,00", "03.10.2026", "RUB", "ИНН", "Оплата прошла"]) {
      expect(prompt, hint).toContain(hint);
    }
  });

  it("does not add the Russian section to unrelated templates", () => {
    expect(buildPromptForTemplate(template("contract", "חוזה"))).not.toContain("Кассовый чек");
  });
});

import { inferInvoiceCashFlow, resolveVatAmount } from "../invoices/cashFlow";

describe("cash flow and VAT for Russian and foreign documents", () => {
  it("treats a Russian credit note as an offset (income), a receipt as spending", () => {
    expect(inferInvoiceCashFlow({ document_subtype: "Кредит-нота" })).toBe("income");
    expect(inferInvoiceCashFlow({ document_subtype: "Корректировочный счёт-фактура" })).toBe("income");
    expect(inferInvoiceCashFlow({ document_subtype: "Кассовый чек" })).toBe("expense");
    expect(inferInvoiceCashFlow({ document_subtype: "Счёт-фактура" })).toBe("expense");
  });

  it("estimates 18% included VAT for ILS documents only", () => {
    expect(resolveVatAmount({ amount: 118, currency: "ILS" })).toBe(18);
    expect(resolveVatAmount({ amount: 118 })).toBe(18);
    expect(resolveVatAmount({ amount: 1250, currency: "RUB" })).toBeNull();
    expect(resolveVatAmount({ amount: 50, currency: "USD" })).toBeNull();
  });

  it("still uses a stated or derivable VAT figure for any currency", () => {
    expect(resolveVatAmount({ amount: 1250, currency: "RUB", vat_amount: 208.33 })).toBe(208.33);
    expect(resolveVatAmount({ amount: 1250, currency: "RUB", amount_before_vat: 1041.67 })).toBe(208.33);
  });
});
