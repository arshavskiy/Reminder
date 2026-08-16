export type GroupedReminderItem = {
  contract_number: string;
  equipment: string;
  license_number: string;
  expiry_date: string;
};

export function groupedReminderKey(clientId: string | null | undefined, triggerDate: string, email: string): string {
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

export function buildGroupedItemsTable(items: GroupedReminderItem[]): string {
  const rows = items.map((item) => `<tr>
      <td>${cell(item.contract_number)}</td>
      <td>${cell(item.equipment)}</td>
      <td>${cell(item.license_number)}</td>
      <td>${cell(item.expiry_date)}</td>
    </tr>`).join("");
  return `<table class="items" cellpadding="0" cellspacing="0" role="presentation">
    <thead>
      <tr>
        <th>תסקיר</th>
        <th>ציוד</th>
        <th>רישוי</th>
        <th>בתוקף עד</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function expiryFromReminderTitle(title: string | null | undefined): string | null {
  const match = String(title ?? "").match(/ב-(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}
