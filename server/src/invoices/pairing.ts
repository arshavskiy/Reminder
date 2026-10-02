import { invoiceDocumentCategory } from "./documentCategory";

/**
 * Pairs an invoice (or bill / payment request) with the receipt that proves it
 * was paid, so the same payment is not counted twice in expenses, flagged as a
 * duplicate, or kept on the "to pay" list after it has been paid.
 *
 * Everything here is pure; the database side lives in pairingStore.ts.
 */

export type PairStatus = "auto" | "confirmed" | "rejected";
export type PairRole = "invoice" | "receipt";

/** The fields of an invoice row the matcher needs, normalised. */
export interface PairRow {
  id: string;
  supplier: string;
  amount: number | null;
  currency: string;
  issueDate: string | null;
  role: PairRole | null;
  /** Numbers printed on the document that could name the other half of the pair. */
  references: string[];
  pairedWith: string | null;
  pairStatus: PairStatus | null;
  /** Ids the user told us are not the same payment. */
  rejected: string[];
}

export interface PairScore {
  score: number;
  /** high = a shared reference number or a close date; medium = amount and supplier only inside the window. */
  confidence: "high" | "medium";
  reasons: string[];
}

const UNIDENTIFIED_SUPPLIERS = new Set(["", "ספק לא מזוהה", "unidentified supplier", "unknown"]);
// \b does not work next to Hebrew letters, so match the suffix between whitespace or the ends.
const LEGAL_SUFFIX_RE = /(?:^|\s)(?:בע["״']?מ|ltd|inc|llc|co|corp|gmbh)\.?(?=\s|$)/gi;
/** A receipt may be dated a day before its invoice (clock/time zone) but not earlier. */
const RECEIPT_EARLIEST_DAYS = -1;
/** Receipts normally follow an invoice within weeks; three months is the outer bound. */
const RECEIPT_LATEST_DAYS = 90;
const CLOSE_DATE_DAYS = 30;

export function roleOf(category: string | null | undefined): PairRole | null {
  if (category === "receipt") return "receipt";
  if (category === "invoice" || category === "bill" || category === "payment_request") return "invoice";
  return null; // credit notes and anything else never pair
}

export function normalizeSupplier(name: unknown): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(LEGAL_SUFFIX_RE, " ")
    .replace(/["'`״׳.,()\-_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isIdentifiedSupplier(name: unknown): boolean {
  return !UNIDENTIFIED_SUPPLIERS.has(String(name ?? "").trim().toLowerCase());
}

export function normalizeCurrency(value: unknown): string {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text || text === "₪" || text === "NIS" || text === "ILS" || /^ש.?ח$/.test(text)) return "ILS";
  return text;
}

export function parsePairAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value ?? "").replace(/[^\d.,-]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDay(value: unknown): string | null {
  if (!value) return null;
  const ts = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : null;
}

function dayDiff(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

function cleanReference(value: unknown): string | null {
  const text = String(value ?? "").trim().replace(/\s+/g, "");
  // A bare "1" or "0" would match half the account.
  return text.length >= 3 ? text.toLowerCase() : null;
}

/** Builds the matcher's view of a stored invoice document. */
export function toPairRow(raw: Record<string, any>): PairRow {
  const subtype = raw.document_subtype ?? raw.template_name ?? raw.fields?.document_subtype;
  const references = [
    raw.invoice_number,
    raw.receipt_number,
    raw.fields?.invoice_number,
    raw.fields?.receipt_number,
    raw.fields?.reference_number,
    raw.fields?.related_invoice_number,
    raw.fields?.original_invoice_number,
    raw.fields?.order_number,
    raw.fields?.transaction_id,
  ].map(cleanReference).filter((value): value is string => Boolean(value));
  return {
    id: String(raw._id ?? raw.id ?? ""),
    supplier: String(raw.supplier_name ?? raw.fields?.supplier_name ?? ""),
    amount: parsePairAmount(raw.amount),
    currency: normalizeCurrency(raw.currency),
    issueDate: isoDay(raw.issue_date),
    role: roleOf(invoiceDocumentCategory(subtype)),
    references: [...new Set(references)],
    pairedWith: raw.paired_with ? String(raw.paired_with) : null,
    pairStatus: raw.pair_status === "auto" || raw.pair_status === "confirmed" || raw.pair_status === "rejected" ? raw.pair_status : null,
    rejected: Array.isArray(raw.pair_rejected_with) ? raw.pair_rejected_with.map(String) : [],
  };
}

export function hasActivePair(row: Pick<PairRow, "pairedWith" | "pairStatus">): boolean {
  return Boolean(row.pairedWith) && (row.pairStatus === "auto" || row.pairStatus === "confirmed");
}

/**
 * Scores whether `receipt` is the proof of payment for `invoice`; null when they
 * cannot be the same payment. The same amount, currency and supplier are always
 * required, and the receipt must come after the invoice (within a bound).
 */
export function scorePair(invoice: PairRow, receipt: PairRow): PairScore | null {
  if (invoice.role !== "invoice" || receipt.role !== "receipt") return null;
  if (invoice.id === receipt.id) return null;
  if (invoice.rejected.includes(receipt.id) || receipt.rejected.includes(invoice.id)) return null;
  if (invoice.amount === null || receipt.amount === null) return null;
  if (Math.abs(invoice.amount - receipt.amount) > 0.01) return null;
  if (invoice.currency !== receipt.currency) return null;

  const reasons = ["same amount"];
  let score = 3;

  const sharedReference = invoice.references.some((reference) => receipt.references.includes(reference));
  const sameSupplier = isIdentifiedSupplier(invoice.supplier) && isIdentifiedSupplier(receipt.supplier)
    && normalizeSupplier(invoice.supplier) === normalizeSupplier(receipt.supplier);
  // A shared document number can stand in for the supplier (receipts often print a
  // different trade name); without either there is nothing tying the two together.
  if (!sameSupplier && !sharedReference) return null;
  if (sameSupplier) { score += 3; reasons.push("same supplier"); }
  if (sharedReference) { score += 4; reasons.push("shared reference number"); }

  let closeDate = false;
  if (invoice.issueDate && receipt.issueDate) {
    const days = dayDiff(invoice.issueDate, receipt.issueDate);
    if (days < RECEIPT_EARLIEST_DAYS || days > RECEIPT_LATEST_DAYS) return null;
    if (days <= CLOSE_DATE_DAYS) { score += 2; closeDate = true; reasons.push(`receipt ${days} days after the invoice`); }
    else { score += 1; reasons.push(`receipt ${days} days after the invoice`); }
  }
  return { score, confidence: sharedReference || closeDate ? "high" : "medium", reasons };
}

export interface PairChoice {
  match: PairRow;
  score: PairScore;
}

/**
 * Picks the one counterpart to link automatically. Linking happens only when the
 * best candidate is clear: a single candidate, or one that out-scores the rest,
 * and it is not already paired with something else. Ties return null so the
 * caller can leave the pair for a person to confirm.
 */
export function chooseCounterpart(target: PairRow, pool: PairRow[]): PairChoice | null {
  const scored: PairChoice[] = [];
  for (const candidate of pool) {
    if (hasActivePair(candidate)) continue;
    const score = target.role === "invoice" ? scorePair(target, candidate) : scorePair(candidate, target);
    if (score) scored.push({ match: candidate, score });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score.score - a.score.score);
  if (scored.length > 1 && scored[0].score.score === scored[1].score.score) return null;
  return scored[0];
}
