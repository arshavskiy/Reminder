import express from "express";
import { ObjectId } from "mongodb";
import { col } from "../db/db";
import { HTTPException, requireAuth } from "../auth/middleware";
import { documentImportMonthlyLimit } from "../quotas/documentImportQuota";
import { loadGmailSearchProviders, type GmailSearchProvider } from "../gmail/searchProviders";

type InvoiceRow = Record<string, any>;
const INVOICE_STATUSES = new Set(["new", "reviewed", "outgoing", "archived"]);

export function registerInvoiceRoutes(app: express.Application) {
  app.get("/api/invoices", async (req, res) => {
    let userId: string;
    let userPlan: string | null | undefined;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
      userPlan = ctx.user.plan ?? ctx.user.role;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const limit = clampInt(req.query.limit, 50, 1, 500);
    const offset = clampInt(req.query.offset, 0, 0, 100_000);
    const q = normalize(String(req.query.q ?? ""));
    const status = String(req.query.status ?? "").trim();
    const type = String(req.query.type ?? "").trim();
    const suppliers = parseMultiQuery(req.query.supplier);
    const fromTs = parseDateTs(req.query.dateFrom);
    const toTs = parseDateTs(req.query.dateTo, true);

    const invoices = await col("invoices")
      .find({ user_id: userId } as any)
      .sort({ issue_date: -1, created_at: -1 } as any)
      .limit(2000)
      .toArray() as InvoiceRow[];

    const documentIds = [...new Set(invoices.map((invoice) => String(invoice.document_id ?? "")).filter(ObjectId.isValid))];
    const documents = documentIds.length
      ? await col("documents")
        .find({ _id: { $in: documentIds.map((id) => new ObjectId(id)) }, user_id: userId } as any, { projection: { raw_text: 0 } } as any)
        .toArray() as InvoiceRow[]
      : [];
    const documentMap = new Map(documents.map((doc) => [doc._id.toString(), doc]));

    const providers = await loadGmailSearchProviders();
    const allRows = invoices.map((invoice) => presentInvoice(invoice, documentMap.get(String(invoice.document_id)), undefined, providers));
    const facetRows = allRows.filter((row) => {
      if (status && row.status !== status) return false;
      if (type && row.type !== type) return false;
      const rowTs = invoiceDateTs(row);
      if (fromTs && (!rowTs || rowTs < fromTs)) return false;
      if (toTs && (!rowTs || rowTs > toTs)) return false;
      if (!q) return true;
      return invoiceMatchesQuery(row, q);
    });
    const rows = facetRows
      .filter((row) => {
        if (status && row.status !== status) return false;
        if (type && row.type !== type) return false;
          if (suppliers.length) {
              const wantUnidentified = suppliers.includes("__unidentified__");
              const namedSuppliers = suppliers.filter((s) => s !== "__unidentified__");
              const isUnidentified = !row.supplier_name || row.supplier_name === "ספק לא מזוהה";
              const match = (wantUnidentified && isUnidentified) || (namedSuppliers.length > 0 && namedSuppliers.includes(row.supplier_name));
              if (!match) return false;
          }
        const rowTs = invoiceDateTs(row);
        if (fromTs && (!rowTs || rowTs < fromTs)) return false;
        if (toTs && (!rowTs || rowTs > toTs)) return false;
        if (!q) return true;
        return invoiceMatchesQuery(row, q);
      });

    const visibleLimit = invoiceListVisibleLimit(userPlan);
    const visibleRows = visibleLimit === null ? rows : rows.slice(0, visibleLimit);
    const visibleFacetRows = visibleLimit === null ? facetRows : facetRows.slice(0, visibleLimit);
    const safeOffset = visibleLimit === null ? offset : Math.min(offset, visibleLimit);
    const counts: Record<string, number> = {};
    for (const row of visibleRows) counts[row.status] = (counts[row.status] ?? 0) + 1;

    res.json({
      rows: visibleRows.slice(safeOffset, safeOffset + limit),
      total: visibleRows.length,
      totalAll: rows.length,
      limit,
      offset: safeOffset,
      visibleLimit,
      counts,
      types: uniqueSorted(visibleRows.map((row) => row.type).filter(Boolean)),
      suppliers: uniqueSorted(visibleFacetRows.map((row) => row.supplier_name).filter(Boolean)),
    });
  });

  app.post("/api/invoices/vendors/merge", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const supplierNames = uniqueSorted((Array.isArray(req.body?.supplierNames) ? req.body.supplierNames : [])
      .map((value: unknown) => String(value ?? "").trim())
      .filter(Boolean));
    const canonicalName = String(req.body?.canonicalName ?? "").trim();
    if (supplierNames.length < 2 || !canonicalName) {
      res.status(400).json({ error: "Choose at least two supplier names and a merged supplier name" });
      return;
    }

    const now = new Date();
    const result = await col("invoices").updateMany(
      { user_id: userId, supplier_name: { $in: supplierNames } } as any,
      [
        {
          $set: {
            supplier_name_raw: { $ifNull: ["$supplier_name_raw", "$supplier_name"] },
            supplier_name: canonicalName,
            "fields.supplier_name": canonicalName,
            updated_at: now,
          },
        },
      ] as any,
    );

    res.json({
      ok: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      supplierName: canonicalName,
    });
  });

  app.get("/api/invoices/:id", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const id = String(req.params.id ?? "");
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid invoice id" });
      return;
    }

    const invoice = await col("invoices").findOne({ _id: new ObjectId(id), user_id: userId } as any) as InvoiceRow | null;
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const documentId = String(invoice.document_id ?? "");
    const doc = ObjectId.isValid(documentId)
      ? await col("documents").findOne({ _id: new ObjectId(documentId), user_id: userId } as any, { projection: { raw_text: 0 } } as any) as InvoiceRow | null
      : null;
    const gmailImport = documentId
      ? await col("gmail_imports").findOne({
          user_id: userId,
          "files.document_id": documentId,
        } as any, { projection: { subject: 1, imported_at: 1 } } as any) as InvoiceRow | null
      : null;

    const providers = await loadGmailSearchProviders();
    res.json(presentInvoice(invoice, doc ?? undefined, gmailImport ?? undefined, providers));
  });

  app.put("/api/invoices/:id", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const id = String(req.params.id ?? "");
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid invoice id" });
      return;
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    const status = String(req.body?.status ?? "").trim();
    if (status) {
      if (!INVOICE_STATUSES.has(status)) {
        res.status(400).json({ error: "Invalid invoice status" });
        return;
      }
      updates.status = status;
    }

    const business = stringOrNull(req.body?.business);
    if (business !== undefined) updates.business = business;
    const clientName = stringOrNull(req.body?.client_name);
    if (clientName !== undefined) {
      updates.client_company = clientName;
      updates.client_name = clientName;
      updates["fields.client_company"] = clientName;
      updates["fields.client_name"] = clientName;
    }
    const expenseCategory = stringOrNull(req.body?.expense_category);
    if (expenseCategory !== undefined) updates.expense_category = expenseCategory;
    const paymentStatus = stringOrNull(req.body?.payment_status);
    if (paymentStatus !== undefined) updates.payment_status = paymentStatus;
    const currency = stringOrNull(req.body?.currency);
    if (currency !== undefined) updates.currency = normalizeCurrencyCode(currency);
    const issueDate = dateStringOrNull(req.body?.issue_date);
    if (issueDate !== undefined) updates.issue_date = issueDate;
    const paymentDueDate = dateStringOrNull(req.body?.payment_due_date);
    if (paymentDueDate !== undefined) updates.payment_due_date = paymentDueDate;
    const note = stringOrNull(req.body?.note);
    if (note !== undefined) updates.note = note;

    const result = await col("invoices").findOneAndUpdate(
      { _id: new ObjectId(id), user_id: userId } as any,
      { $set: updates } as any,
      { returnDocument: "after" } as any,
    ) as InvoiceRow | null;
    if (!result) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const documentId = String(result.document_id ?? "");
    const doc = ObjectId.isValid(documentId)
      ? await col("documents").findOne({ _id: new ObjectId(documentId), user_id: userId } as any, { projection: { raw_text: 0 } } as any) as InvoiceRow | null
      : null;
    const providers = await loadGmailSearchProviders();
    res.json(presentInvoice(result, doc ?? undefined, undefined, providers));
  });
}

