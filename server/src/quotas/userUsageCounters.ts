import { ObjectId } from "mongodb";
import { col } from "../db/db";

export type UserUsageCounters = {
  documents: number;
  reminders: number;
  scannedDocuments: number;
  gmailDocuments: number;
  gmailInvoices: number;
};

export type DocumentUsageKind = "scanned" | "gmail_document" | "gmail_invoice";

const EMPTY: UserUsageCounters = {
  documents: 0,
  reminders: 0,
  scannedDocuments: 0,
  gmailDocuments: 0,
  gmailInvoices: 0,
};

export function normalizeUsageCounters(raw: Partial<UserUsageCounters> | null | undefined): UserUsageCounters {
  return {
    documents: nonNeg(raw?.documents),
    reminders: nonNeg(raw?.reminders),
    scannedDocuments: nonNeg(raw?.scannedDocuments),
    gmailDocuments: nonNeg(raw?.gmailDocuments),
    gmailInvoices: nonNeg(raw?.gmailInvoices),
  };
}

export async function getStoredUserUsage(userId: string): Promise<UserUsageCounters> {
  const user = await col("users").findOne(userIdFilter(userId) as any, {
    projection: { usage: 1 },
  }) as { usage?: Partial<UserUsageCounters> } | null;
  return normalizeUsageCounters(user?.usage);
}

/** Lifetime counters only increase — deletes never decrement. */
export async function incrementDocumentUsage(
  userId: string,
  kind: DocumentUsageKind = "scanned",
  amount = 1,
): Promise<void> {
  if (!userId || amount <= 0) return;
  const breakdownKey = kind === "gmail_invoice"
    ? "usage.gmailInvoices"
    : kind === "gmail_document"
      ? "usage.gmailDocuments"
      : "usage.scannedDocuments";
  await col("users").updateOne(
    userIdFilter(userId) as any,
    {
      $inc: {
        "usage.documents": amount,
        [breakdownKey]: amount,
      },
      $set: { updated_at: new Date() },
    },
  );
}

export async function incrementReminderUsage(userId: string, amount = 1): Promise<void> {
  if (!userId || amount <= 0) return;
  await col("users").updateOne(
    userIdFilter(userId) as any,
    {
      $inc: { "usage.reminders": amount },
      $set: { updated_at: new Date() },
    },
  );
}

export async function setUserUsageCounters(
  userId: string,
  usage: UserUsageCounters,
): Promise<void> {
  await col("users").updateOne(
    userIdFilter(userId) as any,
    {
      $set: {
        usage: normalizeUsageCounters(usage),
        updated_at: new Date(),
      },
    },
  );
}

/**
 * Compute current DB snapshot (live rows). Used only for backfill —
 * runtime quotas read stored lifetime counters.
 */
export async function computeLiveUsageSnapshot(userId: string): Promise<UserUsageCounters> {
  const [gmailImports, documents, invoices, reminders] = await Promise.all([
    col("gmail_imports").find({ user_id: userId }, { projection: { files: 1 } }).toArray(),
    col("documents").find(
      { user_id: userId, document_kind: { $ne: "certificate" } },
      { projection: { _id: 1, document_kind: 1, invoice_saved: 1, invoice_rejected: 1 } },
    ).toArray(),
    col("invoices").find({ user_id: userId }, { projection: { document_id: 1 } }).toArray(),
    col("reminders").countDocuments({ user_id: userId } as any),
  ]);

  const gmailDocumentIds = new Set<string>();
  for (const item of gmailImports as Array<{ files?: Array<{ document_id?: unknown }> }>) {
    for (const file of item.files ?? []) {
      const id = String(file.document_id ?? "").trim();
      if (id) gmailDocumentIds.add(id);
    }
  }

  const invoiceDocumentIds = new Set(
    (invoices as Array<{ document_id?: unknown }>)
      .map((invoice) => String(invoice.document_id ?? "").trim())
      .filter(Boolean),
  );

  let scannedDocuments = 0;
  let gmailDocuments = 0;
  let gmailInvoices = 0;

  for (const doc of documents as Array<{
    _id: { toString(): string };
    document_kind?: string | null;
    invoice_saved?: boolean;
    invoice_rejected?: boolean;
  }>) {
    const id = doc._id.toString();
    const isInvoice = doc.document_kind === "invoice"
      || doc.invoice_saved === true
      || doc.invoice_rejected === true
      || invoiceDocumentIds.has(id);
    const fromGmail = gmailDocumentIds.has(id);

    if (fromGmail) {
      if (isInvoice) gmailInvoices += 1;
      else gmailDocuments += 1;
      continue;
    }

    // Manual uploads (including invoices) count as scanned in the breakdown.
    scannedDocuments += 1;
  }

  // Free-tier document pool = all non-certificate documents.
  const documentsTotal = (documents as unknown[]).length;

  return {
    documents: documentsTotal,
    reminders: reminders,
    scannedDocuments,
    gmailDocuments,
    gmailInvoices,
  };
}

export function mergeUsageFloor(existing: UserUsageCounters, live: UserUsageCounters): UserUsageCounters {
  return {
    documents: Math.max(existing.documents, live.documents),
    reminders: Math.max(existing.reminders, live.reminders),
    scannedDocuments: Math.max(existing.scannedDocuments, live.scannedDocuments),
    gmailDocuments: Math.max(existing.gmailDocuments, live.gmailDocuments),
    gmailInvoices: Math.max(existing.gmailInvoices, live.gmailInvoices),
  };
}

function userIdFilter(userId: string): Record<string, unknown> {
  if (ObjectId.isValid(userId)) return { _id: new ObjectId(userId) };
  return { _id: userId };
}

function nonNeg(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
