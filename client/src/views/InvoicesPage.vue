<template>
  <div class="invoices-page" dir="rtl">
    <div class="invoice-head">
      <div>
        <h1>חשבוניות שיובאו</h1>
        <p>{{ total }} מסמכים</p>
      </div>
      <div class="invoice-actions">
        <n-button @click="load(true)" :loading="loading">
          <template #icon><n-icon :component="RefreshOutline" /></template>
          רענן
        </n-button>
        <n-button type="primary" @click="router.push('/gmail-inbox')">
          <template #icon><n-icon :component="CloudUploadOutline" /></template>
          ייבוא מ-Gmail
        </n-button>
      </div>
    </div>

    <div class="invoice-toolbar">
      <n-input
        v-model:value="filters.q"
        clearable
        placeholder="חיפוש ספק, מספר, כתובת או קובץ..."
        class="invoice-toolbar__search"
        @keydown.enter="load(true)"
      />
      <n-select
        v-model:value="filters.status"
        :options="statusOptions"
        clearable
        placeholder="כל הסטטוסים"
        class="invoice-toolbar__select"
        @update:value="load(true)"
      />
      <n-select
        v-model:value="filters.type"
        :options="typeOptions"
        clearable
        filterable
        placeholder="סוג מסמך"
        class="invoice-toolbar__select"
        @update:value="load(true)"
      />
      <n-select
        v-model:value="filters.supplier"
        :options="supplierOptions"
        clearable
        filterable
        placeholder="ספק"
        class="invoice-toolbar__select"
        @update:value="load(true)"
      />
      <n-date-picker
        v-model:value="dateRange"
        type="daterange"
        clearable
        class="invoice-toolbar__dates"
        @update:value="load(true)"
      />
      <div class="invoice-view-toggle">
        <n-button :type="viewMode === 'cards' ? 'primary' : 'default'" @click="viewMode = 'cards'">
          כרטיסים
        </n-button>
        <n-button :type="viewMode === 'table' ? 'primary' : 'default'" @click="viewMode = 'table'">
          טבלה
        </n-button>
      </div>
    </div>

    <div class="status-strip">
      <button
        v-for="option in statusStrip"
        :key="option.value"
        type="button"
        class="status-filter"
        :class="{ 'status-filter--active': (filters.status ?? '') === option.value }"
        @click="setStatus(option.value)"
      >
        <span>{{ option.label }}</span>
        <strong>{{ option.count }}</strong>
      </button>
    </div>

    <n-spin :show="loading">
      <div v-if="!rows.length" class="invoice-empty">
        לא נמצאו חשבוניות מיובאות
      </div>

      <div v-else-if="viewMode === 'cards'" class="invoice-grid">
        <article
          v-for="row in rows"
          :key="row.id"
          class="invoice-card"
          @click="openDocument(row)"
        >
          <div class="invoice-card__preview">
            <img v-if="thumbnailSrc(row)" :src="thumbnailSrc(row)" :alt="row.file_name" loading="lazy" />
            <img v-else-if="isImage(row)" :src="previewSrc(row)" :alt="row.file_name" loading="lazy" />
            <iframe v-else-if="isPdf(row)" :src="previewSrc(row)" :title="row.file_name" loading="lazy" />
            <div v-else class="invoice-card__fallback">
              <n-icon :component="DocumentTextOutline" :size="42" />
            </div>
            <span class="invoice-card__status">{{ statusLabel(row.status) }}</span>
          </div>
          <div class="invoice-card__body">
            <div class="invoice-card__supplier" :title="row.supplier_name">{{ row.supplier_name }}</div>
            <div class="invoice-card__amount">{{ row.amount_display }}</div>
            <div class="invoice-card__line">
              <span>{{ row.type }}</span>
              <span>{{ displayDate(row) }}</span>
            </div>
            <div class="invoice-card__line invoice-card__line--muted">
              <span>{{ row.invoice_number || "ללא מספר" }}</span>
              <span>{{ row.billing_period || "" }}</span>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="invoice-table-wrap">
        <table class="invoice-table">
          <thead>
            <tr>
              <th>ספק</th>
              <th>סטטוס</th>
              <th>תאריך</th>
              <th>לקוח</th>
              <th>סוג</th>
              <th>סכום</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.id"
              class="invoice-table-row"
              tabindex="0"
              role="button"
              @click="openDocument(row)"
              @keydown.enter.prevent="openDocument(row)"
              @keydown.space.prevent="openDocument(row)"
            >
              <td class="cell-strong">{{ row.supplier_name }}</td>
              <td @click.stop>
                <n-select
                  :value="row.status"
                  :options="invoiceStatusOptions"
                  size="small"
                  class="invoice-status-select"
                  @update:value="(value) => updateInvoiceStatus(row, String(value))"
                />
              </td>
              <td>{{ formatDate(row.issue_date) }}</td>
              <td>{{ clientLabel(row) }}</td>
              <td>{{ invoiceTypeLabel(row) }}</td>
              <td class="cell-amount">{{ row.amount_display }}</td>
              <td class="cell-actions" @click.stop>
                <div class="row-actions">
                  <n-dropdown
                    :options="invoiceActionOptions(row)"
                    placement="bottom-start"
                    trigger="click"
                    @select="(key: string) => handleInvoiceAction(key, row)"
                  >
                    <button class="btn btn--ghost btn--xs icon-btn invoice-row-action" type="button" aria-label="פעולות">
                      <n-icon :component="EllipsisVerticalOutline" class="btn-icon" />
                    </button>
                  </n-dropdown>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </n-spin>

    <n-modal
      v-model:show="businessModal.show"
      preset="card"
      title="הגדר לקוח"
      class="invoice-business-modal"
      :style="{ width: '460px', maxWidth: 'calc(100vw - 32px)' }"
    >
      <div class="invoice-business-form" dir="rtl">
        <n-input
          v-model:value="businessModal.value"
          clearable
          placeholder="שם לקוח"
          @keydown.enter="saveBusinessModal"
        />
        <div class="invoice-business-form__actions">
          <n-button @click="businessModal.show = false">ביטול</n-button>
          <n-button type="primary" :disabled="!businessModal.value.trim()" @click="saveBusinessModal">
            שמור
          </n-button>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch, type Component } from "vue";
