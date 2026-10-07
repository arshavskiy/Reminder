import {saveSupplierCategory} from "../invoices/supplierCategories.js";
import express from "express";
import ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import { col } from "../db/db";
import { HTTPException, requireAuth } from "../auth/middleware";
import { documentImportMonthlyLimit } from "../quotas/documentImportQuota";
import {effectivePlanId, featureFlagsForUser, PLAN_GATE_MESSAGES} from "../plans/tierFeatures";
import { loadGmailSearchProviders, type GmailSearchProvider } from "../gmail/searchProviders";
import {
  categoryFacetRows,
  categoryFacetValues,
  matchesCategoryFilter,
  normalizeProviderCategory,
  supplierFacetRows,
  supplierFacetValues,
} from "../invoices/expenseFacets";
import { inferInvoiceCashFlow, normalizeCashFlow, resolveVatAmount } from "../invoices/cashFlow";
import { matchesExpenseProofFilter, normalizeExpenseProofFilter } from "../invoices/documentProof";
import {sendEmailWithAttachments} from "../reminders/emailSender";
import { toIlsMany } from "../invoices/fxRates";
import { invoiceIsPayable, selectDueInRange, selectDueSoon } from "../invoices/dueSoon";
import { invoiceDocumentCategory, type InvoiceDocumentCategory } from "../invoices/documentCategory";
import { hasActivePair, roleOf, toPairRow } from "../invoices/pairing";
import { linkPair, scanPairs, unlinkPair } from "../invoices/pairingStore";

type InvoiceRow = Record<string, any>;
const INVOICE_STATUSES = new Set(["new", "reviewed", "outgoing", "archived"]);
const REJECTED_INVOICE_VALIDATION_STATUSES = new Set([
  "missing_invoice_number_and_amount",
  "missing_required_fields",
  "not_invoice",
  "rejected",
]);

