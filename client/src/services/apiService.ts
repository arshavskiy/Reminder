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
    PipelineFlags,
    PrintTemplate,
    Reminder,
    ReminderWithContext,
    Task,
    UserSettings,
} from "../../src/shared/types.js";

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
  business: {
    display_name: string;
    entity_type?: string;
    id_number?: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    address?: string;
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
  check_date?: string;
  next_inspection_date?: string;
  interval_months?: 4 | 6 | 12 | 14;
  skip_reminders?: boolean;
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
}

export interface PrintTemplateDraftSummary {
  _id: string;
  template_id: string;
  template_name: string;
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

// Admin panel always hits the production server when VITE_ADMIN_API_BASE is set.
const ADMIN_SERVER = (import.meta.env.VITE_ADMIN_API_BASE as string | undefined) || SERVER;
const ADMIN_BASE = `${ADMIN_SERVER}/api`;


async function get<T>(path: string, force = false): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: "include",
    cache: force ? "reload" : "default",
  });
  if (!res.ok) {
    const err = new Error(`GET ${path} failed: ${res.status}`) as any;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
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
  return res.json() as Promise<T>;
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
  return res.json() as Promise<T>;
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

async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(ADMIN_BASE + path, { credentials: "include" });
  if (!res.ok) {
    const err = new Error(`GET ${path} failed: ${res.status}`) as any;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

async function adminPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(ADMIN_BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
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
export const api = {
  dashboard: {
    stats: (force = false) => get<DashboardStats>("/dashboard/stats", force),
  },

  documents: {
    list: (params?: { status?: string; limit?: number; offset?: number; clientId?: string }, force = false) => {
      return get<{ rows: Document[]; total: number; totalAll: number; documentLimit: number; counts?: { all: number; done: number; in_progress: number; error: number } }>(`/documents${qs(params)}`, force);
    },
    get: (id: string) => get<Document>(`/documents/${id}`),
    import: (filePath: string) => post<{ id: string }>("/documents/import", { filePath }),
    upload: async (
      files: File[],
      options?: { doAi?: boolean; doEntities?: boolean; doReminders?: boolean },
      templateId?: number
    ) => {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const params = new URLSearchParams();
      if (options?.doAi === false) params.set("skipAi", "true");
      if (options?.doEntities === false) params.set("skipEntities", "true");
      if (options?.doReminders === false) params.set("skipReminders", "true");
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
      options?: { doAi?: boolean; doEntities?: boolean; doReminders?: boolean },
      templateId?: number
    ): Promise<{ id: string; duplicate: boolean }> => {
      const fd = new FormData();
      fd.append("files", file);
      const params = new URLSearchParams();
      if (options?.doAi === false) params.set("skipAi", "true");
      if (options?.doEntities === false) params.set("skipEntities", "true");
      if (options?.doReminders === false) params.set("skipReminders", "true");
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
    list: (params?: { q?: string; limit?: number; offset?: number }, force = false) => {
      return get<{ rows: Client[]; total: number }>(`/clients${qs(params)}`, force);
    },
    get: (id: string) => get<ClientDetail>(`/clients/${id}`),
    create: (body: Partial<Client>) => post<Client>("/clients", body),
    update: (id: string, body: Partial<Client>) => put<Client>(`/clients/${id}`, body),
    delete: (id: string) => del(`/clients/${id}`),
    deleteAll: () => del("/clients"),
    timeline: (id: string) => get(`/clients/${id}/timeline`),
    documents: (id: string) => get<Document[]>(`/clients/${id}/documents`),
  },

  contracts: {
    list: (params?: { clientId?: string; status?: string; limit?: number; kind?: "contract" | "inspection" | "all" }, force = false) => {
      return get<{ rows: ContractWithClient[]; total: number }>(`/contracts${qs(params)}`, force);
    },
    expiring: (days = 30) => get<ContractWithClient[]>(`/contracts/expiring?days=${days}`),
    get: (id: string) => get<ContractWithClient>(`/contracts/${id}`),
    byDocument: (documentId: string, force = false) => get<ContractWithClient[]>(`/contracts/by-document/${documentId}`, force),
    create: (body: Partial<Contract>) => post<Contract>("/contracts", body),
    update: (id: string, body: Partial<Contract>) => put<Contract>(`/contracts/${id}`, body),
    createReminder: (id: string) => post<{ ok: boolean; replaced: number; reminders: Reminder[] }>(`/contracts/${id}/reminder`),
    delete: (id: string, params?: { deleteRelatedReminders?: boolean }) => del(`/contracts/${id}${qs(params)}`),
    deleteAll: () => del("/contracts"),
  },

  reminders: {
    list: (params?: { status?: string; days?: number; limit?: number; documentId?: string }, force = false) => {
      return get<{ rows: ReminderWithContext[]; total: number }>(`/reminders${qs(params)}`, force);
    },
    senderInfo: () => get<{ email: string | null; name: string }>("/reminders/email-sender"),
    create: (body: Partial<Reminder>) => post<Reminder>("/reminders", body),
    update: (id: number, body: Partial<Reminder>) => put<Reminder>(`/reminders/${id}`, body),
    delete: (id: number) => del(`/reminders/${id}`),
    deleteAll: () => del("/reminders"),
    dismiss: (id: number) => post(`/reminders/${id}/dismiss`),
    snooze: (id: number, until: string) => post(`/reminders/${id}/snooze`, { until }),
    sendNow: (id: number) => post<{ success: boolean; error?: string }>(`/reminders/${id}/send-now`),
    createHydraulicCheck: (body: HydraulicCheckRequest) =>
      post<HydraulicCheckResult>("/reminders/hydraulic-check", body),
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

  userSettings: {
    get: () => get<UserSettings>("/user-settings"),
    save: (body: Partial<PipelineFlags & Pick<UserSettings, "theme" | "email_from_name" | "reminder_advance_days" | "ocr_language" | "monthly_report_enabled" | "monthly_report_recipients" | "monthly_report_day" | "monthly_report_hour" | "monthly_report_formats" | "monthly_report_last_sent" | "monthly_report_last_error" | "report_config" | "calendar_next_tests_only" | "features">>) =>
      put<UserSettings>("/user-settings", body),
  },

  features: {
    list: () => get<{ rows: FeatureDefinition[] }>("/features"),
  },

  admin: {
    listUsers: () => adminGet<any[]>("/admin/users"),
    updateUser: (id: string, body: { role?: string; is_active?: number }) =>
      adminPut<any>(`/admin/users/${id}`, body),
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
    listFeatures: () => adminGet<{ rows: FeatureDefinition[] }>("/features"),
    getAdminSettings: () => adminGet<any>("/admin/settings"),
    getUserDetail: (id: string) => adminGet<any>(`/admin/users/${id}/detail`),
    getUserSettings: (id: string) => adminGet<any>(`/admin/users/${id}/settings`),
    saveUserSettings: (id: string, body: Partial<UserSettings & { default_email_template_id: number | string | null }>) =>
      adminPut<{ ok: boolean }>(`/admin/users/${id}/settings`, body),
    setUserDefaultTemplate: (id: string, templateId: number | null) => {
      return fetch(`${ADMIN_BASE}/admin/users/${id}/settings`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
      }).then(r => r.json());
    },
    retryEscalation: (reminderId: string) => {
      return fetch(`${ADMIN_BASE}/admin/reminders/${reminderId}/retry-escalation`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }).then(r => r.json());
    },
    triggerMonthlyReport: (userId: string) => {
      return fetch(`${ADMIN_BASE}/admin/monthly-reports/trigger/${userId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }).then(r => r.json());
    },
    pushVapidKey: () => adminGet<{ key: string | null }>("/admin/push/vapid-key"),
    pushSubscribe: (body: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
      fetch(`${ADMIN_BASE}/admin/push/subscribe`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then(r => r.json()),
    pushUnsubscribe: (endpoint: string) =>
      fetch(`${ADMIN_BASE}/admin/push/unsubscribe`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }),
      }).then(r => r.json()),
    pushTest: () =>
      fetch(`${ADMIN_BASE}/admin/push/test`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      }).then(r => r.json()),
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
    get: (id: number) => get<DocTemplate>(`/doc-templates/${id}`),
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
    status: () => get<{ connected: boolean }>("/gmail/status"),
    authUrl: () => get<{ url: string }>("/gmail/auth-url"),
    inbox: (q?: string, limit?: number) => get<{ emails: GmailEmail[] }>(`/gmail/inbox${qs({ q, limit })}`),
    attachmentUrl: (messageId: string, attachmentId: string, filename: string) =>
      `${BASE}/gmail/attachment/${messageId}/${attachmentId}?filename=${encodeURIComponent(filename)}`,
    disconnect: () => del("/gmail/disconnect"),
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
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const blob = await res.blob();
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
      const res = await fetch("/api/assets/logo", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      return res.json() as Promise<{ logo_path: string; url?: string; key?: string }>;
    },
    url: (name: string) => /^https?:\/\//i.test(name) ? name : `${BASE}/assets/${name}`,
  },
};