import { useRouter } from "vue-router";
import { NButton, NDatePicker, NDropdown, NIcon, NInput, NModal, NSelect, NSpin, useMessage, type SelectOption } from "naive-ui";
import {
  ArchiveOutline,
  BriefcaseOutline,
  CloudUploadOutline,
  DocumentTextOutline,
  DownloadOutline,
  EllipsisVerticalOutline,
  EyeOutline,
  PricetagOutline,
  RefreshOutline,
} from "@vicons/ionicons5";
import { api, type ImportedInvoice } from "../services/apiService.js";

const router = useRouter();
const message = useMessage();

const rows = ref<ImportedInvoice[]>([]);
const total = ref(0);
const loading = ref(false);
const viewMode = ref<"cards" | "table">("table");
const dateRange = ref<[number, number] | null>(null);
const counts = ref<Record<string, number>>({});
const types = ref<string[]>([]);
const suppliers = ref<string[]>([]);
const filters = reactive({
  q: "",
  status: null as string | null,
  type: null as string | null,
  supplier: null as string | null,
});
const businessModal = reactive({
  show: false,
  row: null as ImportedInvoice | null,
  value: "",
});

const statusOptions = computed<SelectOption[]>(() => statusStrip.value.slice(1).map((item) => ({
  label: `${item.label} (${item.count})`,
  value: item.value,
})));
const invoiceStatusOptions: SelectOption[] = [
  { label: "חדש", value: "new" },
  { label: "נבדק", value: "reviewed" },
  { label: "יוצא", value: "outgoing" },
  { label: "ארכיון", value: "archived" },
];
const typeOptions = computed<SelectOption[]>(() => types.value.map((value) => ({ label: value, value })));
const supplierOptions = computed<SelectOption[]>(() => suppliers.value.map((value) => ({ label: value, value })));
const statusStrip = computed(() => [
  { label: "הכל", value: "", count: total.value },
  { label: "חדש", value: "new", count: counts.value.new ?? 0 },
  { label: "נבדק", value: "reviewed", count: counts.value.reviewed ?? 0 },
  { label: "יוצא", value: "outgoing", count: counts.value.outgoing ?? 0 },
  { label: "ארכיון", value: "archived", count: counts.value.archived ?? 0 },
]);

let searchTimer: number | undefined;
watch(() => filters.q, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => load(true), 250);
});

onMounted(() => {
  load();
});

async function load(force = false) {
  loading.value = true;
  try {
    const [dateFrom, dateTo] = dateRange.value ?? [];
    const result = await api.invoices.list({
      q: filters.q,
      status: filters.status ?? undefined,
      type: filters.type ?? undefined,
      supplier: filters.supplier ?? undefined,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString().slice(0, 10) : undefined,
      dateTo: dateTo ? new Date(dateTo).toISOString().slice(0, 10) : undefined,
      limit: 200,
    }, force);
    rows.value = result.rows;
    total.value = result.total;
    counts.value = result.counts;
    types.value = result.types;
    suppliers.value = result.suppliers;
  } catch {
    message.error("שגיאה בטעינת החשבוניות");
  } finally {
    loading.value = false;
  }
}

