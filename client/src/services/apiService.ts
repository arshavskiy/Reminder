import type {
  AppSettings,
  Client,
  ClientDetail,
  Contract,
  ContractWithClient,
  DashboardStats,
  DocTemplate,
  Document,
  EmailLogEntry,
  EmailTemplate,
  Equipment,
  FeatureDefinition,
  GlobalSearchResult,
  NotificationItem,
  PipelineFlags,
  PrintTemplate,
  Reminder,
  ReminderWithContext,
  Task,
  User,
  UserSettings,
} from "../../src/shared/types.js";

export interface InboundEmailStatus {
  configured: boolean;
  allowed: boolean;
  enabled: boolean;
  address: string | null;
}

export type ReviewReason = "low_confidence" | "missing_amount" | "missing_date" | "unknown_supplier" | "possible_not_invoice" | "missing_fields" | "no_expiry_date";

/** An unattended import (Gmail, email-in, Drive) waiting for a person to look at it. */
export interface ReviewItem {
  id: string;
  file_name: string;
  document_type: string | null;
  source: "gmail" | "email" | "drive" | string;
  reasons: ReviewReason[];
  flagged_at: string | null;
  supplier: string | null;
  amount_display: string | null;
  issue_date: string | null;
  invoice_id: string | null;
  download_url: string | null;
  thumbnail_url: string | null;
}

export interface InvoiceDueSoon {
  id: string;
  supplier_name: string | null;
  amount_display: string;
  currency: string | null;
  payment_due_date: string;
  daysLeft: number;
  document_category: string | null;
}

export interface ObligationSuggestion {
  id: string;
  status: "new" | "created" | "dismissed";
  pdfs: { id: string; filename: string; size: number }[];
  messageId: string;
  subject: string;
  from: string;
  kind: "warranty" | "renewal" | "payment_due" | "maintenance" | "due_task";
  title: string;
  entity_name: string;
  due_date: string;
  evidence_quote: string;
  confidence: "high" | "medium";
  warning?: "immediate";
  attachment_name: string | null;
}

export interface GmailAttachment {
  attachmentId: string;
  filename: string;
  size: number;
}

export interface GmailEmail {
  id: string;
  subject: string;
  from: string;
  date: string;
  internalDate: string;
  attachments: GmailAttachment[];
}

export interface GmailLinkOnlyEmail {
  id: string;
  subject: string;
  from: string;
  date: string;
  internalDate: string;
  kind: "link" | "inline";
  documentLinkUrl: string | null;
  importable: boolean;
}

export interface GmailSearchProvider {
  id: string;
  category:
    | "household"
    | "transport"
    | "parking"
    | "fuel"
    | "tv"
    | "marketplace"
    | "food"
    | "payment"
    | "government"
    | "insurance"
    | "finance"
    | "travel"
    | "healthcare"
    | "education"
    | "retail"
    | "electronics"
    | "nonprofit"
    | "digital"
    | "development"
    | "general";
  label: string;
  terms: string[];
  sort_order: number;
  enabled: boolean;
}

export interface GmailImportedDocument {
  id: string;
  file_name: string;
  mime_type: string | null;
  processing_status: string;
  invoice_id: string | null;
  invoice_status: string | null;
  possible_not_invoice: boolean;
  invoice_validation_status: string | null;
  invoice_rejection_label: string | null;
  missing_required_fields: string[];
  business: string | null;
  expense_category: string | null;
  document_kind: string | null;
  document_type: string | null;
  extracted_fields: Record<string, unknown>;
  import_date: string | null;
  created_at: string | null;
  preview_url: string;
  thumbnail_url: string | null;
  download_url: string;
}

export interface GmailImportHistoryFile {
  filename: string;
  document_id: string | null;
  error: string | null;
  import_status?: string;
  import_explanation?: string;
  retryable?: boolean;
  retry_mode?: "failed" | "rejected" | "retryable" | null;
  document?: GmailImportedDocument | null;
}

export interface GmailImportHistoryItem {
  message_id: string;
  subject: string;
  imported_at: string;
  files?: GmailImportHistoryFile[];
}

export interface GmailImportJobResult {
  messageId: string;
  filename: string;
  documentId?: string;
  error?: string;
  importStatus?: string;
  import_status?: string;
  explanation?: string;
  rejection_label?: string | null;
  rejection_reason?: string | null;
  retryable?: boolean;
  ocr_failed?: boolean;
  retryMode?: "failed" | "rejected" | "retryable" | null;
}

export interface GmailImportJob {
  jobId: string | null;
  status: "queued" | "running" | "completed" | "failed";
  q?: string;
  templateId?: string | null;
  retryMode?: "failed" | "rejected" | "retryable" | null;
  total: number;
  totalMessages: number;
  newMessages: number;
  processedMessages: number;
  imported: number;
  skipped: number;
  errors: number;
  attachmentsFound?: number;
  stored?: number;
  classifiedInvoices?: number;
  rejected?: number;
  ocrFailed?: number;
  aiRetryPending?: number;
  results: GmailImportJobResult[];
  explanationSummary?: Record<string, number>;
  quota?: Record<string, unknown> | null;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
}

export interface ImportedInvoice {
  id: string;
  document_id: string | null;
  inline_no_file?: boolean;
  preview_html?: string | null;
  supplier_name: string;
  supplier_id: string | null;
  invoice_number: string | null;
  receipt_number: string | null;
  type: string;
  document_category: "invoice" | "receipt" | "bill" | "payment_request" | "credit_note";
  customer_number: string | null;
  account_number: string | null;
  service_address: string | null;
  issue_date: string | null;
  payment_due_date: string | null;
  billing_period: string | null;
  amount: number | null;
  amount_display: string;
  amount_ils: number | null;
  vat_amount: number | null;
  currency: string;
  cash_flow: "income" | "expense";
  client_name: string | null;
  business: string | null;
  expense_category: string | null;
  provider_id: string | null;
  provider_label: string | null;
  provider_category: GmailSearchProvider["category"] | null;
  payment_status: string | null;
  /** Id of the receipt (for an invoice) or invoice (for a receipt) this row is paired with. */
  paired_with?: string | null;
  pair_status?: "auto" | "confirmed" | null;
  pair_role?: "invoice" | "receipt" | null;
  note: string | null;
  status: string;
  possible_not_invoice: boolean;
  invoice_validation_status: string | null;
  invoice_rejection_label: string | null;
  missing_required_fields: string[];
  file_name: string;
  mime_type: string | null;
  created_at: string | null;
  import_date: string | null;
  preview_url: string | null;
  thumbnail_url: string | null;
  download_url: string | null;
  in_s3: boolean;
  drive_file_id: string | null;
  drive_web_link: string | null;
  source_subject: string | null;
  source_email: string | null;
  fields: Record<string, unknown>;
}

export interface InvoiceExpenseMonthlyPoint {
  month: string;
  total: number;
  count: number;
}

export interface InvoiceExpenseMonthlySeries {
  supplier: string;
  total: number;
  points: InvoiceExpenseMonthlyPoint[];
  isOther?: boolean;
}

export interface InvoiceExpenseCategorySeries {
  category: string;
  total: number;
  count: number;
  suppliers: { name: string; total: number; count: number }[];
}

export interface InvoiceExpenseMonthlyResponse {
  dateBasis: "invoice" | "import";
  proofFilter?: "all" | "paid" | "requested" | "income";
  months: string[];
  totalInvoices: number;
  totalAmount: number;
  suppliers: { name: string; total: number; count?: number }[];
  /** Every supplier available under the current filters minus the supplier filter itself. */
  supplierNames?: string[];
  categories: GmailSearchProvider["category"][];
  categorySeries?: InvoiceExpenseCategorySeries[];
  series: InvoiceExpenseMonthlySeries[];
}

export interface SpendingAlert {
  category: string;
  threshold: number;
  currency: string;
}

