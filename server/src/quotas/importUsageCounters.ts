import { col } from "../db/db";
import { getStoredUserUsage, type UserUsageCounters } from "./userUsageCounters";

export type ImportUsageCounters = {
  scannedDocuments: number;
  gmailDocuments: number;
  gmailInvoices: number;
};

/** Lifetime breakdown — stored counters, not live row counts (survives deletes). */
export async function getImportUsageCounters(userId: string): Promise<ImportUsageCounters> {
  const usage = await getStoredUserUsage(userId);
  return {
    scannedDocuments: usage.scannedDocuments,
    gmailDocuments: usage.gmailDocuments,
    gmailInvoices: usage.gmailInvoices,
  };
}

export function importCountersFromUsage(usage: UserUsageCounters): ImportUsageCounters {
  return {
    scannedDocuments: usage.scannedDocuments,
    gmailDocuments: usage.gmailDocuments,
    gmailInvoices: usage.gmailInvoices,
  };
}

/** @deprecated live counting kept for scripts/tests only */
export async function getLiveImportUsageCounters(userId: string): Promise<ImportUsageCounters> {
  const [gmailImports, documents, invoices] = await Promise.all([
    col("gmail_imports").find({ user_id: userId }, { projection: { files: 1 } }).toArray(),
    col("documents").find(
      { user_id: userId, document_kind: { $ne: "certificate" } },
      { projection: { _id: 1, document_kind: 1, invoice_saved: 1, invoice_rejected: 1 } },
    ).toArray(),
    col("invoices").find({ user_id: userId }, { projection: { document_id: 1 } }).toArray(),
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

    scannedDocuments += 1;
  }

  return { scannedDocuments, gmailDocuments, gmailInvoices };
}
