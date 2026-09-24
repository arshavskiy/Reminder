import { describe, expect, it } from "vitest";
import {
  isPaymentProofDocument,
  isPaymentRequestDocument,
  matchesExpenseProofFilter,
  normalizeExpenseProofFilter,
} from "../invoices/documentProof";

describe("normalizeExpenseProofFilter", () => {
  it("accepts paid and requested", () => {
    expect(normalizeExpenseProofFilter("paid")).toBe("paid");
    expect(normalizeExpenseProofFilter("requested")).toBe("requested");
    expect(normalizeExpenseProofFilter("income")).toBe("income");
    expect(normalizeExpenseProofFilter("")).toBe("all");
    expect(normalizeExpenseProofFilter("nope")).toBe("all");
  });
});

describe("isPaymentProofDocument", () => {
  it("treats receipts as proof", () => {
    expect(isPaymentProofDocument("קבלה")).toBe(true);
    expect(isPaymentProofDocument("Receipt")).toBe(true);
  });

  it("treats Final invoice and tax invoices as proof", () => {
    expect(isPaymentProofDocument("Final invoice")).toBe(true);
    expect(isPaymentProofDocument("חשבונית מס")).toBe(true);
    expect(isPaymentProofDocument("חשבונית מס מקור")).toBe(true);
    expect(isPaymentProofDocument("חשבונית מס מרכזת")).toBe(true);
    expect(isPaymentProofDocument("Tax Invoice")).toBe(true);
  });

  it("excludes credit notes even when they mention invoice words", () => {
    expect(isPaymentProofDocument("חשבונית מס זיכוי")).toBe(false);
    expect(isPaymentProofDocument("Credit Note")).toBe(false);
  });

  it("does not treat payment requests or plain invoices as proof", () => {
    expect(isPaymentProofDocument("דרישת תשלום")).toBe(false);
    expect(isPaymentProofDocument("חשבונית")).toBe(false);
    expect(isPaymentProofDocument("Invoice")).toBe(false);
    expect(isPaymentProofDocument("חשבון תקופתי")).toBe(false);
  });
});

describe("matchesExpenseProofFilter", () => {
  it("keeps everything for all", () => {
    expect(matchesExpenseProofFilter("דרישת תשלום", "all")).toBe(true);
    expect(matchesExpenseProofFilter("קבלה", "all")).toBe(true);
  });

  it("filters paid vs requested", () => {
    expect(matchesExpenseProofFilter("קבלה", "paid")).toBe(true);
    expect(matchesExpenseProofFilter("דרישת תשלום", "paid")).toBe(false);
    expect(matchesExpenseProofFilter("דרישת תשלום", "requested")).toBe(true);
    expect(matchesExpenseProofFilter("חשבונית", "requested")).toBe(true);
    expect(matchesExpenseProofFilter("חשבונית מס", "requested")).toBe(false);
  });

  it("treats payment requests as requested docs", () => {
    expect(isPaymentRequestDocument("דרישת תשלום")).toBe(true);
    expect(isPaymentRequestDocument("Payment Request")).toBe(true);
    expect(isPaymentRequestDocument("קבלה")).toBe(false);
  });
});
