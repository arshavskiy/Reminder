export const BILLING_DOCUMENT_KINDS = [
  "quote",
  "payment_request",
  "service_specification",
] as const;

export const MAIN_DOCUMENTS_EXCLUDED_KINDS = [
  "certificate",
  "invoice",
  ...BILLING_DOCUMENT_KINDS,
] as const;

export const NON_IMPORTED_GENERATED_DOCUMENT_KINDS = [
  "certificate",
  ...BILLING_DOCUMENT_KINDS,
] as const;

/** Mongo filter for documents shown and counted as regular documents. */
export function mainDocumentsFilter(userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    document_kind: { $nin: [...MAIN_DOCUMENTS_EXCLUDED_KINDS] },
  };
}

export function belongsInMainDocumentsWorkspace(kind: unknown): boolean {
  return !MAIN_DOCUMENTS_EXCLUDED_KINDS.includes(String(kind ?? "") as never);
}
