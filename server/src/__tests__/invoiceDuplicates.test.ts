import { describe, expect, it } from "vitest";
import { findDuplicateGroups, normalizeDocumentNumber, planInvoiceDedup } from "../invoices/duplicates";

let seq = 0;
const row = (over: Record<string, unknown> = {}) => {
  seq += 1;
  return {
    _id: `inv${String(seq).padStart(3, "0")}`,
    document_id: `doc${seq}`,
    user_id: "user-1",
    supplier_name: "Acme Ltd",
    invoice_number: "INV-1001",
    document_subtype: "חשבונית מס",
    amount: 100,
    currency: "ILS",
    issue_date: "2026-09-01",
    status: "new",
    created_at: new Date(Date.UTC(2026, 8, 1, 0, seq)),
    ...over,
  } as Record<string, any>;
};

describe("normalizeDocumentNumber", () => {
  it("ignores punctuation, case and leading zeros, and rejects short numbers", () => {
    expect(normalizeDocumentNumber("INV-00123")).toBe("inv00123");
    expect(normalizeDocumentNumber("00123")).toBe("123");
    expect(normalizeDocumentNumber("inv 00123")).toBe(normalizeDocumentNumber("INV-00123"));
    expect(normalizeDocumentNumber("12")).toBeNull();
  });
});

describe("findDuplicateGroups", () => {
  it("groups the same document number, supplier, amount and date and keeps the oldest", () => {
    const a = row();
    const b = row({ supplier_name: "ACME בע\"מ", invoice_number: "inv 1001", amount: "100.00" });
    const groups = findDuplicateGroups([b, a]);
    expect(groups).toHaveLength(1);
    expect(groups[0].keep.id).toBe(a._id);
    expect(groups[0].remove.map((c) => c.id)).toEqual([b._id]);
  });

  it("never treats an invoice and its receipt as duplicates", () => {
    const invoice = row();
    const receipt = row({ document_subtype: "קבלה" });
    expect(findDuplicateGroups([invoice, receipt])).toEqual([]);
  });

  it("does not match a different amount, date, currency or number", () => {
    const base = row();
    expect(findDuplicateGroups([base, row({ amount: 101 })])).toEqual([]);
    expect(findDuplicateGroups([base, row({ issue_date: "2026-10-01" })])).toEqual([]);
    expect(findDuplicateGroups([base, row({ currency: "USD" })])).toEqual([]);
    expect(findDuplicateGroups([base, row({ invoice_number: "INV-1002" })])).toEqual([]);
  });

  it("skips rows with an unidentified supplier or no amount", () => {
    expect(findDuplicateGroups([row({ supplier_name: "ספק לא מזוהה" }), row({ supplier_name: "ספק לא מזוהה" })])).toEqual([]);
    expect(findDuplicateGroups([row({ amount: null }), row({ amount: null })])).toEqual([]);
  });

  it("matches rows without a number only in loose mode", () => {
    const a = row({ invoice_number: null });
    const b = row({ invoice_number: null });
    expect(findDuplicateGroups([a, b])).toEqual([]);
    const groups = findDuplicateGroups([a, b], { loose: true });
    expect(groups).toHaveLength(1);
    expect(groups[0].match).toBe("loose");
  });

  it("loose mode leaves unnumbered rows alone when the group has two different numbers", () => {
    const groups = findDuplicateGroups([
      row({ invoice_number: "A-1001" }),
      row({ invoice_number: "A-1002" }),
      row({ invoice_number: null }),
    ], { loose: true });
    expect(groups).toEqual([]);
  });

  it("loose mode never matches rows without a date", () => {
    expect(findDuplicateGroups([row({ invoice_number: null, issue_date: null }), row({ invoice_number: null, issue_date: null })], { loose: true })).toEqual([]);
  });

  it("does not match an inline Gmail receipt with a file-backed copy", () => {
    const inline = row({ source: "gmail_inline", inline_no_file: true, document_id: "gmail-inline:x" });
    expect(findDuplicateGroups([inline, row()])).toEqual([]);
  });

  it("never keeps a row whose document is gone over one whose document exists", () => {
    const orphan = row({ status: "reviewed", paired_with: "r1", pair_status: "confirmed" });
    const backed = row();
    const groups = findDuplicateGroups([orphan, backed], { existingDocumentIds: new Set([backed.document_id]) });
    expect(groups[0].keep.id).toBe(backed._id);
    expect(groups[0].remove[0].orphan).toBe(true);
  });

  it("prefers a paired, user-handled, complete copy over an older plain one", () => {
    const older = row();
    const paired = row({ paired_with: "r1", pair_status: "auto" });
    expect(findDuplicateGroups([older, paired])[0].keep.id).toBe(paired._id);

    const reviewed = row({ status: "reviewed" });
    expect(findDuplicateGroups([row(), reviewed])[0].keep.id).toBe(reviewed._id);

    const archived = row({ status: "archived" });
    const fresh = row();
    expect(findDuplicateGroups([archived, fresh])[0].keep.id).toBe(fresh._id);

    const complete = row({ supplier_id: "514", payment_due_date: "2026-09-30", vat_amount: 15 });
    expect(findDuplicateGroups([row(), complete])[0].keep.id).toBe(complete._id);
  });
});

