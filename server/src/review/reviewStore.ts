import { ObjectId } from "mongodb";
import { col } from "../db/db";
import { logger } from "../logger";
import { needsReview, type ReviewReason, type ReviewStatus } from "./reviewRules";

// Database side of the import review queue. The rules are in reviewRules.ts.

export interface ReviewState {
  status: ReviewStatus;
  reasons: ReviewReason[];
  source: string;
  flagged_at: Date;
  reviewed_at?: Date | null;
}

const EXPIRY_TYPE_RE = /inspection|contract|certificate|license|תסקיר|חוזה|תעודה|רישיון/i;

function objectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function parseFields(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Called when an automatic import finishes processing. Flags the document for review
 * when something looks wrong. A document someone already approved or dismissed is not
 * put back in the queue, and a clean import leaves no mark.
 */
export async function evaluateReviewForDocument(
  documentId: string,
  userId: string | undefined,
  source: string | undefined,
): Promise<{ flagged: boolean; reasons: ReviewReason[] }> {
  const _id = objectId(documentId);
  if (!_id || !userId) return { flagged: false, reasons: [] };
  const doc = await col<any>("documents").findOne({ _id, user_id: userId } as any, { projection: { raw_text: 0 } } as any);
  if (!doc) return { flagged: false, reasons: [] };
  if (doc.review?.status === "approved" || doc.review?.status === "dismissed") return { flagged: false, reasons: [] };

  const invoice = await col<any>("invoices").findOne({ document_id: documentId, user_id: userId } as any, { projection: { preview_html: 0 } } as any);
  const kind = String(doc.document_kind ?? doc.document_type ?? "");
  const result = needsReview({
    source: source ?? doc.import_source,
    fields: parseFields(doc.extracted_fields),
    invoice,
    expectsExpiry: EXPIRY_TYPE_RE.test(kind),
  });
  if (!result.needed) return { flagged: false, reasons: [] };

  const review: ReviewState = {
    status: "pending",
    reasons: result.reasons,
    source: String(source ?? doc.import_source ?? "gmail"),
    flagged_at: doc.review?.flagged_at ?? new Date(),
  };
  await col<any>("documents").updateOne({ _id, user_id: userId } as any, { $set: { review } } as any);
  logger.info("import_flagged_for_review", { user_id: userId, document_id: documentId, reasons: result.reasons, source: review.source });
  return { flagged: true, reasons: result.reasons };
}

export interface ReviewItem {
  id: string;
  file_name: string;
  document_type: string | null;
  source: string;
  reasons: ReviewReason[];
  flagged_at: string | null;
  supplier: string | null;
  amount_display: string | null;
  amount: number | null;
  currency: string;
  issue_date: string | null;
  invoice_id: string | null;
  download_url: string | null;
  thumbnail_url: string | null;
}

function amountDisplay(invoice: Record<string, any> | undefined): string | null {
  if (!invoice || typeof invoice.amount !== "number" || !Number.isFinite(invoice.amount)) return null;
  const currency = String(invoice.currency ?? "ILS").toUpperCase();
  const symbol = currency === "ILS" ? "₪" : currency;
  return `${invoice.amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${symbol}`;
}

export async function listReviewItems(
  userId: string,
  options: { status?: ReviewStatus; limit?: number; offset?: number } = {},
): Promise<{ items: ReviewItem[]; total: number }> {
  const status = options.status ?? "pending";
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const filter = { user_id: userId, "review.status": status } as any;
  const total = await col<any>("documents").countDocuments(filter);
  const docs = await col<any>("documents")
    .find(filter, { projection: { raw_text: 0 } } as any)
    .sort({ "review.flagged_at": -1 } as any)
    .skip(offset)
    .limit(limit)
    .toArray();
  const ids = docs.map((doc: any) => String(doc._id));
  const invoices = ids.length
    ? await col<any>("invoices").find({ user_id: userId, document_id: { $in: ids } } as any, { projection: { preview_html: 0 } } as any).toArray()
    : [];
  const byDocument = new Map<string, any>(invoices.map((row: any) => [String(row.document_id), row]));
  const items = docs.map((doc: any): ReviewItem => {
    const id = String(doc._id);
    const invoice = byDocument.get(id);
    return {
      id,
      file_name: String(doc.file_name ?? ""),
      document_type: doc.document_type ?? doc.document_kind ?? null,
      source: String(doc.review?.source ?? "gmail"),
      reasons: Array.isArray(doc.review?.reasons) ? doc.review.reasons : [],
      flagged_at: doc.review?.flagged_at ? new Date(doc.review.flagged_at).toISOString() : null,
      supplier: invoice?.supplier_name ?? null,
      amount_display: amountDisplay(invoice),
      amount: typeof invoice?.amount === "number" ? invoice.amount : null,
      currency: invoice?.currency ?? "ILS",
      issue_date: invoice?.issue_date ? String(invoice.issue_date).slice(0, 10) : null,
      invoice_id: invoice ? String(invoice._id) : null,
      download_url: `/api/documents/${id}/download?dl=1`,
      thumbnail_url: doc.thumbnail_key || doc.thumbnail_path ? `/api/documents/${id}/thumbnail` : null,
    };
  });
  return { items, total };
}

export async function countPendingReviews(userId: string): Promise<number> {
  return col<any>("documents").countDocuments({ user_id: userId, "review.status": "pending" } as any);
}

/**
 * "Looks right": clears the flag. A document flagged as possibly not an invoice was
 * hidden from the invoice lists, so approving it makes it count.
 */
export async function approveReviews(userId: string, ids: string[]): Promise<number> {
  let approved = 0;
  for (const id of ids) {
    const _id = objectId(id);
    if (!_id) continue;
    const result = await col<any>("documents").updateOne(
      { _id, user_id: userId, "review.status": "pending" } as any,
      { $set: { "review.status": "approved", "review.reviewed_at": new Date() } } as any,
    );
    if (!result.matchedCount) continue;
    approved += 1;
    await col<any>("invoices").updateOne({ document_id: id, user_id: userId, possible_not_invoice: true } as any, { $set: { possible_not_invoice: false } } as any);
  }
  return approved;
}

/**
 * "Not wanted": marks the import as dismissed, archives its invoice so it leaves the
 * lists and totals, and dismisses the reminders that were created from it.
 */
export async function dismissReview(userId: string, id: string): Promise<{ ok: boolean; remindersDismissed: number }> {
  const _id = objectId(id);
  if (!_id) return { ok: false, remindersDismissed: 0 };
  const result = await col<any>("documents").updateOne(
    { _id, user_id: userId, "review.status": "pending" } as any,
    { $set: { "review.status": "dismissed", "review.reviewed_at": new Date() } } as any,
  );
  if (!result.matchedCount) return { ok: false, remindersDismissed: 0 };
  await col<any>("invoices").updateOne({ document_id: id, user_id: userId } as any, { $set: { status: "archived" } } as any);
  const reminders = await col<any>("reminders").updateMany(
    { document_id: id, user_id: userId, status: { $in: ["pending", "snoozed"] } } as any,
    { $set: { status: "dismissed", updated_at: new Date() } } as any,
  );
  return { ok: true, remindersDismissed: Number(reminders?.modifiedCount ?? 0) };
}


export async function correctReview(userId: string, id: string, changes: {
  supplier_name: string; amount: number; currency: string; issue_date: string;
}): Promise<boolean> {
  const _id = objectId(id);
  if (!_id) return false;
  const document = await col<any>("documents").findOne({_id, user_id: userId, "review.status": "pending"});
  if (!document) return false;
  const invoice = await col<any>("invoices").findOne({document_id: id, user_id: userId});
  if (!invoice) return false;
  const now = new Date();
  await col<any>("invoices").updateOne({_id: invoice._id, user_id: userId}, {$set: {
    ...changes, fields: {...parseFields(invoice.fields), ...changes}, updated_at: now,
  }});
  await col<any>("documents").updateOne({_id, user_id: userId}, {$set: {
    extracted_fields: JSON.stringify({...parseFields(document.extracted_fields), ...changes}), updated_at: now,
    manual_field_keys: [...new Set([
      ...(Array.isArray(document.manual_field_keys) ? document.manual_field_keys : []),
      ...Object.keys(changes),
    ])],
  }});
  // Approval is a separate action: a save failure must never approve the item.
  return true;
}
