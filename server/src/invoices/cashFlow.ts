export type InvoiceCashFlow = "income" | "expense";

export const ISRAEL_VAT_RATE = 0.18;
export const ISRAEL_VAT_INCLUDED_FACTOR = ISRAEL_VAT_RATE / (1 + ISRAEL_VAT_RATE);

const EXPENSE_HINT_RE = /github|vercel|subscription|חשבון\s*תקופתי|דרישת\s*תשלום|utility|\bbill\b|חיוב\s*אוטומטי/;
const HEBREW_RECEIPT_RE = /קבלה/;
const ENGLISH_VENDOR_RECEIPT_RE = /\breceipt\b/;
// A credit note refunds money the user already paid, so it offsets spending
// rather than adding to it. Expense analytics excludes income rows, so leaving
// these as "expense" would inflate reported costs.
const CREDIT_NOTE_RE = /זיכוי|credit\s*note|credit\s*memo/;

export function normalizeCashFlow(value: unknown): InvoiceCashFlow | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "income" || text === "הכנסה" || text === "in") return "income";
  if (text === "expense" || text === "הוצאה" || text === "out") return "expense";
  return null;
}

export function inferInvoiceCashFlow(input: {
  cash_flow?: unknown;
  document_subtype?: unknown;
  type?: unknown;
  provider_id?: unknown;
  provider_category?: unknown;
  notes?: unknown;
  source?: unknown;
  inline_no_file?: unknown;
  fields?: Record<string, unknown> | null;
}): InvoiceCashFlow {
  // A receipt saved from a vendor email is money the account paid. The Hebrew
  // "קבלה" default below means a receipt the business issued, and that default
  // was stored on these rows, which then dropped them from the expense chart.
  if (input.source === "gmail_inline" || input.inline_no_file === true) return "expense";

  const stored = normalizeCashFlow(input.cash_flow) ?? normalizeCashFlow(input.fields?.cash_flow);
  if (stored) return stored;

  // Tested before the vendor/provider hints below: a credit note from a known
  // vendor is still a refund, and those hints would otherwise force "expense".
  const subtype = String(input.document_subtype ?? input.type ?? input.fields?.document_subtype ?? "").toLowerCase();
  if (CREDIT_NOTE_RE.test(subtype)) return "income";

  if (input.provider_id) return "expense";
  const category = String(input.provider_category ?? input.fields?.provider_category ?? "").trim();
  if (category && category !== "general" && category !== "payment") return "expense";

  const type = String(input.document_subtype ?? input.type ?? input.fields?.document_subtype ?? "").toLowerCase();
  const notes = String(input.notes ?? input.fields?.notes ?? "").toLowerCase();
  if (EXPENSE_HINT_RE.test(type) || EXPENSE_HINT_RE.test(notes)) return "expense";
  if (ENGLISH_VENDOR_RECEIPT_RE.test(type) || ENGLISH_VENDOR_RECEIPT_RE.test(notes)) return "expense";
  if (HEBREW_RECEIPT_RE.test(type)) return "income";
  return "expense";
}

export function resolveVatAmount(input: {
  amount?: number | null;
  vat_amount?: unknown;
  amount_before_vat?: unknown;
  fields?: Record<string, unknown> | null;
}): number | null {
  const extracted = parseMoney(input.vat_amount ?? input.fields?.vat_amount ?? input.fields?.vat);
  if (extracted != null) return extracted;

  const amount = typeof input.amount === "number" && Number.isFinite(input.amount)
    ? input.amount
    : parseMoney(input.fields?.amount);
  const before = parseMoney(input.amount_before_vat ?? input.fields?.amount_before_vat ?? input.fields?.subtotal);
  if (amount != null && before != null && amount > before) return roundMoney(amount - before);
  if (amount != null) return roundMoney(amount * ISRAEL_VAT_INCLUDED_FACTOR);
  return null;
}

function parseMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").replace(/[^\d.,-]/g, "").replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