export function registerInvoiceRoutes(app: express.Application) {
  app.get("/api/invoices", async (req, res) => {
    let userId: string;
    let userPlan: string | null | undefined;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
        userPlan = effectivePlanId(ctx.user);
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const exportRequested = String(req.query.export ?? "") === "true" || String(req.query.export ?? "") === "1";
    if (exportRequested) {
      const dbUser = await col("users").findOne({ _id: new ObjectId(userId) }) as any;
      if (!featureFlagsForUser(dbUser ?? { plan: userPlan }).excelExport) {
        res.status(403).json({ error: "excel_export_plan_required", message: PLAN_GATE_MESSAGES.excelExport });
        return;
      }
    }

    const limit = clampInt(req.query.limit, 50, 1, 500);
    const offset = clampInt(req.query.offset, 0, 0, 100_000);
    const q = normalize(String(req.query.q ?? ""));
    const status = String(req.query.status ?? "").trim();
    const documentCategory = normalizeInvoiceDocumentCategory(req.query.documentCategory);
    const type = String(req.query.type ?? "").trim();
    const cashFlow = normalizeCashFlow(req.query.cashFlow);
    const category = String(req.query.category ?? "").trim();
    const currency = String(req.query.currency ?? "").trim().toUpperCase();
    const suppliers = parseMultiQuery(req.query.supplier);
    const duplicatesOnly = String(req.query.duplicatesOnly ?? "") === "1";
    // Unpaid invoices that have a payment date: the "to pay" view.
    const unpaidOnly = String(req.query.unpaidOnly ?? "") === "1";
    const sortBy = normalizeInvoiceSortBy(req.query.sortBy);
    const sortDir = normalizeSortDir(req.query.sortDir);
    const fromTs = parseDateTs(req.query.dateFrom);
    const toTs = parseDateTs(req.query.dateTo, true);

    const invoices = await col("invoices")
      .find({ user_id: userId } as any, { projection: { preview_html: 0 } } as any)
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
    const eligibleInvoices = invoices.filter((invoice) => invoiceIsVisible(invoice, documentMap.get(String(invoice.document_id))));
    const allRows = eligibleInvoices.map((invoice) => presentInvoice(invoice, documentMap.get(String(invoice.document_id)), undefined, providers));
    await enrichAmountIls(allRows);
    const facetRows = allRows.filter((row) => {
      if (type && row.type !== type) return false;
      if (cashFlow && row.cash_flow !== cashFlow) return false;
      if (category && !matchesCategoryFilter(row.provider_category, category)) return false;
      if (currency && String(row.currency ?? "").toUpperCase() !== currency) return false;
      if (suppliers.length && !invoiceMatchesSuppliers(row, suppliers)) return false;
      const rowTs = invoiceDateTs(row);
      if (fromTs && (!rowTs || rowTs < fromTs)) return false;
      if (toTs && (!rowTs || rowTs > toTs)) return false;
      if (!q) return true;
      return invoiceMatchesQuery(row, q);
    });
    const duplicateIds = findDuplicateIds(facetRows);
    const rows = facetRows
      .filter((row) => {
        if (status && row.status !== status) return false;
        if (documentCategory && row.document_category !== documentCategory) return false;
        if (duplicatesOnly && !duplicateIds.has(row.id)) return false;
        if (unpaidOnly && !rowIsUnpaidWithDueDate(row)) return false;
        return true;
      })
      .sort((left, right) => compareInvoiceRows(left, right, sortBy, sortDir));

    const visibleLimit = invoiceListVisibleLimit(userPlan);
    const visibleRows = visibleLimit === null ? rows : rows.slice(0, visibleLimit);
    const visibleFacetRows = visibleLimit === null ? facetRows : facetRows.slice(0, visibleLimit);
    const safeOffset = visibleLimit === null ? offset : Math.min(offset, visibleLimit);
    const counts: Record<string, number> = {};
    for (const row of visibleFacetRows) counts[row.status] = (counts[row.status] ?? 0) + 1;

    res.json({
      rows: visibleRows.slice(safeOffset, safeOffset + limit),
      total: visibleRows.length,
      totalAll: visibleFacetRows.length,
      limit,
      offset: safeOffset,
      visibleLimit,
      counts,
      duplicatesCount: duplicateIds.size,
      unpaidDueCount: visibleFacetRows.filter(rowIsUnpaidWithDueDate).length,
      documentCategoryCounts: countBy(visibleFacetRows, (row) => row.document_category),
      types: uniqueSorted(visibleFacetRows.map((row) => row.type).filter(isNonEmptyString)),
      categories: uniqueSorted(visibleFacetRows.map((row) => row.provider_category ?? "").filter(isNonEmptyString)),
      suppliers: uniqueSorted(visibleFacetRows.map((row) => row.supplier_name).filter(isNonEmptyString)),
      // Every currency the user has, so the filter still offers the others once one is picked.
      currencies: uniqueSorted(allRows.map((row) => String(row.currency ?? "").toUpperCase()).filter(isNonEmptyString)),
    });
  });

  // ── Invoice <-> receipt pairing ─────────────────────────────────────────────
  // POST /api/invoices/pairs/scan — look for counterparts of every unpaired receipt.
  app.post("/api/invoices/pairs/scan", async (req, res) => {
    const userId = await pairingUserId(req, res);
    if (!userId) return;
    res.json(await scanPairs(userId));
  });

  // POST /api/invoices/:id/pair { with } — confirm a pair by hand (overrides the matcher).
  app.post("/api/invoices/:id/pair", async (req, res) => {
    const userId = await pairingUserId(req, res);
    if (!userId) return;
    const id = String(req.params.id ?? "");
    const other = String(req.body?.with ?? "");
    if (!ObjectId.isValid(id) || !ObjectId.isValid(other) || id === other) {
      res.status(400).json({ error: "invalid_pair" });
      return;
    }
    const rows = await col("invoices").find({ _id: { $in: [new ObjectId(id), new ObjectId(other)] }, user_id: userId } as any, { projection: { preview_html: 0 } } as any).toArray() as InvoiceRow[];
    if (rows.length !== 2) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    const roles = rows.map((row) => toPairRow(row).role).sort();
    if (roles[0] !== "invoice" || roles[1] !== "receipt") {
      res.status(400).json({ error: "pair_needs_invoice_and_receipt" });
      return;
    }
    // Free either side from an earlier pair first, so nothing is left pointing at a stale partner.
    for (const row of rows) if (row.paired_with) await unlinkPair(userId, String(row._id));
    await linkPair(userId, id, other, "confirmed");
    res.json({ ok: true, paired_with: other });
  });

  // DELETE /api/invoices/:id/pair — break a wrong pair; the matcher will not re-link the two.
  app.delete("/api/invoices/:id/pair", async (req, res) => {
    const userId = await pairingUserId(req, res);
    if (!userId) return;
    const id = String(req.params.id ?? "");
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid invoice id" });
      return;
    }
    const result = await unlinkPair(userId, id);
    if (!result.ok) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    res.json({ ok: true, unpaired: result.partner });
  });

  // Unpaid invoices due soon (or just overdue) for the dashboard. Registered
  // before /api/invoices/:id so "due-soon" is not read as an id.
  app.get("/api/invoices/due-soon", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }
    const days = clampInt(req.query.days, 14, 1, 90);
    // Calendar mode: ?from=YYYY-MM-DD&to=YYYY-MM-DD lists every unpaid invoice due in that range.
    const rangeFrom = isoDateParam(req.query.from);
    const rangeTo = isoDateParam(req.query.to);
    const rangeMode = Boolean(rangeFrom && rangeTo);
    const invoices = await col("invoices")
      .find({ user_id: userId, payment_due_date: { $nin: [null, ""] } } as any, { projection: { preview_html: 0 } } as any)
      .sort({ payment_due_date: 1 } as any)
      .limit(500)
      .toArray() as InvoiceRow[];
    const documentIds = [...new Set(invoices.map((invoice) => String(invoice.document_id ?? "")).filter(ObjectId.isValid))];
    const documents = documentIds.length
      ? await col("documents")
        .find({ _id: { $in: documentIds.map((id) => new ObjectId(id)) }, user_id: userId } as any, { projection: { raw_text: 0 } } as any)
        .toArray() as InvoiceRow[]
      : [];
    const documentMap = new Map(documents.map((doc) => [doc._id.toString(), doc]));
    const providers = await loadGmailSearchProviders();
    const rows = invoices
      .filter((invoice) => invoiceIsVisible(invoice, documentMap.get(String(invoice.document_id))))
      .map((invoice) => presentInvoice(invoice, documentMap.get(String(invoice.document_id)), undefined, providers))
      .map((row: any) => ({ ...row, payment_due_date: isoDate(row.payment_due_date) }));
    const today = new Date().toISOString().slice(0, 10);
    const picked = rangeMode
      ? selectDueInRange(rows as any[], rangeFrom!, rangeTo!, today).slice(0, 200)
      : selectDueSoon(rows as any[], today, days).slice(0, 20);
    const items = picked.map((row: any) => ({
      id: row.id,
      supplier_name: row.supplier_name,
      amount_display: row.amount_display,
      currency: row.currency,
      payment_due_date: row.payment_due_date,
      daysLeft: row.daysLeft,
      document_category: row.document_category,
    }));
    res.json(rangeMode ? { items, from: rangeFrom, to: rangeTo } : { items, days });
  });

  app.get("/api/invoices/expenses/monthly", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const dateBasis = String(req.query.dateBasis ?? "").trim() === "import" ? "import" : "invoice";
    const category = String(req.query.category ?? "").trim();
    const suppliers = parseMultiQuery(req.query.supplier);
    const fromTs = parseDateTs(req.query.dateFrom);
    const toTs = parseDateTs(req.query.dateTo, true);
    const top = clampInt(req.query.top, 8, 1, 20);
    const proofFilter = normalizeExpenseProofFilter(req.query.proofFilter);

    const invoices = await col("invoices")
      .find({ user_id: userId } as any, { projection: { preview_html: 0 } } as any)
      .sort({ issue_date: -1, created_at: -1 } as any)
      .limit(5000)
      .toArray() as InvoiceRow[];

    const documentIds = [...new Set(invoices.map((invoice) => String(invoice.document_id ?? "")).filter(ObjectId.isValid))];
    const documents = documentIds.length
      ? await col("documents")
        .find({ _id: { $in: documentIds.map((id) => new ObjectId(id)) }, user_id: userId } as any, { projection: { raw_text: 0 } } as any)
        .toArray() as InvoiceRow[]
      : [];
    const documentMap = new Map(documents.map((doc) => [doc._id.toString(), doc]));
    const providers = await loadGmailSearchProviders();
    const expenseRows = invoices
      .filter((invoice) => invoiceIsVisible(invoice, documentMap.get(String(invoice.document_id))))
      .map((invoice) => presentInvoice(invoice, documentMap.get(String(invoice.document_id)), undefined, providers))
      .filter((row) => {
        const wantIncome = proofFilter === "income";
        if (wantIncome ? row.cash_flow !== "income" : row.cash_flow === "income") return false;
        if (!wantIncome && !matchesExpenseProofFilter(row.type, proofFilter)) return false;
        // The receipt counts, not the invoice it settled, so one payment is not summed twice.
        if (!wantIncome && proofFilter !== "requested" && row.pair_role === "invoice" && hasActivePair({ pairedWith: row.paired_with, pairStatus: row.pair_status })) return false;
        const rowTs = chartDateTs(row, dateBasis);
        if (fromTs && (!rowTs || rowTs < fromTs)) return false;
        if (toTs && (!rowTs || rowTs > toTs)) return false;
        return Boolean(rowTs) && typeof row.amount === "number" && Number.isFinite(row.amount);
      });
    await enrichAmountIls(expenseRows);

    // Facet options must not be narrowed by the facet they populate, or the
    // active selection becomes the only option the user can ever pick.
    const categoryOptionRows = categoryFacetRows(expenseRows, suppliers);
    const supplierOptionRows = supplierFacetRows(expenseRows, category);

    const rows = expenseRows.filter((row) => {
      if (category && !matchesCategoryFilter(row.provider_category, category)) return false;
      if (suppliers.length && !suppliers.includes(row.supplier_name)) return false;
      return true;
    });

    const monthSet = new Set<string>();
    const totals = new Map<string, number>();
    const counts = new Map<string, number>();
    const buckets = new Map<string, Map<string, { total: number; count: number }>>();
    const categoryTotals = new Map<string, { total: number; count: number }>();
    const categorySupplierTotals = new Map<string, Map<string, { total: number; count: number }>>();
    for (const row of rows) {
      const month = chartMonth(row, dateBasis);
      if (!month) continue;
      const supplier = row.supplier_name || "ספק לא מזוהה";
      const amount = row.amount_ils ?? row.amount ?? 0;
      const categoryKey = row.provider_category || "general";
      monthSet.add(month);
      totals.set(supplier, (totals.get(supplier) ?? 0) + amount);
      counts.set(supplier, (counts.get(supplier) ?? 0) + 1);
      if (!buckets.has(supplier)) buckets.set(supplier, new Map());
      const supplierBuckets = buckets.get(supplier)!;
      const current = supplierBuckets.get(month) ?? { total: 0, count: 0 };
      current.total += amount;
      current.count += 1;
      supplierBuckets.set(month, current);

      const categoryAgg = categoryTotals.get(categoryKey) ?? { total: 0, count: 0 };
      categoryAgg.total += amount;
      categoryAgg.count += 1;
      categoryTotals.set(categoryKey, categoryAgg);
      if (!categorySupplierTotals.has(categoryKey)) categorySupplierTotals.set(categoryKey, new Map());
      const bySupplier = categorySupplierTotals.get(categoryKey)!;
      const supplierAgg = bySupplier.get(supplier) ?? { total: 0, count: 0 };
      supplierAgg.total += amount;
      supplierAgg.count += 1;
      bySupplier.set(supplier, supplierAgg);
    }

    const months = [...monthSet].sort();
    const supplierTotals = [...totals.entries()]
      .map(([name, total]) => ({
        name,
        total: roundMoney(total),
        count: counts.get(name) ?? 0,
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "he", { sensitivity: "base" }));
    const selectedSuppliers = suppliers.length ? suppliers : supplierTotals.slice(0, top).map((item) => item.name);
    const series: Array<{
      supplier: string;
      total: number;
      isOther?: boolean;
      points: { month: string; total: number; count: number }[];
    }> = selectedSuppliers.map((supplier) => {
      const supplierBuckets = buckets.get(supplier) ?? new Map();
      return {
        supplier,
        total: roundMoney(totals.get(supplier) ?? 0),
        points: months.map((month) => ({
          month,
          total: roundMoney(supplierBuckets.get(month)?.total ?? 0),
          count: supplierBuckets.get(month)?.count ?? 0,
        })),
      };
    });
    if (!suppliers.length) {
      const named = new Set(selectedSuppliers);
      const otherPoints = months.map((month) => {
        let total = 0;
        let count = 0;
        for (const [name, supplierBuckets] of buckets) {
          if (named.has(name)) continue;
          const bucket = supplierBuckets.get(month);
          if (!bucket) continue;
          total += bucket.total;
          count += bucket.count;
        }
        return { month, total: roundMoney(total), count };
      });
      const otherTotal = roundMoney(otherPoints.reduce((sum, point) => sum + point.total, 0));
      if (otherTotal > 0) {
        series.push({
          supplier: "אחרים",
          total: otherTotal,
          isOther: true,
          points: otherPoints,
        });
      }
    }

    const categorySeries = [...categoryTotals.entries()]
      .map(([categoryKey, agg]) => ({
        category: categoryKey,
        total: roundMoney(agg.total),
        count: agg.count,
        suppliers: [...(categorySupplierTotals.get(categoryKey)?.entries() ?? [])]
          .map(([name, supplierAgg]) => ({
            name,
            total: roundMoney(supplierAgg.total),
            count: supplierAgg.count,
          }))
          .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "he", { sensitivity: "base" })),
      }))
      .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, "he", { sensitivity: "base" }));

    res.json({
      dateBasis,
      proofFilter,
      months,
      totalInvoices: rows.length,
      totalAmount: roundMoney(rows.reduce((sum, row) => sum + (row.amount_ils ?? row.amount ?? 0), 0)),
      suppliers: supplierTotals,
      // Same reasoning as `categories`: not narrowed by the supplier filter.
      supplierNames: supplierFacetValues(supplierOptionRows),
      // Built from rows not narrowed by the category filter, so selecting a
      // category never removes the other categories from the dropdown.
      categories: categoryFacetValues(categoryOptionRows),
      categorySeries,
      series,
    });
  });

  // GET /api/invoices/recurring — detect likely recurring / subscription payments.
  // Groups invoices by supplier and flags those with 3+ occurrences across distinct months
  // with a consistent amount (within 15% of the median).
  app.get("/api/invoices/recurring", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }
    const fromTs = parseDateTs(req.query.dateFrom);
    const toTs = parseDateTs(req.query.dateTo, true);
    const invoices = await col("invoices")
      .find({ user_id: userId } as any, { projection: { supplier_name: 1, amount: 1, currency: 1, issue_date: 1, provider_category: 1, cash_flow: 1, pair_role: 1 } } as any)
      .toArray() as InvoiceRow[];

    const groups = new Map<string, { amount: number; month: string; date: string; category: string }[]>();
    for (const inv of invoices) {
      const supplier = (inv.supplier_name ?? "").trim();
      if (!supplier) continue;
      const amount = typeof inv.amount === "number" ? inv.amount : null;
      if (amount === null || amount <= 0) continue;
      const cashFlow = normalizeCashFlow(inferInvoiceCashFlow(inv));
      if (cashFlow === "income") continue;
      const dateStr = inv.issue_date ? String(inv.issue_date).slice(0, 10) : null;
      if (!dateStr) continue;
      const ts = new Date(dateStr).getTime();
      if (fromTs && ts < fromTs) continue;
      if (toTs && ts > toTs) continue;
      const month = dateStr.slice(0, 7);
      if (!groups.has(supplier)) groups.set(supplier, []);
      groups.get(supplier)!.push({ amount, month, date: dateStr, category: inv.provider_category ?? "general" });
    }

    const results: {
      supplier: string; category: string; occurrences: number; months_active: number;
      avg_amount: number; min_amount: number; max_amount: number; last_date: string;
      amount_stable: boolean;
    }[] = [];

    for (const [supplier, entries] of groups) {
      if (entries.length < 3) continue;
      const distinctMonths = new Set(entries.map((e) => e.month));
      if (distinctMonths.size < 2) continue;
      const amounts = entries.map((e) => e.amount).sort((a, b) => a - b);
      const median = amounts[Math.floor(amounts.length / 2)];
      const minAmt = amounts[0];
      const maxAmt = amounts[amounts.length - 1];
      const spread = median > 0 ? (maxAmt - minAmt) / median : 1;
      const avg = roundMoney(amounts.reduce((s, a) => s + a, 0) / amounts.length);
      const lastDate = entries.map((e) => e.date).sort().at(-1)!;
      const catFreq = new Map<string, number>();
      for (const e of entries) catFreq.set(e.category, (catFreq.get(e.category) ?? 0) + 1);
      const category = [...catFreq.entries()].sort((a, b) => b[1] - a[1])[0][0];
      results.push({
        supplier, category,
        occurrences: entries.length,
        months_active: distinctMonths.size,
        avg_amount: avg,
        min_amount: roundMoney(minAmt),
        max_amount: roundMoney(maxAmt),
        last_date: lastDate,
        amount_stable: spread <= 0.15,
      });
    }

    results.sort((a, b) => b.occurrences - a.occurrences || b.avg_amount - a.avg_amount);
    res.json({ items: results, total: results.length });
  });

  // GET /api/invoices/missing-receipts — invoices that have no paired receipt.
  app.get("/api/invoices/missing-receipts", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }
    const fromTs = parseDateTs(req.query.dateFrom);
    const toTs = parseDateTs(req.query.dateTo, true);
    const limit = clampInt(req.query.limit, 50, 1, 200);
    const invoices = await col("invoices")
      .find({ user_id: userId } as any, { projection: { supplier_name: 1, amount: 1, currency: 1, issue_date: 1, document_subtype: 1, provider_category: 1, status: 1, paired_with: 1, pair_status: 1 } } as any)
      .sort({ issue_date: -1 } as any)
      .limit(2000)
      .toArray() as InvoiceRow[];
    const providers = await loadGmailSearchProviders();
    const rows = invoices
      .filter((inv) => {
        if (inv.status === "archived" || inv.status === "rejected") return false;
        const role = roleOf(invoiceDocumentCategory(inv.document_subtype));
        if (role !== "invoice") return false;
        if (hasActivePair({ pairedWith: inv.paired_with ? String(inv.paired_with) : null, pairStatus: inv.pair_status ?? null })) return false;
        const dateStr = inv.issue_date ? String(inv.issue_date).slice(0, 10) : null;
        if (!dateStr) return false;
        const ts = new Date(dateStr).getTime();
        if (fromTs && ts < fromTs) return false;
        if (toTs && ts > toTs) return false;
        return true;
      })
      .slice(0, limit)
      .map((inv) => {
        const supplier = (inv.supplier_name ?? "").trim();
        const gmailQuery = supplier
          ? `from:(${supplier}) קבלה OR receipt OR payment`
          : "קבלה OR receipt OR payment";
        return {
          id: String(inv._id),
          supplier_name: supplier || null,
          amount: typeof inv.amount === "number" ? roundMoney(inv.amount) : null,
          currency: inv.currency ?? "ILS",
          issue_date: inv.issue_date ? String(inv.issue_date).slice(0, 10) : null,
          gmail_search_url: `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(gmailQuery)}`,
        };
      });
    res.json({ items: rows, total: rows.length });
  });

  app.post("/api/invoices/reports/six-months/send", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const user = await col("users").findOne({ _id: new ObjectId(userId) }) as any;
    if (!featureFlagsForUser(user).excelExport) {
      res.status(403).json({ error: "excel_export_plan_required", message: PLAN_GATE_MESSAGES.excelExport });
      return;
    }

    const recipients = uniqueEmails(
      Array.isArray(req.body?.recipients)
        ? req.body.recipients
        : [user?.email],
    );
    if (!recipients.length) {
      res.status(400).json({ error: "missing_report_recipient" });
      return;
    }

    const period = lastSixMonthPeriod();
    const invoices = await col("invoices")
      .find({ user_id: userId } as any, { projection: { preview_html: 0 } } as any)
      .sort({ issue_date: -1, created_at: -1 } as any)
      .limit(5000)
      .toArray() as InvoiceRow[];

    const documentIds = [...new Set(invoices.map((invoice) => String(invoice.document_id ?? "")).filter(ObjectId.isValid))];
    const documents = documentIds.length
      ? await col("documents")
        .find({ _id: { $in: documentIds.map((id) => new ObjectId(id)) }, user_id: userId } as any, { projection: { raw_text: 0 } } as any)
        .toArray() as InvoiceRow[]
      : [];
    const documentMap = new Map(documents.map((doc) => [doc._id.toString(), doc]));
    const providers = await loadGmailSearchProviders();
    const rows = invoices
      .filter((invoice) => invoiceIsVisible(invoice, documentMap.get(String(invoice.document_id))))
      .map((invoice) => presentInvoice(invoice, documentMap.get(String(invoice.document_id)), undefined, providers))
      .filter((row) => {
        const ts = invoiceDateTs(row);
        return ts !== null && ts >= period.from.getTime() && ts <= period.to.getTime();
      })
      .sort((left, right) => compareInvoiceRows(left, right, "date", "desc"));
    await enrichAmountIls(rows);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RemindOCR";
    workbook.created = new Date();
    workbook.views = [{ rightToLeft: true } as any];
    const sheet = workbook.addWorksheet("חשבוניות", { views: [{ rightToLeft: true }] });
    sheet.columns = [
      { header: "ספק", key: "supplier", width: 28 },
      { header: "סטטוס", key: "status", width: 12 },
      { header: "תאריך חשבונית", key: "issueDate", width: 16 },
      { header: "תאריך לתשלום", key: "dueDate", width: 16 },
      { header: "לקוח", key: "client", width: 24 },
      { header: "סוג", key: "type", width: 18 },
      { header: "תנועה", key: "cashFlow", width: 12 },
      { header: "סכום", key: "amount", width: 12 },
      { header: "מטבע", key: "currency", width: 10 },
      { header: "סכום בש\"ח", key: "amountIls", width: 14 },
      { header: "מספר חשבונית", key: "invoiceNumber", width: 20 },
      { header: "מספר לקוח", key: "customerNumber", width: 16 },
      { header: "תקופת חיוב", key: "billingPeriod", width: 24 },
      { header: "קטגוריית ספק", key: "providerCategory", width: 22 },
      { header: "ספק מזוהה", key: "providerLabel", width: 26 },
      { header: "קובץ", key: "fileName", width: 36 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { horizontal: "right", readingOrder: "rtl", wrapText: true };

    for (const row of rows) {
      sheet.addRow({
        supplier: row.supplier_name,
        status: invoiceStatusLabel(row.status),
        issueDate: isoDate(row.issue_date),
        dueDate: isoDate(row.payment_due_date),
        client: invoiceClientLabel(row),
        type: invoiceTypeLabel(row),
        cashFlow: row.cash_flow === "income" ? "הכנסה" : "הוצאה",
        amount: row.amount ?? "",
        currency: row.currency,
        amountIls: row.amount_ils !== null ? roundMoney(row.amount_ils) : "",
        invoiceNumber: row.invoice_number ?? "",
        customerNumber: row.customer_number ?? "",
        billingPeriod: row.billing_period ?? "",
        providerCategory: providerCategoryLabel(row.provider_category),
        providerLabel: row.provider_label ?? "",
        fileName: row.file_name,
      });
    }
    sheet.eachRow((row) => {
      row.alignment = { horizontal: "right", readingOrder: "rtl", wrapText: true };
    });
    sheet.getColumn("amount").numFmt = '#,##0.00';
    sheet.autoFilter = "A1:O1";

    const content = Buffer.from(await workbook.xlsx.writeBuffer());
    const periodLabel = `${isoDate(period.from)} עד ${isoDate(period.to)}`;
    const subject = `דוח חשבוניות 6 חודשים - RemindOCR`;
    const text = `מצורף דוח חשבוניות Excel עבור התקופה ${periodLabel}. מספר רשומות: ${rows.length}.`;
    const html = `<div dir="rtl"><h2>דוח חשבוניות</h2><p>מצורף דוח Excel עבור ששת החודשים האחרונים.</p><p>תקופה: ${escapeHtml(periodLabel)}</p><p>מספר רשומות: ${rows.length}</p></div>`;
    const result = await sendEmailWithAttachments(
      recipients,
      subject,
      text,
      [{
        filename: `invoices-six-months-${isoDate(period.to)}.xlsx`,
        content,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }],
      html,
    );
    if (!result.success) {
      res.status(500).json({ error: result.error ?? "invoice_report_email_failed" });
      return;
    }

    res.json({
      ok: true,
      recipients,
      count: rows.length,
      period: { from: isoDate(period.from), to: isoDate(period.to) },
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

  app.post("/api/invoices/vendors/category", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const supplierName = String(req.body?.supplierName ?? "").trim();
    const providerCategory = stringOrNull(req.body?.provider_category);
    if (!supplierName || providerCategory === undefined) {
      res.status(400).json({ error: "supplierName and provider_category are required" });
      return;
    }
    if (providerCategory !== null && !/^[a-z][a-z0-9_]{0,40}$/.test(providerCategory)) {
      res.status(400).json({ error: "Invalid provider_category" });
      return;
    }

    await saveSupplierCategory(userId, supplierName, providerCategory);
    const now = new Date();
    const result = await col("invoices").updateMany(
      { user_id: userId, supplier_name: supplierName } as any,
      { $set: { provider_category: providerCategory, "fields.provider_category": providerCategory, updated_at: now } } as any,
    );
    res.json({
      ok: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      supplierName,
      provider_category: providerCategory,
    });
  });

  app.post("/api/invoices/delete-selected", async (req, res) => {
    let userId: string;
    try {
      userId = (await requireAuth(req.headers.cookie)).userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const ids = Array.isArray(req.body?.ids)
      ? uniqueSorted(req.body.ids.map((id: unknown) => String(id ?? "").trim()).filter(ObjectId.isValid)).slice(0, 200)
      : [];
    if (!ids.length) {
      res.status(400).json({ error: "No invoice ids selected" });
      return;
    }

    const invoiceObjectIds = ids.map((id) => new ObjectId(id));
    const invoices = await col("invoices")
      .find({ _id: { $in: invoiceObjectIds }, user_id: userId } as any, { projection: { document_id: 1 } } as any)
      .toArray() as InvoiceRow[];
    if (!invoices.length) {
      res.json({ ok: true, requested: ids.length, deleted: 0, documentsDeleted: 0 });
      return;
    }

    const documentIdStrings = uniqueSorted(invoices
      .map((invoice) => String(invoice.document_id ?? "").trim())
      .filter(ObjectId.isValid));
    const documentObjectIds = documentIdStrings.map((id) => new ObjectId(id));
    const documentIdsForLinks = [...documentIdStrings, ...documentObjectIds];

    const deleteResult = await col("invoices").deleteMany({ _id: { $in: invoiceObjectIds }, user_id: userId } as any);
    let documentsDeleted = 0;
    if (documentObjectIds.length) {
      await Promise.all([
        col("extractions").deleteMany({ user_id: userId, document_id: { $in: documentIdsForLinks } } as any),
        col("tasks").deleteMany({ user_id: userId, document_id: { $in: documentIdsForLinks } } as any),
        col("document_clients").deleteMany({ document_id: { $in: documentIdsForLinks } } as any),
        col("timeline_events").deleteMany({ source_type: "document", source_id: { $in: documentIdStrings } } as any),
        col("reminders").deleteMany({ user_id: userId, document_id: { $in: documentIdsForLinks } } as any),
        col("contracts").deleteMany({ user_id: userId, document_id: { $in: documentIdsForLinks } } as any),
        col("equipment").deleteMany({ user_id: userId, document_id: { $in: documentIdsForLinks } } as any),
      ]);
      const docsResult = await col("documents").deleteMany({ _id: { $in: documentObjectIds }, user_id: userId } as any);
      documentsDeleted = docsResult.deletedCount ?? 0;
    }

    res.json({
      ok: true,
      requested: ids.length,
      deleted: deleteResult.deletedCount ?? 0,
      documentsDeleted,
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
    if (!invoiceIsVisible(invoice, doc ?? undefined)) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    const gmailImport = documentId
      ? await col("gmail_imports").findOne({
          user_id: userId,
          "files.document_id": documentId,
        } as any, { projection: { subject: 1, imported_at: 1 } } as any) as InvoiceRow | null
      : null;

    const providers = await loadGmailSearchProviders();
    const presented = presentInvoice(invoice, doc ?? undefined, gmailImport ?? undefined, providers, true);
    await enrichAmountIls([presented]);
    res.json(presented);
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
      const existingInvoice = await col("invoices").findOne(
          {_id: new ObjectId(id), user_id: userId} as any,
          {projection: {document_subtype: 1, template_name: 1, fields: 1}} as any,
      ) as InvoiceRow | null;
      if (!existingInvoice) {
          res.status(404).json({error: "Invoice not found"});
          return;
      }
      const isReceipt = invoiceDocumentCategory(existingInvoice.document_subtype ?? existingInvoice.template_name ?? existingInvoice.fields?.document_subtype) === "receipt";

      const clientName = isReceipt ? null : stringOrNull(req.body?.client_name);
    if (clientName !== undefined) {
      updates.client_company = clientName;
      updates.client_name = clientName;
      updates["fields.client_company"] = clientName;
      updates["fields.client_name"] = clientName;
    }
    const expenseCategory = stringOrNull(req.body?.expense_category);
    if (expenseCategory !== undefined) updates.expense_category = expenseCategory;
    const documentCategory = normalizeInvoiceDocumentCategory(req.body?.document_category);
    if (req.body?.document_category != null && String(req.body.document_category).trim()) {
      if (!documentCategory) {
        res.status(400).json({ error: "Invalid document_category" });
        return;
      }
      const subtype = documentCategorySubtype(documentCategory);
      updates.document_subtype = subtype;
      updates["fields.document_subtype"] = subtype;
    }
    const cashFlow = stringOrNull(req.body?.cash_flow);
    if (cashFlow !== undefined) {
      const normalized = cashFlow === null ? null : normalizeCashFlow(cashFlow);
      if (cashFlow !== null && !normalized) {
        res.status(400).json({ error: "Invalid cash_flow" });
        return;
      }
      updates.cash_flow = normalized;
    }
    const providerCategory = stringOrNull(req.body?.provider_category);
    if (providerCategory !== undefined) {
      updates.provider_category = providerCategory;
      updates["fields.provider_category"] = providerCategory;
    }
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
    if (!invoiceIsVisible(result, doc ?? undefined)) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    const providers = await loadGmailSearchProviders();
    const presented = presentInvoice(result, doc ?? undefined, undefined, providers, true);
    await enrichAmountIls([presented]);
    res.json(presented);
  });
}

async function pairingUserId(req: express.Request, res: express.Response): Promise<string | null> {
  try {
    return (await requireAuth(req.headers.cookie)).userId;
  } catch (e) {
    const err = e as HTTPException;
    res.status(err.status ?? 401).json({ error: err.message });
    return null;
  }
}

function rowIsUnpaidWithDueDate(row: ReturnType<typeof presentInvoice>): boolean {
  return Boolean(isoDate(row.payment_due_date ?? null)) && invoiceIsPayable(row as any);
}

function isoDateParam(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(`${text}T00:00:00Z`)) ? text : null;
}

function invoiceIsVisible(invoice: InvoiceRow, doc?: InvoiceRow): boolean {
  if (invoice.source === "gmail_inline" || invoice.inline_no_file === true) {
    return invoice.possible_not_invoice !== true;
  }
  if (!doc) return false;
  if (invoice.possible_not_invoice === true) return false;
  if (doc.invoice_rejected === true) return false;
  const invoiceValidationStatus = String(invoice.invoice_validation_status ?? "").trim();
  if (invoiceValidationStatus && REJECTED_INVOICE_VALIDATION_STATUSES.has(invoiceValidationStatus)) return false;
  const documentRejectionReason = String(doc.invoice_rejection_reason ?? "").trim();
  if (documentRejectionReason && REJECTED_INVOICE_VALIDATION_STATUSES.has(documentRejectionReason)) return false;
  return true;
}

function presentInvoice(
  invoice: InvoiceRow,
  doc?: InvoiceRow,
  gmailImport?: InvoiceRow,
  providers: GmailSearchProvider[] = [],
  includePreview = false,
) {
  const documentId = String(invoice.document_id ?? "");
  const inlineNoFile = invoice.source === "gmail_inline" || invoice.inline_no_file === true;
  const linkedDocumentId = inlineNoFile || !ObjectId.isValid(documentId) ? "" : documentId;
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
    document_id: linkedDocumentId || null,
    inline_no_file: inlineNoFile,
    supplier_name: invoice.supplier_name ?? "ספק לא מזוהה",
    supplier_id: invoice.supplier_id ?? null,
    invoice_number: invoice.invoice_number ?? null,
    receipt_number: invoice.receipt_number ?? invoice.fields?.receipt_number ?? null,
    type: invoice.document_subtype ?? invoice.template_name ?? "חשבונית",
    document_category: invoiceDocumentCategory(invoice.document_subtype ?? invoice.template_name ?? invoice.fields?.document_subtype),
    customer_number: invoice.customer_number ?? null,
    account_number: invoice.account_number ?? null,
    service_address: invoice.service_address ?? null,
    issue_date: invoice.issue_date ?? null,
    payment_due_date: invoice.payment_due_date ?? null,
    billing_period: invoice.billing_period ?? null,
    amount,
    amount_display: formatAmount(amount, currency),
    amount_ils: currency === "ILS" ? amount : null,
    vat_amount: resolveVatAmount({
      amount,
      currency,
      vat_amount: invoice.vat_amount,
      amount_before_vat: invoice.amount_before_vat,
      fields: invoice.fields,
    }),
    currency,
    cash_flow: inferInvoiceCashFlow({
      cash_flow: invoice.cash_flow,
      document_subtype: invoice.document_subtype,
      type: invoice.template_name,
      provider_id: invoice.provider_id ?? provider?.id,
      provider_category: invoice.provider_category ?? invoice.fields?.provider_category ?? provider?.category,
      notes: invoice.notes ?? invoice.fields?.notes,
      source: invoice.source,
      inline_no_file: invoice.inline_no_file,
      fields: invoice.fields,
    }),
      client_name: invoiceDocumentCategory(invoice.document_subtype ?? invoice.template_name ?? invoice.fields?.document_subtype) === "receipt"
          ? null
          : invoice.client_company ?? invoice.client_name ?? invoice.fields?.client_company ?? invoice.fields?.client_name ?? null,
    business: invoice.business ?? invoice.fields?.business ?? invoice.fields?.business_name ?? null,
    expense_category: invoice.expense_category ?? invoice.fields?.expense_category ?? null,
    provider_id: invoice.provider_id ?? provider?.id ?? null,
    provider_label: invoice.provider_label ?? provider?.label ?? null,
    provider_category: normalizeProviderCategory(invoice.provider_category ?? invoice.fields?.provider_category ?? provider?.category ?? null),
    payment_status: invoice.payment_status ?? null,
    paired_with: invoice.paired_with ? String(invoice.paired_with) : null,
    pair_status: invoice.pair_status ?? null,
    pair_role: roleOf(invoiceDocumentCategory(invoice.document_subtype ?? invoice.template_name ?? invoice.fields?.document_subtype)),
    note: invoice.note ?? null,
    status: normalizeInvoiceStatus(invoice.status),
    possible_not_invoice: Boolean(invoice.possible_not_invoice),
    invoice_validation_status: invoice.invoice_validation_status ?? null,
    invoice_rejection_label: invoice.invoice_rejection_label ?? doc?.invoice_rejection_label ?? null,
    missing_required_fields: Array.isArray(invoice.missing_required_fields) ? invoice.missing_required_fields : [],
    file_name: inlineNoFile ? "" : (doc?.file_name ?? ""),
    mime_type: inlineNoFile ? null : (doc?.mime_type ?? null),
    created_at: invoice.created_at ?? doc?.created_at ?? null,
    import_date: doc?.import_date ?? invoice.created_at ?? null,
    preview_url: linkedDocumentId ? `/api/documents/${linkedDocumentId}/download?raw=1` : null,
    preview_html: includePreview && inlineNoFile ? (typeof invoice.preview_html === "string" ? invoice.preview_html : null) : null,
    thumbnail_url: linkedDocumentId && (doc?.thumbnail_key || doc?.thumbnail_path) ? `/api/documents/${linkedDocumentId}/thumbnail` : null,
    download_url: linkedDocumentId ? `/api/documents/${linkedDocumentId}/download?dl=1` : null,
    in_s3: inlineNoFile ? false : Boolean(invoice.spaces_key || doc?.spaces_key),
    drive_file_id: inlineNoFile ? null : (invoice.drive_file_id || doc?.drive_file_id || null),
    drive_web_link: inlineNoFile ? null : (invoice.drive_web_link || doc?.drive_web_link || null),
    source_subject: invoice.fields?.source_subject ?? gmailImport?.subject ?? doc?.source_subject ?? null,
    source_email: invoice.fields?.source_from ?? doc?.source_email ?? null,
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const INVOICE_DOCUMENT_CATEGORIES: InvoiceDocumentCategory[] = [
  "invoice", "receipt", "bill", "payment_request", "credit_note",
];

function documentCategorySubtype(category: InvoiceDocumentCategory): string {
  switch (category) {
    case "receipt": return "קבלה";
    case "bill": return "חשבון תקופתי";
    case "payment_request": return "דרישת תשלום";
    case "credit_note": return "זיכוי";
    default: return "חשבונית";
  }
}

/** Hebrew + English terms so a category is findable by free-text search. */
function invoiceDocumentCategorySearchTerms(category: unknown): string {
  switch (category) {
    case "receipt": return "קבלה receipt";
    case "bill": return "חשבון תקופתי bill";
    case "payment_request": return "דרישת תשלום payment request";
    case "credit_note": return "זיכוי חשבונית זיכוי credit note";
    default: return "חשבונית invoice";
  }
}

function normalizeInvoiceDocumentCategory(value: unknown): InvoiceDocumentCategory | null {
  const text = String(value ?? "").trim().toLowerCase();
  return (INVOICE_DOCUMENT_CATEGORIES as string[]).includes(text)
    ? text as InvoiceDocumentCategory
    : null;
}

function countBy<T>(rows: T[], keyFn: (row: T) => string | null | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
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

function invoiceMatchesSuppliers(row: ReturnType<typeof presentInvoice>, suppliers: string[]): boolean {
  const wantUnidentified = suppliers.includes("__unidentified__");
  const namedSuppliers = suppliers.filter((supplier) => supplier !== "__unidentified__");
  const isUnidentified = !row.supplier_name || row.supplier_name === "ספק לא מזוהה";
  return (wantUnidentified && isUnidentified) || (namedSuppliers.length > 0 && namedSuppliers.includes(row.supplier_name));
}

function invoiceDateTs(row: ReturnType<typeof presentInvoice>): number | null {
  return parseDateTs(row.issue_date ?? row.import_date);
}

function chartDateTs(row: ReturnType<typeof presentInvoice>, dateBasis: "invoice" | "import"): number | null {
  return parseDateTs(dateBasis === "import" ? row.import_date : row.issue_date ?? row.import_date);
}

function chartMonth(row: ReturnType<typeof presentInvoice>, dateBasis: "invoice" | "import"): string | null {
  const value = dateBasis === "import" ? row.import_date : row.issue_date ?? row.import_date;
  if (!value) return null;
  const ts = Date.parse(String(value));
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString().slice(0, 7);
}

function invoiceMatchesQuery(row: ReturnType<typeof presentInvoice>, q: string): boolean {
  return normalize([
    row.supplier_name,
    row.provider_label,
    row.provider_category,
    row.invoice_number,
    row.receipt_number,
    row.type,
    invoiceDocumentCategorySearchTerms(row.document_category),
    row.cash_flow === "income" ? "הכנסה income" : "הוצאה expense",
    row.amount_display,
    row.file_name,
    row.service_address,
    row.customer_number,
  ].join(" ")).includes(q);
}

type InvoiceSortBy = "supplier" | "status" | "date" | "client" | "category" | "type" | "amount" | "dueDate";
type SortDir = "asc" | "desc";

function normalizeInvoiceSortBy(value: unknown): InvoiceSortBy {
  const raw = String(value ?? "").trim();
  if (raw === "supplier" || raw === "status" || raw === "date" || raw === "client" || raw === "category" || raw === "type" || raw === "amount" || raw === "dueDate") {
    return raw;
  }
  return "date";
}

function normalizeSortDir(value: unknown): SortDir {
  return String(value ?? "").trim().toLowerCase() === "asc" ? "asc" : "desc";
}

function compareInvoiceRows(
  left: ReturnType<typeof presentInvoice>,
  right: ReturnType<typeof presentInvoice>,
  sortBy: InvoiceSortBy,
  sortDir: SortDir,
): number {
  const direction = sortDir === "asc" ? 1 : -1;
  let result = 0;
  if (sortBy === "dueDate") {
    // Rows without a payment date always sort last, whichever way the column is sorted.
    const l = isoDate(left.payment_due_date ?? null);
    const r = isoDate(right.payment_due_date ?? null);
    if (!l && !r) return 0;
    if (!l) return 1;
    if (!r) return -1;
    return l.localeCompare(r) * direction;
  }
  if (sortBy === "amount") {
    result = compareNumber(left.amount_ils ?? left.amount, right.amount_ils ?? right.amount);
  } else if (sortBy === "date") {
    result = compareNumber(invoiceDateTs(left), invoiceDateTs(right));
  } else {
    result = compareText(invoiceSortText(left, sortBy), invoiceSortText(right, sortBy));
  }
  return result * direction || compareNumber(invoiceDateTs(left), invoiceDateTs(right)) * -1;
}

function invoiceSortText(row: ReturnType<typeof presentInvoice>, sortBy: Exclude<InvoiceSortBy, "amount" | "date" | "dueDate">): string {
  if (sortBy === "supplier") return row.supplier_name;
  if (sortBy === "status") return row.status;
  if (sortBy === "client") return row.client_name ?? "";
  if (sortBy === "category") return row.provider_category ?? "";
  return row.type;
}

function compareText(left: string | null | undefined, right: string | null | undefined): number {
  return String(left ?? "").localeCompare(String(right ?? ""), "he", { numeric: true, sensitivity: "base" });
}

function compareNumber(left: number | null | undefined, right: number | null | undefined): number {
  const a = typeof left === "number" && Number.isFinite(left) ? left : Number.NEGATIVE_INFINITY;
  const b = typeof right === "number" && Number.isFinite(right) ? right : Number.NEGATIVE_INFINITY;
  return a - b;
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

// Fills amount_ils for rows in foreign currencies (already set for ILS rows in
// presentInvoice). Mutates rows in place, one rate fetch for the whole batch.
async function enrichAmountIls<T extends { amount: number | null; currency: string; amount_ils: number | null }>(
  rows: T[],
): Promise<T[]> {
  const pending = rows.filter((row) => row.amount_ils === null && row.currency !== "ILS");
  if (!pending.length) return rows;
  const converted = await toIlsMany(pending.map((row) => ({ amount: row.amount, currency: row.currency })));
  pending.forEach((row, i) => {
    row.amount_ils = converted[i];
  });
  return rows;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeCurrencyCode(value: unknown): string {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text || /₪|ש"?ח|שקל|NIS|ILS/.test(text)) return "ILS";
  if (/\$|USD|DOLLAR/.test(text)) return "USD";
  if (/€|EUR/.test(text)) return "EUR";
  if (/£|GBP/.test(text)) return "GBP";
  if (/₽|RUB|RUR|РУБ/.test(text)) return "RUB";
  return /^[A-Z]{3}$/.test(text) ? text : "ILS";
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function findDuplicateIds(rows: ReturnType<typeof presentInvoice>[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    if (row.amount == null || !row.issue_date) continue;
    // An invoice and the receipt that paid it share an amount and date by design.
    if (hasActivePair({ pairedWith: row.paired_with, pairStatus: row.pair_status })) continue;
    const key = `${row.amount}|${row.issue_date}`;
    const group = groups.get(key);
    if (group) group.push(row.id);
    else groups.set(key, [row.id]);
  }
  const ids = new Set<string>();
  for (const group of groups.values()) {
    if (group.length > 1) for (const id of group) ids.add(id);
  }
  return ids;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "he"));
}

function uniqueEmails(values: unknown[]): string[] {
  return [...new Set(values
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))];
}

function lastSixMonthPeriod(): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(now);
  from.setMonth(from.getMonth() - 6);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function isoDate(value: Date | string | null): string {
  if (!value) return "";
  const ts = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : String(value);
}

function invoiceStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: "חדש",
    reviewed: "נבדק",
    outgoing: "יוצא",
    archived: "ארכיון",
    done: "חדש",
  };
  return labels[status] ?? status;
}

function invoiceClientLabel(row: ReturnType<typeof presentInvoice>): string {
  return row.client_name ?? firstString(row.fields, ["client_company", "client_name", "customer_name", "bill_to"]) ?? "";
}

function invoiceTypeLabel(row: ReturnType<typeof presentInvoice>): string {
  if (row.document_category === "receipt") return "קבלה";
  if (row.document_category === "bill") return "חשבון";
  if (row.document_category === "payment_request") return "דרישת תשלום";
  const value = String(row.type || firstString(row.fields, ["document_subtype", "invoice_type", "receipt_type"]) || "").trim();
  const normalized = value.toLowerCase();
  if (/receipt|קבלה/.test(normalized)) return "קבלה";
  if (/order|הזמנה/.test(normalized)) return "אישור הזמנה";
  if (/payment|תשלום/.test(normalized)) return "אישור תשלום";
  return "חשבונית";
}

function providerCategoryLabel(category: string | null): string {
  const labels: Record<string, string> = {
    household: "חשבונות הבית",
    transport: "תחבורה",
    parking: "חניה",
    fuel: "דלק",
    tv: "טלוויזיה וסטרימינג",
    marketplace: "קניות",
    food: "מזון",
    payment: "לא מסווג",
    government: "ממשלה",
    insurance: "ביטוח",
    finance: "פיננסים",
    travel: "תיירות",
    healthcare: "בריאות",
    education: "לימודים",
    retail: "קמעונאות",
    nonprofit: "עמותות",
    digital: "דיגיטל",
    development: "פיתוח",
    general: "כללי",
  };
  return category ? labels[category] ?? category : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
