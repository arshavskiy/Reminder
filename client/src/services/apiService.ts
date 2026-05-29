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
  GlobalSearchResult,
  PipelineFlags,
  Reminder,
  ReminderWithContext,
  Task,
  UserSettings,
} from "../../src/shared/types.js";

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

export interface ExpiryCalendarItem {
  id: string;
  expiry_date: string;
  contract_type: string | null;
  contract_number: string | null;
  client_name: string | null;
  equipment_name: string | null;
  days_until: number;
  urgency: "overdue" | "critical" | "warning" | "ok";
}

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const BASE = `${SERVER}/api`;

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
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const res = await fetch(BASE + path, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
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
      return get<{ rows: Document[]; total: number; totalAll: number; documentLimit: number }>(`/documents${qs(params)}`, force);
    },
    get: (id: string) => get<Document>(`/documents/${id}`),
    import: (filePath: string) => post<{ id: string }>("/documents/import", { filePath }),
    upload: async (files: File[], ocrOnly = false, templateId?: number) => {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const params = new URLSearchParams();
      if (ocrOnly) params.set("ocrOnly", "true");
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
    extract: (id: string, templateId?: string) =>
      post<{ ok: boolean; fields: Record<string, unknown> | null; template: string; document: import('../shared/types.js').Document }>(`/documents/${id}/extract`, templateId ? { templateId } : {}),
    delete: (id: string) => del(`/documents/${id}`),
    downloadUrl: (id: string) => `${BASE}/documents/${id}/download`,
    reprocess: (id: string) =>
      post<{ ok: boolean; fields?: Record<string, unknown> | null; document?: Document }>(`/documents/${id}/reprocess`),
  },

  clients: {
    list: (params?: { q?: string; limit?: number; offset?: number }, force = false) => {
      return get<{ rows: Client[]; total: number }>(`/clients${qs(params)}`, force);
    },
    get: (id: string) => get<ClientDetail>(`/clients/${id}`),
    create: (body: Partial<Client>) => post<Client>("/clients", body),
    update: (id: string, body: Partial<Client>) => put<Client>(`/clients/${id}`, body),
    delete: (id: string) => del(`/clients/${id}`),
    timeline: (id: string) => get(`/clients/${id}/timeline`),
    documents: (id: string) => get<Document[]>(`/clients/${id}/documents`),
  },

  contracts: {
    list: (params?: { clientId?: string; status?: string; limit?: number; kind?: "contract" | "inspection" | "all" }, force = false) => {
      return get<{ rows: ContractWithClient[]; total: number }>(`/contracts${qs(params)}`, force);
    },
    expiring: (days = 30) => get<ContractWithClient[]>(`/contracts/expiring?days=${days}`),
    get: (id: string) => get<ContractWithClient>(`/contracts/${id}`),
    byDocument: (documentId: string) => get<ContractWithClient[]>(`/contracts/by-document/${documentId}`),
    create: (body: Partial<Contract>) => post<Contract>("/contracts", body),
    update: (id: string, body: Partial<Contract>) => put<Contract>(`/contracts/${id}`, body),
    delete: (id: string) => del(`/contracts/${id}`),
  },

  reminders: {
    list: (params?: { status?: string; days?: number; limit?: number }, force = false) => {
      return get<{ rows: ReminderWithContext[]; total: number }>(`/reminders${qs(params)}`, force);
    },
    create: (body: Partial<Reminder>) => post<Reminder>("/reminders", body),
    update: (id: number, body: Partial<Reminder>) => put<Reminder>(`/reminders/${id}`, body),
    dismiss: (id: number) => post(`/reminders/${id}/dismiss`),
    snooze: (id: number, until: string) => post(`/reminders/${id}/snooze`, { until }),
    sendNow: (id: number) => post<{ success: boolean; error?: string }>(`/reminders/${id}/send-now`),
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

  userSettings: {
    get: () => get<UserSettings>("/user-settings"),
    save: (body: Partial<PipelineFlags & Pick<UserSettings, "theme" | "email_from_name" | "reminder_advance_days" | "ocr_language">>) =>
      put<UserSettings>("/user-settings", body),
  },

  config: {
    get: () => get<{ userDocumentLimit: number }>("/config"),
  },

  settings: {
    get: () => get<AppSettings>("/settings"),
    save: (body: Partial<AppSettings>) => post<AppSettings>("/settings", body),
  },

  docTemplates: {
    list: () => get<DocTemplate[]>("/doc-templates"),
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
  },

  emailTemplates: {
    list: () => get<EmailTemplate[]>("/email-templates"),
    get: (id: string) => get<EmailTemplate>(`/email-templates/${id}`),
    create: (body: Partial<EmailTemplate>) => post<EmailTemplate>("/email-templates", body),
    update: (id: string, body: Partial<EmailTemplate>) => put<EmailTemplate>(`/email-templates/${id}`, body),
    delete: (id: string) => del(`/email-templates/${id}`),
    detectVars: (html: string) => post<{ vars: string[] }>("/email-templates/vars", { html }),
    preview: (html: string, subject: string, vars: Record<string, unknown>) =>
      post<{ html: string; subject: string }>("/email-templates/preview", { html, subject, vars }),
    getDefault: (name: "default" | "inspection" | "contract" | "invoice" | "verify-email" | "reset-password") =>
      get<{ html: string }>(`/email-templates/defaults/${name}`),
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
  },

  assets: {
    uploadLogo: async (file: File) => {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/assets/logo", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      return res.json() as Promise<{ logo_path: string }>;
    },
    url: (name: string) => `${BASE}/assets/${name}`,
  },
};

