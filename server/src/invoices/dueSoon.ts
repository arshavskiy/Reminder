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
  /** Set when a receipt has been paired with this invoice: the receipt is the proof it was paid. */
  paired_with?: string | null;
  pair_status?: string | null;
}

/**
 * Whether a row is something still to be paid: not archived, not income, a payable
 * document type and not already settled. It says nothing about the payment date.
 */
export function invoiceIsPayable(row: Pick<DueSoonRow, "status" | "cash_flow" | "document_category" | "payment_status" | "paired_with" | "pair_status">): boolean {
  if (row.status === "archived") return false;
  if (row.cash_flow === "income") return false;
  if (row.document_category && !PAYABLE_CATEGORIES.has(row.document_category)) return false;
  return !invoiceIsSettled(row);
}

export function invoiceIsSettled(row: Pick<DueSoonRow, "payment_status" | "document_category" | "paired_with" | "pair_status">): boolean {
  if (row.document_category === "receipt") return true;
  if (row.paired_with && (row.pair_status === "auto" || row.pair_status === "confirmed")) return true;
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
    if (!invoiceIsPayable(row)) continue;
    if (!row.payment_due_date) continue;
    const due = dayNumber(row.payment_due_date);
    if (due === null) continue;
    const daysLeft = due - todayNumber;
    if (daysLeft > days || daysLeft < -overdueDays) continue;
    picked.push({ ...row, daysLeft });
  }
  return picked.sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * Unpaid invoices whose payment date falls inside [from, to] (ISO dates,
 * inclusive), for the calendar. Unlike selectDueSoon there is no look-back
 * limit: a month that shows an old overdue invoice should keep showing it.
 * `daysLeft` is relative to `today` and negative once overdue.
 */
export function selectDueInRange<T extends DueSoonRow>(
  rows: T[],
  from: string,
  to: string,
  today: string,
): (T & { daysLeft: number })[] {
  const fromNumber = dayNumber(from);
  const toNumber = dayNumber(to);
  const todayNumber = dayNumber(today);
  if (fromNumber === null || toNumber === null || todayNumber === null || fromNumber > toNumber) return [];
  const picked: (T & { daysLeft: number })[] = [];
  for (const row of rows) {
    if (!invoiceIsPayable(row)) continue;
    if (!row.payment_due_date) continue;
    const due = dayNumber(row.payment_due_date);
    if (due === null || due < fromNumber || due > toNumber) continue;
    picked.push({ ...row, daysLeft: due - todayNumber });
  }
  return picked.sort((a, b) => String(a.payment_due_date).localeCompare(String(b.payment_due_date)));
}
