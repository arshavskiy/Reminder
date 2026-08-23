import { col } from "../db/db";

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

export type DocumentImportQuotaCategory = "invoices" | "contracts" | "documents";

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
  if (plan === "basic") {
    return {
      limit: category === "contracts"
        ? readPositiveIntEnv("BASIC_MONTHLY_CONTRACT_DOCUMENT_LIMIT", readPositiveIntEnv("PRO_MONTHLY_CONTRACT_DOCUMENT_LIMIT", 40))
        : readPositiveIntEnv("BASIC_MONTHLY_DOCUMENT_LIMIT", readPositiveIntEnv("PRO_MONTHLY_DOCUMENT_LIMIT", 50)),
      scope: "monthly",
    };
  }
  return {
    limit: category === "contracts"
      ? readPositiveIntEnv("FREE_LIFETIME_CONTRACT_DOCUMENT_LIMIT", 20)
      : readPositiveIntEnv("FREE_LIFETIME_DOCUMENT_LIMIT", 25),
    scope: "lifetime",
  };
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
  const { limit, scope } = documentImportLimit(normalizedRole, category);
  const { periodStart, periodEnd } = scope === "monthly"
    ? currentUtcMonthWindow(now)
    : { periodStart: null, periodEnd: null };
  const countFilter = documentQuotaCountFilter(userId, category, scope, periodStart, periodEnd);
  const used = limit === null
    ? 0
    : await col("documents").countDocuments(countFilter as any);

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

export async function assertDocumentImportQuota(
  userId: string,
  role: string | null | undefined,
  requested = 1,
  category: DocumentImportQuotaCategory = "documents",
): Promise<DocumentImportQuota> {
  const quota = await getDocumentImportQuota(userId, role, category);
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

function normalizePlan(role: string | null | undefined): "free" | "basic" | "business" {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "admin" || value === "business") return "business";
  if (value === "pro" || value === "basic") return "basic";
  return "free";
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}
