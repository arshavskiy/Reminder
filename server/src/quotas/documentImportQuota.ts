import { col } from "../db/db";
import { getStoredUserUsage } from "./userUsageCounters";
import {NON_IMPORTED_GENERATED_DOCUMENT_KINDS} from "../documents/documentVisibility";

export const DOCUMENT_MONTHLY_QUOTA_ERROR = "document_monthly_limit_reached";

export type DocumentImportQuota = {
  role: string;
  category: DocumentImportQuotaCategory;
  scope: "monthly" | "lifetime" | "unlimited";
  limit: number | null;
  used: number;
  remaining: number | null;
  periodStart: Date | null;
  periodEnd: Date | null;
};

export type DocumentImportQuotaCategory =
  | "invoices"
  | "contracts"
  | "documents"
  | "manualDocuments"
  | "emailDocuments";

export type DocumentImportSource = "manual" | "email";

export type QuotaTemplateLike = {
    document_kind?: string | null;
    name?: string | null;
} | null | undefined;

export function quotaCategoryFromTemplate(template: QuotaTemplateLike): DocumentImportQuotaCategory {
    if (!template) return "documents";
    if (
        template.document_kind === "contract" ||
        template.document_kind === "inspection_report" ||
        /תסקיר|בדיקה/.test(String(template.name ?? ""))
    ) {
        return "contracts";
    }
    if (
        template.document_kind === "invoice" ||
        /חשבונית|קבלה|invoice|receipt|bill/i.test(String(template.name ?? ""))
    ) {
        return "invoices";
    }
    return "documents";
}

export class DocumentImportQuotaError extends Error {
  quota: DocumentImportQuota;

  constructor(quota: DocumentImportQuota) {
    super(DOCUMENT_MONTHLY_QUOTA_ERROR);
    this.name = "DocumentImportQuotaError";
    this.quota = quota;
  }
}

export function documentImportMonthlyLimit(role: string | null | undefined): number | null {
  return documentImportLimit(role, "invoices").limit;
}

export function documentImportLimit(
  role: string | null | undefined,
  category: DocumentImportQuotaCategory = "documents",
): { limit: number | null; scope: DocumentImportQuota["scope"] } {
  const plan = normalizePlan(role);
  if (plan === "business") return { limit: null, scope: "unlimited" };
  // Digital is the family tier: unlimited monthly imports; history is capped at
  // 12 months back in Gmail (enforced in the Gmail import layer, not here).
  if (plan === "digital") {
    return { limit: null, scope: "unlimited" };
  }
  // Invoices get their own smaller lifetime allowance on trial. They arrive in
  // bulk from a Gmail sync, so without a separate cap a single import would
  // consume the whole document budget and leave no room for the inspections the
  // trial is meant to demonstrate.
    // Ended trial: keep existing files readable, but no new uploads or Gmail imports.
    if (plan === "expired") {
        return {limit: 0, scope: "lifetime"};
  }
    // Active trial: one shared lifetime pool of 20 for upload and Gmail (inspections
    // and receipts together) — the same number the pricing page advertises.
    if (plan === "trial") {
        return {
            limit: readPositiveIntEnv("TRIAL_LIFETIME_DOCUMENT_LIMIT", readPositiveIntEnv("TRIAL_LIFETIME_INVOICE_LIMIT", 20)),
      scope: "lifetime",
    };
  }
  if (plan === "basic") {
    // One shared monthly pool across every category: inspections, contracts and
    // invoices all draw from the same 50, so the plan is "50 documents a month"
    // rather than 50 of each. Every category reports the same limit, which is
    // what makes the shared pool legible in the UI.
    return {
      limit: readPositiveIntEnv("BASIC_MONTHLY_DOCUMENT_LIMIT", readPositiveIntEnv("PRO_MONTHLY_DOCUMENT_LIMIT", 50)),
      scope: "monthly",
    };
  }
  return { limit: null, scope: "unlimited" };
}

export function currentUtcMonthWindow(now = new Date()): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
}

