/**
 * Keys of extracted_fields the documents LIST needs.
 *
 * The list ships every row the user has (the page filters, searches and sorts
 * client-side), so extracted_fields — 120 distinct keys, most of them only ever
 * read on the detail page — was the single largest part of a multi-megabyte
 * response. Trimming it to what the list renders cuts that field by about two
 * thirds.
 *
 * Every key here is read by the documents table or by shared/rowIssues.ts:
 *   report_number / document_number / contract_number  → the מספר column
 *   client_company / client_name / company / counterparty / contact_person
 *                                                      → client name fallback
 *   client_email / contact_email / email               → row issue checks
 *   expiry_date, document_type, contract_type          → expiry + type checks
 *   invoice_number / receipt_number / supplier_name / payment_due_date
 *                                                      → invoice-like detection
 *   payroll_month / employee_name / base_salary / net_payment
 *                                                      → payslip detection
 *
 * Anything not listed is still returned in full by the detail endpoint. Adding a
 * new key to the table means adding it here too, or it will read as empty.
 */
export const LIST_EXTRACTED_FIELD_KEYS = [
  "report_number",
  "document_number",
  "contract_number",
  "client_company",
  "client_name",
  "company",
  "counterparty",
  "contact_person",
  "client_email",
  "contact_email",
  "email",
  "expiry_date",
  "document_type",
  "contract_type",
  "invoice_number",
  "receipt_number",
  "supplier_name",
  "payment_due_date",
  "payroll_month",
  "employee_name",
  "base_salary",
  "net_payment",
] as const;

const KEEP = new Set<string>(LIST_EXTRACTED_FIELD_KEYS);

/**
 * Narrow extracted_fields to the keys above, preserving the stored shape: rows
 * hold it as a JSON string, and the client parses either form, so a string in
 * gives a string out.
 */
export function slimExtractedFieldsForList(value: unknown): unknown {
  if (value == null) return value;
  const wasString = typeof value === "string";
  let parsed: unknown = value;
  if (wasString) {
    try {
      parsed = JSON.parse(value as string);
    } catch {
      return value;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return value;

  const slim: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
    if (KEEP.has(key)) slim[key] = val;
  }
  return wasString ? JSON.stringify(slim) : slim;
}
