import { invoiceDocumentCategory, type InvoiceDocumentCategory } from "./documentCategory";
import { hasActivePair, isIdentifiedSupplier, normalizeCurrency, normalizeSupplier, parsePairAmount } from "./pairing";

/**
 * Finds invoices and receipts stored more than once (the same document imported as an
 * attachment and again as a forwarded copy, a re-sent email, a re-scan) and plans which
 * copy to keep. Pure; scripts/removeDuplicateInvoices.ts applies the plan to the database.
 *
 * Two rows are the same document when they share type, supplier, amount, currency and
 * issue date, and the same document number (ignoreDate drops the date for numbered rows).
 * Rows without a number only match in loose mode, and never when the candidates carry
 * two different numbers. Inline Gmail receipts
 * (no file) are only matched with each other: removing one in favour of a PDF would let
 * the inline import bring it back.
 */

export type DuplicateMatch = "number" | "loose";

export interface DuplicateCandidate {
  id: string;
  documentId: string;
  inline: boolean;
  category: InvoiceDocumentCategory;
  supplier: string;
  supplierLabel: string;
  number: string | null;
  amount: number;
  currency: string;
  issueDate: string | null;
  status: string;
  hidden: boolean;
  /** File-backed row whose document no longer exists; the invoice lists do not show it. */
  orphan: boolean;
  paired: boolean;
  createdAt: number;
  completeness: number;
}

export interface DuplicateGroup {
  match: DuplicateMatch;
  keep: DuplicateCandidate;
  remove: DuplicateCandidate[];
}

export interface PairRelink {
  a: string;
  b: string;
  status: string;
  score: number | null;
  reasons: string[];
}

export interface DedupPlan {
  groups: DuplicateGroup[];
  /** Invoice ids to delete. */
  removeIds: string[];
  /** Invoice id that replaces each removed one. */
  keeperOf: Map<string, string>;
  /** File-backed document ids to delete, mapped to the kept copy's document id. */
  documentKeeperOf: Map<string, string>;
  /** Missing fields on a kept row, filled from the copies being removed. */
  fills: Map<string, Record<string, unknown>>;
  /** Gmail message ids of removed inline receipts, so a re-import skips them. */
  supersededMessageIds: Map<string, string[]>;
  /** Surviving rows whose partner is removed and that cannot move to the partner's keeper. */
  clearPairs: string[];
  /** Surviving rows re-linked to the kept copy of their removed partner. */
  relinks: PairRelink[];
}

const COMPLETENESS_FIELDS = [
  "supplier_id", "invoice_number", "issue_date", "payment_due_date", "amount_before_vat",
  "vat_amount", "client_id", "payment_status", "payment_method", "billing_period",
];

const FILL_FIELDS = [
  "supplier_id", "payment_due_date", "payment_status", "payment_method", "client_id", "client_company",
  "customer_number", "account_number", "billing_period", "amount_before_vat", "vat_amount",
];

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && !value.trim());
}

function isoDay(value: unknown): string | null {
  if (!value) return null;
  const ts = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : null;
}

/** "INV-00123", "inv 123" and "123" are the same number; short ones are too common to trust. */
export function normalizeDocumentNumber(value: unknown): string | null {
  const text = String(value ?? "").toLowerCase().replace(/[^0-9a-z\u0590-\u05ff]/g, "").replace(/^0+/, "");
  return text.length >= 3 ? text : null;
}

function timestamp(value: unknown): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const ts = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
}

export interface DedupOptions {
  loose?: boolean;
    /**
     * Match a shared document number regardless of issue date (the same receipt read once
     * with the bill date and once with the payment date). Never applies to unnumbered rows.
     */
    ignoreDate?: boolean;
  /** Document ids that exist. When given, file-backed rows pointing elsewhere are orphans. */
  existingDocumentIds?: Set<string>;
}

