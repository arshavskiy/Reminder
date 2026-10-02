export type InvoiceDocumentCategory = "invoice" | "receipt" | "bill" | "payment_request" | "credit_note";

export function invoiceDocumentCategory(value: unknown): InvoiceDocumentCategory {
  const text = String(value ?? "").trim().toLowerCase();
  // Checked first: "חשבונית זיכוי" and "חשבונית מס זיכוי" also contain the
  // plain invoice and receipt words, so a later test would misclassify them.
  if (/זיכוי|credit\s*note|credit\s*memo/.test(text)) return "credit_note";
  if (/receipt|קבלה/.test(text)) return "receipt";
  if (/bill|חשבון\s*תקופתי|חיוב/.test(text)) return "bill";
  if (/דרישת\s*תשלום|payment\s*request/.test(text)) return "payment_request";
  return "invoice";
}
