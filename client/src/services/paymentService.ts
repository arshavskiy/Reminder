export interface InspectionRate {
  id: string;
  reportType: string;
  section: string;
  label: string;
  unitCents: number;
  source?: "equipment";
  equipmentId?: string;
  automaticSection?: string;
  automaticLabel?: string;
  automaticQuantity?: number;
}
export interface PaymentRequest {
  _id: string; number?: string; documentKind?: "quote" | "payment_request" | "service_specification"; reportNumber: string; reportType: string; status: string;
  customer: {name: string; email: string; registration?: string}; dueDate: string; totalCents: number; subtotalCents?: number; vatCents?: number; vatBasisPoints?: number; paidCents: number;
  issuer?: {name?: string; subtitle?: string; registration?: string; email?: string; phone?: string; address?: string; logoUrl?: string};
  lines?: {rateId?: string; section?: string; label?: string; quantity?: number; unitCents?: number; totalCents?: number}[];
  notes?: string; createdAt?: string; issuedAt?: string; lastSentTo?: string; lastSendAt?: string;
  storage?: {local: string; object: string; drive: string}; sendState?: string;
  payments: {amountCents: number; method: string; paidDate: string; receiptStatus: string}[];
}
export interface PaymentData {rates: InspectionRate[]; rows: PaymentRequest[]; receiptMode: string; contracts: {id: string; number: string; reportType: string; customer: string; equipment: {name: string; quantity: number}[]}[]}
const base = `${import.meta.env.VITE_API_BASE || ""}/api/payment-requests`;
async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(base + path, {method, credentials: "include", headers: {"Content-Type": "application/json"}, ...(body ? {body: JSON.stringify(body)} : {})});
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "הפעולה נכשלה");
  }
  return response.json();
}
export const paymentService = {
  list: () => request<PaymentData>("/"),
  counts: () => request<{ quotes: number }>("/counts"),
  get: (id: string) => request<PaymentRequest>(`/requests/${id}`),
  saveRates: (rates: InspectionRate[]) => request("/rates", "PUT", {rates}),
  create: (body: unknown) => request<PaymentRequest>("/requests", "POST", body),
  update: (id: string, body: unknown) => request<PaymentRequest>(`/requests/${id}`, "PUT", body),
  issue: (id: string) => request<PaymentRequest>(`/requests/${id}/issue`, "POST", {}),
  archive: (id: string) => request<PaymentRequest>(`/requests/${id}/archive`, "POST", {}),
  send: (id: string, email: string, sendId: string) => request(`/requests/${id}/send`, "POST", {email, sendId}),
  delete: (id: string) => request<{ok: boolean}>(`/requests/${id}`, "DELETE"),
  payment: (id: string, body: unknown) => request<PaymentRequest>(`/requests/${id}/payments`, "POST", body),
  pdf: (id: string) => `${base}/requests/${id}/pdf`,
};
