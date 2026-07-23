import {existsSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {sendMonthlyReportEmail} from "../reminders/emailSender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEBREW_FONT = join(__dirname, "../../../scripts/NotoSansHebrew.ttf");
const RTL_MARK = "\u200F";

export const MONTHLY_REPORT_FIELDS = [
  {key: "contract_number", label: "מספר חוזה"},
  {key: "contract_type", label: "סוג מסמך"},
  {key: "client", label: "לקוח"},
  {key: "contact_person", label: "איש קשר"},
  {key: "contact_phone", label: "טלפון"},
  {key: "contact_email", label: "אימייל"},
  {key: "client_address", label: "כתובת"},
  {key: "start_date", label: "תאריך התחלה"},
  {key: "expiry_date", label: "תאריך סיום / בדיקה הבאה"},
  {key: "status", label: "סטטוס"},
  {key: "amount", label: "סכום"},
  {key: "currency", label: "מטבע"},
  {key: "source_document", label: "מסמך מקור"},
  {key: "equipment", label: "ציוד"},
  {key: "reminders", label: "תזכורות"},
] as const;

export type MonthlyReportField = typeof MONTHLY_REPORT_FIELDS[number]["key"];
export const DEFAULT_MONTHLY_REPORT_FIELDS = MONTHLY_REPORT_FIELDS.map((field) => field.key);

export interface MonthlyReportRow {
  contract: any;
  client: any;
  document: any;
  fields: Record<string, any>;
  reminders: any[];
}

export interface MonthlyReportDeliveryOptions {
  userId: string;
  year: number;
  month: number;
  recipients: string[];
  formats: string[];
  clientId?: string;
}

export async function loadMonthlyReportRows(userId: string, year: number, month: number, clientId?: string): Promise<MonthlyReportRow[]> {
  const filter: Record<string, any> = {...monthFilter(userId, year, month)};
  if (clientId) filter.client_id = {$in: [clientId, tryObjectId(clientId)]};
  const contracts = await col("contracts").find(filter).sort({start_date: 1, contract_number: 1}).toArray();

  return Promise.all(contracts.map(async (contract: any) => {
    const [client, document, reminders] = await Promise.all([
      contract.client_id ? col("clients").findOne({_id: tryObjectId(String(contract.client_id))}) : null,
      contract.document_id ? col("documents").findOne({_id: tryObjectId(String(contract.document_id))}) : null,
      col("reminders").find({user_id: userId, source_id: String(contract._id)}).sort({trigger_date: 1}).toArray(),
    ]);
    let extracted: Record<string, any> = {};
    if ((document as any)?.extracted_fields) {
      try { extracted = JSON.parse((document as any).extracted_fields); } catch { extracted = {}; }
    }
    const manual = contract?.manual_fields && typeof contract.manual_fields === "object" ? contract.manual_fields : {};
    const fields = {...manual, ...Object.fromEntries(Object.entries(extracted).filter(([, value]) => value !== undefined && value !== null && value !== ""))};
    return {contract, client, document, fields, reminders};
  }));
}

export function normalizeMonthlyReportFields(raw?: unknown): MonthlyReportField[] {
  const requested = Array.isArray(raw) ? raw : [];
  const valid = new Set(MONTHLY_REPORT_FIELDS.map((field) => field.key));
  const selected = requested.filter((field): field is MonthlyReportField => typeof field === "string" && valid.has(field as MonthlyReportField));
  return selected.length ? [...new Set(selected)] : [...DEFAULT_MONTHLY_REPORT_FIELDS];
}

export async function generateMonthlyContractReports(userId: string, year: number, month: number, rawFields?: unknown, clientId?: string) {
  const rows = await loadMonthlyReportRows(userId, year, month, clientId);
  const selectedFields = normalizeMonthlyReportFields(rawFields);
  return {pdf: await buildPdf(rows, year, month, selectedFields), csv: buildCsv(rows, selectedFields), count: rows.length};
}

export async function sendMonthlyReportsPerClient(options: MonthlyReportDeliveryOptions) {
  const clientIds = await monthlyReportClientIds(options.userId, options.year, options.month, options.clientId);
  let records = 0;
  let reportsSent = 0;
  const failures: string[] = [];

  for (const clientId of clientIds) {
    const client = await col("clients").findOne({_id: tryObjectId(clientId), user_id: options.userId}) as any;
    if (!client) {
      failures.push(`Client ${clientId} was not found`);
      continue;
    }
    const report = await generateMonthlyContractReports(options.userId, options.year, options.month, undefined, clientId);
    if (!report.count) continue;
    records += report.count;
    const recipients = uniqueEmails([...options.recipients, client.email]);
    if (!recipients.length) {
      failures.push(`No email address for ${client.display_name ?? clientId}`);
      continue;
    }
    const monthKey = `${options.year}-${String(options.month).padStart(2, "0")}`;
    const attachments = [] as Array<{filename: string; content: Buffer; contentType: string}>;
    if (options.formats.includes("pdf")) attachments.push({filename: `contracts-report-${monthKey}.pdf`, content: report.pdf, contentType: "application/pdf"});
    if (options.formats.includes("csv")) attachments.push({filename: `contracts-report-${monthKey}.csv`, content: report.csv, contentType: "text/csv; charset=utf-8"});
    if (!attachments.length) continue;
    const result = await sendMonthlyReportEmail(
      recipients,
      {clientName: client.display_name ?? clientId, reportMonth: monthKey, recordCount: report.count},
      attachments,
    );
    if (result.success) reportsSent += 1;
    else failures.push(`${client.display_name ?? clientId}: ${result.error ?? "Email delivery failed"}`);
  }

  return {success: failures.length === 0, count: records, reportsSent, error: failures.length ? failures.join("; ") : undefined};
}

function monthFilter(userId: string, year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = new Date(year, month, 1);
  const to = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return {user_id: userId, start_date: {$gte: from, $lt: to}};
}

async function monthlyReportClientIds(userId: string, year: number, month: number, onlyClientId?: string) {
  if (onlyClientId) return [onlyClientId];
  const contracts = await col("contracts").find(monthFilter(userId, year, month)).project({client_id: 1}).toArray();
  return [...new Set(contracts.map((contract: any) => contract.client_id ? String(contract.client_id) : null).filter((id): id is string => Boolean(id)))];
}

function uniqueEmails(values: Array<unknown>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim() !== "").map((value) => value.trim().toLowerCase()))];
}

