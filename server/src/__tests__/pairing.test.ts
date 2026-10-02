import { describe, expect, it } from "vitest";
import {
  chooseCounterpart,
  hasActivePair,
  isIdentifiedSupplier,
  normalizeCurrency,
  normalizeSupplier,
  parsePairAmount,
  roleOf,
  scorePair,
  toPairRow,
  type PairRow,
} from "../invoices/pairing";

const row = (over: Partial<PairRow>): PairRow => ({
  id: "x",
  supplier: "Acme Ltd",
  amount: 100,
  currency: "ILS",
  issueDate: "2026-09-01",
  role: "invoice",
  references: [],
  pairedWith: null,
  pairStatus: null,
  rejected: [],
  ...over,
});
const invoice = (over: Partial<PairRow> = {}) => row({ id: "inv", role: "invoice", ...over });
const receipt = (over: Partial<PairRow> = {}) => row({ id: "rec", role: "receipt", issueDate: "2026-09-10", ...over });

describe("normalisers", () => {
  it("maps document categories to a pairing role; credit notes never pair", () => {
    expect(roleOf("invoice")).toBe("invoice");
    expect(roleOf("bill")).toBe("invoice");
    expect(roleOf("payment_request")).toBe("invoice");
    expect(roleOf("receipt")).toBe("receipt");
    expect(roleOf("credit_note")).toBeNull();
    expect(roleOf(undefined)).toBeNull();
  });

  it("ignores legal suffixes, case and punctuation in supplier names", () => {
    expect(normalizeSupplier("ACME Ltd.")).toBe("acme");
    expect(normalizeSupplier("אקמה בע\"מ")).toBe("אקמה");
    expect(normalizeSupplier("Acme, Inc")).toBe("acme");
    expect(normalizeSupplier("  Acme   Tools ")).toBe("acme tools");
  });

  it("does not treat an unidentified supplier as a name", () => {
    expect(isIdentifiedSupplier("ספק לא מזוהה")).toBe(false);
    expect(isIdentifiedSupplier("")).toBe(false);
    expect(isIdentifiedSupplier("Acme")).toBe(true);
  });

  it("normalises currencies and amounts", () => {
    expect(normalizeCurrency(undefined)).toBe("ILS");
    expect(normalizeCurrency("₪")).toBe("ILS");
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(parsePairAmount("1,234.50")).toBe(1234.5);
    expect(parsePairAmount(99)).toBe(99);
    expect(parsePairAmount("n/a")).toBeNull();
  });
});

describe("scorePair", () => {
  it("matches the same supplier and amount when the receipt follows the invoice", () => {
    const result = scorePair(invoice(), receipt());
    expect(result?.confidence).toBe("high");
    expect(result?.reasons).toContain("same supplier");
  });

  it("requires the same amount and currency", () => {
    expect(scorePair(invoice(), receipt({ amount: 100.5 }))).toBeNull();
    expect(scorePair(invoice(), receipt({ currency: "USD" }))).toBeNull();
    expect(scorePair(invoice(), receipt({ amount: 100.004 }))).not.toBeNull();
  });

  it("requires the same supplier unless a reference number is shared", () => {
    expect(scorePair(invoice(), receipt({ supplier: "Other Co" }))).toBeNull();
    const withReference = scorePair(invoice({ references: ["inv-4411"] }), receipt({ supplier: "Other Co", references: ["inv-4411"] }));
    expect(withReference?.confidence).toBe("high");
    expect(withReference?.reasons).toContain("shared reference number");
  });

  it("does not match two unidentified suppliers on amount alone", () => {
    expect(scorePair(invoice({ supplier: "ספק לא מזוהה" }), receipt({ supplier: "ספק לא מזוהה" }))).toBeNull();
  });

  it("bounds how far the receipt may be from the invoice", () => {
    expect(scorePair(invoice(), receipt({ issueDate: "2026-08-30" }))).toBeNull(); // 2 days before
    expect(scorePair(invoice(), receipt({ issueDate: "2026-08-31" }))).not.toBeNull(); // 1 day before is tolerated
    expect(scorePair(invoice(), receipt({ issueDate: "2026-12-30" }))).toBeNull(); // far later
    expect(scorePair(invoice(), receipt({ issueDate: "2026-11-15" }))?.confidence).toBe("medium"); // 75 days
  });

  it("still matches when a date is missing", () => {
    expect(scorePair(invoice({ issueDate: null }), receipt())).not.toBeNull();
  });

  it("only pairs an invoice side with a receipt side, never itself or a rejected pair", () => {
    expect(scorePair(receipt(), invoice())).toBeNull();
    expect(scorePair(invoice({ role: "invoice" }), invoice({ id: "other" }))).toBeNull();
    expect(scorePair(invoice(), receipt({ id: "inv" }))).toBeNull();
    expect(scorePair(invoice({ rejected: ["rec"] }), receipt())).toBeNull();
    expect(scorePair(invoice(), receipt({ rejected: ["inv"] }))).toBeNull();
  });
});

describe("chooseCounterpart", () => {
  it("links the only candidate", () => {
    expect(chooseCounterpart(invoice(), [receipt()])?.match.id).toBe("rec");
  });

  it("works from the receipt side too", () => {
    expect(chooseCounterpart(receipt(), [invoice()])?.match.id).toBe("inv");
  });

  it("skips candidates that are already paired", () => {
    const taken = receipt({ pairedWith: "someone", pairStatus: "auto" });
    expect(chooseCounterpart(invoice(), [taken])).toBeNull();
    expect(hasActivePair(taken)).toBe(true);
    expect(hasActivePair({ pairedWith: "x", pairStatus: "rejected" })).toBe(false);
  });

  it("prefers the clearly better candidate", () => {
    const close = receipt({ id: "close", issueDate: "2026-09-05" });
    const late = receipt({ id: "late", issueDate: "2026-11-20" });
    expect(chooseCounterpart(invoice(), [late, close])?.match.id).toBe("close");
  });

  it("refuses to guess between equally good candidates", () => {
    expect(chooseCounterpart(invoice(), [receipt({ id: "a" }), receipt({ id: "b" })])).toBeNull();
  });

  it("returns nothing when no candidate fits", () => {
    expect(chooseCounterpart(invoice(), [receipt({ amount: 5 })])).toBeNull();
    expect(chooseCounterpart(invoice(), [])).toBeNull();
  });
});

describe("toPairRow", () => {
  it("reads the role, amount, references and pair state from a stored document", () => {
    const parsed = toPairRow({
      _id: "abc",
      supplier_name: "Acme",
      amount: "250.00",
      currency: "₪",
      issue_date: new Date("2026-09-01T00:00:00Z"),
      document_subtype: "קבלה",
      invoice_number: "INV-77",
      fields: { reference_number: "ref-9" },
      paired_with: "def",
      pair_status: "auto",
      pair_rejected_with: ["zzz"],
    });
    expect(parsed).toMatchObject({ id: "abc", amount: 250, currency: "ILS", issueDate: "2026-09-01", role: "receipt", pairedWith: "def", pairStatus: "auto", rejected: ["zzz"] });
    expect(parsed.references).toEqual(["inv-77", "ref-9"]);
  });

  it("drops references too short to be meaningful", () => {
    expect(toPairRow({ _id: "a", invoice_number: "1" }).references).toEqual([]);
  });
});