/** Null for rows that cannot be matched safely: no amount or no identified supplier. */
export function toDuplicateCandidate(raw: Record<string, any>, existingDocumentIds?: Set<string>): DuplicateCandidate | null {
  const amount = parsePairAmount(raw.amount);
  const supplierLabel = String(raw.supplier_name ?? raw.fields?.supplier_name ?? "").trim();
  if (amount === null || !isIdentifiedSupplier(supplierLabel)) return null;
  const supplier = normalizeSupplier(supplierLabel);
  if (!supplier) return null;
  const subtype = raw.document_subtype ?? raw.template_name ?? raw.fields?.document_subtype;
  const number = normalizeDocumentNumber(raw.invoice_number)
    ?? normalizeDocumentNumber(raw.receipt_number)
    ?? normalizeDocumentNumber(raw.fields?.invoice_number)
    ?? normalizeDocumentNumber(raw.fields?.receipt_number);
  const filled = COMPLETENESS_FIELDS.filter((key) => !isBlank(raw[key])).length
    + (Array.isArray(raw.items) && raw.items.length > 0 ? 1 : 0);
  const documentId = String(raw.document_id ?? "");
  const inline = raw.source === "gmail_inline" || raw.inline_no_file === true;
  return {
    id: String(raw._id ?? raw.id ?? ""),
    documentId,
    inline,
    category: invoiceDocumentCategory(subtype),
    supplier,
    supplierLabel,
    number,
    amount,
    currency: normalizeCurrency(raw.currency),
    issueDate: isoDay(raw.issue_date),
    status: String(raw.status ?? "new"),
    hidden: raw.possible_not_invoice === true,
    orphan: !inline && Boolean(existingDocumentIds) && !existingDocumentIds!.has(documentId),
    paired: hasActivePair({ pairedWith: raw.paired_with ? String(raw.paired_with) : null, pairStatus: raw.pair_status ?? null }),
    createdAt: timestamp(raw.created_at),
    completeness: filled,
  };
}

/**
 * Lower sorts first = better copy to keep: one whose document still exists, paired with
 * its receipt/invoice, visible, already handled by the user, most complete, then the oldest.
 */
export function compareKeepPreference(a: DuplicateCandidate, b: DuplicateCandidate): number {
  const rank = (c: DuplicateCandidate) => [
    c.orphan ? 1 : 0,
    c.paired ? 0 : 1,
    c.hidden ? 1 : 0,
    c.status === "archived" ? 1 : 0,
    c.status === "new" ? 1 : 0,
    -c.completeness,
    c.createdAt,
  ];
  const left = rank(a);
  const right = rank(b);
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return a.id.localeCompare(b.id);
}

function baseKey(c: DuplicateCandidate, ignoreDate: boolean): string {
    return [c.inline ? "inline" : "file", c.category, c.supplier, c.currency, Math.round(c.amount * 100), ignoreDate ? "" : c.issueDate ?? ""].join("|");
}

function toGroup(match: DuplicateMatch, members: DuplicateCandidate[]): DuplicateGroup {
  const [keep, ...remove] = [...members].sort(compareKeepPreference);
  return { match, keep, remove };
}

export function findDuplicateGroups(raws: Record<string, any>[], options: DedupOptions = {}): DuplicateGroup[] {
    if (options.loose && options.ignoreDate) throw new Error("loose and ignoreDate cannot be combined");
  const buckets = new Map<string, DuplicateCandidate[]>();
  for (const raw of raws) {
    const candidate = toDuplicateCandidate(raw, options.existingDocumentIds);
    if (!candidate?.id) continue;
      const key = baseKey(candidate, Boolean(options.ignoreDate));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(candidate);
    else buckets.set(key, [candidate]);
  }

  const groups: DuplicateGroup[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const numbers = new Set(bucket.map((c) => c.number).filter((n): n is string => Boolean(n)));
    const unnumbered = bucket.filter((c) => !c.number);
    // Without a date, only a shared document number ties two rows together.
    const hasDate = Boolean(bucket[0].issueDate);
    if (options.loose && hasDate && numbers.size <= 1 && unnumbered.length > 0) {
      groups.push(toGroup("loose", bucket));
      continue;
    }
    for (const number of numbers) {
      const members = bucket.filter((c) => c.number === number);
      if (members.length > 1) groups.push(toGroup("number", members));
    }
  }
  return groups.sort((a, b) => a.keep.supplierLabel.localeCompare(b.keep.supplierLabel) || a.keep.id.localeCompare(b.keep.id));
}

