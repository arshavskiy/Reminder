import XLSX from "xlsx";
import {createHash} from "crypto";

const aliases: Record<string, string[]> = {
  name: ["Expiry Name", "Name", "Reminder Name", "שם", "שם תזכורת", "שם תפוגה"],
  expiry: ["Expiry Date", "Expiration Date", "תאריך תפוגה", "תאריך תוקף", "בתוקף עד"],
  start: ["Start Date", "תאריך התחלה"],
  category: ["Type/category", "Type", "Category", "Document Type", "סוג", "קטגוריה", "סוג מסמך"],
  description: ["Description", "Notes", "notes", "תיאור"],
  externalId: ["External ID", "Compliance ID", "compliance_id", "מזהה חיצוני"],
  clientId: ["Client External ID", "מזהה לקוח"],
  clientName: ["Client Name", "שם לקוח"],
  clientType: ["Client Type", "סוג לקוח"],
  contact: ["Contact Person", "איש קשר"],
  email: ["Client Email", "Email", "דואר אלקטרוני", "אימייל לקוח", "אימייל"],
  phone: ["Client Phone", "Phone", "טלפון לקוח", "טלפון"],
  address: ["Client Address", "כתובת לקוח", "כתובת"],
  city: ["Client City", "עיר לקוח", "עיר"],
  offsets: ["Reminder Advance Days", "ימי התראה", "ימים לפני"],
  recipients: ["Reminder Recipients", "Notification Email", "notification_email", "נמענים", "נמעני תזכורת"],
  owner: ["Owner", "בעלים", "אחראי"],
  document: ["Document", "מסמך"],
  documentNumber: ["Document Number", "מספר מסמך"],
  folder: ["Folder", "תיקייה"],
  tags: ["Tags", "תגיות"],
  priority: ["Priority", "עדיפות"],
  location: ["Location", "מיקום"],
  reminderStatus: ["Reminder Status", "סטטוס תזכורת"],
  contractStatus: ["Contract Status", "סטטוס חוזה"],
  url: ["URL", "Link", "קישור"],
  auditDate: ["Audit Date", "תאריך ביקורת"],
};
const normalize = (value: unknown) => String(value ?? "").replace(/[\uFEFF\u200e\u200f]/g, "").trim().replace(/[_\s]+/g, " ").toLowerCase();
const lookup = new Map(Object.entries(aliases).flatMap(([key, names]) => names.map(name => [normalize(name), key])));
export type ImportRow = {
  row: number; sheet: string; key: string; name: string; expiry: string; start: string | null;
  fields: Record<string, string>; offsets: number[]; dates: string[]; recipients: string[];
};
export type TablePreview = {rows: ImportRow[]; errors: string[]; warnings: string[]; reminderCount: number};

