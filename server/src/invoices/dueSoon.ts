// Picks the unpaid invoices whose payment date is close (or just passed), for
// the dashboard "due soon" list. Pure, so the rules can be tested without a database.

const SETTLED_STATUS_RE = /paid|settled|שולם|שולמה|בוצע|הוראת\s*קבע|חיוב\s*אשראי|אשראי/i;
const PAYABLE_CATEGORIES = new Set(["invoice", "bill", "payment_request"]);
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DueSoonRow {
  id: string;
  status?: string | null;
  cash_flow?: string | null;
  document_category?: string | null;
  payment_status?: string | null;
  payment_due_date?: string | null;
}

export function invoiceIsSettled(row: Pick<DueSoonRow, "payment_status" | "document_category">): boolean {
  if (row.document_category === "receipt") return true;
  return SETTLED_STATUS_RE.test(String(row.payment_status ?? ""));
}

function dayNumber(iso: string): number | null {
  const ts = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(ts) ? Math.floor(ts / DAY_MS) : null;
}

/**
 * Rows still to pay, due within `days` from today or overdue by at most
 * `overdueDays`, soonest first. `daysLeft` is negative once overdue.
 */
export function selectDueSoon<T extends DueSoonRow>(
  rows: T[],
  today: string,
  days = 14,
  overdueDays = 30,
): (T & { daysLeft: number })[] {
  const todayNumber = dayNumber(today);
  if (todayNumber === null) return [];
  const picked: (T & { daysLeft: number })[] = [];
  for (const row of rows) {
    if (row.status === "archived") continue;
    if (row.cash_flow === "income") continue;
    if (row.document_category && !PAYABLE_CATEGORIES.has(row.document_category)) continue;
    if (invoiceIsSettled(row)) continue;
    if (!row.payment_due_date) continue;
    const due = dayNumber(row.payment_due_date);
    if (due === null) continue;
    const daysLeft = due - todayNumber;
    if (daysLeft > days || daysLeft < -overdueDays) continue;
    picked.push({ ...row, daysLeft });
  }
  return picked.sort((a, b) => a.daysLeft - b.daysLeft);
}
