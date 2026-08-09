import "dotenv/config";
import {ObjectId} from "mongodb";
import {closeDb, col, connectDb} from "../db/db";
import {sendEmailWithAttachments} from "../reminders/emailSender";
import {
    generateFutureClientReports,
    generateMonthlyContractReports,
    loadFutureReportRows,
    loadMonthlyReportRows,
    reportPeriodKey,
    sendMonthlyReportToRecipients,
} from "../reports/monthlyReports";
import {getSpacesSignedUrl} from "../storage/spaces";

const OWNER_EMAIL = "arshavsky.pasha@gmail.com";
const VALID_FORMATS = new Set(["docx", "xlsx", "csv"]);
const SIGNED_URL_TTL = 7 * 24 * 3600;

type Mode = "all" | "client" | "client-monthly-owner" | "send-both" | "client-links" | "client-future" | "client-future-links" | "send-client-future";

function arg(name: string): string | undefined {
  const eqPrefix = `--${name}=`;
  const eqArg = process.argv.find((value) => value.startsWith(eqPrefix));
  if (eqArg) return eqArg.slice(eqPrefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function parseMode(): Mode {
  const mode = process.argv[2];
  if (
    mode === "all" ||
    mode === "client" ||
    mode === "client-monthly-owner" ||
    mode === "send-both" ||
    mode === "client-links" ||
    mode === "client-future" ||
    mode === "client-future-links" ||
    mode === "send-client-future"
  ) return mode;
  throw new Error("Use one of: all, client, client-monthly-owner, send-both, client-links, client-future, client-future-links, send-client-future");
}

function parsePeriod(): {year: number; month?: number} {
  const rawMonth = arg("month");
  const rawYear = arg("year");
  if (!rawMonth) {
    const year = rawYear ? Number(rawYear) : new Date().getFullYear();
    return validatePeriod(year);
  }

  const yearMonth = rawMonth.match(/^(\d{4})-(\d{1,2})$/);
  if (yearMonth) {
    return validatePeriod(Number(yearMonth[1]), Number(yearMonth[2]));
  }

  const year = rawYear ? Number(rawYear) : new Date().getFullYear();
  return validatePeriod(year, Number(rawMonth));
}

function validatePeriod(year: number, month?: number): {year: number; month?: number} {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`Invalid year "${year}"`);
  }
  if (month == null) return {year};
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month "${month}"`);
  }
  return {year, month};
}

function parseCsvArg(name: string): string[] | undefined {
  const raw = arg(name);
  if (!raw) return undefined;
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function parseFormats(): string[] {
  const formats = parseCsvArg("formats") ?? ["docx", "xlsx"];
  const invalid = formats.filter((format) => !VALID_FORMATS.has(format));
  if (invalid.length) throw new Error(`Invalid format(s): ${invalid.join(", ")}. Use docx,xlsx,csv.`);
  return [...new Set(formats)];
}

async function findOwnerUserId(): Promise<string> {
  const explicitUserId = arg("user-id") ?? arg("userId");
  if (explicitUserId?.trim()) return explicitUserId.trim();

  const user = await col("users").findOne({email: OWNER_EMAIL}) as any;
  if (!user) throw new Error(`No user found with email ${OWNER_EMAIL}`);
  return user._id.toString();
}

async function loadSavedClientReportFields(userId: string): Promise<string[] | undefined> {
  const settings = await col("user_settings").findOne({user_id: userId}) as any;
  const fields = settings?.report_config?.client_fields;
  return Array.isArray(fields) && fields.length
    ? fields.filter((field): field is string => typeof field === "string")
    : undefined;
}

async function findClientId(userId: string): Promise<string> {
  const raw = arg("client") ?? arg("client-id") ?? arg("clientId");
  if (!raw) {
    throw new Error("Provide a client: --client=<client id, email, or exact display name>");
  }

  const value = raw.trim();
  if (ObjectId.isValid(value)) return value;

  const client = await col("clients").findOne({
    user_id: userId,
    $or: [
      {email: value.toLowerCase()},
      {display_name: value},
    ],
  }) as any;

  if (!client) throw new Error(`Client not found: ${value}`);
  return client._id.toString();
}

async function monthlyClientIds(userId: string, year: number, month?: number): Promise<string[]> {
  const from = month ? `${year}-${String(month).padStart(2, "0")}-01` : `${year}-01-01`;
  const next = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);
  const to = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  const contracts = await col("contracts")
    .find({
      user_id: userId,
      expiry_date: {$gte: from, $lt: to},
    })
    .project({client_id: 1})
    .toArray() as any[];

  return [...new Set(contracts
    .map((contract) => contract.client_id ? String(contract.client_id) : null)
    .filter((id): id is string => Boolean(id)))];
}

async function futureClientIds(userId: string): Promise<string[]> {
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
  const contracts = await col("contracts")
    .find({user_id: userId, $or: conditions})
    .project({client_id: 1})
    .toArray() as any[];

  return [...new Set(contracts
    .map((contract) => contract.client_id ? String(contract.client_id) : null)
    .filter((id): id is string => Boolean(id)))];
}

function buildAttachments(report: {docx: Buffer; xlsx: Buffer; csv: Buffer}, monthKey: string, formats: string[]) {
  const attachments = [] as Array<{filename: string; content: Buffer; contentType: string}>;
  if (formats.includes("docx")) attachments.push({filename: `contracts-report-${monthKey}.docx`, content: report.docx, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  if (formats.includes("xlsx")) attachments.push({filename: `contracts-report-${monthKey}.xlsx`, content: report.xlsx, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  if (formats.includes("csv")) attachments.push({filename: `contracts-report-${monthKey}.csv`, content: report.csv, contentType: "text/csv; charset=utf-8"});
  return attachments;
}

async function sendOwnerClientReports(userId: string, year: number, month: number | undefined, formats: string[], fields?: string[]) {
  const clientId = arg("client") || arg("client-id") || arg("clientId")
    ? await findClientId(userId)
    : undefined;
  const ids = clientId ? [clientId] : await monthlyClientIds(userId, year, month);
  const periodKey = reportPeriodKey(year, month);
  let sent = 0;
  let records = 0;

  for (const id of ids) {
    const report = await generateMonthlyContractReports(userId, year, month, fields, id);
    if (!report.count) continue;
    const client = await col("clients").findOne({_id: toObjectId(id), user_id: userId}) as any;
    const attachments = buildAttachments(report, periodKey, formats);
    const result = await sendEmailWithAttachments(
      [OWNER_EMAIL],
      `דוח ללקוח - ${client?.display_name ?? id} - ${periodKey}`,
      `מצורף דוח חודשי ללקוח ${client?.display_name ?? id}. מספר רשומות: ${report.count}.`,
      attachments,
      `<div dir="rtl"><h2>דוח ללקוח</h2><p>לקוח: ${escapeHtml(client?.display_name ?? id)}</p><p>תקופה: ${periodKey}</p><p>מספר רשומות: ${report.count}</p></div>`,
    );
    if (!result.success) throw new Error(result.error ?? `Failed sending client report for ${id}`);
    sent += 1;
    records += report.count;
  }

  return {sent, records};
}

async function sendOwnerFutureClientReports(userId: string, formats: string[], fields?: string[]) {
  const clientId = arg("client") || arg("client-id") || arg("clientId")
    ? await findClientId(userId)
    : undefined;
  const ids = clientId ? [clientId] : await futureClientIds(userId);
  let sent = 0;
  let records = 0;

  for (const id of ids) {
    const report = await generateFutureClientReports(userId, fields, id);
    if (!report.count) continue;
    const client = await col("clients").findOne({_id: toObjectId(id), user_id: userId}) as any;
    const attachments = buildAttachments(report, "future-tests", formats);
    const result = await sendEmailWithAttachments(
      [OWNER_EMAIL],
      `דוח בדיקות עתידיות ללקוח - ${client?.display_name ?? id}`,
      `מצורף דוח בדיקות עתידיות ללקוח ${client?.display_name ?? id}. מספר רשומות: ${report.count}.`,
      attachments,
      `<div dir="rtl"><h2>דוח בדיקות עתידיות ללקוח</h2><p>לקוח: ${escapeHtml(client?.display_name ?? id)}</p><p>מספר רשומות: ${report.count}</p></div>`,
    );
    if (!result.success) throw new Error(result.error ?? `Failed sending future client report for ${id}`);
    sent += 1;
    records += report.count;
  }

  return {sent, records};
}

async function sendDocumentLinksToClients(userId: string, year: number, month?: number): Promise<{sent: number; skipped: string[]}> {
  const clientId = arg("client") || arg("client-id") || arg("clientId")
    ? await findClientId(userId)
    : undefined;
  const clientIds = clientId ? [clientId] : await monthlyClientIds(userId, year, month);
  const periodKey = reportPeriodKey(year, month);
  const skipped: string[] = [];
  let sent = 0;

  for (const id of clientIds) {
    const client = await col("clients").findOne({_id: toObjectId(id), user_id: userId}) as any;
    if (!client?.email) {
      skipped.push(`${client?.display_name ?? id}: missing email`);
      continue;
    }

    const rows = await loadMonthlyReportRows(userId, year, month, id);
    const docs = new Map<string, any>();
    for (const row of rows) {
      if (row.document?._id) docs.set(String(row.document._id), row.document);
    }

    const links: Array<{name: string; url: string}> = [];
    for (const doc of docs.values()) {
      const url = await publicDocumentUrl(doc);
      if (url) links.push({name: doc.file_name ?? `document-${String(doc._id)}`, url});
    }

    if (!links.length) {
      skipped.push(`${client.display_name ?? id}: no public document links`);
      continue;
    }

    const htmlLinks = links
      .map((link) => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.name)}</a></li>`)
      .join("");
    const textLinks = links.map((link) => `${link.name}: ${link.url}`).join("\n");
    const result = await sendEmailWithAttachments(
      [client.email],
      `מסמכים - ${client.display_name ?? ""} - ${periodKey}`,
      `שלום,\n\nלהלן קישורים למסמכים עבור ${periodKey}:\n${textLinks}\n\nבברכה`,
      [],
      `<div dir="rtl"><p>שלום,</p><p>להלן קישורים למסמכים עבור ${periodKey}:</p><ul>${htmlLinks}</ul><p>בברכה</p></div>`,
    );
    if (!result.success) throw new Error(result.error ?? `Failed sending document links for ${client.display_name ?? id}`);
    sent += 1;
  }

  return {sent, skipped};
}