describe("planInvoiceDedup", () => {
  it("fills missing fields on the kept copy and maps removed documents to it", () => {
    const keep = row();
    const extra = row({ payment_due_date: "2026-09-30", supplier_id: "514" });
    // A copy the user already reviewed outranks a more complete one.
    keep.status = "reviewed";
    const plan = planInvoiceDedup([keep, extra]);
    expect(plan.removeIds).toEqual([extra._id]);
    expect(plan.fills.get(keep._id)).toEqual({ payment_due_date: "2026-09-30", supplier_id: "514" });
    expect(plan.documentKeeperOf.get(extra.document_id)).toBe(keep.document_id);
  });

  it("records removed inline receipts' Gmail message ids on the kept copy", () => {
    const inline = { source: "gmail_inline", inline_no_file: true };
    const keep = row({ ...inline, document_id: "gmail-inline:m1", gmail_message_id: "m1" });
    const dup = row({ ...inline, document_id: "gmail-inline:m2", gmail_message_id: "m2", superseded_gmail_message_ids: ["m0"] });
    const plan = planInvoiceDedup([keep, dup]);
    expect(plan.supersededMessageIds.get(keep._id)).toEqual(["m2", "m0"]);
    expect(plan.documentKeeperOf.size).toBe(0);
  });

  it("keeps the paired copy so its receipt stays linked", () => {
    const plain = row({ status: "reviewed" });
    const paired = row({ paired_with: "rcpt1", pair_status: "confirmed" });
    const receipt = row({ _id: "rcpt1", document_subtype: "קבלה", invoice_number: "R-5", paired_with: paired._id, pair_status: "confirmed" });
    const plan = planInvoiceDedup([plain, paired, receipt]);
    expect(plan.removeIds).toEqual([plain._id]);
    expect(plan.relinks).toEqual([]);
    expect(plan.clearPairs).toEqual([]);
  });

  it("keeps an intact pair when both halves are duplicated", () => {
    const invoiceA = row({ paired_with: "rcptA", pair_status: "auto" });
    const invoiceB = row({ paired_with: "rcptB", pair_status: "auto" });
    const receiptA = row({ _id: "rcptA", document_subtype: "קבלה", invoice_number: "R-100", paired_with: invoiceA._id, pair_status: "auto" });
    const receiptB = row({ _id: "rcptB", document_subtype: "קבלה", invoice_number: "R-100", paired_with: invoiceB._id, pair_status: "auto" });
    const plan = planInvoiceDedup([invoiceA, invoiceB, receiptA, receiptB]);
    // Oldest paired copy of each wins; their pair is intact, the removed copies' pairs vanish with them.
    expect(new Set(plan.removeIds)).toEqual(new Set([invoiceB._id, "rcptB"]));
    expect(plan.relinks).toEqual([]);
    expect(plan.clearPairs).toEqual([]);
  });

  it("clears the pair of a surviving row whose partner is removed and whose keeper is taken", () => {
    const invoiceA = row({ paired_with: "rcptX", pair_status: "auto" });
    const invoiceB = row({ paired_with: "rcptY", pair_status: "auto" });
    const receiptX = row({ _id: "rcptX", document_subtype: "קבלה", supplier_name: "Other", invoice_number: "X-100", paired_with: invoiceA._id, pair_status: "auto" });
    const receiptY = row({ _id: "rcptY", document_subtype: "קבלה", supplier_name: "Third", invoice_number: "Y-100", paired_with: invoiceB._id, pair_status: "auto" });
    const plan = planInvoiceDedup([invoiceA, invoiceB, receiptX, receiptY]);
    expect(plan.removeIds).toEqual([invoiceB._id]);
    expect(plan.clearPairs).toEqual(["rcptY"]);
    expect(plan.relinks).toEqual([]);
  });

  it("re-links the kept halves when the chosen invoice and receipt came from different pairs", () => {
    const invoice1 = row({ paired_with: "rcpt1", pair_status: "auto", pair_score: 8, pair_reasons: ["same amount"] });
    const invoice2 = row({ paired_with: "rcpt2", pair_status: "auto" });
    const receipt = { document_subtype: "קבלה", invoice_number: "R-77" };
    const receipt1 = row({ _id: "rcpt1", ...receipt, paired_with: invoice1._id, pair_status: "auto" });
    const receipt2 = row({ _id: "rcpt2", ...receipt, paired_with: invoice2._id, pair_status: "auto", status: "reviewed" });
    const plan = planInvoiceDedup([invoice1, invoice2, receipt1, receipt2]);
    expect(new Set(plan.removeIds)).toEqual(new Set([invoice2._id, "rcpt1"]));
    expect(plan.relinks).toEqual([{ a: invoice1._id, b: "rcpt2", status: "auto", score: 8, reasons: ["same amount"] }]);
    expect(plan.clearPairs).toEqual([]);
  });

  it("does not re-link two rows the user said are not a pair", () => {
    const invoice1 = row({ paired_with: "rcpt1", pair_status: "auto", pair_rejected_with: ["rcpt2"] });
    const invoice2 = row({ paired_with: "rcpt2", pair_status: "auto" });
    const receipt = { document_subtype: "קבלה", invoice_number: "R-77" };
    const receipt1 = row({ _id: "rcpt1", ...receipt, paired_with: invoice1._id, pair_status: "auto" });
    const receipt2 = row({ _id: "rcpt2", ...receipt, paired_with: invoice2._id, pair_status: "auto", status: "reviewed" });
    const plan = planInvoiceDedup([invoice1, invoice2, receipt1, receipt2]);
    expect(plan.relinks).toEqual([]);
    expect(plan.clearPairs).toEqual([invoice1._id, "rcpt2"]);
  });
});