function rowValue(row: MonthlyReportRow, key: MonthlyReportField): unknown {
  const c = row.contract;
  const f = row.fields;
  switch (key) {
    case "contract_number": return c.contract_number;
    case "contract_type": return c.contract_type;
    case "client": return row.client?.display_name;
    case "contact_person": return f.contact_person;
    case "contact_phone": return f.contact_phone;
    case "contact_email": return f.contact_email;
    case "client_address": return f.client_address;
    case "start_date": return c.start_date;
    case "expiry_date": return c.expiry_date;
    case "status": return c.status;
    case "amount": return c.amount;
    case "currency": return c.currency;
    case "source_document": return row.document?.file_name;
    case "equipment": return (Array.isArray(f._equipment) ? f._equipment : []).map((equipment: any) => [equipment.name, equipment.manufacturer, equipment.model, equipment.serial_number].filter(Boolean).join(" | ")).join("; ");
    case "reminders": return row.reminders.map((reminder: any) => `${reminder.trigger_date}: ${reminder.title ?? ""} (${reminder.status ?? ""})`).join("; ");
  }
}

function buildCsv(rows: MonthlyReportRow[], selectedFields: MonthlyReportField[]): Buffer {
  const fieldMap = new Map(MONTHLY_REPORT_FIELDS.map((field) => [field.key, field.label]));
  const quote = (value: unknown) => {
    const text = value == null || value === "" ? "" : `${RTL_MARK}${String(value)}`;
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [selectedFields.map((key) => quote(fieldMap.get(key) ?? key)).join(",")];
  for (const row of rows) lines.push(selectedFields.map((key) => quote(rowValue(row, key))).join(","));
  return Buffer.from("\uFEFF" + lines.join("\n"), "utf8");
}

async function buildPdf(rows: MonthlyReportRow[], year: number, month: number, selectedFields: MonthlyReportField[]): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const fieldMap = new Map(MONTHLY_REPORT_FIELDS.map((field) => [field.key, field.label]));
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({size: "A4", margin: 44, info: {Title: `Monthly contracts report ${year}-${month}`}});
    const chunks: Buffer[] = [];
    const fontAvailable = existsSync(HEBREW_FONT);
    if (fontAvailable) doc.registerFont("Hebrew", HEBREW_FONT);
    const setFont = (size: number) => doc.font(fontAvailable ? "Hebrew" : "Helvetica").fontSize(size).fillColor("#111111");
    const value = (raw: unknown) => raw == null || raw === "" ? "-" : String(raw);
    const line = (name: string, raw: unknown) => { setFont(9); doc.text(`${name}: ${value(raw)}`, {align: "right", width: 507}); };
    let pageNo = 1;
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.on("pageAdded", () => { pageNo += 1; setFont(8); doc.fillColor("#777777").text(`עמוד ${pageNo}`, 44, 780, {width: 507, align: "center"}); });
    setFont(18);
    doc.text("דוח חודשי - חוזים ותסקירים", {align: "right"});
    setFont(11);
    doc.text(`חודש הדוח: ${new Date(year, month - 1, 1).toLocaleDateString("he-IL", {month: "long", year: "numeric"})}`, {align: "right"});
    doc.text(`מספר רשומות: ${rows.length}`, {align: "right"});
    doc.moveDown(0.5);
    doc.moveTo(44, doc.y).lineTo(551, doc.y).stroke("#8aa0b5");
    for (const row of rows) {
      if (doc.y > 700) doc.addPage();
      doc.moveDown(0.45);
      setFont(12);
      doc.text(`${value(row.contract.contract_number)} - ${value(row.contract.contract_type)}`, {align: "right"});
      for (const key of selectedFields) line(fieldMap.get(key) ?? key, rowValue(row, key));
      doc.moveTo(44, Math.min(doc.y + 8, 750)).lineTo(551, Math.min(doc.y + 8, 750)).stroke("#d5dbe2");
    }
    doc.end();
  });
}

function tryObjectId(id: string): any {
  try { return new ObjectId(id); } catch { return id; }
}