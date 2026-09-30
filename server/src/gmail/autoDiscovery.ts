// Decisions for the scheduled discovery scan, kept free of I/O so they can be
// unit tested. The scheduler does the database and Gmail work around them.

export const AUTO_SCAN_INTERVAL_DAYS = 7;
export const AUTO_SCAN_HISTORY_MONTHS = 3;
/** Scans are heavy (up to 2,500 messages each); cap how many run per scheduler tick. */
export const AUTO_SCAN_USERS_PER_TICK = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export function autoScanDue(lastScanAt: Date | string | null | undefined, now: Date, intervalDays = AUTO_SCAN_INTERVAL_DAYS): boolean {
  if (!lastScanAt) return true;
  const last = lastScanAt instanceof Date ? lastScanAt.getTime() : Date.parse(lastScanAt);
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= intervalDays * DAY_MS;
}

/** Discoveries found by a scan that were not saved before it. */
export function newDiscoveryIds(existingIds: Iterable<string>, foundIds: Iterable<string>): string[] {
  const known = new Set(existingIds);
  const fresh: string[] = [];
  for (const id of foundIds) {
    if (!known.has(id) && !fresh.includes(id)) fresh.push(id);
  }
  return fresh;
}

export interface DiscoveryDigestItem {
  entity_name: string;
  due_date: string;
}

/** Short notification text; the earliest date leads so the most urgent item is visible. */
export function discoveryDigest(items: DiscoveryDigestItem[], locale: "he" | "en" = "he"): { title: string; body: string } {
  const sorted = [...items].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const first = sorted[0];
  const count = sorted.length;
  if (locale === "en") {
    return {
      title: count === 1 ? "New deadline found in your email" : `${count} new deadlines found in your email`,
      body: first ? `${first.entity_name} · ${first.due_date}` : "",
    };
  }
  return {
    title: count === 1 ? "נמצא מועד חדש בדואר שלך" : `נמצאו ${count} מועדים חדשים בדואר שלך`,
    body: first ? `${first.entity_name} · ${first.due_date}` : "",
  };
}
