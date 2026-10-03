/**
 * Expense-chart document role:
 * - paid = real proof of payment (receipt / Final invoice / tax invoice)
 * - requested = payment requests and other non-proof billing docs
 */

import { normalizeDocumentText } from "./documentCategory";

export type ExpenseProofFilter = "all" | "paid" | "requested" | "income";

const CREDIT_NOTE_RE = /זיכוי|credit\s*note|credit\s*memo|кредит[- ]?нот|корректировочн[а-я]*\s+сч[её]т|сторно/;
const RECEIPT_RE = /receipt|קבלה|кассовый чек|товарный чек|чек-ордер|чек ордер|(?<![а-я])чек(?![а-я])|квитанци|подтверждение оплаты|оплата получена/;
const FINAL_INVOICE_RE = /final\s*invoice/;
// Russian tax invoices (счет-фактура, УПД) are the equivalent of חשבונית מס: proof of the sale.
const TAX_INVOICE_RE = /חשבונית\s*מס|tax\s*invoice|счет[- ]?фактур|(?<![а-я])упд(?![а-я])|универсальный передаточный документ/;
const PAYMENT_REQUEST_RE = /דרישת\s*תשלום|payment\s*request|счет на оплату|счет-оферта|счет оферта|запрос на оплату/;
// A utility bill that merely contains "квитанция" asks for payment; it does not prove it.
const RU_UNPAID_BILL_RE = /квитанция на оплату|платежная квитанция|единый платежный документ|(?<![а-я])епд(?![а-я])/;

export function normalizeExpenseProofFilter(value: unknown): ExpenseProofFilter {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "paid" || text === "requested" || text === "income") return text;
  return "all";
}

/** Receipt, Final invoice, or חשבונית מס* / счет-фактура (not credit notes, not unpaid bills). */
export function isPaymentProofDocument(value: unknown): boolean {
  const text = normalizeDocumentText(value);
  if (!text) return false;
  if (CREDIT_NOTE_RE.test(text)) return false;
  if (RU_UNPAID_BILL_RE.test(text)) return false;
  if (RECEIPT_RE.test(text)) return true;
  if (FINAL_INVOICE_RE.test(text)) return true;
  if (TAX_INVOICE_RE.test(text)) return true;
  return false;
}

export function isPaymentRequestDocument(value: unknown): boolean {
  const text = normalizeDocumentText(value);
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
  if (filter === "all" || filter === "income") return true;
  if (filter === "paid") return isPaymentProofDocument(documentType);
  return isPaymentRequestDocument(documentType);
}
