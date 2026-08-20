export interface AppSettings {
  theme: "dark" | "light";
  port: number;

  // AI
  aiBackend: "openai" | "ollama";
  openAiKey: string;
  openAiModel: string;
  ollamaUrl: string;
  ollamaModel: string;

  // OCR
  ocrLanguage: string;
  autoExtract: boolean;
  extractionMaxChars: number;

  // SMTP
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpRejectUnauthorized: boolean;  // false = accept self-signed / hostname-mismatched certs
  emailFrom: string;
  emailFromName: string;

  // Reminders
  reminderEnabled: boolean;
  reminderAdvanceDays: number[];
  reminderCheckIntervalMs: number;
  testEmail: string;          // default recipient for test emails / test reminders
  testEmailTemplateId: number | null;  // email template to use for test emails

  // Watch folder
  watchFolderEnabled: boolean;
  watchFolder: string;

  // Phase 2: Google OAuth
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  sessionSecret?: string;
  allowedEmails?: string[];

  // Quotas
  userDocumentLimit: number;

  // Escalation
  escalationEmail: string;
  escalationThresholdDays: number;
}

// Phase 2: Authentication types
export interface User {
  id: number;
  google_sub: string;
  email: string;
  name: string | null;
  phone: string | null;
  picture_url: string | null;
  role: "admin" | "user";
  is_active: number;
  created_at: string;
  last_login_at: string | null;
}

export interface Session {
  id: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  user_agent: string | null;
  ip: string | null;
}

export interface PipelineFlags {
  pipeline_ocr: boolean;
  pipeline_ai: boolean;
  pipeline_s3: boolean;
  pipeline_entities: boolean;
}

export interface EngineerProfile {
  inspector_number?: string | null;
  address?: string | null;
  city?: string | null;
  title?: string | null;
  expertise?: string | null;
  mr_number?: string | null;
  mg_number?: string | null;
  membership_start_date?: string | null;
  inspector_id_start?: string | null;
  next_inspection_seq?: number | null;
  company_name?: string | null;
  company_registration?: string | null;
  company_subtitle?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  company_logo_url?: string | null;
  full_name?: string | null;
}

export interface UserSettings extends PipelineFlags {
  user_id: number;
  theme: "dark" | "light";
  email_from_name: string | null;
  reminder_advance_days: string;  // JSON array as string
  ocr_language: string;
  monthly_report_enabled?: boolean;
  monthly_report_recipients?: string;
  monthly_report_day?: number;
  monthly_report_hour?: number;
  monthly_report_formats?: string;
  monthly_report_last_sent?: string | null;
  monthly_report_last_error?: string | null;
  report_config?: {
    all_fields?: string[];
    client_fields?: string[];
  } | null;
  calendar_next_tests_only?: boolean;
  features?: Record<string, boolean> | null;
}

export interface FeatureDefinition {
  id: string;
  key: string;
  scope: "pages" | "dashboard";
  label_he: string;
  label_en: string;
  description_he: string;
  default_enabled: boolean;
  sort_order: number;
}

export type ProcessingStatus = "queued" | "processing" | "done" | "error";
export type DocumentSource = "scanned" | "generated";
export type DocumentReminderAssignmentStatus = "pending" | "assigned" | "missing" | "error";
export type ReminderStatus = "pending" | "sent" | "snoozed" | "dismissed" | "error";
export type ContractStatus = "active" | "expired" | "cancelled" | "renewed";
export type EntityType = "person" | "company";
export type TaskStatus = "open" | "done" | "cancelled";
export type EventType =
  | "document_added"
  | "contract_signed"
  | "email_sent"
  | "reminder_fired"
  | "note";

export interface Document {
  id: number;
  file_name: string;
  file_path: string;
  original_path: string | null;
  file_hash: string;
  mime_type: string;
  file_size_bytes: number;
  import_date: string;
  processing_status: ProcessingStatus;
  document_source?: DocumentSource | null;
  error_message: string | null;
  raw_text: string | null;
  extracted_fields?: string | null;
  document_type?: string | null;
  inspection_date?: string | null;
  expiry_date?: string | null;
  reminder_count?: number;
  reminder_status?: DocumentReminderAssignmentStatus;
  reminder_date?: string | null;
  language: string;
  page_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  display_name: string;
  entity_type: EntityType;
  contact_person: string | null;
  id_number: string | null;
  email: string | null;
  phone: string | null;
  mobile?: string | null;
  fax?: string | null;
  address?: string | null;
  city?: string | null;
  po_box?: string | null;
  client_zipcode?: string | null;
  notes: string | null;
  tags: string | null; // JSON array string
  created_at: string;
  updated_at: string;
}

