import {ObjectId} from "mongodb";
import {closeDb, col, connectDb} from "../db/db";

type InvoiceRow = Record<string, any>;

const apply = process.argv.includes("--apply");
const userId = readArg("--user-id");

await connectDb();

try {
  const filter: Record<string, unknown> = {};
  if (userId) filter.user_id = userId;
  const invoices = await col("invoices").find(filter as any).toArray() as InvoiceRow[];
  const documentIds = [...new Set(invoices.map((invoice) => String(invoice.document_id ?? "")).filter(ObjectId.isValid))];
  const documents = documentIds.length
    ? await col("documents")
      .find({_id: {$in: documentIds.map((id) => new ObjectId(id))}} as any)
      .project({_id: 1, raw_text: 1})
      .toArray() as InvoiceRow[]
    : [];
  const documentRawText = new Map(documents.map((doc) => [String(doc._id), String(doc.raw_text ?? "")]));
  let valid = 0;
  let possibleNotInvoice = 0;

  for (const invoice of invoices) {
    const missing = missingInvoiceCoreFields(invoice, documentRawText.get(String(invoice.document_id)));
    if (missing.length > 0) {
      possibleNotInvoice += 1;
      if (apply) await markPossibleNotInvoice(invoice, missing);
      continue;
    }
    valid += 1;
    if (apply) await markValidInvoice(invoice, documentRawText.get(String(invoice.document_id)));
  }

  console.log(JSON.stringify({
    scanned: invoices.length,
    valid,
    possible_not_invoice: possibleNotInvoice,
    applied: apply,
    user_id: userId ?? null,
  }, null, 2));
} finally {
  await closeDb();
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}

async function markPossibleNotInvoice(invoice: InvoiceRow, missing: string[]): Promise<void> {
  const now = new Date();
  const rejectionReason = isProbablyContractOrNonInvoice(missing)
    ? "missing_invoice_number_and_amount"
    : "missing_required_fields";
  const rejectionLabel = invoiceRejectionLabel(rejectionReason, missing);
  await col("invoices").updateOne(
    {_id: invoice._id} as any,
    {
      $set: {
        possible_not_invoice: true,
        invoice_validation_status: rejectionReason,
        invoice_rejection_label: rejectionLabel,
        missing_required_fields: missing,
        updated_at: now,
      },
    } as any,
  );

  const documentFilter = documentIdFilter(invoice.document_id);
  if (!documentFilter) return;
  await col("documents").updateOne(
    documentFilter as any,
    {
      $set: {
        invoice_saved: false,
        invoice_rejected: true,
        invoice_rejection_reason: rejectionReason,
        invoice_rejection_label: rejectionLabel,
        invoice_missing_fields: missing,
        reminder_status: "not_applicable",
        updated_at: now,
      },
    } as any,
  );
}

async function markValidInvoice(invoice: InvoiceRow, rawText?: string): Promise<void> {
  const now = new Date();
  const extractedClient = invoiceClientName(invoice, rawText);
  const fieldUpdates = extractedClient
    ? {
        client_company: extractedClient,
        client_name: invoice.fields?.client_name ?? extractedClient,
      }
    : {};
  await col("invoices").updateOne(
    {_id: invoice._id} as any,
    {
      $set: {
        possible_not_invoice: false,
        invoice_validation_status: "valid",
        invoice_rejection_label: null,
        missing_required_fields: [],
        status: normalizeInvoiceStatus(invoice.status),
        ...(extractedClient && {client_company: extractedClient}),
        ...(extractedClient && {fields: {...(invoice.fields ?? {}), ...fieldUpdates}}),
        updated_at: now,
      },
    } as any,
  );

  const documentFilter = documentIdFilter(invoice.document_id);
  if (!documentFilter) return;
  await col("documents").updateOne(
    documentFilter as any,
    {
      $set: {
        invoice_saved: true,
        invoice_rejected: false,
        invoice_rejection_reason: null,
        invoice_rejection_label: null,
        invoice_missing_fields: [],
        reminder_status: "not_applicable",
        updated_at: now,
      },
    } as any,
  );
}

