import type { ContractWithClient, Document } from "./types.js";

export type RowIssue = {
  kind: string;
  label: string;
  tagClass: "tag--warn" | "tag--bad" | "tag--info" | "tag--neutral";
};

export function normalizeReportNumber(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim().replace(/\s+/g, "");
  if (!text) return null;
  return text.toLowerCase();
}

export function parseDocumentExtractedFields(extracted_fields?: string | null): Record<string, unknown> {
  if (!extracted_fields) return {};
  try {
    const parsed = JSON.parse(extracted_fields);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function documentReportNumber(doc: { extracted_fields?: string | null }): string | null {
  const fields = parseDocumentExtractedFields(doc.extracted_fields);
  return normalizeReportNumber(
    fields.report_number ?? fields.document_number ?? fields.contract_number,
  );
}

export function documentReportNumberLabel(doc: { extracted_fields?: string | null }): string | null {
  const fields = parseDocumentExtractedFields(doc.extracted_fields);
  const raw = fields.report_number ?? fields.document_number ?? fields.contract_number;
  if (raw == null) return null;
  const text = String(raw).trim();
  return text || null;
}

export function contractReportNumber(row: {
  contract_number?: string | null;
  manual_fields?: unknown;
}): string | null {
  const manual = row.manual_fields && typeof row.manual_fields === "object" && !Array.isArray(row.manual_fields)
    ? row.manual_fields as Record<string, unknown>
    : {};
  return normalizeReportNumber(
    row.contract_number ?? manual.report_number ?? manual.document_number,
  );
}

export function duplicateReportNumberSet<T>(rows: T[], pick: (row: T) => string | null): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const num = pick(row);
    if (!num) continue;
    counts.set(num, (counts.get(num) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([num]) => num));
}

export function isDuplicateReportNumber(num: string | null, dupes: Set<string>): boolean {
  return Boolean(num && dupes.has(num));
}

export function countDuplicateReportRows<T>(rows: T[], pick: (row: T) => string | null): number {
  const dupes = duplicateReportNumberSet(rows, pick);
  return rows.filter((row) => isDuplicateReportNumber(pick(row), dupes)).length;
}

type DocumentIssueRow = Pick<Document, "processing_status" | "extracted_fields"> & {
  reminder_status?: string | null;
  contract_status?: string | null;
};

export function listDocumentRowIssues(doc: DocumentIssueRow, dupes: Set<string>): RowIssue[] {
  const issues: RowIssue[] = [];
  const num = documentReportNumber(doc);
  if (isDuplicateReportNumber(num, dupes)) {
    issues.push({ kind: "duplicate_report_number", label: "כפילות מספר תסקיר", tagClass: "tag--warn" });
  }
  if (doc.processing_status === "error") {
    issues.push({ kind: "processing_error", label: "שגיאת עיבוד", tagClass: "tag--bad" });
  }
  if (doc.reminder_status === "missing" && doc.processing_status === "done" && !doc.contract_status) {
    const fields = parseDocumentExtractedFields(doc.extracted_fields);
    const isPayslip = Boolean(
      fields.payroll_month || fields.employee_name || fields.net_payment || fields.base_salary,
    );
    if (!isPayslip) {
      const expiry = fields.expiry_date;
      if (!normalizeReportNumber(expiry)) {
        issues.push({ kind: "missing_expiry", label: "חסר תאריך תוקף", tagClass: "tag--warn" });
      }
    }
  }
  if (doc.contract_status === "expired" || doc.contract_status === "overdue") {
    issues.push({ kind: "expired", label: "פג תוקף", tagClass: "tag--bad" });
  }
  return issues;
}

export function listContractRowIssues(
  row: ContractWithClient,
  dupes: Set<string>,
  hasReminders: boolean,
): RowIssue[] {
  const issues: RowIssue[] = [];
  const num = contractReportNumber(row);
  if (isDuplicateReportNumber(num, dupes)) {
    issues.push({ kind: "duplicate_report_number", label: "כפילות מספר תסקיר", tagClass: "tag--warn" });
  }
  if (!row.expiry_date && row.status === "active") {
    issues.push({ kind: "missing_expiry", label: "חסר תאריך תוקף", tagClass: "tag--warn" });
  }
  if (!hasReminders && row.status === "active") {
    issues.push({ kind: "no_reminder", label: "ללא תזכורת", tagClass: "tag--warn" });
  }
  return issues;
}