export interface DocumentClient {
  document_id: number;
  client_id: number;
  role: string | null;
}

export type PrintEditorType = "grid" | "sections";

export interface Contract {
  id: number;
  document_id: number;
  client_id: number | null;
  contract_number: string | null;
  contract_type: string | null;
  start_date: string | null;
  expiry_date: string | null;
  amount: number | null;
  currency: string;
  counterparty: string | null;
  summary: string | null;
  manual_fields?: ContractManualFields | null;
  confidence: "high" | "medium" | "low";
  status: ContractStatus;
    editor_type?: PrintEditorType | null;
    print_template_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractManualFields {
  contact_person?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
    client_email?: string | null;
  client_address?: string | null;
  po_box?: string | null;
  client_zipcode?: string | null;
  equipment_description?: string | null;
  checked_equipment?: string | null;
  _equipment?: Array<{
    name: string;
    manufacturer: string | null;
    model: string | null;
    models?: string[];
    serial_number: string | null;
    serial_numbers?: string[];
    quantity?: number;
    license_number?: string | null;
    load_capacity_work: string[];
    load_capacity_test: string[];
    load_radius: string[];
    category: string;
  }>;
}

export interface Reminder {
  id: number;
  source_type: "contract_expiry" | "task" | "manual";
  source_id: number | null;
  client_id: number | null;
  document_id: number | null;
  trigger_date: string;
  advance_days: number;
  title: string;
  body: string | null;
  email_to: string | null;       // JSON array string
  email_template_id: number | null;
  status: ReminderStatus;
  snoozed_until: string | null;
  // Equipment snapshot stored on the reminder — sent to email templates.
  equipment_type: EquipmentCategory | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  license_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  document_id: number | null;
  client_id: number | null;
  description: string;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface Extraction {
  id: number;
  document_id: number;
  backend: string;
  model: string;
  result_json: string;
  parsed_ok: number;
  error: string | null;
  exec_ms: number | null;
  created_at: string;
}

export interface EmailLogEntry {
  id: number;
  reminder_id: number | null;
  to_address: string;
  subject: string;
  body_html: string | null;
  sent_at: string;
  success: number;
  error: string | null;
  smtp_host: string | null;
}

export interface TimelineEvent {
  id: number;
  client_id: number;
  event_type: EventType;
  title: string;
  description: string | null;
  event_date: string;
  source_id: number | null;
  source_type: string | null;
  created_at: string;
}

// Enriched types for API responses
export interface ContractWithClient extends Contract {
  client_name: string | null;
  document_name: string;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  client_address: string | null;
  po_box: string | null;
  client_zipcode: string | null;
  equipment_description: string | null;
  checked_equipment: string | null;
  _equipment: Array<{
    name: string;
    manufacturer: string | null;
    model: string | null;
    serial_number: string | null;
    license_number?: string | null;
    load_capacity_work: string[];
    load_capacity_test: string[];
    load_radius: string[];
    category: string;
  }>;
}

export interface ReminderWithContext extends Reminder {
  client_name: string | null;
  contact_person?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  document_name: string | null;
}

export interface ClientDetail extends Client {
  doc_count: number;
  document_count?: number;
  contract_count: number;
  open_reminder_count: number;
}

export interface DocumentSearchResult {
  id: number;
  file_name: string;
  snippet: string;
  rank: number;
}

export interface GlobalSearchResult {
  documents: DocumentSearchResult[];
  clients: Pick<Client, "id" | "display_name" | "email" | "phone">[];
  contracts: Pick<Contract, "id" | "contract_number" | "contract_type" | "expiry_date">[];
}

export interface DashboardStats {
  total_documents: number;
  total_clients: number;
  total_contracts: number;     // actual contracts (excludes inspection reports)
  active_contracts: number;
  total_inspections: number;   // תסקירים / inspection reports
  total_equipment: number;
  total_doc_templates: number;
  total_email_templates: number;
  pending_reminders: number;
  expiring_soon: number;       // active contracts/inspections expiring within 30 days
  recent_documents: Document[];
  upcoming_reminders: ReminderWithContext[];
}

export interface AppInfo {
  version: string;
  dataDir: string;
  dbPath: string;
}

// WebSocket push event types
export type WsEvent =
  | { type: "document:queued"; documentId: number; fileName: string }
  | { type: "document:progress"; documentId: number; stage: string; progress: number }
  | { type: "document:done"; documentId: number; status: "done" | "error"; error?: string }
  | { type: "reminder:fired"; reminderId: number; clientId: number | null; title: string }
  | { type: "reminder:error"; reminderId: number; error: string };

// ── Document kind ───────────────────────────────────────────────────────────
export type DocumentKind =
  | "inspection_report"
  | "contract"
  | "invoice"
  | "certificate"
  | "unknown";

// ── Document templates ──────────────────────────────────────────────────────
export type FieldType =
  | "text"
  | "number"
  | "date"            // ISO YYYY-MM-DD; can drive reminders
  | "phone"
  | "email"
  | "currency"
  | "list";           // array of strings

export interface TemplateField {
  key: string;                  // machine name e.g. "expiry_date"
  label_he: string;             // Hebrew label shown in UI + email
  type: FieldType;
  required?: boolean;
  hint_he?: string;             // optional extra instruction for the AI
  example_he?: string;          // optional example value
}

export interface DocTemplate {
  id: string;
  user_id?: string | null;
  name: string;                        // Hebrew, e.g. "תסקיר בדיקה"
  description: string | null;
  document_kind: DocumentKind;
  match_keywords: string[];            // ["תסקיר", "בדיקה"]
  fields: TemplateField[];
  expiry_field: string | null;         // key of the date field that drives reminders
  cached_system_prompt: string | null; // pre-built AI system prompt
  is_default: number;
  is_builtin: number;
  extract_equipment?: boolean;
  created_at: string;
  updated_at: string;
}

// ── Equipment catalogue ─────────────────────────────────────────────────────
export type EquipmentCategory =
  | "lift"          // מכונות הרמה
  | "accessory"     // אביזרי הרמה
  | "scaffold"      // פיגומים
  | "ladder"        // מעליות
  | "balloon"       // מעלונים
  | "intake"        // קולטי אוויר
  | "extractor"     // קולטי קיטור
  | "other";

export interface Equipment {
  id: number;
  name: string;
  category: EquipmentCategory;
  manufacturer: string | null;
  model: string | null;
  serial_number?: string | null;
  license_number?: string | null;
  capacity: string | null;
  load_capacity_test?: string | null;
  description: string | null;
  notes: string | null;
  client_id?: string | null;
  client_name?: string | null;
  document_id?: string | null;
  document_name?: string | null;
  photo_urls?: { key: string; taken_at: string }[];
  is_active: number;
  created_at: string;
  updated_at: string;
}

// ── Email templates ─────────────────────────────────────────────────────────
export interface EmailTemplate {
  id: string;
  name: string;
  doc_template_id: string | null;
  subject: string;              // may contain {{vars}}
  html: string;                 // body with {{vars}} placeholders
  logo_path: string | null;
  poster_url: string | null;
  example_document_url: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

// AI extraction result shape — kept for the legacy hardcoded prompt path.
// New flow stores ALL extracted fields as a flat object in `documents.extracted_fields`.
export type DynamicExtraction = Record<string, string | number | string[] | null>;

// ── Print templates (תסקיר designer) ─────────────────────────────────────────
export interface PrintTemplateCell {
  r: number;
  c: number;
  type: "label" | "field" | "image";
  text?: string;
  html?: string;
  bind?: string;
  src?: string;
  alt?: string;
  bold?: boolean;
  color?: string;
  align?: "right" | "center" | "left";
  valign?: "top" | "middle" | "bottom";
  border?: PrintCellBorder;
  fontSize?: number; // px; falls back to template default when unset
  colSpan?: number;
  rowSpan?: number;
    cellWidth?: number;
}

export type PrintCellBorderStyle = "thin" | "medium" | "thick" | "double";
// Per-side borders (Excel-like). Legacy values: a bare style string or "none"
// mean "all four sides that style / cleared" and are still accepted.
export interface PrintCellBorderSides {
  top?: PrintCellBorderStyle;
  right?: PrintCellBorderStyle;
  bottom?: PrintCellBorderStyle;
  left?: PrintCellBorderStyle;
}
export type PrintCellBorder = PrintCellBorderStyle | "none" | PrintCellBorderSides;

export interface PrintTemplate {
  _id: string;
  name: string;
  page: "A4" | "A3";
  dir: "rtl" | "ltr";
  cols: Array<{ w: number }>;
  rows: Array<{ h: number }>;
  cells: PrintTemplateCell[];
  hasFixedFrame?: boolean; // wrap section-2 grid with תסקיר header/footer
    /** "grid" = Excel designer (default); "sections" = simple layout editor */
    editorType?: import("./printTemplateLayout.js").PrintTemplateEditorType;
    layout?: import("./printTemplateLayout.js").PrintTemplateLayout;
    user_id?: string;
    is_shared?: boolean;
  created_at: string;
  updated_at: string;
}

// Fixed document-level fields surrounding the designer grid (section 1 client info +
// section 3 findings + section 4 static notes/signature).
// Binds marked "extracted" match ExtractionResult keys exactly, so compose can
// auto-fill from a document's extracted_fields. Binds marked "manual" have no
// extractor source yet (תסקיר-specific: report numbering, registration) — typed
// by hand each time, not auto-filled.
export const PRINT_HEADER_FIELDS = [
  { bind: "document_number", label: "מספר תסקיר", source: "extracted" },        // ExtractionResult.document_number
  { bind: "prev_report_number", label: "מספר תסקיר קודם", source: "manual" },
  { bind: "start_date", label: "תאריך בדיקה", source: "extracted" },            // ExtractionResult.start_date
  { bind: "expiry_date", label: "בתוקף עד", source: "extracted" },              // ExtractionResult.expiry_date
  { bind: "client_company", label: "שם הלקוח/תופש", source: "extracted" },      // ExtractionResult.client_company
  { bind: "client_name", label: "איש קשר", source: "extracted" },               // ExtractionResult.client_name (contact person)
  { bind: "client_phone", label: "טלפון", source: "extracted" },                // ExtractionResult.client_phone
  { bind: "client_email", label: "מייל", source: "extracted" },                 // ExtractionResult.client_email
  { bind: "client_address", label: "כתובת/יישוב", source: "extracted" },        // ExtractionResult.client_address
  { bind: "license_number", label: "מספר רישוי", source: "extracted" },
  { bind: "client_id", label: "ח.פ / ת.ז לקוח", source: "extracted" },          // ExtractionResult.client_id
  { bind: "inspection_type", label: "סוג בדיקה", source: "manual" },
  { bind: "zip_code", label: "מיקוד", source: "manual" },
  { bind: "chassis", label: "שלדה", source: "manual" },
] as const;

export const PRINT_FOOTER_FIELDS = [
  { bind: "findings_general", label: "כללי", source: "manual" },
  { bind: "findings_remedy", label: "ליקוי", source: "manual" },
  { bind: "findings_deadline", label: "תוך", source: "manual" },
  { bind: "findings_note", label: "הערה נוספת", source: "manual" },
] as const;

export interface ExtractionResult {
  client_name: string | null;          // contact person (e.g. "שילה")
  client_company: string | null;       // company name (e.g. "מילניום שירותים ולוגיסטיקה בע\"מ")
  client_id: string | null;            // Israeli ID or company registration number
  license_number?: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address: string | null;       // city / full address
  document_type: string | null;        // e.g. "תסקיר בדיקה" | "חוזה" | "חשבונית"
  document_number: string | null;      // generic document/report number (e.g. תסקיר 15935)
  contract_number: string | null;
  contract_type: string | null;
  start_date: string | null;           // ISO8601
  expiry_date: string | null;          // ISO8601 — next inspection / contract expiry / renewal date
  amount: number | null;
  currency: string | null;
  parties: string[];
  tasks: Array<{ description: string; due_date: string | null }>;
  summary_hebrew: string | null;
  confidence: "high" | "medium" | "low";
}