function invoiceRejectionLabel(reason: string, missingFields: string[] = []): string {
  const labels: Record<string, string> = {
    missing_invoice_number_and_amount: "חסר מספר חשבונית וסכום - כנראה לא חשבונית",
    missing_required_fields: "חסרים שדות חובה לחשבונית",
    not_invoice: "המסמך לא זוהה כחשבונית",
    rejected: "החשבונית נדחתה",
  };
  const base = labels[reason] ?? "המסמך נדחה כחשבונית";
  return missingFields.length ? `${base}: ${missingFields.join(", ")}` : base;
}

function documentIdFilter(value: unknown): Record<string, unknown> | null {
  const id = String(value ?? "");
  if (!ObjectId.isValid(id)) return null;
  return {_id: new ObjectId(id)};
}

function missingInvoiceCoreFields(invoice: InvoiceRow, rawText?: string): string[] {
  const fields = invoice.fields && typeof invoice.fields === "object" ? invoice.fields as Record<string, unknown> : {};
  const amount = typeof invoice.amount === "number" ? invoice.amount : parseAmount(invoice.amount ?? fields.amount ?? fields.total_amount ?? fields.amount_due ?? fields.total_to_pay ?? fields.total);
  const values = {
    supplierName: stringValue(invoice.supplier_name) ?? firstString(fields, ["supplier_name", "vendor_name", "counterparty", "issuer_name", "company_name"]),
    invoiceNumber: stringValue(invoice.invoice_number) ?? firstString(fields, ["invoice_number", "receipt_number", "document_number", "reference_number"]),
    clientName: invoiceClientName(invoice, rawText),
    issueDate: stringValue(invoice.issue_date) ?? firstString(fields, ["issue_date", "invoice_date", "receipt_date", "date"]),
    paymentDueDate: stringValue(invoice.payment_due_date) ?? firstString(fields, ["payment_due_date", "due_date", "expiry_date"]),
    amount: Number.isFinite(amount) ? amount : null,
  };

  const missing: string[] = [];
  if (!values.supplierName || values.supplierName === "ספק לא מזוהה") missing.push("supplier_name");
  if (!values.invoiceNumber) missing.push("invoice_number");
  if (!values.clientName) missing.push("client_company");
  if (!values.issueDate) missing.push("issue_date");
  if (!values.paymentDueDate) missing.push("payment_due_date");
  if (values.amount === null) missing.push("amount");
  return missing;
}

function isProbablyContractOrNonInvoice(missing: string[]): boolean {
  return missing.includes("invoice_number") && missing.includes("amount");
}

function invoiceClientName(invoice: InvoiceRow, rawText?: string): string | null {
  const fields = invoice.fields && typeof invoice.fields === "object" ? invoice.fields as Record<string, unknown> : {};
  return stringValue(invoice.client_company)
    ?? firstString(fields, ["client_company", "client_name", "customer_name", "bill_to"])
    ?? extractInvoiceRecipientFromRawText(rawText);
}

function firstString(fields: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(fields[key]);
    if (value) return value;
  }
  return null;
}

function stringValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  return text || null;
}

function parseAmount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/[₪$€£,\s]/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractInvoiceRecipientFromRawText(rawText: string | null | undefined): string | null {
  if (!rawText) return null;
  const match = rawText.match(/(?:^|\n|\r)\s*לכבוד\s*:?\s*([^\n\r\t|:]{2,100})/m);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  const compact = raw
    .replace(/\s{2,}/g, " ")
    .replace(/[,:;|\-]+$/g, "")
    .trim();
  const company = compact.match(/^(.+?בע["״']?מ)\b/);
  if (company?.[1]) return company[1].trim();
  return compact
    .replace(/\s+(?:לתשלום|תשלום|סה["״]?כ|עד|מספר|חשבון)\b.*$/, "")
    .trim() || null;
}

function normalizeInvoiceStatus(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (["new", "reviewed", "outgoing", "archived"].includes(raw)) return raw;
  if (!raw || raw === "done") return "new";
  return raw;
}