export async function getDocumentImportQuota(
  userId: string,
  role: string | null | undefined,
  category: DocumentImportQuotaCategory = "documents",
  now = new Date(),
): Promise<DocumentImportQuota> {
  const normalizedRole = role ?? "user";
  const plan = normalizePlan(normalizedRole);
  const { limit, scope } = documentImportLimit(normalizedRole, category);
  const { periodStart, periodEnd } = scope === "monthly"
    ? currentUtcMonthWindow(now)
    : { periodStart: null, periodEnd: null };
  let used = 0;
  if (limit !== null) {
    if (scope === "lifetime") {
      // Lifetime usage is stored on the user and never decreases on delete.
      const usage = await getStoredUserUsage(userId);
        if (plan === "trial" || plan === "expired") {
            // One advertised pool of 20 across upload and Gmail (inspections and
            // receipts together). Querying any category reports the same used count.
            used = usage.scannedDocuments + usage.gmailDocuments + usage.gmailInvoices;
        } else if (category === "invoices") {
        used = usage.gmailInvoices;
      } else if (category === "manualDocuments" || category === "emailDocuments") {
        used = usage.scannedDocuments + usage.gmailDocuments + usage.gmailInvoices;
      } else {
        used = usage.documents;
      }
    } else {
      const countFilter = plan === "basic" || plan === "digital"
        ? sharedDocumentQuotaCountFilter(userId, periodStart, periodEnd)
        : documentQuotaCountFilter(userId, category, scope, periodStart, periodEnd);
      used = await col("documents").countDocuments(countFilter as any);
    }
  }

  return {
    role: normalizedRole,
    category,
    scope: limit === null ? "unlimited" : scope,
    limit,
    used,
    remaining: limit === null ? null : Math.max(limit - used, 0),
    periodStart,
    periodEnd,
  };
}

/**
 * The category a request is actually charged against. Free tier collapses every
 * category into the manual/email lifetime buckets, so callers that only want to
 * *report* the quota must ask for the same category enforcement will use, or the
 * UI shows a different limit than the one that blocks the upload.
 */
export function effectiveQuotaCategory(
  role: string | null | undefined,
  category: DocumentImportQuotaCategory = "documents",
  source: DocumentImportSource = "manual",
): DocumentImportQuotaCategory {
  const plan = normalizePlan(role ?? "user");
    // Trial (and a lapsed trial) share one lifetime pool. Keep upload vs Gmail
    // as the reported category so the profile bars stay labeled, but both draw
    // from the same 20-document budget.
  if (plan === "expired" || plan === "trial") {
    return source === "email" ? "emailDocuments" : "manualDocuments";
  }
  // Starter (basic) pools every category into one monthly budget, so report and enforce
  // against a single category rather than the caller's guess.
  if (plan === "basic") return "documents";
  return category;
}

export async function assertDocumentImportQuota(
  userId: string,
  role: string | null | undefined,
  requested = 1,
  category: DocumentImportQuotaCategory = "documents",
  source: DocumentImportSource = "manual",
): Promise<DocumentImportQuota> {
  const effectiveCategory = effectiveQuotaCategory(role, category, source);
  const quota = await getDocumentImportQuota(userId, role, effectiveCategory);
  if (quota.limit !== null && quota.used + requested > quota.limit) {
    throw new DocumentImportQuotaError(quota);
  }
  return quota;
}

export function documentImportQuotaErrorPayload(error: DocumentImportQuotaError) {
  return {
    error: DOCUMENT_MONTHLY_QUOTA_ERROR,
    category: error.quota.category,
    scope: error.quota.scope,
    limit: error.quota.limit,
    used: error.quota.used,
    remaining: error.quota.remaining,
    periodStart: error.quota.periodStart?.toISOString() ?? null,
    periodEnd: error.quota.periodEnd?.toISOString() ?? null,
  };
}

/**
 * Every document the user imported this month, whatever its kind.
 *
 * Mirrors the lapsed tier's shared pool but bounded by the monthly window instead
 * of lifetime. Certificates are excluded here too: they are produced by the app
 * rather than imported, so charging them would bill the user for its own output.
 */
function sharedDocumentQuotaCountFilter(
  userId: string,
  periodStart: Date | null,
  periodEnd: Date | null,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    user_id: userId,
    document_kind: {$nin: NON_IMPORTED_GENERATED_DOCUMENT_KINDS},
  };
  if (periodStart && periodEnd) {
    filter.created_at = { $gte: periodStart, $lt: periodEnd };
  }
  return filter;
}

function documentQuotaCountFilter(
  userId: string,
  category: DocumentImportQuotaCategory,
  scope: DocumentImportQuota["scope"],
  periodStart: Date | null,
  periodEnd: Date | null,
): Record<string, unknown> {
  const filter: Record<string, unknown> = { user_id: userId };
  if (scope === "monthly" && periodStart && periodEnd) {
    filter.created_at = { $gte: periodStart, $lt: periodEnd };
  }
  if (category === "contracts") {
    filter.document_kind = { $in: ["contract", "inspection_report"] };
  } else if (category === "invoices") {
    filter.$or = [
      { document_kind: "invoice" },
      { invoice_saved: true },
      { invoice_rejected: true },
    ];
  }
  return filter;
}

function normalizePlan(role: string | null | undefined): "expired" | "trial" | "digital" | "basic" | "business" {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "admin" || value === "business") return "business";
  if (value === "pro" || value === "basic") return "basic";
  if (value === "digital") return "digital";
  if (value === "trial") return "trial";
  return "expired";
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}
