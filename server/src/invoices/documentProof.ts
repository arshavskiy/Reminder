/**
 * Expense-chart document role:
 * - paid = real proof of payment (receipt / Final invoice / tax invoice)
 * - requested = payment requests and other non-proof billing docs
 */

export type ExpenseProofFilter = "all" | "paid" | "requested";

const CREDIT_NOTE_RE = /זיכוי|credit\s*note|credit\s*memo/;
const RECEIPT_RE = /receipt|קבלה/;
const FINAL_INVOICE_RE = /final\s*invoice/;
const TAX_INVOICE_RE = /חשבונית\s*מס|tax\s*invoice/;
const PAYMENT_REQUEST_RE = /דרישת\s*תשלום|payment\s*request/;

export function normalizeExpenseProofFilter(value: unknown): ExpenseProofFilter {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "paid" || text === "requested") return text;
  return "all";
}

/** Receipt, Final invoice, or חשבונית מס* (not credit notes). */
export function isPaymentProofDocument(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  if (CREDIT_NOTE_RE.test(text)) return false;
  if (RECEIPT_RE.test(text)) return true;
  if (FINAL_INVOICE_RE.test(text)) return true;
  if (TAX_INVOICE_RE.test(text)) return true;
  return false;
}

export function isPaymentRequestDocument(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  if (CREDIT_NOTE_RE.test(text)) return false;
  if (isPaymentProofDocument(text)) return false;
  if (PAYMENT_REQUEST_RE.test(text)) return true;
  // Plain invoices / periodic bills count as "requested" (not yet proof of paying).
  return true;
}

export function matchesExpenseProofFilter(
  documentType: unknown,
  filter: ExpenseProofFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "paid") return isPaymentProofDocument(documentType);
  return isPaymentRequestDocument(documentType);
}