function setStatus(value: string) {
  filters.status = value || null;
  load(true);
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: "חדש",
    reviewed: "נבדק",
    outgoing: "יוצא",
    archived: "ארכיון",
    done: "חדש",
  };
  return labels[status] ?? status;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const ts = Date.parse(value);
  return Number.isFinite(ts)
    ? new Date(ts).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" })
    : value;
}

function displayDate(row: ImportedInvoice): string {
  return formatDate(row.issue_date ?? row.import_date);
}

function clientLabel(row: ImportedInvoice): string {
  return row.client_name ?? firstInvoiceField(row, ["client_company", "client_name", "customer_name", "bill_to"]) ?? "—";
}

function invoiceTypeLabel(row: ImportedInvoice): string {
  const value = String(row.type || firstInvoiceField(row, ["document_subtype", "invoice_type", "receipt_type"]) || "").trim();
  const normalized = value.toLowerCase();
  if (/receipt|קבלה/.test(normalized)) return "קבלה";
  if (/order|הזמנה/.test(normalized)) return "אישור הזמנה";
  if (/payment|תשלום/.test(normalized)) return "אישור תשלום";
  return "חשבונית";
}

function firstInvoiceField(row: ImportedInvoice, keys: string[]): string | null {
  for (const key of keys) {
    const direct = (row as unknown as Record<string, unknown>)[key];
    const nested = row.fields?.[key];
    const value = direct ?? nested;
    if (value === undefined || value === null || value === "") continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function previewSrc(row: ImportedInvoice): string {
  return row.preview_url ?? "";
}

function thumbnailSrc(row: ImportedInvoice): string | null {
  return row.thumbnail_url;
}

function isPdf(row: ImportedInvoice): boolean {
  return row.mime_type === "application/pdf" || row.file_name.toLowerCase().endsWith(".pdf");
}

function isImage(row: ImportedInvoice): boolean {
  return Boolean(row.mime_type?.startsWith("image/"));
}

function openDocument(row: ImportedInvoice) {
  router.push(`/invoices/${row.id}`);
}

function download(row: ImportedInvoice) {
  if (row.download_url) window.open(row.download_url, "_blank");
}

function renderActionIcon(icon: Component) {
  return () => h(NIcon, { component: icon });
}

function invoiceActionOptions(row: ImportedInvoice) {
  return [
    { label: "פתח מסמך", key: "open", icon: renderActionIcon(EyeOutline) },
    {
      label: "ייצא מסמך",
      key: "download",
      disabled: !row.download_url,
      icon: renderActionIcon(DownloadOutline),
    },
    { type: "divider", key: "d1" },
    {
      label: "הגדר לקוח",
      key: "business",
      icon: renderActionIcon(BriefcaseOutline),
      children: [
        { label: clientLabel(row), key: "business:current", disabled: true },
        { label: "לקוח חדש...", key: "business:custom" },
      ],
    },
    {
      label: "הגדר קטגוריית הוצאה",
      key: "category",
      icon: renderActionIcon(PricetagOutline),
      children: [
        { label: "חשבוניות", key: "category:חשבוניות" },
        { label: "קבלות", key: "category:קבלות" },
      ],
    },
    { type: "divider", key: "d2" },
    {
      label: "העבר לארכיון",
      key: "archive",
      icon: renderActionIcon(ArchiveOutline),
      props: { style: "color: var(--color-error, #d03050)" },
    },
  ];
}

async function handleInvoiceAction(key: string, row: ImportedInvoice) {
  if (key === "open") return openDocument(row);
  if (key === "download") return download(row);
  if (key === "archive") return updateInvoiceStatus(row, "archived");
  if (key === "business:custom") return openBusinessModal(row);
  if (key.startsWith("business:")) return updateInvoiceMeta(row, { client_name: key.slice("business:".length) });
  if (key.startsWith("category:")) return updateInvoiceMeta(row, { expense_category: key.slice("category:".length) });
}

function openBusinessModal(row: ImportedInvoice) {
  businessModal.row = row;
  businessModal.value = clientLabel(row) === "—" ? "" : clientLabel(row);
  businessModal.show = true;
}

async function saveBusinessModal() {
  const row = businessModal.row;
  const value = businessModal.value.trim();
  if (!row || !value) return;
  await updateInvoiceMeta(row, { client_name: value });
  businessModal.show = false;
}

async function updateInvoiceStatus(row: ImportedInvoice, status: string) {
  if (row.status === status) return;
  try {
    const updated = await api.invoices.update(row.id, { status });
    replaceRow(updated);
    message.success("הסטטוס עודכן");
  } catch {
    message.error("שגיאה בעדכון הסטטוס");
  }
}

async function updateInvoiceMeta(row: ImportedInvoice, body: { client_name?: string; business?: string; expense_category?: string }) {
  try {
    const updated = await api.invoices.update(row.id, body);
    replaceRow(updated);
    message.success("החשבונית עודכנה");
  } catch {
    message.error("שגיאה בעדכון החשבונית");
  }
}

function replaceRow(updated: ImportedInvoice) {
  rows.value = rows.value.map((row) => row.id === updated.id ? updated : row);
  const nextCounts: Record<string, number> = {};
  for (const row of rows.value) nextCounts[row.status] = (nextCounts[row.status] ?? 0) + 1;
  counts.value = nextCounts;
}
</script>

<style scoped>
.invoices-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.invoice-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.invoice-head h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
}

.invoice-head p {
  margin: 4px 0 0;
  color: var(--text-secondary);
}

.invoice-actions,
.invoice-toolbar,
.invoice-view-toggle,
.status-strip,
.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.invoice-toolbar {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}

.invoice-toolbar__search {
  min-width: 260px;
  flex: 1;
}

.invoice-toolbar__select {
  width: 180px;
}

.invoice-toolbar__dates {
  width: 260px;
}

.status-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
}

