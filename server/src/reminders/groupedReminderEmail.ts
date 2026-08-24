export type GroupedReminderItem = {
  contract_number: string;
  equipment: string;
  license_number: string;
  expiry_date: string;
};

const TH_STYLE = "background:#fff8e1;color:#7c4a00;font-size:12px;font-weight:700;padding:10px 12px;text-align:right;border-bottom:1px solid #f3e8c8;font-family:'Segoe UI',Arial,sans-serif";
const TD_STYLE = "padding:10px 12px;border-bottom:1px solid #e5e9ef;font-size:13px;color:#111827;text-align:right;font-family:'Segoe UI',Arial,sans-serif";
const TABLE_STYLE = "width:100%;border-collapse:collapse;background:#fafbfc;border:1px solid #e5e9ef;border-radius:10px;margin:8px 0 16px;font-family:'Segoe UI',Arial,sans-serif";
const WRAP_STYLE = "margin:16px 0;width:100%;direction:rtl;text-align:right";
const TITLE_STYLE = "font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 8px;font-family:'Segoe UI',Arial,sans-serif";

const LANDMARKS = [
  /<div[^>]*class=["'][^"']*\bcta-box\b[^"']*["'][^>]*>/i,
  /<div[^>]*class=["'][^"']*\bwarning-box\b[^"']*["'][^>]*>/i,
  /<div[^>]*class=["'][^"']*\brenewal-box\b[^"']*["'][^>]*>/i,
  /<div[^>]*class=["'][^"']*\bfooter\b[^"']*["'][^>]*>/i,
  /<\/body>/i,
];

export function groupedReminderKey(clientId: string | number | null | undefined, triggerDate: string, email: string): string {
  return `${clientId ?? "no-client"}|${triggerDate}|${email.trim().toLowerCase()}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cell(value: string | null | undefined): string {
  const text = value?.trim() ? value.trim() : "—";
  return escapeHtml(text);
}

export const SAMPLE_GROUPED_ITEMS: GroupedReminderItem[] = [
  { contract_number: "484590/13110", equipment: "מנוף הידראולי", license_number: "233017", expiry_date: "2026-09-14" },
  { contract_number: "484590/13111", equipment: "אביזר הרמה", license_number: "188402", expiry_date: "2026-09-20" },
  { contract_number: "501102/22001", equipment: "פיגום נייד", license_number: "", expiry_date: "2026-10-01" },
];

export function sampleGroupedItemsTable(): string {
  return buildGroupedItemsTable(SAMPLE_GROUPED_ITEMS);
}

export function buildGroupedItemsTable(items: GroupedReminderItem[]): string {
  const rows = items.map((item) => `<tr>
      <td style="${TD_STYLE}">${cell(item.contract_number)}</td>
      <td style="${TD_STYLE}">${cell(item.equipment)}</td>
      <td style="${TD_STYLE}">${cell(item.expiry_date)}</td>
    </tr>`).join("");
  return `<table class="items" cellpadding="0" cellspacing="0" role="presentation" dir="rtl" style="${TABLE_STYLE}">
    <thead>
      <tr>
        <th style="${TH_STYLE}">תסקיר</th>
        <th style="${TH_STYLE}">ציוד</th>
        <th style="${TH_STYLE}">בתוקף עד</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function hasItemsTablePlaceholder(html: string): boolean {
  return /\{\{\{\s*items_table\s*\}\}\}|\{\{\s*items_table\s*(?:\|[^}]*)?\}\}/.test(html);
}

export function normalizeItemsTableTokens(html: string): string {
  return html.replace(/\{\{\{\s*items_table\s*\}\}\}/g, "{{items_table}}");
}

function wrapInjectedTable(tableHtml: string): string {
  return `<div class="grouped-items-wrap" dir="rtl" style="${WRAP_STYLE}"><div class="section-title" style="${TITLE_STYLE}">פריטים לבדיקה</div>${tableHtml}</div>`;
}

export function injectItemsTable(html: string, tableHtml: string): string {
  if (!tableHtml.trim() || hasItemsTablePlaceholder(html)) return html;
  const block = wrapInjectedTable(tableHtml);
  const bodyStart = html.search(/<body[\s>]/i);
  const searchFrom = bodyStart >= 0 ? bodyStart : 0;
  const region = html.slice(searchFrom);
  for (const re of LANDMARKS) {
    const match = re.exec(region);
    if (!match) continue;
    const idx = searchFrom + match.index;
    return `${html.slice(0, idx)}${block}\n    ${html.slice(idx)}`;
  }
  return `${html}\n${block}`;
}

export function prepareGroupedTemplateHtml(html: string, tableHtml: string): string {
  const normalized = normalizeItemsTableTokens(html);
  if (hasItemsTablePlaceholder(normalized)) return normalized;
  return injectItemsTable(normalized, tableHtml);
}

export function expiryFromReminderTitle(title: string | null | undefined): string | null {
  const match = String(title ?? "").match(/ב-(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}
