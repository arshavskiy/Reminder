/**
 * Recipient rules for monthly reports sent to the app account (not to clients).
 *
 * - If `monthly_report_recipients` is set → those addresses only
 * - If empty → the signed-in app user's email only
 * - Client emails are never added here (use sendMonthlyReportsPerClient for that)
 */

export function parseRecipientList(raw: unknown): string[] {
  return String(raw ?? "")
    .split(/[;,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function uniqueEmails(values: Array<unknown>): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string" && value.trim() !== "")
        .map((value) => value.trim().toLowerCase()),
    ),
  ];
}

/** Account-side recipients for automatic / combined monthly report delivery. */
export function resolveAccountReportRecipients(opts: {
  configuredRecipients?: unknown;
  accountEmail?: string | null;
}): string[] {
  const configured = parseRecipientList(opts.configuredRecipients);
  if (configured.length) return uniqueEmails(configured);
  if (opts.accountEmail) return uniqueEmails([opts.accountEmail]);
  return [];
}

export function monthlyReportMonthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** True when the configured day/hour has arrived and this month was not already sent. */
export function isMonthlyReportDue(opts: {
  now: Date;
  day?: unknown;
  hour?: unknown;
  lastSent?: unknown;
}): boolean {
  const day = Math.min(28, Math.max(1, Number(opts.day ?? 1)));
  const hour = Number(opts.hour ?? 8);
  const now = opts.now;
  if (now.getDate() < day || (now.getDate() === day && now.getHours() < hour)) return false;
  const monthKey = monthlyReportMonthKey(now);
  if (String(opts.lastSent ?? "").startsWith(monthKey)) return false;
  return true;
}