export function planInvoiceDedup(raws: Record<string, any>[], options: DedupOptions = {}): DedupPlan {
  const groups = findDuplicateGroups(raws, options);
  const byId = new Map(raws.map((raw) => [String(raw._id ?? raw.id ?? ""), raw]));
  const keeperOf = new Map<string, string>();
  const documentKeeperOf = new Map<string, string>();
  const fills = new Map<string, Record<string, unknown>>();
  const supersededMessageIds = new Map<string, string[]>();

  for (const group of groups) {
    const keeper = byId.get(group.keep.id)!;
    const fill: Record<string, unknown> = {};
    const superseded = new Set<string>();
    for (const removed of group.remove) {
      keeperOf.set(removed.id, group.keep.id);
      if (!removed.inline && removed.documentId && group.keep.documentId) {
        documentKeeperOf.set(removed.documentId, group.keep.documentId);
      }
      const raw = byId.get(removed.id)!;
      for (const key of FILL_FIELDS) {
        if (isBlank(keeper[key]) && !(key in fill) && !isBlank(raw[key])) fill[key] = raw[key];
      }
      if (removed.inline) {
        for (const messageId of [raw.gmail_message_id, ...(Array.isArray(raw.superseded_gmail_message_ids) ? raw.superseded_gmail_message_ids : [])]) {
          if (!isBlank(messageId) && messageId !== keeper.gmail_message_id) superseded.add(String(messageId));
        }
      }
    }
    if (Object.keys(fill).length) fills.set(group.keep.id, fill);
    if (superseded.size) supersededMessageIds.set(group.keep.id, [...superseded]);
  }

  // A surviving row paired with a removed copy moves to that copy's keeper when the keeper
  // is free; otherwise its pair is cleared so it can be matched again later.
  const partnerOf = new Map<string, string>();
  for (const [id, raw] of byId) {
    if (hasActivePair({ pairedWith: raw.paired_with ? String(raw.paired_with) : null, pairStatus: raw.pair_status ?? null })) {
      partnerOf.set(id, String(raw.paired_with));
    }
  }
  const isFree = (id: string) => {
    const partner = partnerOf.get(id);
    return !partner || keeperOf.has(partner);
  };
  const rejectedBetween = (a: string, b: string) => {
    const listed = (id: string) => (Array.isArray(byId.get(id)?.pair_rejected_with) ? byId.get(id)!.pair_rejected_with.map(String) : []);
    return listed(a).includes(b) || listed(b).includes(a);
  };

  const clearPairs: string[] = [];
  const relinks: PairRelink[] = [];
  const survivors = [...byId.keys()].filter((id) => !keeperOf.has(id)).sort();
  for (const id of survivors) {
    const partner = partnerOf.get(id);
    if (!partner || !keeperOf.has(partner)) continue;
    const target = keeperOf.get(partner)!;
    if (target !== id && isFree(target) && !rejectedBetween(id, target)) {
      const raw = byId.get(id)!;
      relinks.push({
        a: id,
        b: target,
        status: String(raw.pair_status),
        score: typeof raw.pair_score === "number" ? raw.pair_score : null,
        reasons: Array.isArray(raw.pair_reasons) ? raw.pair_reasons.map(String) : [],
      });
      partnerOf.set(id, target);
      partnerOf.set(target, id);
    } else {
      clearPairs.push(id);
      partnerOf.delete(id);
    }
  }

  return {
    groups,
    removeIds: [...keeperOf.keys()],
    keeperOf,
    documentKeeperOf,
    fills,
    supersededMessageIds,
    clearPairs,
    relinks,
  };
}
