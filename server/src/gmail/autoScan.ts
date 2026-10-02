// Decisions for the scheduled Gmail scans (daily invoice import, discovery scan),
// kept free of I/O so they can be unit tested. The scheduler does the database and
// Gmail work around them.

export type ScanFrequency = "daily" | "weekly";

export const DEFAULT_DISCOVERY_FREQUENCY: ScanFrequency = "weekly";

/**
 * The scheduler ticks hourly, so a plain 24h interval would drift an hour later each
 * day. 20 hours keeps one scan per calendar day without ever skipping a day.
 */
const DAILY_INTERVAL_DAYS = 20 / 24;
const WEEKLY_INTERVAL_DAYS = 7;

/** How far back a daily invoice scan looks; older mail was covered by earlier scans or a manual import. */
export const INVOICE_SCAN_WINDOW_DAYS = 14;
/** Each run queues a Gmail import job, so cap how many users start one per scheduler tick. */
export const INVOICE_SCAN_USERS_PER_TICK = 3;

export function normalizeScanFrequency(value: unknown, fallback: ScanFrequency = DEFAULT_DISCOVERY_FREQUENCY): ScanFrequency {
  return value === "daily" || value === "weekly" ? value : fallback;
}

export function scanIntervalDays(frequency: ScanFrequency): number {
  return frequency === "daily" ? DAILY_INTERVAL_DAYS : WEEKLY_INTERVAL_DAYS;
}

export function scanDue(lastScanAt: Date | string | null | undefined, now: Date, frequency: ScanFrequency): boolean {
  if (!lastScanAt) return true;
  const last = lastScanAt instanceof Date ? lastScanAt.getTime() : Date.parse(lastScanAt);
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= scanIntervalDays(frequency) * 24 * 60 * 60 * 1000;
}

/**
 * Narrows a Gmail search to the last `days` days. The plan's history window
 * (e.g. 36 months) is replaced, not added to, so the scan stays cheap.
 */
export function limitQueryToRecentDays(query: string, days = INVOICE_SCAN_WINDOW_DAYS): string {
  const withoutWindow = query.replace(/\bnewer_than:\S+/gi, " ").replace(/\s+/g, " ").trim();
  return `${withoutWindow} newer_than:${Math.max(1, Math.floor(days))}d`.trim();
}

/** Short notification text for a finished automatic invoice import. */
export function invoiceImportDigest(imported: number, locale: "he" | "en" = "he"): { title: string; body: string } {
  if (locale === "en") {
    return {
      title: imported === 1 ? "1 new invoice imported from Gmail" : `${imported} new invoices imported from Gmail`,
      body: "Imported by the daily scan.",
    };
  }
  return {
    title: imported === 1 ? "יובאה חשבונית חדשה מ-Gmail" : `יובאו ${imported} חשבוניות חדשות מ-Gmail`,
    body: "יובאו בסריקה היומית.",
  };
}