function dateOnly(value: unknown, date1904: boolean): string {
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value, {date1904});
    if (!date) throw new Error("Invalid Excel date");
    value = `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match || Number(match[1]) < 1900 || Number(match[1]) > 9999) throw new Error("Use YYYY-MM-DD / יש להזין תאריך YYYY-MM-DD");
  const date = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error("Invalid date / תאריך לא תקין");
  return text;
}
export const importHash = (value: string) => createHash("sha256").update(value).digest("hex");

export function parseReminderTable(buffer: Buffer, filename: string): TablePreview {
  if (!/\.(csv|xlsx|xls)$/i.test(filename)) throw new Error("Select a CSV or Excel file / יש לבחור CSV או Excel");
  if (buffer.length > 5 * 1024 * 1024) throw new Error("Maximum file size: 5 MB");
  const csv = /\.csv$/i.test(filename);
  const book = XLSX.read(csv ? new TextDecoder("utf-8", {fatal: true}).decode(buffer) : buffer,
    {type: csv ? "string" : "buffer", raw: true, cellDates: false, sheetRows: 502});
  const result: TablePreview = {rows: [], errors: [], warnings: [], reminderCount: 0};
  const keys = new Set<string>();
  const clients = new Map<string, string>();
  let count = 0;
  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!fullref"] ?? sheet["!ref"] ?? "A1");
    if (range.e.r > 500 || range.e.c > 99) throw new Error("Maximum 500 rows and 100 columns per file");
    const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, {header: 1, raw: true, defval: "", blankrows: true});
    if (!table.some(row => row.some(cell => String(cell).trim()))) continue;
    const columns = (table[0] ?? []).map(header => lookup.get(normalize(header)));
    const known = columns.filter(Boolean);
    if (!known.includes("name") || !known.includes("expiry")) {
      result.errors.push(`${sheetName}: Required headers: Expiry Name / שם תזכורת, Expiry Date / תאריך תפוגה`);
      continue;
    }
    if (new Set(known).size !== known.length) { result.errors.push(`${sheetName}: Duplicate mapped headers / כותרות כפולות`); continue; }
    const unknown = table[0].filter((header, i) => String(header).trim() && !columns[i]);
    if (unknown.length) result.warnings.push(`${sheetName}: Unmapped columns will be ignored / עמודות שלא ייובאו: ${unknown.join(", ")}`);
    for (let index = 1; index < table.length; index++) {
      const values = table[index];
      if (!values.some(value => String(value).trim())) continue;
      if (++count > 500) throw new Error("Maximum 500 items per file");
      try {
        const fields: Record<string, string> = {};
        for (let c = 0; c < values.length; c++) {
          if (sheet[XLSX.utils.encode_cell({r: range.s.r + index, c: range.s.c + c})]?.f) throw new Error("Formulas are not supported; paste values / יש להדביק ערכים ללא נוסחאות");
          if (String(values[c]).length > 10000) throw new Error("Cell text exceeds 10000 characters");
          if (columns[c]) fields[columns[c]!] = String(values[c] ?? "").trim();
        }
        if (!fields.name) throw new Error("Expiry Name is required / שם תזכורת נדרש");
        const expiry = dateOnly(values[columns.indexOf("expiry")], !!book.Workbook?.WBProps?.date1904);
        const start = fields.start ? dateOnly(values[columns.indexOf("start")], !!book.Workbook?.WBProps?.date1904) : null;
        fields.expiry = expiry;
        if (fields.start !== undefined) fields.start = start ?? "";
        if (start && start > expiry) throw new Error("Start Date is after Expiry Date / תאריך התחלה מאוחר מתפוגה");
        if (fields.auditDate) fields.auditDate = dateOnly(values[columns.indexOf("auditDate")], !!book.Workbook?.WBProps?.date1904);
        if ((fields.clientId || fields.email || fields.contact || fields.phone) && !fields.clientName) throw new Error("Client Name is required for client details / שם לקוח נדרש");
        fields.clientType = ({"חברה": "company", "אדם": "person", "פרטי": "person"} as Record<string, string>)[fields.clientType] ?? fields.clientType ?? "";
        if (fields.clientType && !["company", "person"].includes(fields.clientType)) throw new Error("Client Type: company/person / חברה/אדם");
        if (fields.reminderStatus && !["pending", "ממתין", "ממתינה"].includes(fields.reminderStatus)) throw new Error("Only pending reminders can be imported / ניתן לייבא תזכורות ממתינות בלבד");
        if (fields.contractStatus && !["active", "expired", "פעיל", "פג תוקף"].includes(fields.contractStatus)) throw new Error("Only active/expired contracts can be imported");
        const tokens = (fields.offsets || "0").split(";").map(value => value.trim());
        if (tokens.some(value => !/^\d+$/.test(value) || Number(value) > 3650) || tokens.length > 10) throw new Error("Use up to 10 day offsets, 0–3650, separated by ; / ימי התראה לא תקינים");
        const offsets = [...new Set(tokens.map(Number))];
        const recipientsRaw = fields.recipients || fields.email || "";
        let recipientList: string[];
        try {
          const parsed = /^\s*\[/.test(recipientsRaw) ? JSON.parse(recipientsRaw) : null;
          recipientList = Array.isArray(parsed) ? parsed.map(String) : recipientsRaw.split(";");
        } catch { recipientList = recipientsRaw.split(";"); }
        const recipients = [...new Set(recipientList.map(value => value.trim()).filter(Boolean))];
        if ([...recipients, ...(fields.email ? [fields.email] : [])].some(value => !/^[^\s@;]+@[^\s@;]+\.[^\s@;]+$/.test(value))) throw new Error("Invalid email / אימייל לא תקין");
        const dates = offsets.map(days => { const d = new Date(`${expiry}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); });
        const key = fields.externalId || importHash(JSON.stringify([fields.name, expiry, fields.clientId || fields.email || fields.clientName || ""]));
        if (keys.has(key)) throw new Error("Duplicate item key / מזהה פריט כפול");
        keys.add(key);
        if (fields.clientName) {
          const clientKey = fields.clientId || fields.email?.toLowerCase() || fields.clientName;
          const signature = JSON.stringify([fields.clientName, fields.clientType, fields.contact, fields.email, fields.phone, fields.address, fields.city]);
          if (clients.has(clientKey) && clients.get(clientKey) !== signature) throw new Error("Conflicting details for the same client / פרטי לקוח סותרים");
          clients.set(clientKey, signature);
        }
        result.rows.push({row: index + 1, sheet: sheetName, key, name: fields.name, expiry, start, fields, offsets, dates, recipients});
        result.reminderCount += offsets.length;
      } catch (error) { result.errors.push(`${sheetName}, row ${index + 1}: ${(error as Error).message}`); }
    }
  }
  if (!count && !result.errors.length) result.errors.push("No data rows / אין שורות נתונים");
  if (result.rows.some(row => row.dates.some(date => date < new Date().toISOString().slice(0, 10)))) result.warnings.push("Past reminders may become due immediately / תזכורות בעבר עשויות להישלח מיד לאחר הייבוא");
  if (result.rows.some(row => row.fields.document || row.fields.owner)) result.warnings.push("Document references and owners are saved as metadata; files are not uploaded and users are not assigned / מסמכים ואחראים נשמרים כמידע בלבד");
  return result;
}
