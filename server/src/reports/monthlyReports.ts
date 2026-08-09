import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {sendMonthlyReportEmail} from "../reminders/emailSender";
import ExcelJS from "exceljs";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType
} from "docx";

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

export const TRACKING_REPORT_FIELDS = [
  {key: "tracking_date", label: "תאריך"},
  {key: "tracking_checked", label: "מה נבדק"},
  {key: "tracking_holder_contact", label: "תופש/איש קשר"},
  {key: "tracking_phone", label: "טלפון"},
  {key: "tracking_license_number", label: "מספר רישוי"},
  {key: "tracking_notes", label: "הערות"},
  {key: "tracking_relevant", label: "רלוונטי"},
] as const;

export type MonthlyReportField = typeof MONTHLY_REPORT_FIELDS[number]["key"];
export type TrackingReportField = typeof TRACKING_REPORT_FIELDS[number]["key"];
export const DEFAULT_MONTHLY_REPORT_FIELDS = MONTHLY_REPORT_FIELDS.map((field) => field.key);
export const DEFAULT_TRACKING_REPORT_FIELDS = TRACKING_REPORT_FIELDS.map((field) => field.key);
export const ALL_REPORT_FIELDS = [...TRACKING_REPORT_FIELDS, ...MONTHLY_REPORT_FIELDS] as const;
export const DEFAULT_ALL_REPORT_FIELDS = [
  "tracking_date",
  "tracking_checked",
  "client",
  "contact_person",
  "tracking_phone",
  "tracking_license_number",
  "tracking_relevant",
  "tracking_notes",
] as const;

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
  month?: number;
  recipients: string[];
  formats: string[];
  clientId?: string;
  rawFields?: unknown;
  includeClientRecipient?: boolean;
}

export interface ReportBundle {
  docx: Buffer;
  xlsx: Buffer;
  csv: Buffer;
  count: number;
}

interface TrackingRow {
  date: string;
  checked: string;
  holderContact: string;
  phone: string;
  relevant: string;
  licenseNumber: string;
  notes: string;
}

export async function loadMonthlyReportRows(userId: string, year: number, month?: number, clientId?: string): Promise<MonthlyReportRow[]> {
  const filter: Record<string, any> = periodFilter(userId, year, month);
  if (clientId) filter.client_id = {$in: [clientId, tryObjectId(clientId)]};
  const contracts = await col("contracts").find(filter).sort({start_date: 1, contract_number: 1}).toArray();
  return hydrateReportRows(userId, contracts);
}

export async function loadFutureReportRows(userId: string, clientId?: string): Promise<MonthlyReportRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const reminders = await col("reminders")
    .find({user_id: userId, trigger_date: {$gte: today}})
    .project({source_id: 1})
    .toArray() as any[];
  const sourceIds = [...new Set(reminders
    .map((reminder) => reminder.source_id ? String(reminder.source_id) : null)
    .filter((id): id is string => Boolean(id)))];
  const sourceObjectIds = sourceIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
  const conditions: Record<string, any>[] = [
    {expiry_date: {$gte: today}},
  ];
  if (sourceIds.length) conditions.push({id: {$in: sourceIds}});
  if (sourceObjectIds.length) conditions.push({_id: {$in: sourceObjectIds}});
  const filter: Record<string, any> = {user_id: userId, $or: conditions};
  if (clientId) filter.client_id = {$in: [clientId, tryObjectId(clientId)]};
  const contracts = await col("contracts").find(filter).sort({expiry_date: 1, contract_number: 1}).toArray();
  return hydrateReportRows(userId, contracts);
}