.status-filter--active {
  border-color: var(--brand-color);
  background: color-mix(in srgb, var(--brand-color) 10%, var(--bg-card));
  color: var(--brand-color);
}

.invoice-empty {
  padding: 48px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  text-align: center;
  color: var(--text-secondary);
  background: var(--bg-card);
}

.invoice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.invoice-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.invoice-card:hover {
  border-color: var(--brand-color);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text-primary) 10%, transparent);
  transform: translateY(-1px);
}

.invoice-card__preview {
  position: relative;
  height: 220px;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-elevated) 82%, var(--bg-card));
  overflow: hidden;
}

.invoice-card__preview img,
.invoice-card__preview iframe {
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: contain;
  background: #fff;
}

.invoice-card__fallback {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-secondary);
}

.invoice-card__status,
.invoice-status {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 9px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--brand-color) 13%, var(--bg-card));
  color: var(--brand-color);
  font-size: 12px;
  font-weight: 700;
}

.invoice-card__status {
  position: absolute;
  top: 10px;
  right: 10px;
}

.invoice-card__body {
  padding: 12px 14px 14px;
}

.invoice-card__supplier {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 800;
  color: var(--text-primary);
}

.invoice-card__amount {
  margin-top: 4px;
  font-size: 20px;
  font-weight: 800;
}

.invoice-card__line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 12px;
}

.invoice-card__line--muted {
  margin-top: 4px;
  padding-top: 0;
  border-top: 0;
}

.invoice-table-wrap {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  overflow: auto;
}

.invoice-table {
  width: 100%;
  min-width: 900px;
  border-collapse: separate;
  border-spacing: 0;
}

.invoice-table th,
.invoice-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-color);
  text-align: right;
  white-space: nowrap;
  font-size: 13px;
}

.invoice-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-weight: 800;
}

.invoice-table tbody tr:last-child td {
  border-bottom: none;
}

.invoice-table tbody tr:hover td {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
}

.invoice-table-row {
  cursor: pointer;
  outline: none;
}

.invoice-table-row:focus-visible td {
  background: color-mix(in srgb, var(--brand-color) 8%, var(--bg-card));
  box-shadow: inset 0 0 0 1px var(--brand-color);
}

.cell-strong,
.cell-amount {
  font-weight: 800;
  color: var(--text-primary);
}

.cell-file {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cell-actions {
  width: 72px;
}

.invoice-status-select {
  width: 112px;
}

.invoice-row-action {
  color: var(--text-secondary);
}

.invoice-row-action:hover {
  color: var(--brand-color);
}

.invoice-business-modal {
  width: 460px;
  max-width: calc(100vw - 32px);
}

:global(.invoice-business-modal.n-card) {
  width: 460px !important;
  max-width: calc(100vw - 32px) !important;
}

.invoice-business-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.invoice-business-form__actions {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
}

@media (max-width: 760px) {
  .invoice-head {
    flex-direction: column;
  }

  .invoice-toolbar :deep(.n-input),
  .invoice-toolbar :deep(.n-select),
  .invoice-toolbar :deep(.n-date-picker) {
    width: 100% !important;
    min-width: 0 !important;
  }

  .invoice-grid {
    grid-template-columns: 1fr;
  }
}
</style>
