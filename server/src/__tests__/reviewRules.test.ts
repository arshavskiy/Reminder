import { describe, expect, it } from "vitest";
import { isAutomaticSource, needsReview, reviewReasons } from "../review/reviewRules";

const goodInvoice = { supplier_name: "Acme", amount: 120, issue_date: "2026-09-01", possible_not_invoice: false, missing_required_fields: [] };

describe("isAutomaticSource", () => {
  it("covers imports nobody triggered file by file, not manual uploads", () => {
    for (const source of ["gmail", "email", "drive", "GMAIL"]) expect(isAutomaticSource(source)).toBe(true);
    for (const source of ["upload", "", undefined, null]) expect(isAutomaticSource(source)).toBe(false);
  });
});

describe("reviewReasons", () => {
  it("flags nothing for a complete invoice", () => {
    expect(reviewReasons({ source: "gmail", fields: {}, invoice: goodInvoice })).toEqual([]);
  });

  it("flags a missing amount, date and an unidentified supplier", () => {
    const reasons = reviewReasons({ source: "gmail", fields: {}, invoice: { supplier_name: "ספק לא מזוהה", amount: null, issue_date: "" } });
    expect(reasons).toEqual(expect.arrayContaining(["missing_amount", "missing_date", "unknown_supplier"]));
  });

  it("recognises the Russian unidentified-supplier placeholder", () => {
    expect(reviewReasons({ source: "gmail", fields: {}, invoice: { ...goodInvoice, supplier_name: "Неизвестный поставщик" } })).toContain("unknown_supplier");
  });

  it("flags documents that may not be invoices, with missing required fields, or low confidence", () => {
    expect(reviewReasons({ source: "email", fields: {}, invoice: { ...goodInvoice, possible_not_invoice: true } })).toContain("possible_not_invoice");
    expect(reviewReasons({ source: "email", fields: {}, invoice: { ...goodInvoice, missing_required_fields: ["invoice_number"] } })).toContain("missing_fields");
    expect(reviewReasons({ source: "email", fields: { _confidence: "low" }, invoice: goodInvoice })).toEqual(["low_confidence"]);
    expect(reviewReasons({ source: "email", fields: { _confidence: "high" }, invoice: goodInvoice })).toEqual([]);
  });

  it("treats zero as a real amount but not a missing one", () => {
    expect(reviewReasons({ source: "gmail", fields: {}, invoice: { ...goodInvoice, amount: 0 } })).not.toContain("missing_amount");
    expect(reviewReasons({ source: "gmail", fields: {}, invoice: { ...goodInvoice, amount: Number.NaN } })).toContain("missing_amount");
  });

  it("expects an expiry date on inspection-type documents without an invoice", () => {
    expect(reviewReasons({ source: "gmail", fields: {}, expectsExpiry: true })).toEqual(["no_expiry_date"]);
    expect(reviewReasons({ source: "gmail", fields: { expiry_date: "2027-01-01" }, expectsExpiry: true })).toEqual([]);
    expect(reviewReasons({ source: "gmail", fields: {} })).toEqual([]);
  });

  it("lists each reason once", () => {
    const reasons = reviewReasons({ source: "gmail", fields: { _confidence: "low" }, invoice: { amount: null, issue_date: null, supplier_name: "" } });
    expect(new Set(reasons).size).toBe(reasons.length);
  });
});

describe("needsReview", () => {
  it("only queues automatic imports", () => {
    const bad = { fields: {}, invoice: { supplier_name: "", amount: null, issue_date: null } };
    expect(needsReview({ source: "upload", ...bad }).needed).toBe(false);
    expect(needsReview({ source: "gmail", ...bad }).needed).toBe(true);
  });

  it("does not queue a clean automatic import", () => {
    expect(needsReview({ source: "gmail", fields: {}, invoice: goodInvoice })).toEqual({ needed: false, reasons: [] });
  });
});
