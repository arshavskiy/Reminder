import { col } from "../db/db";

export const DOCUMENT_MONTHLY_QUOTA_ERROR = "document_monthly_limit_reached";

export type DocumentImportQuota = {
  role: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  periodStart: Date;
  periodEnd: Date;
};

export class DocumentImportQuotaError extends Error {
  quota: DocumentImportQuota;

  constructor(quota: DocumentImportQuota) {
    super(DOCUMENT_MONTHLY_QUOTA_ERROR);
    this.name = "DocumentImportQuotaError";
    this.quota = quota;
  }
}

export function documentImportMonthlyLimit(role: string | null | undefined): number | null {
  if (role === "admin") return null;
  if (role === "pro") return readPositiveIntEnv("PRO_MONTHLY_DOCUMENT_LIMIT", 100);
  return readPositiveIntEnv("USER_MONTHLY_DOCUMENT_LIMIT", 30);
}

export function currentUtcMonthWindow(now = new Date()): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
}

export async function getDocumentImportQuota(
  userId: string,
  role: string | null | undefined,
  now = new Date(),
): Promise<DocumentImportQuota> {
  const normalizedRole = role ?? "user";
  const limit = documentImportMonthlyLimit(normalizedRole);
  const { periodStart, periodEnd } = currentUtcMonthWindow(now);
  const used = limit === null
    ? 0
    : await col("documents").countDocuments({
        user_id: userId,
        created_at: { $gte: periodStart, $lt: periodEnd },
      } as any);

  return {
    role: normalizedRole,
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
): Promise<DocumentImportQuota> {
  const quota = await getDocumentImportQuota(userId, role);
  if (quota.limit !== null && quota.used + requested > quota.limit) {
    throw new DocumentImportQuotaError(quota);
  }
  return quota;
}

export function documentImportQuotaErrorPayload(error: DocumentImportQuotaError) {
  return {
    error: DOCUMENT_MONTHLY_QUOTA_ERROR,
    limit: error.quota.limit,
    used: error.quota.used,
    remaining: error.quota.remaining,
    periodStart: error.quota.periodStart.toISOString(),
    periodEnd: error.quota.periodEnd.toISOString(),
  };
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}