async function sendFutureDocumentLinksToClients(userId: string): Promise<{sent: number; skipped: string[]}> {
  const clientId = arg("client") || arg("client-id") || arg("clientId")
    ? await findClientId(userId)
    : undefined;
  const clientIds = clientId ? [clientId] : await futureClientIds(userId);
  const skipped: string[] = [];
  let sent = 0;

  for (const id of clientIds) {
    const client = await col("clients").findOne({_id: toObjectId(id), user_id: userId}) as any;
    if (!client?.email) {
      skipped.push(`${client?.display_name ?? id}: missing email`);
      continue;
    }

    const rows = await loadFutureReportRows(userId, id);
    const docs = new Map<string, any>();
    for (const row of rows) {
      if (row.document?._id) docs.set(String(row.document._id), row.document);
    }

    const links: Array<{name: string; url: string}> = [];
    for (const doc of docs.values()) {
      const url = await publicDocumentUrl(doc);
      if (url) links.push({name: doc.file_name ?? `document-${String(doc._id)}`, url});
    }

    if (!links.length) {
      skipped.push(`${client.display_name ?? id}: no public document links`);
      continue;
    }

    const htmlLinks = links
      .map((link) => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.name)}</a></li>`)
      .join("");
    const textLinks = links.map((link) => `${link.name}: ${link.url}`).join("\n");
    const result = await sendEmailWithAttachments(
      [client.email],
      `מסמכים לבדיקות עתידיות - ${client.display_name ?? ""}`,
      `שלום,\n\nלהלן קישורים למסמכי הבדיקות העתידיות:\n${textLinks}\n\nבברכה`,
      [],
      `<div dir="rtl"><p>שלום,</p><p>להלן קישורים למסמכי הבדיקות העתידיות:</p><ul>${htmlLinks}</ul><p>בברכה</p></div>`,
    );
    if (!result.success) throw new Error(result.error ?? `Failed sending future document links for ${client.display_name ?? id}`);
    sent += 1;
  }

  return {sent, skipped};
}

async function publicDocumentUrl(doc: any): Promise<string | null> {
  if (typeof doc.download_url === "string" && doc.download_url.trim()) {
    const expiresAt = doc.signed_url_expires_at ? new Date(doc.signed_url_expires_at) : null;
    if (!expiresAt || expiresAt.getTime() > Date.now() + 3600_000) return doc.download_url;
  }

  if (!doc.spaces_key) return null;
  const url = await getSpacesSignedUrl(doc.spaces_key, SIGNED_URL_TTL, doc.file_name ?? undefined);
  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL * 1000);
  await col("documents").updateOne({_id: doc._id}, {$set: {download_url: url, signed_url_expires_at: expiresAt, updated_at: new Date()}});
  return url;
}

function toObjectId(id: string): any {
  try {
    return new ObjectId(id);
  } catch {
    return id;
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  const mode = parseMode();
  const needsMonth = mode === "all" || mode === "client" || mode === "client-monthly-owner" || mode === "send-both" || mode === "client-links";
  const period = needsMonth ? parsePeriod() : null;
  const formats = parseFormats();

  await connectDb();

  const userId = await findOwnerUserId();
  const fields = parseCsvArg("fields") ?? await loadSavedClientReportFields(userId);
  if (mode === "client-future") {
    const result = await sendOwnerFutureClientReports(userId, formats, fields);
    console.log(`[monthly-report] Sent ${result.sent} future client report email(s) to ${OWNER_EMAIL}; records=${result.records}`);
    return;
  }

  if (mode === "client-future-links") {
    const result = await sendFutureDocumentLinksToClients(userId);
    console.log(`[monthly-report] Sent future document-link emails to ${result.sent} client(s)`);
    for (const item of result.skipped) console.log(`[monthly-report] Skipped: ${item}`);
    return;
  }

  if (mode === "send-client-future") {
    const clientResult = await sendOwnerFutureClientReports(userId, formats, fields);
    const linksResult = await sendFutureDocumentLinksToClients(userId);
    console.log(`[monthly-report] Sent ${clientResult.sent} future client report email(s) to ${OWNER_EMAIL}; records=${clientResult.records}`);
    console.log(`[monthly-report] Sent future document-link emails to ${linksResult.sent} client(s)`);
    for (const item of linksResult.skipped) console.log(`[monthly-report] Skipped: ${item}`);
    return;
  }

  const {year, month} = period!;
  if (mode === "client-links") {
    const result = await sendDocumentLinksToClients(userId, year, month);
    console.log(`[monthly-report] Sent document-link emails to ${result.sent} client(s)`);
    for (const item of result.skipped) console.log(`[monthly-report] Skipped: ${item}`);
    return;
  }

  if (mode === "client-monthly-owner") {
    const periodKey = reportPeriodKey(year, month);
    const clientResult = await sendOwnerClientReports(userId, year, month, formats, fields);
    console.log(`[monthly-report] Sent ${clientResult.sent} client monthly report email(s) for ${periodKey} to ${OWNER_EMAIL}; records=${clientResult.records}`);
    return;
  }

  if (mode === "send-both") {
    const periodKey = reportPeriodKey(year, month);
    const allResult = await sendMonthlyReportToRecipients({
      userId,
      year,
      month,
      recipients: [OWNER_EMAIL],
      formats,
      rawFields: fields,
      includeClientRecipient: false,
    });
    if (!allResult.success) throw new Error(allResult.error ?? "All-client monthly report email failed");
    const clientResult = await sendOwnerClientReports(userId, year, month, formats, fields);
    const linksResult = await sendDocumentLinksToClients(userId, year, month);
    console.log(`[monthly-report] Sent all-client report for ${periodKey} to ${OWNER_EMAIL}; records=${allResult.count}`);
    console.log(`[monthly-report] Sent ${clientResult.sent} client report email(s) to ${OWNER_EMAIL}; records=${clientResult.records}`);
    console.log(`[monthly-report] Sent document-link emails to ${linksResult.sent} client(s)`);
    for (const item of linksResult.skipped) console.log(`[monthly-report] Skipped: ${item}`);
    return;
  }

  const clientId = mode === "client" ? await findClientId(userId) : undefined;
  const result = await sendMonthlyReportToRecipients({
    userId,
    year,
    month,
    recipients: [OWNER_EMAIL],
    formats,
    rawFields: fields,
    clientId,
    includeClientRecipient: false,
  });

  if (!result.success) throw new Error(result.error ?? "Monthly report email failed");
  const periodKey = reportPeriodKey(year, month);
  console.log(`[monthly-report] Sent ${mode} report for ${periodKey} to ${OWNER_EMAIL}`);
  console.log(`[monthly-report] Records: ${result.count}; emails sent: ${result.reportsSent}`);
}

main()
  .catch((err) => {
    console.error("[monthly-report] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