export interface ProfileSubscriptionQuota {
  category: "invoices" | "contracts" | "documents" | "manualDocuments" | "emailDocuments" | "reminders";
  scope: "monthly" | "lifetime" | "unlimited";
  limit: number | null;
  used: number;
  remaining: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface ProfileImportCounters {
  scannedDocuments: number;
  gmailDocuments: number;
  gmailInvoices: number;
}

export interface ProfileSubscription {
  plan: string;
  quotas: Partial<Record<ProfileSubscriptionQuota["category"], ProfileSubscriptionQuota>>;
  counters: ProfileImportCounters;
}

export type DriveFolderState = "ok" | "trashed" | "missing" | "unknown";

export interface DriveStatus {
  connected: boolean;
  syncEnabled: boolean;
  folderId: string | null;
  folderName: string;
  folderUrl: string | null;
  folderState?: DriveFolderState | null;
  syncedFileCount?: number;
  totalFileCount?: number;
    pendingFileCount?: number;
    missingFileCount?: number;
    latestJob?: DriveExportJob | null;
  trashUrl?: string | null;
  allowed: boolean;
}

export interface DriveExportResult {
  ok: boolean;
  uploaded: number;
  failed: number;
  total: number;
  folderId?: string | null;
  folderName?: string;
  folderUrl?: string | null;
  recreated?: boolean;
  resetCount?: number;
}

export interface DriveExportJobResult {
  documentId: string;
  fileName: string;
  status: "uploaded" | "failed" | "skipped";
  error?: string;
}

export interface DriveExportJob {
  jobId: string | null;
  status: "queued" | "running" | "completed" | "failed";
  ok: boolean;
  uploaded: number;
  failed: number;
  skipped: number;
  processed: number;
  total: number;
  folderId?: string | null;
  folderName?: string;
  folderUrl?: string | null;
  recreated?: boolean;
  resetCount?: number;
  error?: string | null;
  results?: DriveExportJobResult[];
}

export interface EquipmentHistoryEvent {
  id: string;
  contract_type: string | null;
  contract_number: string | null;
  start_date: string | null;
  expiry_date: string | null;
  status: string | null;
  document_id: string | null;
  document_name: string | null;
  inspector: string | null;
  load_capacity_test: string | null;
  test_pressure: string | null;
  pass_fail: string | null;
  days_until: number | null;
}

export interface HydraulicCheckRequest {
  client_id?: string;
  contract_number?: string;
    contract_type?: string;
  business: {
    display_name: string;
    entity_type?: string;
    id_number?: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    fax?: string;
    address?: string;
    city?: string;
    po_box?: string;
    client_zipcode?: string;
    notes?: string;
  };
  equipment: {
    category: string;
    name?: string;
    manufacturer?: string;
    model?: string;
    serial_number?: string;
    license_number?: string;
    load_capacity_work?: string;
    load_capacity_test?: string;
    load_radius?: string;
    description?: string;
  };
  inspection_type?: string;
  inspection_location?: string;
  check_date?: string;
  expiry_date?: string;
  interval_months?: number;
  skip_reminders?: boolean;
  editor_type?: "grid" | "sections";
  print_template_id?: string;
}

export interface HydraulicCheckResult {
  client: Client;
  equipment: Equipment;
  contract: Contract;
  reminders: Reminder[];
}

export interface ExpiryCalendarItem {
  id: string;
  document_id: string | null;
  expiry_date: string;
  contract_type: string | null;
  contract_number: string | null;
  client_name: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  equipment_name: string | null;
  days_until: number;
  urgency: "overdue" | "critical" | "warning" | "ok";
  /** Set on items that are not contract expiries: `invoice` = an unpaid invoice payment date, `discovery` = a new suggestion found in the mailbox. */
  kind?: "invoice" | "discovery";
  invoice_id?: string;
  /** Display title for non-contract items (a discovery title). */
  title?: string | null;
  amount_display?: string | null;
  supplier_name?: string | null;
}

export interface PrintTemplateDraftSummary {
  _id: string;
  template_id: string;
  template_name: string;
  editor_type?: "grid" | "sections";
  client_id: string | null;
  client_name: string | null;
  contract_id: string | null;
  contract_number: string | null;
  contract_type: string | null;
  updated_at: string | null;
  data: Record<string, string>;
  meta: Record<string, unknown>;
}

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const BASE = `${SERVER}/api`;

// Optional build-time production admin API host (legacy). Runtime DB target uses
// X-Admin-Db-Target against the local server's dual Mongo links instead.
const ADMIN_SERVER = (import.meta.env.VITE_ADMIN_API_BASE as string | undefined) || SERVER;
const ADMIN_BASE = `${ADMIN_SERVER}/api`;

export type AdminDbTarget = "local" | "production";
const ADMIN_DB_TARGET_KEY = "remindocr_admin_db_target";

export type InspectorLeadStatus = "NEW" | "CONTACTED" | "DEMO" | "TRIAL" | "CUSTOMER" | "NOT_RELEVANT";

export interface InspectorLead {
  id: string;
  name: string;
  company?: string | null;
  professionType?: string[] | string | null;
  certificationType?: string | null;
  city?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  licenseNumber?: string | null;
  notes?: string | null;
  leadScore: number;
  contactStatus: InspectorLeadStatus;
  foundAt?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  unsubscribed?: boolean;
  unsubscribedAt?: string | null;
  unsubscribeSource?: string | null;
  unsubscribeSubject?: string | null;
  unsubscribeSnippet?: string | null;
  lastEmailedAt?: string | null;
  lastEmailCampaign?: string | null;
}

export interface InspectorLeadEmailSend {
  leadId: string;
  email: string;
  name?: string | null;
  company?: string | null;
  campaign: string;
  subject?: string | null;
  sentAt: string;
  resendId?: string | null;
  unsubscribed: boolean;
  registered: boolean;
  registeredAt?: string | null;
}

export interface InspectorLeadEmailSendsResponse {
  rows: InspectorLeadEmailSend[];
  total: number;
  page: number;
  limit: number;
  campaigns: { campaign: string; count: number }[];
}

export interface UnsubscribeScanRun {
  id: string;
  trigger: "manual" | "schedule" | "pre-send";
  triggeredBy: string | null;
  status: "running" | "ok" | "error" | "skipped";
  started_at: string;
  finished_at: string | null;
  scanned: number;
  requests: number;
  newlyUnsubscribed: number;
  alreadyUnsubscribed: number;
  insertedLeads: number;
  newEmails: string[];
  error: string | null;
}

export interface UnsubscribeScanResult {
  scanId: string;
  newEmails: string[];
  scanned: number;
  requests: number;
  newlyUnsubscribed: number;
  alreadyUnsubscribed: number;
  insertedLeads: number;
}

export type EmailCampaignStatus = "draft" | "sending" | "sent" | "paused" | "failed";

export type EmailCampaignAudience = { statuses?: string[]; neverEmailed?: boolean } & (
  | { type: "leads"; ids: string[] }
  | { type: "emails"; emails: string }
  | { type: "import"; batchId: string }
  | { type: "filter"; source?: string | null; status?: string | null; q?: string | null }
  | { type: "all" }
);

export interface EmailCampaign {
  id: string;
  key: string;
  name: string;
  subject: string;
  html: string;
  status: EmailCampaignStatus;
  counts: { total: number; sent: number; failed: number };
  audience?: EmailCampaignAudience | null;
  error?: string | null;
  failedRecipients?: { email: string; error?: string | null }[];
  running?: boolean;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface CampaignLeadImportResult {
  batchId: string;
  file: string;
  totalRows: number;
  valid: number;
  duplicatesInFile: number;
  invalid: number;
  inserted: number;
  updated: number;
  mode: "fill" | "overwrite";
}

export interface CampaignAudiencePreview {
  count: number;
  alreadySent: number;
  invalid: number;
  unsubscribed: number;
  sample: string[];
}

export interface InspectorLeadsResponse {
  rows: InspectorLead[];
  total: number;
  page: number;
  limit: number;
  summary: {
    bySource: { source: string; count: number }[];
    byStatus: { status: InspectorLeadStatus; count: number }[];
    withEmail?: number;
    withPhone?: number;
    unsubscribed?: number;
    bestScore?: number;
  };
}

export interface WhatsAppTemplate { name: string; language: string; body: string; parameters: number }
export interface WhatsAppCampaign { _id: string; status: string; recipientCount: number; createdAt: string; template: WhatsAppTemplate }
export interface WhatsAppContact { phone: string; optedIn: boolean; source: string }
export interface WhatsAppStatus { configured: boolean; enabled: boolean; missing: string[]; sender: string; webhookPath: string; contacts: WhatsAppContact[]; campaigns: WhatsAppCampaign[] }
export interface WhatsAppDraft { leadIds: string[]; templateName: string; language: string; parameters: string[] }
export interface WhatsAppPreview { template: WhatsAppTemplate; skipped: number; previewHash: string; recipients: { phone: string; name: string; parameters: string[] }[] }
export interface WhatsAppMessage { _id: string; name: string; phone: string; status: string; error?: string }

export const whatsappApi = {
  status: () => adminGet<WhatsAppStatus>("/admin/whatsapp/status"),
  templates: () => adminGet<WhatsAppTemplate[]>("/admin/whatsapp/templates"),
  consent: (phone: string, optedIn: boolean, source: string) => adminPut("/admin/whatsapp/consent", {phone, optedIn, source}),
  preview: (draft: WhatsAppDraft) => adminPost<WhatsAppPreview>("/admin/whatsapp/preview", draft),
  create: (draft: WhatsAppDraft, requestId: string, previewHash: string) => adminPost<WhatsAppCampaign>("/admin/whatsapp/campaigns", {...draft, requestId, previewHash}),
  campaign: (id: string) => adminGet<{campaign: WhatsAppCampaign; messages: WhatsAppMessage[]}>(`/admin/whatsapp/campaigns/${id}`),
  cancel: (id: string) => adminPost(`/admin/whatsapp/campaigns/${id}/cancel`, {}),
};

export function getAdminDbTarget(): AdminDbTarget {
  try {
    const raw = localStorage.getItem(ADMIN_DB_TARGET_KEY);
    if (raw === "production" || raw === "prod" || raw === "atlas") return "production";
  } catch { /* ignore */ }
  return "local";
}

export function setAdminDbTarget(target: AdminDbTarget): void {
  try {
    localStorage.setItem(ADMIN_DB_TARGET_KEY, target);
  } catch { /* ignore */ }
}

function adminHeaders(extra?: HeadersInit, target: AdminDbTarget = getAdminDbTarget()): Headers {
  const headers = new Headers(extra);
  headers.set("X-Admin-Db-Target", target);
  return headers;
}

/**
 * Server responses carry `*_url` fields as `/api/...` paths. In production the
 * session cookie lives on the API host (VITE_API_BASE), so those paths must be
 * loaded from there, not from the app domain.
 */
export function apiUrl(path: string | null | undefined): string {
  if (!path) return "";
  return SERVER && path.startsWith("/api/") ? `${SERVER}${path}` : path;
}

function withApiHost<T>(value: T): T {
  if (!SERVER || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = withApiHost(value[i]);
    return value;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === "string") {
      if (key.endsWith("_url")) obj[key] = apiUrl(v);
    } else if (v && typeof v === "object") {
      obj[key] = withApiHost(v);
    }
  }
  return value;
}

async function get<T>(path: string, force = false): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: "include",
    cache: force ? "reload" : "default",
  });
  if (!res.ok) {
    const err = new Error(await responseErrorMessage(res, `GET ${path} failed: ${res.status}`)) as any;
    err.status = res.status;
    throw err;
  }
  return withApiHost(await res.json()) as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(await responseErrorMessage(res, `POST ${path} failed: ${res.status}`)) as any;
    err.status = res.status;
    throw err;
  }
  return withApiHost(await res.json()) as T;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(await responseErrorMessage(res, `PUT ${path} failed: ${res.status}`)) as any;
    err.status = res.status;
    throw err;
  }
  return withApiHost(await res.json()) as T;
}

