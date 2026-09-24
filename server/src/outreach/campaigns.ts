import XLSX from "xlsx";

export const CAMPAIGN_FROM = "RemindOCR <contact@remindocr.com>";
export const CAMPAIGN_REPLY_TO = "contact@remindocr.com";
export const CAMPAIGN_BATCH_SIZE = 100;

const EMAIL_RE = /^[^\s@,;<>/]+@[^\s@,;<>/]+\.[a-z]{2,}$/i;
const UNSUBSCRIBE_MAILTO = "mailto:contact@remindocr.com?subject=%D7%94%D7%A1%D7%A8";

export function isValidCampaignEmail(value: unknown): boolean {
  return EMAIL_RE.test(String(value ?? "").trim());
}

// ── CSV / Excel lead import ─────────────────────────────────────────────────

export interface ImportedLeadRow {
  email: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  city: string | null;
}

const HEADER_ALIASES: Record<keyof ImportedLeadRow, string[]> = {
  email: ["email", "e-mail", "e mail", "mail", "email address", "אימייל", "מייל", "דואל", "דוא\"ל", "דוא״ל", "כתובת מייל"],
  name: ["name", "full name", "contact", "contact name", "שם", "שם מלא", "איש קשר", "שם איש קשר"],
  company: ["company", "business", "organization", "חברה", "שם חברה", "עסק", "שם העסק", "ארגון"],
  phone: ["phone", "mobile", "tel", "telephone", "cell", "טלפון", "נייד", "סלולרי", "מספר טלפון"],
  city: ["city", "town", "עיר", "ישוב", "יישוב"],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, " ").replace(/[׳']/g, "'");
}

function cellText(value: unknown): string | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

/**
 * Maps a CSV/XLSX buffer to lead rows. Columns are matched by English or Hebrew
 * header names; a sheet with no recognizable email header falls back to the
 * column whose values are mostly email addresses (e.g. a bare list of emails).
 */
export function parseLeadSheet(buffer: Buffer, filename: string): {rows: ImportedLeadRow[]; invalid: number; totalRows: number} {
  const isCsv = /\.(csv|txt)$/i.test(filename);
  const workbook = isCsv
    ? XLSX.read(buffer.toString("utf8").replace(/^\uFEFF/, ""), {type: "string", raw: true})
    : XLSX.read(buffer, {type: "buffer"});
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return {rows: [], invalid: 0, totalRows: 0};
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {header: 1, defval: "", blankrows: false, raw: false});
  if (!matrix.length) return {rows: [], invalid: 0, totalRows: 0};

  const header = matrix[0].map(normalizeHeader);
  const columnFor = (field: keyof ImportedLeadRow) =>
    header.findIndex((h) => HEADER_ALIASES[field].some((alias) => h === normalizeHeader(alias)));
  let emailCol = columnFor("email");
  let dataRows = matrix.slice(1);
  if (emailCol < 0) {
    // No header row: pick the column that looks most like emails, and keep row 0 as data.
    const width = Math.max(...matrix.map((row) => row.length));
    let best = -1;
    let bestHits = 0;
    for (let c = 0; c < width; c += 1) {
      const hits = matrix.filter((row) => isValidCampaignEmail(row[c])).length;
      if (hits > bestHits) { best = c; bestHits = hits; }
    }
    emailCol = best;
    dataRows = matrix;
  }
  if (emailCol < 0) return {rows: [], invalid: dataRows.length, totalRows: dataRows.length};

  const cols = {name: columnFor("name"), company: columnFor("company"), phone: columnFor("phone"), city: columnFor("city")};
  const rows: ImportedLeadRow[] = [];
  let invalid = 0;
  for (const row of dataRows) {
    const email = String(row[emailCol] ?? "").trim().toLowerCase();
    if (!isValidCampaignEmail(email)) { invalid += 1; continue; }
    rows.push({
      email,
      name: cols.name >= 0 ? cellText(row[cols.name]) : null,
      company: cols.company >= 0 ? cellText(row[cols.company]) : null,
      phone: cols.phone >= 0 ? cellText(row[cols.phone]) : null,
      city: cols.city >= 0 ? cellText(row[cols.city]) : null,
    });
  }
  return {rows, invalid, totalRows: dataRows.length};
}

// ── Email content ───────────────────────────────────────────────────────────

/** Israeli anti-spam law: advertising email must be marked "פרסומת" in the subject. */
export function campaignSubject(subject: string): string {
  const trimmed = subject.trim();
  return /^פרסומת/.test(trimmed) ? trimmed : `פרסומת: ${trimmed}`;
}

const FOOTER_HTML = `<p dir="rtl" style="margin:20px 0 0;font-size:12px;color:#000000;text-align:right;font-family:'Segoe UI',Arial,sans-serif;">להסרה מרשימת התפוצה <a href="${UNSUBSCRIBE_MAILTO}" style="color:#000000;text-decoration:underline;font-weight:700;">לחצו כאן</a> או השיבו למייל זה עם המילה &quot;הסר&quot;.</p>`;

/** Adds the opt-out line unless the HTML already carries one. */
export function withUnsubscribeFooter(html: string): string {
  if (/הסר|unsubscribe/i.test(html)) return html;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${FOOTER_HTML}\n</body>`) : `${html}\n${FOOTER_HTML}`;
}

/** Plain-text alternative for clients that do not render HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildCampaignMessage(campaign: {subject: string; html: string}) {
  const html = withUnsubscribeFooter(campaign.html);
  return {
    from: CAMPAIGN_FROM,
    replyTo: CAMPAIGN_REPLY_TO,
    subject: campaignSubject(campaign.subject),
    html,
    text: htmlToText(html),
    headers: {"List-Unsubscribe": "<mailto:contact@remindocr.com?subject=unsubscribe>"},
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
