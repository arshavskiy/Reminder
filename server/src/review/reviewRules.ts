/**
 * Decides which automatically imported documents a person should look at before
 * trusting them. Imports from Gmail, email-in and Drive create documents, invoices and
 * reminders with nobody watching; this flags the ones likely to be wrong.
 *
 * Pure, so the rules can be tested without a database. The store (reviewStore.ts)
 * reads the documents and records the result.
 */

export type ReviewReason =
  | "low_confidence"
  | "missing_amount"
  | "missing_date"
  | "unknown_supplier"
  | "possible_not_invoice"
  | "missing_fields"
  | "no_expiry_date";

export type ReviewStatus = "pending" | "approved" | "dismissed";

/** Imports nobody triggered one file at a time. A manual upload is already looked at by its owner. */
export const AUTOMATIC_SOURCES = new Set(["gmail", "email", "drive", "whatsapp"]);

export function isAutomaticSource(source: unknown): boolean {
  return AUTOMATIC_SOURCES.has(String(source ?? "").trim().toLowerCase());
}

export interface ReviewInput {
  source: string | null | undefined;
  /** Parsed extracted_fields of the document. */
  fields: Record<string, unknown>;
  /** The invoice row created from the document, if it is an invoice-type document. */
  invoice?: {
    supplier_name?: unknown;
    amount?: unknown;
    issue_date?: unknown;
    possible_not_invoice?: unknown;
    missing_required_fields?: unknown;
  } | null;
  /** Document types that carry an expiry date (inspection reports, contracts, certificates). */
  expectsExpiry?: boolean;
}

const UNIDENTIFIED = new Set(["", "ספק לא מזוהה", "unidentified supplier", "unknown", "неизвестный поставщик"]);

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  return String(value).trim().length > 0;
}

/** Reasons to review, most important first. Empty when nothing looks wrong. */
export function reviewReasons(input: ReviewInput): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  const invoice = input.invoice ?? null;

  if (invoice) {
    if (invoice.possible_not_invoice === true) reasons.push("possible_not_invoice");
    if (!hasValue(invoice.amount)) reasons.push("missing_amount");
    if (!hasValue(invoice.issue_date)) reasons.push("missing_date");
    if (UNIDENTIFIED.has(String(invoice.supplier_name ?? "").trim().toLowerCase())) reasons.push("unknown_supplier");
    if (Array.isArray(invoice.missing_required_fields) && invoice.missing_required_fields.length > 0) reasons.push("missing_fields");
  } else if (input.expectsExpiry && !hasValue(input.fields.expiry_date)) {
    reasons.push("no_expiry_date");
  }

  if (String(input.fields._confidence ?? "").toLowerCase() === "low") reasons.push("low_confidence");
  return [...new Set(reasons)];
}

/** Whether to put the document in the queue: an automatic import with at least one reason. */
export function needsReview(input: ReviewInput): { needed: boolean; reasons: ReviewReason[] } {
  if (!isAutomaticSource(input.source)) return { needed: false, reasons: [] };
  const reasons = reviewReasons(input);
  return { needed: reasons.length > 0, reasons };
}