function presentInvoice(
  invoice: InvoiceRow,
  doc?: InvoiceRow,
  gmailImport?: InvoiceRow,
  providers: GmailSearchProvider[] = [],
) {
  const documentId = String(invoice.document_id ?? "");
  const amount = typeof invoice.amount === "number" ? invoice.amount : parseAmount(invoice.amount);
  const currency = normalizeCurrencyCode(invoice.currency);
  const provider = matchGmailSearchProvider([
    invoice.supplier_name,
    invoice.supplier_id,
    invoice.fields?.supplier_name,
    invoice.fields?.vendor_name,
    invoice.fields?.counterparty,
    invoice.fields?.issuer_name,
    invoice.fields?.company_name,
    invoice.customer_number,
    invoice.account_number,
    invoice.service_address,
    gmailImport?.subject,
    doc?.source_subject,
    doc?.source_email,
    doc?.file_name,
  ].join(" "), providers);
  return {
    id: invoice._id?.toString?.() ?? String(invoice._id),
    document_id: documentId || null,
    supplier_name: invoice.supplier_name ?? "ספק לא מזוהה",
    supplier_id: invoice.supplier_id ?? null,
    invoice_number: invoice.invoice_number ?? null,
    type: invoice.document_subtype ?? invoice.template_name ?? "חשבונית",
    customer_number: invoice.customer_number ?? null,
    account_number: invoice.account_number ?? null,
    service_address: invoice.service_address ?? null,
    issue_date: invoice.issue_date ?? null,
    payment_due_date: invoice.payment_due_date ?? null,
    billing_period: invoice.billing_period ?? null,
    amount,
    amount_display: formatAmount(amount, currency),
    currency,
    client_name: invoice.client_company ?? invoice.client_name ?? invoice.fields?.client_company ?? invoice.fields?.client_name ?? null,
    business: invoice.business ?? invoice.fields?.business ?? invoice.fields?.business_name ?? null,
    expense_category: invoice.expense_category ?? invoice.fields?.expense_category ?? null,
    provider_id: provider?.id ?? null,
    provider_label: provider?.label ?? null,
    provider_category: provider?.category ?? null,
    payment_status: invoice.payment_status ?? null,
    note: invoice.note ?? null,
    status: normalizeInvoiceStatus(invoice.status),
    possible_not_invoice: Boolean(invoice.possible_not_invoice),
    invoice_validation_status: invoice.invoice_validation_status ?? null,
    missing_required_fields: Array.isArray(invoice.missing_required_fields) ? invoice.missing_required_fields : [],
    file_name: doc?.file_name ?? "",
    mime_type: doc?.mime_type ?? null,
    created_at: invoice.created_at ?? doc?.created_at ?? null,
    import_date: doc?.import_date ?? invoice.created_at ?? null,
    preview_url: documentId ? `/api/documents/${documentId}/download?raw=1` : null,
    thumbnail_url: doc?.thumbnail_key || doc?.thumbnail_path ? `/api/documents/${documentId}/thumbnail` : null,
    download_url: documentId ? `/api/documents/${documentId}/download?dl=1` : null,
    source_subject: gmailImport?.subject ?? doc?.source_subject ?? null,
    source_email: doc?.source_email ?? null,
    fields: invoice.fields ?? {},
  };
}

