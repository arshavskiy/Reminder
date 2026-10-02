import { ObjectId } from "mongodb";
import { col } from "../db/db";
import { logger } from "../logger";
import { chooseCounterpart, hasActivePair, toPairRow, type PairScore, type PairStatus } from "./pairing";

// Database side of invoice <-> receipt pairing. The matching rules are in pairing.ts.

const AMOUNT_TOLERANCE = 0.01;

function objectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

async function loadRaw(userId: string, id: string): Promise<Record<string, any> | null> {
  const _id = objectId(id);
  if (!_id) return null;
  return (await col<any>("invoices").findOne({ _id, user_id: userId } as any)) as Record<string, any> | null;
}

export interface PairResult {
  linked: boolean;
  with?: string;
  score?: PairScore;
  reason?: "not_found" | "not_pairable" | "already_paired" | "no_match";
}

/**
 * Looks for the counterpart of one invoice or receipt and links them when there is
 * a clear match. Safe to call after every import: it does nothing for documents
 * that cannot pair, are already paired, or have no unambiguous candidate.
 */
export async function pairInvoiceById(userId: string, id: string): Promise<PairResult> {
  const raw = await loadRaw(userId, id);
  if (!raw) return { linked: false, reason: "not_found" };
  const target = toPairRow(raw);
  if (!target.role || target.amount === null) return { linked: false, reason: "not_pairable" };
  if (hasActivePair(target)) return { linked: false, reason: "already_paired" };

  const wantedRole = target.role === "invoice" ? "receipt" : "invoice";
  const candidates = await col<any>("invoices")
    .find({
      user_id: userId,
      _id: { $ne: raw._id },
      amount: { $gte: target.amount - AMOUNT_TOLERANCE, $lte: target.amount + AMOUNT_TOLERANCE },
    } as any, { projection: { preview_html: 0 } } as any)
    .limit(100)
    .toArray();
  const pool = candidates.map((row: any) => toPairRow(row)).filter((row) => row.role === wantedRole);
  const choice = chooseCounterpart(target, pool);
  if (!choice) return { linked: false, reason: "no_match" };

  await linkPair(userId, target.id, choice.match.id, "auto", choice.score);
  logger.info("invoice_receipt_paired", { user_id: userId, a: target.id, b: choice.match.id, score: choice.score.score, reasons: choice.score.reasons });
  return { linked: true, with: choice.match.id, score: choice.score };
}

/** Same as pairInvoiceById for the invoice created from an imported document. */
export async function pairInvoiceByDocumentId(userId: string | undefined, documentId: string): Promise<PairResult> {
  const filter: Record<string, unknown> = { document_id: documentId };
  if (userId) filter.user_id = userId;
  const row = await col<any>("invoices").findOne(filter as any, { projection: { _id: 1, user_id: 1 } } as any);
  if (!row?._id) return { linked: false, reason: "not_found" };
  return pairInvoiceById(String(row.user_id ?? userId ?? ""), String(row._id));
}

export async function linkPair(userId: string, aId: string, bId: string, status: Exclude<PairStatus, "rejected">, score?: PairScore): Promise<boolean> {
  const a = objectId(aId);
  const b = objectId(bId);
  if (!a || !b) return false;
  const at = new Date();
  const set = (partner: string) => ({
    paired_with: partner,
    pair_status: status,
    pair_score: score?.score ?? null,
    pair_reasons: score?.reasons ?? [],
    pair_linked_at: at,
  });
  await col<any>("invoices").updateOne({ _id: a, user_id: userId } as any, { $set: set(bId) } as any);
  await col<any>("invoices").updateOne({ _id: b, user_id: userId } as any, { $set: set(aId) } as any);
  return true;
}

/**
 * Breaks a pair, and remembers it was wrong so the matcher does not re-link the
 * same two documents the next time something is imported.
 */
export async function unlinkPair(userId: string, id: string): Promise<{ ok: boolean; partner: string | null }> {
  const raw = await loadRaw(userId, id);
  if (!raw) return { ok: false, partner: null };
  const partner = raw.paired_with ? String(raw.paired_with) : null;
  const clear = { $unset: { paired_with: "", pair_status: "", pair_score: "", pair_reasons: "", pair_linked_at: "" } };
  await col<any>("invoices").updateOne({ _id: raw._id, user_id: userId } as any, {
    ...clear,
    ...(partner ? { $addToSet: { pair_rejected_with: partner } } : {}),
  } as any);
  const partnerId = partner ? objectId(partner) : null;
  if (partnerId) {
    await col<any>("invoices").updateOne({ _id: partnerId, user_id: userId } as any, {
      ...clear,
      $addToSet: { pair_rejected_with: String(raw._id) },
    } as any);
  }
  return { ok: true, partner };
}

/** Backfill: tries every receipt that has no pair yet. Returns how many were linked. */
export async function scanPairs(userId: string): Promise<{ scanned: number; linked: number }> {
  const rows = await col<any>("invoices")
    .find({ user_id: userId } as any, { projection: { preview_html: 0 } } as any)
    .limit(5000)
    .toArray();
  let scanned = 0;
  let linked = 0;
  for (const raw of rows) {
    const row = toPairRow(raw);
    if (row.role !== "receipt" || hasActivePair(row)) continue;
    scanned += 1;
    const result = await pairInvoiceById(userId, row.id);
    if (result.linked) linked += 1;
  }
  return { scanned, linked };
}
