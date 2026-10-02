export type InvoiceDocumentCategory = "invoice" | "receipt" | "bill" | "payment_request" | "credit_note";

// Russian wording is normalised first: ё -> е and any whitespace run -> one space, so
// "счёт-фактура", "счет фактура" and "СЧЕТ-ФАКТУРА" all read the same.
export function normalizeDocumentText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

const CREDIT_NOTE_RE = /זיכוי|credit\s*note|credit\s*memo|кредит[- ]?нот|корректировочн[а-я]*\s+сч[её]т|сторно/;
// Utility and periodic bills: the unified payment document (ЕПД), "квитанция на оплату",
// bills for utilities. Checked before "receipt" because they also contain "квитанция".
const RU_BILL_RE = /единый платежный документ|(?<![а-я])епд(?![а-я])|платежная квитанция|квитанция на оплату|квитанция за|коммунальн|жкх|счет за (?:электроэнергию|воду|газ|отопление|услуги|связь|интернет)/;
const RU_PAYMENT_REQUEST_RE = /счет на оплату|счет-оферта|счет оферта|запрос на оплату|требование об оплате/;
const RECEIPT_RE = /receipt|קבלה|кассовый чек|товарный чек|чек-ордер|чек ордер|(?<![а-я])чек(?![а-я])|квитанци|подтверждение оплаты|оплата получена/;
const BILL_RE = /bill|חשבון\s*תקופתי|חיוב/;
const PAYMENT_REQUEST_RE = /דרישת\s*תשלום|payment\s*request/;

export function invoiceDocumentCategory(value: unknown): InvoiceDocumentCategory {
  const text = normalizeDocumentText(value);
  // Checked first: "חשבונית זיכוי" and "חשבונית מס זיכוי" also contain the
  // plain invoice and receipt words, so a later test would misclassify them.
  if (CREDIT_NOTE_RE.test(text)) return "credit_note";
  if (RU_BILL_RE.test(text)) return "bill";
  if (RU_PAYMENT_REQUEST_RE.test(text)) return "payment_request";
  if (RECEIPT_RE.test(text)) return "receipt";
  if (BILL_RE.test(text)) return "bill";
  if (PAYMENT_REQUEST_RE.test(text)) return "payment_request";
  return "invoice";
}
