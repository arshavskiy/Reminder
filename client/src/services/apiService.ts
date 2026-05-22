import type {
  Document, Client, Contract, Reminder, Task,
  DashboardStats, GlobalSearchResult, EmailLogEntry,
  Extraction, ReminderWithContext, ContractWithClient,
  ClientDetail, AppSettings,
  DocTemplate, EmailTemplate, Equipment,
} from "../../src/shared/types.js";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const res = await fetch(BASE + path, { method: "DELETE" });
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
    stats: () => get<DashboardStats>("/dashboard/stats"),
  },

  documents: {
    list: (params?: { status?: string; limit?: number; offset?: number }) => {
      return get<{ rows: Document[]; total: number }>(`/documents${qs(params)}`);
    },
    get: (id: number) => get<Document>(`/documents/${id}`),
    import: (filePath: string) => post<{ id: number }>("/documents/import", { filePath }),
    upload: async (files: File[]) => {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      return res.json() as Promise<{ ids: number[] }>;
    },
    delete: (id: number) => del(`/documents/${id}`),
    reprocess: (id: number) => post<{ ok: boolean }>(`/documents/${id}/reprocess`),
  },

  clients: {
    list: (params?: { q?: string; limit?: number; offset?: number }) => {
      return get<{ rows: Client[]; total: number }>(`/clients${qs(params)}`);
    },
    get: (id: number) => get<ClientDetail>(`/clients/${id}`),
    create: (body: Partial<Client>) => post<Client>("/clients", body),
    update: (id: number, body: Partial<Client>) => put<Client>(`/clients/${id}`, body),
    delete: (id: number) => del(`/clients/${id}`),
    timeline: (id: number) => get(`/clients/${id}/timeline`),
    documents: (id: number) => get<Document[]>(`/clients/${id}/documents`),
  },

  contracts: {
    list: (params?: { clientId?: number; status?: string; limit?: number; kind?: "contract" | "inspection" | "all" }) => {
      return get<{ rows: ContractWithClient[]; total: number }>(`/contracts${qs(params)}`);
    },
    expiring: (days = 30) => get<ContractWithClient[]>(`/contracts/expiring?days=${days}`),
    get: (id: number) => get<ContractWithClient>(`/contracts/${id}`),
    update: (id: number, body: Partial<Contract>) => put<Contract>(`/contracts/${id}`, body),
    delete: (id: number) => del(`/contracts/${id}`),
  },

  reminders: {
    list: (params?: { status?: string; days?: number; limit?: number }) => {
      return get<{ rows: ReminderWithContext[]; total: number }>(`/reminders${qs(params)}`);
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
      const res = await fetch("/api/doc-templates/generate-from-file", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      return res.json() as Promise<{ draft: Partial<DocTemplate>; sample_text_preview: string; usage: unknown; model: string; exec_ms: number }>;
    },
  },

  emailTemplates: {
    list: () => get<EmailTemplate[]>("/email-templates"),
    get: (id: number) => get<EmailTemplate>(`/email-templates/${id}`),
    create: (body: Partial<EmailTemplate>) => post<EmailTemplate>("/email-templates", body),
    update: (id: number, body: Partial<EmailTemplate>) => put<EmailTemplate>(`/email-templates/${id}`, body),
    delete: (id: number) => del(`/email-templates/${id}`),
    detectVars: (html: string) => post<{ vars: string[] }>("/email-templates/vars", { html }),
    preview: (html: string, subject: string, vars: Record<string, unknown>) =>
      post<{ html: string; subject: string }>("/email-templates/preview", { html, subject, vars }),
  },

  equipment: {
    list: (params?: { category?: string; q?: string }) =>
      get<Equipment[]>(`/equipment${qs(params)}`),
    stats: () => get<Record<string, number>>("/equipment/stats"),
    get: (id: number) => get<Equipment>(`/equipment/${id}`),
    create: (body: Partial<Equipment>) => post<Equipment>("/equipment", body),
    update: (id: number, body: Partial<Equipment>) => put<Equipment>(`/equipment/${id}`, body),
    delete: (id: number) => del(`/equipment/${id}`),
  },

  assets: {
    uploadLogo: async (file: File) => {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/assets/logo", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      return res.json() as Promise<{ logo_path: string }>;
    },
    url: (name: string) => `/api/assets/${name}`,
  },
};