function firstString(fields: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!fields) return null;
  for (const key of keys) {
    const value = fields[key];
    if (value === undefined || value === null || value === "") continue;
    return String(value).trim() || null;
  }
  return null;
}

function matchGmailSearchProvider(text: string, providers: GmailSearchProvider[]): GmailSearchProvider | null {
  const haystack = normalize(text);
  if (!haystack) return null;
  let best: GmailSearchProvider | null = null;
  let bestScore = 0;
  for (const provider of providers) {
    const terms = [provider.label, ...provider.terms]
      .map((term) => normalize(term))
      .filter((term) => term.length >= 2);
    for (const term of terms) {
      if (!haystack.includes(term)) continue;
      if (term.length > bestScore) {
        best = provider;
        bestScore = term.length;
      }
    }
  }
  return best;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function parseDateTs(value: unknown, endOfDay = false): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return null;
  const date = new Date(ts);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function parseMultiQuery(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [value];
  const parsed: string[] = [];
  for (const raw of rawValues) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    if (text.startsWith("[")) {
      try {
        const json = JSON.parse(text);
        if (Array.isArray(json)) {
          parsed.push(...json.map((item) => String(item ?? "")));
          continue;
        }
      } catch {
        // Fall through to delimiter parsing.
      }
    }
    parsed.push(...text.split("||"));
  }
  return uniqueSorted(parsed);
}

function invoiceDateTs(row: ReturnType<typeof presentInvoice>): number | null {
  return parseDateTs(row.issue_date ?? row.import_date);
}

function invoiceMatchesQuery(row: ReturnType<typeof presentInvoice>, q: string): boolean {
  return normalize([
    row.supplier_name,
    row.provider_label,
    row.provider_category,
    row.invoice_number,
    row.type,
    row.amount_display,
    row.file_name,
    row.service_address,
    row.customer_number,
  ].join(" ")).includes(q);
}

function normalizeInvoiceStatus(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (INVOICE_STATUSES.has(raw)) return raw;
  if (!raw || raw === "done") return "new";
  return raw;
}

function invoiceListVisibleLimit(role: string | null | undefined): number | null {
  return documentImportMonthlyLimit(role);
}

function stringOrNull(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function dateStringOrNull(value: unknown): string | null | undefined {
  const text = stringOrNull(value);
  if (text === undefined || text === null) return text;
  const ts = Date.parse(text);
  if (!Number.isFinite(ts)) return text;
  return new Date(ts).toISOString().slice(0, 10);
}

function parseAmount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/[₪$€£,\s]/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAmount(amount: number | null, currency: string): string {
  if (amount === null) return "—";
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount}`;
  }
}

function normalizeCurrencyCode(value: unknown): string {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text || /₪|ש"?ח|שקל|NIS|ILS/.test(text)) return "ILS";
  if (/\$|USD|DOLLAR/.test(text)) return "USD";
  if (/€|EUR/.test(text)) return "EUR";
  if (/£|GBP/.test(text)) return "GBP";
  return /^[A-Z]{3}$/.test(text) ? text : "ILS";
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "he"));
}