async function hydrateReportRows(userId: string, contracts: any[]): Promise<MonthlyReportRow[]> {
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

export async function generateMonthlyContractReports(userId: string, year: number, month?: number, rawFields?: unknown, clientId?: string) {
  const rows = await loadMonthlyReportRows(userId, year, month, clientId);
  const selectedFields = normalizeMonthlyReportFields(rawFields);
  const periodTitle = reportPeriodTitle(year, month);
  return {
    docx: await buildDocx(rows, periodTitle, selectedFields),
    xlsx: await buildXlsx(rows, selectedFields),
    csv: buildCsv(rows, selectedFields),
    count: rows.length,
  };
}

export async function generateMonthlyTrackingReport(userId: string, year: number, month?: number, rawFields?: unknown): Promise<ReportBundle> {
  const rows = await loadMonthlyReportRows(userId, year, month);
  const periodTitle = month ? `מעקב בדיקות לחודש 01.${String(month).padStart(2, "0")}` : `מעקב בדיקות לשנת ${year}`;
  const selectedFields = normalizeAllReportFields(rawFields);
  const fieldMap = new Map(ALL_REPORT_FIELDS.map((field) => [field.key, field.label]));
  const headers = selectedFields.map((field) => fieldMap.get(field) ?? field);

  // Group rows by client+date so multiple equipment on the same day become one merged row
  const trackingRows = rows.map(toTrackingRow);
  const grouped = new Map<string, TrackingRow[]>();
  for (const tr of trackingRows) {
    const key = `${tr.holderContact}||${tr.date}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(tr);
  }
  const mergedRows = [...grouped.values()].map((group) => {
    if (group.length === 1) return group[0];
    return {
      ...group[0],
      checked: group.map((r) => r.checked).filter(Boolean).join("\n"),
      licenseNumber: group.map((r) => r.licenseNumber).filter(Boolean).join("\n"),
    };
  });

  const data = mergedRows.map((trackingRow) => {
    const matchingRow = rows.find((r) => {
      const tr = toTrackingRow(r);
      return tr.holderContact === trackingRow.holderContact && tr.date === trackingRow.date;
    }) ?? rows[0];
    return selectedFields.map((field) => reportValue(matchingRow, trackingRow, field));
  });
  return {
    docx: await buildDocxTable(periodTitle, headers, data, true),
    xlsx: await buildXlsxTable(headers, data, true),
    csv: buildCsvTable(headers, data, true),
    count: rows.length,
  };
}

export async function generateFutureClientReports(userId: string, rawFields?: unknown, clientId?: string) {
  const rows = await loadFutureReportRows(userId, clientId);
  const selectedFields = normalizeMonthlyReportFields(rawFields);
  return {
    docx: await buildDocx(rows, "בדיקות עתידיות", selectedFields),
    xlsx: await buildXlsx(rows, selectedFields),
    csv: buildCsv(rows, selectedFields),
    count: rows.length,
  };
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
    const report = await generateMonthlyContractReports(options.userId, options.year, options.month, options.rawFields, clientId);
    if (!report.count) continue;
    records += report.count;
    const recipients = uniqueEmails([
      ...options.recipients,
      ...(options.includeClientRecipient === false ? [] : [client.email]),
    ]);
    if (!recipients.length) {
      failures.push(`No email address for ${client.display_name ?? clientId}`);
      continue;
    }
    const periodKey = reportPeriodKey(options.year, options.month);
    const attachments = buildAttachments(report, periodKey, options.formats);
    if (!attachments.length) continue;
    const result = await sendMonthlyReportEmail(
      recipients,
      {clientName: client.display_name ?? clientId, reportMonth: periodKey, recordCount: report.count},
      attachments,
    );
    if (result.success) reportsSent += 1;
    else failures.push(`${client.display_name ?? clientId}: ${result.error ?? "Email delivery failed"}`);
  }

  return {success: failures.length === 0, count: records, reportsSent, error: failures.length ? failures.join("; ") : undefined};
}

export async function sendMonthlyReportToRecipients(options: MonthlyReportDeliveryOptions) {
  const report = options.clientId
    ? await generateMonthlyContractReports(options.userId, options.year, options.month, options.rawFields, options.clientId)
    : await generateMonthlyTrackingReport(options.userId, options.year, options.month, options.rawFields);
  const recipients = uniqueEmails(options.recipients);
  if (!recipients.length) {
    return {success: false, count: report.count, reportsSent: 0, error: "Configure at least one recipient"};
  }
  if (!report.count) {
    return {success: true, count: 0, reportsSent: 0};
  }

  const periodKey = reportPeriodKey(options.year, options.month);
  const attachments = buildAttachments(report, periodKey, options.formats);
  if (!attachments.length) {
    return {success: false, count: report.count, reportsSent: 0, error: "Choose at least one report format"};
  }

  const client = options.clientId
    ? await col("clients").findOne({_id: tryObjectId(options.clientId), user_id: options.userId}) as any
    : null;
  const result = await sendMonthlyReportEmail(
    recipients,
    {
      clientName: client?.display_name ?? "כל הלקוחות",
      reportMonth: periodKey,
      recordCount: report.count,
    },
    attachments,
  );

  return {
    success: result.success,
    count: report.count,
    reportsSent: result.success ? 1 : 0,
    error: result.error,
  };
}

function periodFilter(userId: string, year: number, month?: number) {
  const from = month ? `${year}-${String(month).padStart(2, "0")}-01` : `${year}-01-01`;
  const next = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);
  const to = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return {
    user_id: userId,
    expiry_date: {$gte: from, $lt: to},
  };
}

async function monthlyReportClientIds(userId: string, year: number, month?: number, onlyClientId?: string) {
  if (onlyClientId) return [onlyClientId];
  const contracts = await col("contracts").find(periodFilter(userId, year, month)).project({client_id: 1}).toArray();
  return [...new Set(contracts.map((contract: any) => contract.client_id ? String(contract.client_id) : null).filter((id): id is string => Boolean(id)))];
}

function uniqueEmails(values: Array<unknown>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim() !== "").map((value) => value.trim().toLowerCase()))];
}

function buildAttachments(report: ReportBundle, monthKey: string, formats: string[]) {
  const attachments = [] as Array<{filename: string; content: Buffer; contentType: string}>;
  if (formats.includes("docx")) attachments.push({filename: `contracts-report-${monthKey}.docx`, content: report.docx, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  if (formats.includes("xlsx")) attachments.push({filename: `contracts-report-${monthKey}.xlsx`, content: report.xlsx, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  if (formats.includes("csv")) attachments.push({filename: `contracts-report-${monthKey}.csv`, content: report.csv, contentType: "text/csv; charset=utf-8"});
  return attachments;
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
    case "start_date": return formatReportDate(c.start_date);
    case "expiry_date": return formatReportDate(c.expiry_date);
    case "status": return c.status;
    case "amount": return c.amount;
    case "currency": return c.currency;
    case "source_document": return row.document?.file_name;
    case "equipment": return (Array.isArray(f._equipment) ? f._equipment : []).map((equipment: any) => [equipment.name, equipment.manufacturer, equipment.model, equipment.serial_number].filter(Boolean).join(" | ")).join("; ");
    case "reminders": return row.reminders.map((reminder: any) => `${formatReportDate(reminder.trigger_date)}: ${reminder.title ?? ""} (${reminder.status ?? ""})`).join("; ");
  }
}

export function normalizeTrackingReportFields(raw?: unknown): TrackingReportField[] {
  const requested = Array.isArray(raw) ? raw : [];
  const valid = new Set(TRACKING_REPORT_FIELDS.map((field) => field.key));
  const selected = requested.filter((field): field is TrackingReportField => typeof field === "string" && valid.has(field as TrackingReportField));
  return selected.length ? [...new Set(selected)] : [...DEFAULT_TRACKING_REPORT_FIELDS];
}

export function normalizeAllReportFields(raw?: unknown): Array<TrackingReportField | MonthlyReportField> {
  const requested = Array.isArray(raw) ? raw : [];
  const valid = new Set(ALL_REPORT_FIELDS.map((field) => field.key));
  const selected = requested.filter((field): field is TrackingReportField | MonthlyReportField => typeof field === "string" && valid.has(field as any));
  return selected.length ? [...new Set(selected)] : [...DEFAULT_ALL_REPORT_FIELDS];
}

function reportValue(row: MonthlyReportRow, trackingRow: TrackingRow, key: TrackingReportField | MonthlyReportField): unknown {
  if (key.startsWith("tracking_")) return trackingValue(trackingRow, key as TrackingReportField);
  return rowValue(row, key as MonthlyReportField);
}

function trackingValue(row: TrackingRow, key: TrackingReportField): unknown {
  switch (key) {
    case "tracking_date": return row.date;
    case "tracking_checked": return row.checked;
    case "tracking_holder_contact": return row.holderContact;
    case "tracking_phone": return row.phone;
    case "tracking_relevant": return row.relevant;
    case "tracking_license_number": return row.licenseNumber;
    case "tracking_notes": return row.notes;
  }
}

function toTrackingRow(row: MonthlyReportRow): TrackingRow {
  const f = row.fields;
  const clientName = firstText(row.client?.display_name, f.client_company, row.contract.counterparty);
  const contact = firstText(f.contact_person, row.client?.contact_person);
  const holderContact = [clientName, contact].filter(Boolean).join(" / ");
  return {
    date: formatReportDate(firstText(row.contract.expiry_date, f.next_inspection_date, row.contract.start_date)),
    checked: firstText(
      f.checked_equipment,
      f.equipment_description,
      equipmentSummary(f),
      row.contract.contract_type,
    ),
    holderContact,
    phone: firstText(f.contact_phone, row.client?.phone),
    relevant: "",
    licenseNumber: firstText(f.license_number),
    notes: "",
  };
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function formatReportDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      String(value.getDate()).padStart(2, "0"),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getFullYear()),
    ].join("-");
  }

  if (typeof value !== "string") return firstText(value);
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const dotted = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dotted) return `${dotted[1].padStart(2, "0")}-${dotted[2].padStart(2, "0")}-${dotted[3]}`;
  return text;
}

function equipmentSummary(fields: Record<string, any>): string {
  const equipment = Array.isArray(fields._equipment) ? fields._equipment : [];
  return equipment.map((item: any) => firstText(item?.name, item?.description)).filter(Boolean).join("; ");
}

function buildCsv(rows: MonthlyReportRow[], selectedFields: MonthlyReportField[]): Buffer {
  const fieldMap = new Map(MONTHLY_REPORT_FIELDS.map((field) => [field.key, field.label]));
  const lines = [selectedFields.map((key) => quote(fieldMap.get(key) ?? key)).join(",")];
  for (const row of rows) lines.push(selectedFields.map((key) => quote(rowValue(row, key))).join(","));
  return Buffer.from("\uFEFF" + lines.join("\n"), "utf8");
}

function buildCsvTable(headers: string[], rows: unknown[][], rtl = false): Buffer {
  const lines = [headers.map(quote).join(",")];
  for (const row of rows) lines.push(row.map(quote).join(","));
  return Buffer.from("\uFEFF" + lines.join("\n"), "utf8");
}

function quote(value: unknown): string {
  const text = value == null || value === "" ? "" : `${RTL_MARK}${String(value)}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function buildXlsx(rows: MonthlyReportRow[], selectedFields: MonthlyReportField[]): Promise<Buffer> {
  const fieldMap = new Map(MONTHLY_REPORT_FIELDS.map((field) => [field.key, field.label]));
  const headers = selectedFields.map((key) => fieldMap.get(key) ?? key);
  const data = rows.map((row) => selectedFields.map((key) => rowValue(row, key) ?? ""));
  return buildXlsxTable(headers, data);
}

async function buildXlsxTable(headers: string[], data: unknown[][], rtl = false): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("דוח", {views: [{rightToLeft: true}]});
  worksheet.columns = headers.map((header) => ({
    header,
    width: Math.max(14, Math.min(34, String(header).length + 8)),
  }));
  const rtlAlignment: Partial<ExcelJS.Alignment> = {horizontal: "right", readingOrder: "rtl", wrapText: true};
  worksheet.getRow(1).eachCell((cell) => {
    cell.alignment = rtlAlignment;
    cell.font = {bold: true};
  });
  for (const row of data) {
    const added = worksheet.addRow(row.map((v) => v ?? ""));
    added.eachCell((cell) => { cell.alignment = rtlAlignment; });
  }
  worksheet.autoFilter = {
    from: {row: 1, column: 1},
    to: {row: Math.max(data.length + 1, 2), column: headers.length},
  };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildDocx(rows: MonthlyReportRow[], periodTitle: string, selectedFields: MonthlyReportField[]): Promise<Buffer> {
  const fieldMap = new Map(MONTHLY_REPORT_FIELDS.map((field) => [field.key, field.label]));
  const headers = selectedFields.map((key) => fieldMap.get(key) ?? key);
  const data = rows.map((row) => selectedFields.map((key) => rowValue(row, key)));
  return buildDocxTable(periodTitle, headers, data);
}

async function buildDocxTable(periodTitle: string, headers: string[], rows: unknown[][], rtl = false): Promise<Buffer> {
  const widthByHeader = (header: string) => {
    if (header.includes("תאריך") || header.includes("טלפון") || header.includes("רישוי")) return 1600;
    if (header.includes("הערות") || header.includes("מה נבדק") || header.includes("תופש")) return 2450;
    return 1900;
  };
  const displayHeaders = [...headers].reverse();
  const displayRows = rows.map((row) => [...row].reverse());
  const makeParagraph = (text: string, bold = false) => new Paragraph({
    alignment: AlignmentType.END,
    bidirectional: true,
    spacing: {before: 0, after: 0},
    children: [new TextRun({text: `${RTL_MARK}${text}`, bold, rightToLeft: true, size: bold ? 18 : 16})],
  });
  const cell = (text: unknown, header: string, bold = false) => {
    const lines = String(text ?? "").split("\n");
    return new TableCell({
      width: {size: widthByHeader(header), type: WidthType.DXA},
      margins: {top: 80, bottom: 80, left: 90, right: 90},
      children: lines.map((line) => makeParagraph(line, bold)),
    });
  };
  const tableRows = [
    new TableRow({tableHeader: true, children: displayHeaders.map((header) => cell(header, header, true))}),
    ...displayRows.map((row) => new TableRow({children: row.map((value, index) => cell(value, displayHeaders[index] ?? ""))})),
  ];
  if (!rows.length) tableRows.push(new TableRow({children: [cell("אין רשומות", displayHeaders[0] ?? "")]}));

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: {orientation: PageOrientation.LANDSCAPE},
          margin: {top: 720, right: 720, bottom: 720, left: 720},
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          bidirectional: true,
          children: [new TextRun({text: periodTitle, bold: true, size: 32, rightToLeft: true})],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          bidirectional: true,
          children: [new TextRun({text: `מספר רשומות: ${rows.length}`, rightToLeft: true})],
        }),
        new Paragraph({text: ""}),
        new Table({
          width: {size: 100, type: WidthType.PERCENTAGE},
          layout: TableLayoutType.FIXED,
          alignment: AlignmentType.RIGHT,
          columnWidths: displayHeaders.map(widthByHeader),
          borders: {
            top: {style: BorderStyle.SINGLE, size: 4, color: "404040"},
            bottom: {style: BorderStyle.SINGLE, size: 4, color: "404040"},
            left: {style: BorderStyle.SINGLE, size: 4, color: "404040"},
            right: {style: BorderStyle.SINGLE, size: 4, color: "404040"},
            insideHorizontal: {style: BorderStyle.SINGLE, size: 3, color: "A6A6A6"},
            insideVertical: {style: BorderStyle.SINGLE, size: 3, color: "A6A6A6"},
          },
          rows: tableRows,
        }),
      ],
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

function reportPeriodTitle(year: number, month?: number): string {
  if (!month) return String(year);
  return new Date(year, month - 1, 1).toLocaleDateString("he-IL", {month: "long", year: "numeric"});
}

export function reportPeriodKey(year: number, month?: number): string {
  return month ? `${year}-${String(month).padStart(2, "0")}` : String(year);
}

function tryObjectId(id: string): any {
  try { return new ObjectId(id); } catch { return id; }
}