async function del(path: string): Promise<void> {
  const res = await fetch(BASE + path, { method: "DELETE", credentials: "include" });
  if (!res.ok) {
    const err = new Error(await responseErrorMessage(res, `DELETE ${path} failed: ${res.status}`)) as any;
    err.status = res.status;
    throw err;
  }
}

async function responseErrorMessage(res: Response, fallback: string): Promise<string> {
  const contentType = res.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await res.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
    const message = body?.error ?? body?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  const text = await res.text().catch(() => "");
  return text.trim() || fallback;
}

async function adminGet<T>(path: string, target?: AdminDbTarget): Promise<T> {
  const res = await fetch(ADMIN_BASE + path, {
    credentials: "include",
    headers: adminHeaders(undefined, target),
  });
  if (!res.ok) {
    const err = new Error(`GET ${path} failed: ${res.status}`) as any;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

async function adminPut<T>(path: string, body: unknown, target?: AdminDbTarget): Promise<T> {
  const res = await fetch(ADMIN_BASE + path, {
    method: "PUT",
    headers: adminHeaders({ "Content-Type": "application/json" }, target),
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.error ?? text;
    } catch { /* keep text */ }
    throw new Error(detail || `PUT ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function adminUpload<T>(path: string, field: string, file: File, extra?: Record<string, string>): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(extra ?? {})) form.append(key, value);
  form.append(field, file);
  const res = await fetch(ADMIN_BASE + path, {
    method: "POST",
    headers: adminHeaders(),
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      detail = JSON.parse(text)?.error ?? text;
    } catch { /* keep text */ }
    throw new Error(detail || `POST ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function adminPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(ADMIN_BASE + path, {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.error ?? text;
    } catch { /* keep text */ }
    throw new Error(detail || `POST ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}


/**
 * Serialize an object to a querystring while dropping undefined/null/empty
 * values. The naive `new URLSearchParams(params).toString()` stringifies
 * missing values as the literal text "undefined" which breaks server filters.
 */
function qs(params?: Record<string, unknown>): string {
  if (!params) return "";
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") clean[k] = String(v);
  }
  const s = new URLSearchParams(clean).toString();
  return s ? "?" + s : "";
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export interface BillingStatus {
    mode: "monthly" | "yearly" | "one_time" | null;
    paidAt: string | null;
    months: number | null;
    nextPaymentAt: string | null;
    paymentDue: boolean;
    paymentUrl: string | null;
}

export const api = {
    billing: {
        status: () => get<BillingStatus>("/billing/status"),
    },
  importReminderTable: async <T>(file: File, action: "preview" | "confirm"): Promise<T> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/reminders/table-import/${action}`, {method: "POST", credentials: "include", body: form});
    if (!res.ok) throw new Error(await responseErrorMessage(res, "Table import failed"));
    return res.json() as Promise<T>;
  },
  dashboard: {
    stats: (force = false) => get<DashboardStats>("/dashboard/stats", force),
  },

  push: {
    vapidKey: () => get<{ key: string | null }>("/push/vapid-key", true),
    subscribe: (body: { endpoint: string; keys: { p256dh: string; auth: string } }) => post<{ ok: boolean }>("/push/subscribe", body),
    unsubscribe: (endpoint: string) => post<{ ok: boolean }>("/push/unsubscribe", { endpoint }),
  },

  invoices: {
    dueSoon: (days = 14) => get<{ items: InvoiceDueSoon[]; days: number }>(`/invoices/due-soon${qs({ days })}`, true),
    pairScan: () => post<{ scanned: number; linked: number }>("/invoices/pairs/scan"),
    unpair: (id: string) => del(`/invoices/${id}/pair`),
    /** Every unpaid invoice due between two ISO dates (inclusive), for the calendar. */
    dueInRange: (from: string, to: string) => get<{ items: InvoiceDueSoon[]; from: string; to: string }>(`/invoices/due-soon${qs({ from, to })}`, true),
    list: (params?: { q?: string; status?: string; type?: string; documentCategory?: ImportedInvoice["document_category"]; cashFlow?: string; category?: string; currency?: string; supplier?: string; sortBy?: string; sortDir?: string; dateFrom?: string; dateTo?: string; limit?: number; offset?: number; export?: boolean; duplicatesOnly?: string; unpaidOnly?: string }, force = false) =>
      get<{
        rows: ImportedInvoice[];
        total: number;
        totalAll: number;
        limit: number;
        offset: number;
        visibleLimit: number | null;
        counts: Record<string, number>;
        documentCategoryCounts: Record<ImportedInvoice["document_category"], number>;
        types: string[];
        categories: GmailSearchProvider["category"][];
        suppliers: string[];
        currencies?: string[];
        duplicatesCount?: number;
        /** Unpaid invoices that have a payment date (the "to pay" chip count). */
        unpaidDueCount?: number;
      }>(`/invoices${qs(params)}`, force),
    get: (id: string, force = false) =>
      get<ImportedInvoice>(`/invoices/${id}`, force),
    update: (id: string, body: { status?: string; client_name?: string | null; business?: string | null; expense_category?: string | null; cash_flow?: "income" | "expense" | null; document_category?: ImportedInvoice["document_category"] | null; provider_category?: GmailSearchProvider["category"] | null; payment_status?: string | null; currency?: string | null; issue_date?: string | null; payment_due_date?: string | null; note?: string | null }) =>
      put<ImportedInvoice>(`/invoices/${id}`, body),
    deleteSelected: (body: { ids: string[] }) =>
      post<{ ok: true; requested: number; deleted: number; documentsDeleted: number }>("/invoices/delete-selected", body),
    mergeVendors: (body: { supplierNames: string[]; canonicalName: string }) =>
      post<{ ok: true; matched: number; modified: number; supplierName: string }>("/invoices/vendors/merge", body),
    setSupplierCategory: (body: { supplierName: string; provider_category: GmailSearchProvider["category"] | null }) =>
      post<{ ok: true; matched: number; modified: number; supplierName: string; provider_category: string | null }>("/invoices/vendors/category", body),
    sendSixMonthReport: () =>
      post<{ ok: true; recipients: string[]; count: number; period: { from: string; to: string } }>("/invoices/reports/six-months/send", {}),
    expenseMonthly: (params?: { dateBasis?: "invoice" | "import"; proofFilter?: "all" | "paid" | "requested" | "income"; category?: string; supplier?: string; dateFrom?: string; dateTo?: string; top?: number }, force = false) =>
      get<InvoiceExpenseMonthlyResponse>(`/invoices/expenses/monthly${qs(params)}`, force),
    upload: async (
      files: File[],
      options?: { doAi?: boolean; doEntities?: boolean; doReminders?: boolean; reprocessDuplicates?: boolean; skipCloudStorage?: boolean; liteImport?: boolean },
      templateId?: string | number
    ) => {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const params = new URLSearchParams();
      if (options?.liteImport) params.set("liteImport", "true");
      if (options?.doAi === false) params.set("skipAi", "true");
      if (options?.doEntities === false) params.set("skipEntities", "true");
      if (options?.doReminders === false) params.set("skipReminders", "true");
      if (options?.reprocessDuplicates === true) params.set("reprocessDuplicates", "true");
      if (options?.skipCloudStorage === true) params.set("skipCloudStorage", "true");
      if (templateId) params.set("templateId", String(templateId));
      const p = params.toString();
      const url = `${BASE}/invoices/upload${p ? "?" + p : ""}`;
      const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as any;
        const err = new Error(data.error ?? `Upload failed: ${res.status}`) as any;
        err.serverMessage = data.message;
        err.remaining = data.remaining;
        err.limit = data.limit;
        throw err;
      }
      return res.json() as Promise<{ ids: string[]; duplicates: string[] }>;
    },
  },

  documents: {
    list: (params?: { status?: string; limit?: number; offset?: number; clientId?: string; inspectionType?: string }, force = false) => {
      return get<{
        rows: Document[];
        total: number;
        totalAll: number;
        documentLimit: number | null;
        documentQuotaUsed?: number;
          documentImportAllowed?: boolean;
          plan?: string;
        counts?: { all: number; done: number; in_progress: number; error: number };
        inspectionTypeCounts?: { type: string; count: number }[];
      }>(`/documents${qs(params)}`, force);
    },
    get: (id: string) => get<Document>(`/documents/${id}`),
    import: (filePath: string) => post<{ id: string }>("/documents/import", { filePath }),
    upload: async (
      files: File[],
      options?: { doAi?: boolean; doEntities?: boolean; doReminders?: boolean; reprocessDuplicates?: boolean; skipCloudStorage?: boolean; liteImport?: boolean },
      templateId?: string | number
    ) => {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const params = new URLSearchParams();
      if (options?.liteImport) params.set("liteImport", "true");
      if (options?.doAi === false) params.set("skipAi", "true");
      if (options?.doEntities === false) params.set("skipEntities", "true");
      if (options?.doReminders === false) params.set("skipReminders", "true");
      if (options?.reprocessDuplicates === true) params.set("reprocessDuplicates", "true");
      if (options?.skipCloudStorage === true) params.set("skipCloudStorage", "true");
      if (templateId) params.set("templateId", String(templateId));
      const qs = params.toString();
      const url = `${BASE}/documents/upload${qs ? "?" + qs : ""}`;
      const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as any;
        const err = new Error(data.error ?? `Upload failed: ${res.status}`) as any;
        err.serverMessage = data.message;
        err.remaining = data.remaining;
        err.limit = data.limit;
        throw err;
      }
      return res.json() as Promise<{ ids: string[]; duplicates: string[] }>;
    },
    uploadOne: async (
      file: File,
      options?: { doAi?: boolean; doEntities?: boolean; doReminders?: boolean; reprocessDuplicates?: boolean; skipCloudStorage?: boolean; liteImport?: boolean },
      templateId?: string | number
    ): Promise<{ id: string; duplicate: boolean }> => {
      const fd = new FormData();
      fd.append("files", file);
      const params = new URLSearchParams();
      if (options?.liteImport) params.set("liteImport", "true");
      if (options?.doAi === false) params.set("skipAi", "true");
      if (options?.doEntities === false) params.set("skipEntities", "true");
      if (options?.doReminders === false) params.set("skipReminders", "true");
      if (options?.reprocessDuplicates === true) params.set("reprocessDuplicates", "true");
      if (options?.skipCloudStorage === true) params.set("skipCloudStorage", "true");
      if (templateId) params.set("templateId", String(templateId));
      const qs = params.toString();
      const url = `${BASE}/documents/upload${qs ? "?" + qs : ""}`;
      const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as any;
        const err = new Error(data.error ?? `Upload failed: ${res.status}`) as any;
        err.serverMessage = data.message;
        err.remaining = data.remaining;
        err.limit = data.limit;
        throw err;
      }
      const json = await res.json() as { ids: string[]; duplicates: string[] };
      return { id: json.ids[0], duplicate: (json.duplicates ?? []).includes(json.ids[0]) };
    },
    extract: (id: string, templateId?: string) =>
      post<{ ok: boolean; fields: Record<string, unknown> | null; template: string; document: import('../shared/types.js').Document }>(`/documents/${id}/extract`, templateId ? { templateId } : {}),
    delete: (id: string) => del(`/documents/${id}`),
    downloadUrl: (id: string) => `${BASE}/documents/${id}/download`,
    rescan: (options?: { all?: boolean; mode?: "all" | "missing"; limit?: number }) =>
      post<{ queued: number; ids: string[]; mode: "all" | "missing"; candidates: number }>("/documents/rescan", options ?? {}),
    reprocess: (id: string) =>
      post<{ ok: boolean; fields?: Record<string, unknown> | null; document?: Document }>(`/documents/${id}/reprocess`),
    updateFields: (id: string, fields: Record<string, unknown>) =>
      put<{ ok: boolean; fields: Record<string, unknown> }>(`/documents/${id}/fields`, fields),
  },

  clients: {
    // withCounts opts into doc_count, which costs three extra collection scans
    // server-side. Only the clients page shows that column; everything else
    // (notably the documents page's client filter) wants just names and ids.
    list: (params?: { q?: string; limit?: number; offset?: number; withCounts?: 1 }, force = false) => {
      return get<{ rows: Client[]; total: number }>(`/clients${qs(params)}`, force);
    },
    get: (id: string) => get<ClientDetail>(`/clients/${id}`),
    create: (body: Partial<Client>) => post<Client>("/clients", body),
    update: (id: string, body: Partial<Client>) => put<Client>(`/clients/${id}`, body),
    delete: (id: string) => del(`/clients/${id}`),
    timeline: (id: string) => get(`/clients/${id}/timeline`),
    documents: (id: string) => get<Document[]>(`/clients/${id}/documents`),
    merge: (body: { sourceIds: string[]; canonicalId: string }) =>
      post<{ ok: true; merged: number; kept: string; clientName: string }>("/clients/merge", body),
  },

  contracts: {
    list: (params?: {
      clientId?: string;
      status?: string;
      limit?: number;
      offset?: number;
      kind?: "contract" | "inspection" | "all";
      search?: string;
      expiryFrom?: string;
      expiryTo?: string;
      due?: string;
      sort?: "serial" | "expiry";
      hasDocument?: "true" | "false";
    }, force = false) => {
      return get<{ rows: ContractWithClient[]; total: number; counts: { all: number; draft: number; active: number; expired: number; cancelled: number } }>(`/contracts${qs(params)}`, force);
    },
    duplicateReportNumbers: (force = false) =>
      get<{ numbers: string[]; rows: Array<{ number: string; count: number }> }>(
        "/contracts/duplicate-report-numbers",
        force,
      ),
    expiring: (days = 30) => get<ContractWithClient[]>(`/contracts/expiring?days=${days}`),
    get: (id: string) => get<ContractWithClient>(`/contracts/${id}`),
    byDocument: (documentId: string, force = false) => get<ContractWithClient[]>(`/contracts/by-document/${documentId}`, force),
    create: (body: Partial<Contract>) => post<Contract>("/contracts", body),
    update: (id: string, body: Partial<Contract>) => put<Contract>(`/contracts/${id}`, body),
    createReminder: (id: string) => post<{ ok: boolean; replaced: number; reminders: Reminder[] }>(`/contracts/${id}/reminder`),
    clone: (id: string, body?: { shift_months?: number; start_date?: string; expiry_date?: string }) =>
      post<Contract>(`/contracts/${id}/clone`, body ?? {}),
    delete: (id: string, params?: { deleteRelatedReminders?: boolean }) => del(`/contracts/${id}${qs(params)}`),
    deleteAll: () => del("/contracts"),
  },

  reminders: {
    list: (params?: { status?: string; days?: number; limit?: number; offset?: number; documentId?: string; sourceIds?: string; category?: string }, force = false) => {
      return get<{ rows: ReminderWithContext[]; total: number }>(`/reminders${qs(params)}`, force);
    },
    categories: (force = false) => get<{ categories: { name: string; count: number }[] }>("/reminders/categories", force),
    activity: (params?: { limit?: number; kind?: "email" | "document" }, force = false) =>
      get<{ rows: { id: string; kind: "email" | "document"; title: string; detail: string | null; at: string; status: "ok" | "failed" | "info"; document_id: string | null; client_name: string | null; recipient: string | null; subject: string | null; file_name: string | null; note: string | null; channel: "email" | "system" }[] }>(
        `/activity${qs(params)}`,
        force,
      ),
    senderInfo: () => get<{ email: string | null; name: string }>("/reminders/email-sender"),
    get: (id: string | number) => get<ReminderWithContext>(`/reminders/${id}`, true),
    create: (body: Partial<Reminder>) => post<Reminder>("/reminders", body),
    update: (id: string | number, body: Partial<Reminder>) => put<ReminderWithContext>(`/reminders/${id}`, body),
    delete: (id: string | number) => del(`/reminders/${id}`),
    deleteAll: () => del("/reminders"),
    dismiss: (id: string | number) => post(`/reminders/${id}/dismiss`),
    snooze: (id: number, until: string) => post(`/reminders/${id}/snooze`, { until }),
    sendNow: (id: string | number) => post<{ success: boolean; error?: string }>(`/reminders/${id}/send-now`),
    syncCalendar: (id: string | number) =>
      post<{ ok: boolean; synced: boolean; reminder: ReminderWithContext }>(`/reminders/${id}/sync-calendar`),
    previewEmail: (id: number | string) => get<{ subject: string; html: string }>(`/reminders/${id}/preview-email`, true),
    createHydraulicCheck: (body: HydraulicCheckRequest) =>
      post<HydraulicCheckResult>("/reminders/hydraulic-check", body),
    createPersonal: (body: {
      title: string;
      target_date: string;
      reminder_category?: string | null;
      email_to?: string | null;
      remind_before_days?: number | number[] | string | null;
      /** Extra warning days before target_date, one reminder each (for example [7, 1]). */
      advance_days?: number[];
      /** Email the account address as each reminder fires. */
      email_self?: boolean;
      /** "discovery" marks a reminder made from a discovered deadline. */
      origin?: "discovery";
      sync_calendar?: boolean;
      calendar_kind?: "task" | "event";
      calendar_time?: string | null;
    }) =>
      post<{ created: number }>("/reminders/personal", body),
  },

  notifications: {
    list: () => get<{ items: NotificationItem[]; unreadCount: number; triggered_count?: number }>("/notifications", true),
    markRead: (id: string) => post<{ ok: boolean }>(`/notifications/${id}/read`),
    markAllRead: () => post<{ ok: boolean }>("/notifications/read-all"),
  },

  review: {
    list: (params?: { status?: string; limit?: number; offset?: number }) =>
      get<{ items: ReviewItem[]; total: number }>(`/review${qs(params)}`),
    count: () => get<{ pending: number }>("/review/count", true),
    approve: (ids: string[]) => post<{ ok: boolean; approved: number; pending: number }>("/review/approve", { ids }),
    dismiss: (id: string) => post<{ ok: boolean; remindersDismissed: number; pending: number }>(`/review/${id}/dismiss`, {}),
  },

  tasks: {
    list: (params?: { status?: string; clientId?: number }) => {
      return get<Task[]>(`/tasks${qs(params)}`);
    },
    update: (id: number, body: Partial<Task>) => put<Task>(`/tasks/${id}`, body),
  },

  search: {
    global: (q: string, limit = 20) =>
      get<GlobalSearchResult>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  },

  email: {
    log: (params?: { limit?: number; offset?: number }) => {
      return get<{ rows: EmailLogEntry[]; total: number }>(`/email-log${qs(params)}`);
    },
    test: (to: string, templateId?: number | null) => post<{ success: boolean; error?: string }>("/email/test", { to, templateId }),
  },

  reports: {
    downloadMonthly: async (params: { year: number; month?: number; format: "docx" | "xlsx" | "csv"; fields?: string[]; clientId?: string; mode?: "all" | "client" }) => {
      const res = await fetch(`${BASE}/reports/monthly/download${qs(params)}`, {credentials: "include"});
      if (!res.ok) {
        const err = await res.json().catch(() => ({error: `HTTP ${res.status}`}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*=UTF-8''(.+)|filename="([^"]+)"/);
      const filename = match ? decodeURIComponent(match[1] ?? match[2]) : `contracts-report-${params.year}${params.month ? `-${String(params.month).padStart(2, "0")}` : ""}.${params.format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    sendMonthly: (body?: {
      year?: number;
      month?: number;
      formats?: string[];
      recipients?: string[];
      clientId?: string;
      fields?: string[];
      deliveryMode?: "combined" | "client";
    }) =>
      post<{ success: boolean; count?: number; reportsSent?: number; error?: string }>("/reports/monthly/send", body ?? {}),
  },

  profile: {
    // Reads come from GET /api/auth/me (the auth store) — this is the write half.
    saveUser: (body: Partial<User>) => put<Partial<User>>("/user", body),
    getSubscription: () => get<ProfileSubscription>("/profile/subscription"),
    deleteAccount: (body: { confirm: "DELETE_ACCOUNT"; email?: string }) =>
      post<{ ok: boolean }>("/profile/account/delete", body),
    getSpendingAlerts: () => get<{ alerts: SpendingAlert[] }>("/user/spending-alerts"),
    saveSpendingAlerts: (alerts: SpendingAlert[]) => put<{ alerts: SpendingAlert[] }>("/user/spending-alerts", { alerts }),
  },

  userSettings: {
    get: () => get<UserSettings>("/user-settings"),
    save: (body: Partial<PipelineFlags & Pick<UserSettings, "theme" | "email_from_name" | "reminder_advance_days" | "ocr_language" | "monthly_report_enabled" | "monthly_report_recipients" | "monthly_report_day" | "monthly_report_hour" | "monthly_report_formats" | "monthly_report_last_sent" | "monthly_report_last_error" | "report_config" | "calendar_next_tests_only" | "features" | "discovery_auto_scan" | "discovery_langs" | "whats_new_seen" | "discovery_scan_frequency" | "invoices_auto_scan">>) =>
      put<UserSettings>("/user-settings", body),
  },

  review: {
    list: (params: { status?: "pending" | "approved" | "dismissed"; limit?: number; offset?: number } = {}) =>
      get<{ items: ReviewItem[]; total: number }>(`/review${qs(params)}`, true),
    count: () => get<{ pending: number }>("/review/count", true),
    approve: (ids: string[]) => post<{ ok: boolean; approved: number; pending: number }>("/review/approve", { ids }),
    dismiss: (id: string) => post<{ ok: boolean; remindersDismissed: number; pending: number }>(`/review/${encodeURIComponent(id)}/dismiss`),
  },

  features: {
    list: () => get<{ rows: FeatureDefinition[] }>("/features"),
  },

  admin: {
    listUsers: () => adminGet<any[]>("/admin/users"),
    updateUser: (id: string, body: {
      email?: string | null;
      username?: string | null;
      password?: string | null;
      name?: string | null;
      phone?: string | null;
      company_name?: string | null;
      picture_url?: string | null;
      role?: string;
      plan?: string;
      is_active?: boolean | number;
      email_verified?: boolean | number;
    }) => adminPut<any>(`/admin/users/${id}`, body),
      updateUserTier: (id: string, plan: "digital" | "basic" | "business", payment?: {
          billing: "one_time" | "monthly" | "yearly";
          months?: number;
          paymentId: string;
          paidAt: string;
      }) => adminPost<any>(`/admin/users/${id}/tier`, {plan, ...payment}),
    createMagicLink: (body: {
      email?: string | null;
      username?: string | null;
      password?: string | null;
      name?: string | null;
      role?: string;
      plan?: string;
      is_active?: boolean | number;
      email_verified?: boolean | number;
      company_name?: string | null;
      phone?: string | null;
      picture_url?: string | null;
      issue_link?: boolean;
    }) =>
      adminPost<{
        ok: boolean;
        isNewUser: boolean;
        expiresInMinutes: number | null;
        magicLink: string | null;
        user: any;
      }>("/admin/users/magic-link", body),
    issueMagicLinkForUser: (id: string) =>
      adminPost<{ ok: boolean; magicLink: string; expiresInMinutes: number }>(`/admin/users/${id}/magic-link`, {}),
    getDbTargets: () => adminGet<{
      active: AdminDbTarget;
      primary: AdminDbTarget;
      local: { configured: boolean; connected: boolean; dbName: string; host: string };
      production: {
        configured: boolean;
        connected: boolean;
        dbName: string;
        host: string | null;
        sameAsLocal: boolean;
      };
    }>("/admin/db-targets"),
    listInspectorLeads: (params?: { page?: number; limit?: number; source?: string | null; status?: string | null; q?: string | null; unsubscribed?: "hide" | "only" | null }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.source) qs.set("source", params.source);
      if (params?.status) qs.set("status", params.status);
      if (params?.q) qs.set("q", params.q);
      if (params?.unsubscribed) qs.set("unsubscribed", params.unsubscribed);
      const query = qs.toString();
      return adminGet<InspectorLeadsResponse>(`/admin/inspector-leads${query ? "?" + query : ""}`);
    },
    updateInspectorLeadStatus: (id: string, contactStatus: InspectorLeadStatus) =>
      adminPut<InspectorLead>(`/admin/inspector-leads/${id}/status`, { contactStatus }),
    listInspectorLeadEmailSends: (params?: { page?: number; limit?: number; campaign?: string | null; q?: string | null }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.campaign) qs.set("campaign", params.campaign);
      if (params?.q) qs.set("q", params.q);
      const query = qs.toString();
      return adminGet<InspectorLeadEmailSendsResponse>(`/admin/inspector-leads/email-sends${query ? "?" + query : ""}`);
    },
    setInspectorLeadUnsubscribed: (id: string, unsubscribed: boolean) =>
      adminPut<InspectorLead>(`/admin/inspector-leads/${id}/unsubscribed`, { unsubscribed }),
    listInspectorLeadUnsubscribes: () =>
      adminGet<{ rows: InspectorLead[]; total: number }>("/admin/inspector-leads/unsubscribes"),
    importCampaignLeads: (file: File, mode: "fill" | "overwrite" = "fill") =>
      adminUpload<CampaignLeadImportResult>("/admin/campaigns/import-leads", "file", file, { mode }),
    uploadCampaignImage: (file: File) =>
      adminUpload<{ url: string }>("/admin/campaigns/images", "image", file),
    renderCampaign: (subject: string, html: string) =>
      adminPost<{ subject: string; html: string }>("/admin/campaigns/render", { subject, html }),
    listCampaigns: () => adminGet<{ rows: EmailCampaign[] }>("/admin/campaigns"),
    getCampaign: (id: string) => adminGet<EmailCampaign>(`/admin/campaigns/${id}`),
    createCampaign: (body: { name: string; subject?: string; html?: string }) =>
      adminPost<EmailCampaign>("/admin/campaigns", body),
    updateCampaign: (id: string, body: { name?: string; subject?: string; html?: string }) =>
      adminPut<EmailCampaign>(`/admin/campaigns/${id}`, body),
    previewCampaignAudience: (id: string, audience: EmailCampaignAudience) =>
      adminPost<CampaignAudiencePreview>(`/admin/campaigns/${id}/audience`, { audience }),
    sendCampaignTest: (id: string, to?: string) =>
      adminPost<{ ok: true; to: string }>(`/admin/campaigns/${id}/test`, to ? { to } : {}),
    sendCampaign: (id: string, audience: EmailCampaignAudience, expectedCount: number) =>
      adminPost<{ ok: true; queued: number }>(`/admin/campaigns/${id}/send`, { audience, expectedCount }),
    pauseCampaign: (id: string) => adminPost<{ ok: true }>(`/admin/campaigns/${id}/pause`, {}),
    resumeCampaign: (id: string) => adminPost<{ ok: true }>(`/admin/campaigns/${id}/resume`, {}),
    listUnsubscribeScans: () =>
      adminGet<{ schedule: { enabled: boolean; intervalMinutes: number }; rows: UnsubscribeScanRun[] }>("/admin/inspector-leads/unsubscribe-scans"),
    scanInspectorLeadUnsubscribes: () =>
      adminPost<UnsubscribeScanResult>("/admin/inspector-leads/scan-unsubscribes", {}),
    getDocument: (id: string) => adminGet<any>(`/admin/documents/${id}`),
    monitorDocuments: () => adminGet<any>("/admin/monitor/documents"),
    monitorExtractions: (params?: { user_id?: string; page?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.user_id) qs.set("user_id", params.user_id);
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      const q = qs.toString();
      return adminGet<any>(`/admin/monitor/extractions${q ? "?" + q : ""}`);
    },
    monitorReminders: () => adminGet<any>("/admin/monitor/reminders"),
    monitorScheduler: () => adminGet<any>("/admin/monitor/scheduler"),
    monitorMonthlyReports: () => adminGet<any>("/admin/monitor/monthly-reports"),
    monitorExtractionQuality: () => adminGet<any>("/admin/monitor/extraction-quality"),
    monitorPipelineGaps: () => adminGet<any>("/admin/monitor/pipeline-gaps"),
    monitorContractAdvances: () => adminGet<any>("/admin/monitor/contract-advances"),
    monitorBadEmails: () => adminGet<any>("/admin/monitor/bad-emails"),
    monitorSystemHealth: () => adminGet<any>("/admin/monitor/system-health"),
    monitorServerLive: (range = "1h") => adminGet<any>(`/admin/monitor/server-live?range=${encodeURIComponent(range)}`),
    sendTestServerAlert: () => adminPost<{ ok: true }>("/admin/monitor/test-alert", {}),
    monitorImportQueue: () => adminGet<any>("/admin/monitor/import-queue"),
    monitorInvoices: () => adminGet<any>("/admin/monitor/invoices"),
    monitorStorageDrive: () => adminGet<any>("/admin/monitor/storage-drive"),
    monitorProcesses: () => adminGet<any>("/admin/monitor/processes"),
    setProcessPaused: (id: string, paused: boolean, reason?: string) =>
      adminPost<any>(`/admin/processes/${id}/pause`, { paused, reason }),
    processJobs: (id: string, limit = 20, userId?: string | null) =>
      adminGet<{ rows: any[] }>(
        `/admin/processes/${id}/jobs?limit=${limit}${userId ? `&userId=${encodeURIComponent(userId)}` : ""}`,
      ),
    cancelProcessJob: (id: string, jobId: string) =>
      adminPost<any>(`/admin/processes/${id}/jobs/${jobId}/cancel`, {}),
    sweepTempFiles: () => adminPost<any>("/admin/temp-files/sweep", {}),
    listFeatures: () => adminGet<{ rows: FeatureDefinition[] }>("/features"),
    getAdminSettings: () => adminGet<any>("/admin/settings"),
    getUserDetail: (id: string) => adminGet<any>(`/admin/users/${id}/detail`),
    getUserSettings: (id: string) => adminGet<any>(`/admin/users/${id}/settings`),
    saveUserSettings: (id: string, body: Partial<UserSettings & { default_email_template_id: number | string | null }>) =>
      adminPut<{ ok: boolean }>(`/admin/users/${id}/settings`, body),
    setUserDefaultTemplate: (id: string, templateId: number | null) => {
      return fetch(`${ADMIN_BASE}/admin/users/${id}/settings`, {
        method: "PUT", credentials: "include",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ default_email_template_id: templateId }),
      }).then((r) => {
        if (!r.ok) throw new Error(`PUT /admin/users/${id}/settings failed: ${r.status}`);
        return r.json();
      });
    },
    downloadDocument: (id: string) => adminGet<any>(`/admin/documents/${id}/download`),
    reprocessDocument: (id: string) => {
      return fetch(`${ADMIN_BASE}/admin/documents/${id}/reprocess`, {
        method: "POST",
        credentials: "include",
        headers: adminHeaders({ "Content-Type": "application/json" }),
      }).then(r => r.json());
    },
    retryEscalation: (reminderId: string) => {
      return fetch(`${ADMIN_BASE}/admin/reminders/${reminderId}/retry-escalation`, {
        method: "POST",
        credentials: "include",
        headers: adminHeaders({ "Content-Type": "application/json" }),
      }).then(r => r.json());
    },
    triggerMonthlyReport: (userId: string) => {
      return fetch(`${ADMIN_BASE}/admin/monthly-reports/trigger/${userId}`, {
        method: "POST",
        credentials: "include",
        headers: adminHeaders({ "Content-Type": "application/json" }),
      }).then(r => r.json());
    },
    pushVapidKey: () => adminGet<{ key: string | null }>("/admin/push/vapid-key"),
    pushSubscribe: (body: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
      fetch(`${ADMIN_BASE}/admin/push/subscribe`, {
        method: "POST", credentials: "include",
        headers: adminHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body),
      }).then(r => r.json()),
    pushUnsubscribe: (endpoint: string) =>
      fetch(`${ADMIN_BASE}/admin/push/unsubscribe`, {
        method: "POST", credentials: "include",
        headers: adminHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ endpoint }),
      }).then(r => r.json()),
    pushTest: () =>
      fetch(`${ADMIN_BASE}/admin/push/test`, {
        method: "POST", credentials: "include",
        headers: adminHeaders({ "Content-Type": "application/json" }),
      }).then(r => r.json()),
    browseStorage: (params?: { user_id?: string; prefix?: string }) => {
      const qs = new URLSearchParams();
      if (params?.user_id) qs.set("user_id", params.user_id);
      if (params?.prefix) qs.set("prefix", params.prefix);
      const q = qs.toString();
      return adminGet<any>(`/admin/storage/browse${q ? "?" + q : ""}`);
    },
    storageDownloadUrl: (key: string) =>
      `${ADMIN_BASE}/admin/storage/download?key=${encodeURIComponent(key)}&admin_db_target=${encodeURIComponent(getAdminDbTarget())}`,
    deleteStorageFile: (key: string) =>
      fetch(`${ADMIN_BASE}/admin/storage/delete?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
        credentials: "include",
        headers: adminHeaders(),
      }).then(r => r.json()),
    listStorageFolders: () => adminGet<any>("/admin/storage/folders"),
    // `confirm` must equal the prefix; `force` overrides the refusal to delete
    // objects still linked to documents.
    deleteStorageFolder: (prefix: string, opts?: { force?: boolean }) => {
      const qs = new URLSearchParams({ prefix, confirm: prefix });
      if (opts?.force) qs.set("force", "true");
      return fetch(`${ADMIN_BASE}/admin/storage/folder?${qs.toString()}`, {
        method: "DELETE",
        credentials: "include",
        headers: adminHeaders(),
      }).then(r => r.json());
    },
  },

  config: {
    get: () => get<{ userDocumentLimit: number; appEnv: string; dbName: string }>("/config"),
    getAdmin: () => adminGet<{ userDocumentLimit: number; appEnv: string; dbName: string }>("/config"),
  },

  settings: {
    get: () => get<AppSettings>("/settings"),
    save: (body: Partial<AppSettings>) => post<AppSettings>("/settings", body),
  },

  docTemplates: {
    list: () => get<DocTemplate[]>("/doc-templates"),
    kinds: () => get<{ kinds: string[] }>("/doc-templates/kinds"),
    suggestKind: (body: { name: string; description: string; fields: unknown[]; match_keywords: string[] }) =>
      post<{ kind: string | null }>("/doc-templates/suggest-kind", body),
    get: (id: string | number) => get<DocTemplate>(`/doc-templates/${id}`),
    create: (body: Partial<DocTemplate>) => post<DocTemplate>("/doc-templates", body),
    update: (id: number, body: Partial<DocTemplate>) => put<DocTemplate>(`/doc-templates/${id}`, body),
    delete: (id: number) => del(`/doc-templates/${id}`),
    generateFromText: (text: string) =>
      post<{ draft: Partial<DocTemplate>; usage: unknown; model: string; exec_ms: number }>(
        "/doc-templates/generate-from-text",
        { text }
      ),
    generateFromFile: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/doc-templates/generate-from-file`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      return res.json() as Promise<{ draft: Partial<DocTemplate>; sample_text_preview: string; usage: unknown; model: string; exec_ms: number }>;
    },
    testExtract: async (file: File, tpl: Partial<DocTemplate>) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("fields", JSON.stringify(tpl.fields ?? []));
      if (tpl.document_kind) fd.append("document_kind", tpl.document_kind);
      if (tpl.expiry_field) fd.append("expiry_field", tpl.expiry_field);
      const res = await fetch(`${BASE}/doc-templates/test-extract`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      return res.json() as Promise<{ fields: Record<string, unknown> | null; raw_json: string; text_preview: string; model: string; exec_ms: number; error: string | null }>;
    },
  },

  emailTemplates: {
    list: () => get<EmailTemplate[]>("/email-templates"),
    get: (id: string) => get<EmailTemplate>(`/email-templates/${id}`),
    create: (body: Partial<EmailTemplate>) => post<EmailTemplate>("/email-templates", body),
    update: (id: string, body: Partial<EmailTemplate>) => put<EmailTemplate>(`/email-templates/${id}`, body),
    delete: (id: string) => del(`/email-templates/${id}`),
    sendTest: (id: string, body: Record<string, string | boolean>) => post<{ success: boolean; error?: string }>(`/email-templates/${id}/send-test`, body),
    detectVars: (html: string) => post<{ vars: string[] }>("/email-templates/vars", { html }),
    preview: (html: string, subject: string, vars: Record<string, unknown>) =>
      post<{ html: string; subject: string }>("/email-templates/preview", { html, subject, vars }),
    getDefault: (name: "default" | "inspection" | "contract" | "invoice" | "verify-email" | "reset-password") =>
      get<{ html: string }>(`/email-templates/defaults/${name}`),
    uploadAsset: async (kind: "poster" | "doc", file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch(`${BASE}/email-templates/asset`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      return res.json() as Promise<{ url: string }>;
    },
  },

  gmail: {
    scanObligations: (langs: string[], months: number) => post<{ scanned: number; proposals: ObligationSuggestion[] }>(`/gmail/obligation/scan${qs({ langs: langs.join(","), months })}`),
    discoveries: () => get<{ proposals: ObligationSuggestion[] }>("/gmail/obligation/saved", true),
    discovery: (id: string) => get<ObligationSuggestion & { preview_html: string }>(`/gmail/obligation/saved/${encodeURIComponent(id)}`, true),
    updateDiscovery: (id: string, status: "new" | "created" | "dismissed") => put<{ ok: boolean }>(`/gmail/obligation/saved/${encodeURIComponent(id)}`, { status }),
    discoveryPdfUrl: (id: string, fileId: string) => `${BASE}/gmail/obligation/saved/${encodeURIComponent(id)}/pdf/${encodeURIComponent(fileId)}`,
    status: () => get<{ connected: boolean; source: string | null; email: string | null }>("/gmail/status"),
      authUrl: (returnTo?: string, purpose?: "gmail" | "drive" | "all") => get<{
          url: string
      }>(`/gmail/auth-url${qs({returnTo, purpose})}`),
    searchProviders: () => get<{ providers: GmailSearchProvider[] }>("/gmail/search-providers"),
    inbox: (q?: string, limit?: number, pageToken?: string, templateId?: string) => get<{ emails: GmailEmail[]; nextPageToken: string | null; resultSizeEstimate: number | null }>(`/gmail/inbox${qs({ q, limit, pageToken, templateId })}`),
    linkOnlyInbox: (limit?: number, pageToken?: string, templateId?: string) => get<{ emails: GmailLinkOnlyEmail[]; nextPageToken: string | null; resultSizeEstimate: number | null }>(`/gmail/inbox/inline-only${qs({ limit, pageToken, templateId })}`),
    importInline: (messageId: string, templateId?: string) =>
      post<{ invoiceId: string; receipt: { vendor: string; transactionId: string; amount: number; currency: string } }>("/gmail/inbox/import-inline", { messageId, templateId }),
    importInlineAll: (messageIds: string[], templateId?: string) =>
      post<GmailImportJob>("/gmail/inbox/import-inline-all", { messageIds, templateId }),
    attachmentUrl: (messageId: string, attachmentId: string, filename: string) =>
      `${BASE}/gmail/attachment/${messageId}/${attachmentId}?filename=${encodeURIComponent(filename)}`,
    importAttachment: (messageId: string, attachmentId: string, filename: string, templateId?: string) =>
      post<{ documentId: string; filename: string }>("/gmail/import-attachment", { messageId, attachmentId, filename, templateId }),
    importAll: (q?: string, limit?: number, templateId?: string) =>
      post<GmailImportJob>("/gmail/import-all", { q, limit, templateId }),
    importRetry: (mode: "failed" | "rejected" | "retryable", q?: string, templateId?: string) =>
      post<GmailImportJob>("/gmail/import-retry", { mode, q, templateId }),
    importJob: (jobId: string) => get<GmailImportJob>(`/gmail/import-jobs/${encodeURIComponent(jobId)}`),
    importHistory: () => get<{ history: GmailImportHistoryItem[] }>("/gmail/import-history"),
    deleteImportHistory: (messageId: string) => del(`/gmail/import-history/${encodeURIComponent(messageId)}`),

    disconnect: () => del("/gmail/disconnect"),
  },

  calendar: {
    status: () => get<{
      allowed: boolean;
      connected: boolean;
      calendar_id: string | null;
      calendar_url: string | null;
      calendar_name: string;
      email: string | null;
      synced_count: number;
      last_synced_at: string | null;
    }>("/calendar/status"),
    authUrl: (returnTo?: string) => get<{ url: string }>(`/calendar/auth-url${qs({ returnTo })}`),
    sync: () => post<{ pushed: number; updated: number; cancelled: number }>("/calendar/sync", {}),
    disconnect: () => post<{ ok: boolean }>("/calendar/disconnect", {}),
    rename: (name: string) => post<{ ok: boolean; name: string; synced: boolean }>("/calendar/name", {name}),
    feedStatus: () => get<{ allowed: boolean; enabled: boolean; path: string | null }>("/calendar/feed/status", true),
    feedEnable: () => post<{ enabled: boolean; path: string }>("/calendar/feed/token", {}),
    feedDisable: () => del("/calendar/feed"),
  },

  inboundEmail: {
    status: () => get<InboundEmailStatus>("/inbound-email/status", true),
    enable: () => post<InboundEmailStatus>("/inbound-email/token", {}),
    disable: () => del("/inbound-email"),
  },

  drive: {
    status: () => get<DriveStatus>("/drive/status"),
    enable: (folderName?: string) => post<{
      ok: boolean;
      folderId: string;
      folderUrl: string;
      recreated?: boolean;
      resetCount?: number;
    }>("/drive/enable", folderName ? {folderName} : {}),
    disable: () => post<{ ok: boolean }>("/drive/disable", {}),
    exportAll: () => post<DriveExportJob>("/drive/export-all", {}),
    exportJob: (jobId: string) => get<DriveExportJob>(`/drive/export-jobs/${encodeURIComponent(jobId)}`),
    renameFolder: (name: string) => post<{ ok: boolean; folderName: string }>("/drive/rename-folder", {name}),
  },

  equipment: {
    list: (params?: { category?: string; q?: string; client_id?: string }, force = false) =>
      get<Equipment[]>(`/equipment${qs(params)}`, force),
    stats: () => get<Record<string, number>>("/equipment/stats"),
    get: (id: string) => get<Equipment>(`/equipment/${id}`),
    create: (body: Partial<Equipment>) => post<Equipment>("/equipment", body),
    update: (id: string, body: Partial<Equipment>) => put<Equipment>(`/equipment/${id}`, body),
    delete: (id: string) => del(`/equipment/${id}`),
    deleteAll: () => del("/equipment"),
    expiryCalendar: (params?: { from?: string; to?: string }) =>
      get<ExpiryCalendarItem[]>(`/equipment/expiry-calendar${qs(params)}`),
    history: (id: string) => get<EquipmentHistoryEvent[]>(`/equipment/${id}/history`),
      saveChecklist: (id: string, checklist: NonNullable<Equipment["inspection_checklist"]>) =>
          put<{
              ok: boolean;
              checklist: NonNullable<Equipment["inspection_checklist"]>
          }>(`/equipment/${id}/checklist`, {checklist}),
    downloadReport: async (id: string) => {
      const res = await fetch(`${BASE}/equipment/${id}/report.pdf`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*=UTF-8''(.+)|filename="([^"]+)"/);
      const filename = match
        ? decodeURIComponent(match[1] ?? match[2])
        : `equipment-${id}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    },
    importPreview: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/equipment/import-xlsx/preview`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      return res.json() as Promise<{ headers: string[]; total: number; preview: Record<string, string>[] }>;
    },
    importConfirm: async (file: File, mapping: Record<string, string>) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));
      const res = await fetch(`${BASE}/equipment/import-xlsx/confirm`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      return res.json() as Promise<{ ok: boolean; created: number; skipped: number }>;
    },
    uploadPhoto: async (id: string, file: File) => {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`${BASE}/equipment/${id}/photos`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      return res.json() as Promise<{ url: string; key: string; taken_at: string }>;
    },
    deletePhoto: async (id: string, key: string) => {
      const res = await fetch(`${BASE}/equipment/${id}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    },
    getSignedPhotos: (id: string) =>
      get<{ photos: { url: string; key: string; taken_at: string }[] }>(`/equipment/${id}/photos/signed`),
    categories: () => get<{ id: string; value: string; label: string }[]>("/equipment/categories"),
    createCategory: (value: string, label: string) =>
        post<{ id: string; value: string; label: string; exists?: boolean }>("/equipment/categories", {value, label}),
    deleteCategory: (id: string) => del(`/equipment/categories/${id}`),
  },

  printTemplates: {
    list: () => get<PrintTemplate[]>("/print-templates"),
    listDrafts: () => get<PrintTemplateDraftSummary[]>("/print-templates/drafts"),
    get: (id: string) => get<PrintTemplate>(`/print-templates/${id}`),
    create: (body: Partial<PrintTemplate>) => post<PrintTemplate>("/print-templates", body),
    update: (id: string, body: Partial<PrintTemplate>) => put<PrintTemplate>(`/print-templates/${id}`, body),
    delete: (id: string) => del(`/print-templates/${id}`),
    getDraft: (id: string) => get<{
      data: Record<string, string>;
      meta?: Record<string, unknown>;
      client_id?: string | null;
      contract_id?: string | null;
      updated_at: string | null;
    }>(`/print-templates/${id}/draft`),
    getContractDraft: (contractId: string) => get<{
      template_id: string;
      template_name: string;
      editor_type?: "grid" | "sections";
      data: Record<string, string>;
      meta?: Record<string, unknown>;
      client_id?: string | null;
      contract_id?: string | null;
      updated_at: string | null;
    }>(`/contracts/${contractId}/print-draft`),
    getDraftForContract: (id: string, contractId: string) => get<{
      data: Record<string, string>;
      meta?: Record<string, unknown>;
      client_id?: string | null;
      contract_id?: string | null;
      updated_at: string | null;
    }>(`/print-templates/${id}/draft?contractId=${encodeURIComponent(contractId)}`),
    saveDraft: (id: string, data: Record<string, string>, meta?: Record<string, unknown>) =>
      put<{
        ok: boolean;
        data: Record<string, string>;
        meta: Record<string, unknown>;
        client_id: string | null;
        contract_id: string | null;
        updated_at: string;
      }>(`/print-templates/${id}/draft`, { data, meta }),
    deleteDraft: (id: string, contractId?: string | null) =>
      del(`/print-templates/${id}/draft${contractId ? `?contractId=${encodeURIComponent(contractId)}` : ""}`),
    renderPdf: async (id: string, data: Record<string, unknown>) => {
      const res = await fetch(`${BASE}/print-templates/${id}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      return res.blob();
    },
    savePdf: async (id: string, data: Record<string, unknown>, meta?: Record<string, unknown>) => {
      const res = await fetch(`${BASE}/print-templates/${id}/pdf/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data, meta }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(text) as { error?: unknown };
          if (parsed?.error) message = String(parsed.error);
        } catch { /* body was not JSON */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      if (!(blob instanceof Blob)) throw new Error("PDF save did not return a file");
      return {
        blob,
        documentId: res.headers.get("X-Document-Id"),
        savedToS3: res.headers.get("X-Saved-To-S3") === "true",
      };
    },
  },

  assets: {
    uploadLogo: async (file: File) => {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch(`${BASE}/assets/logo`, {method: "POST", body: fd, credentials: "include"});
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      return res.json() as Promise<{ logo_path: string; url?: string; key?: string }>;
    },
    uploadUserAsset: async (file: File, kind = "signature") => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch(`${BASE}/assets/user`, {method: "POST", body: fd, credentials: "include"});
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Upload failed: ${res.status}`);
      return res.json() as Promise<{ url: string; key: string }>;
    },
    url: (name: string) => /^https?:\/\//i.test(name) ? name : `${BASE}/assets/${name}`,
  },
};
