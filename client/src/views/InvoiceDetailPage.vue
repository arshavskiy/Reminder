<template>
  <div class="invoice-detail" dir="rtl">
    <div class="invoice-detail__top">
      <button class="invoice-detail__close" type="button" aria-label="סגור" @click="router.push('/invoices')">
        <n-icon :component="CloseOutline" :size="22" />
      </button>
      <div class="invoice-detail__pager">
        <n-icon :component="ChevronBackOutline" :size="16" />
        <span>מסמך 1 מתוך {{ invoice ? 1 : 0 }}</span>
        <n-icon :component="ChevronForwardOutline" :size="16" />
      </div>
      <div class="invoice-detail__title">
        <h1>{{ invoice?.supplier_name || "חשבונית" }}</h1>
        <p v-if="sourceLine">מאת: {{ sourceLine }}</p>
        <div v-if="invoice" class="invoice-detail__chips">
          <span class="status-chip">{{ statusLabel(invoice.status) }}</span>
          <span class="meta-chip">{{ invoice.invoice_number || "ללא מספר" }}</span>
          <span class="meta-chip">{{ invoiceTypeLabel(invoice) }}</span>
        </div>
      </div>
    </div>

    <n-spin :show="loading">
      <div v-if="invoice" class="invoice-detail__body">
        <section class="invoice-preview">
          <div class="invoice-preview__toolbar">
            <n-button size="small">
              <template #icon><n-icon :component="ChevronDownOutline" /></template>
              הוסף לדוח
            </n-button>
            <div class="invoice-preview__tools">
              <n-button quaternary circle @click="downloadInvoice">
                <template #icon><n-icon :component="DownloadOutline" /></template>
              </n-button>
              <n-button quaternary circle @click="openDocumentPage">
                <template #icon><n-icon :component="OpenOutline" /></template>
              </n-button>
            </div>
          </div>

          <div class="invoice-preview__paper">
            <iframe
              v-if="invoice.preview_url && isPdf(invoice)"
              :src="invoice.preview_url"
              :title="invoice.file_name"
            />
            <img
              v-else-if="invoice.preview_url && isImage(invoice)"
              :src="invoice.preview_url"
              :alt="invoice.file_name"
            />
            <div v-else class="invoice-preview__empty">
              <n-icon :component="DocumentTextOutline" :size="48" />
              <span>אין תצוגה מקדימה</span>
            </div>
          </div>

          <div class="invoice-preview__bottom">
            <div class="invoice-preview__bottom-tools">
              <button type="button" @click="openDocumentPage"><n-icon :component="OpenOutline" /></button>
              <button type="button" @click="downloadInvoice"><n-icon :component="DownloadOutline" /></button>
              <button type="button"><n-icon :component="SearchOutline" /></button>
            </div>
            <span v-if="sourceLine" class="invoice-preview__source">
              מקור: {{ sourceLine }}
              <n-icon :component="MailOutline" :size="16" />
            </span>
          </div>
        </section>

        <aside class="invoice-side">
          <div v-if="probablyContractDocument" class="invoice-warning">
            <strong>כנראה לא חשבונית</strong>
            <span>חסרים גם מספר חשבונית וגם סכום לתשלום. המסמך כנראה חוזה או מסמך אחר.</span>
          </div>

          <section class="side-card side-card--main">
            <h2>פיננסים</h2>
            <div class="finance-summary">
              <div class="finance-summary__amount">
                <span>סכום כולל</span>
                <strong>{{ invoice.amount_display }}</strong>
              </div>
              <label class="finance-summary__status">
                <span>סטטוס תשלום</span>
                <n-select
                  v-model:value="form.payment_status"
                  :options="paymentStatusOptions"
                  size="large"
                />
              </label>
            </div>
            <div class="form-grid">
              <label>
                <span>מטבע</span>
                <n-select v-model:value="form.currency" :options="currencyOptions" size="large" />
              </label>
              <label>
                <span>מס</span>
                <n-input :value="taxDisplay" size="large" readonly />
              </label>
            </div>
          </section>

          <section class="side-card">
            <h2>
              סיווג
              <n-icon :component="FolderOutline" :size="20" />
            </h2>
            <div class="form-grid">
              <label>
                <span>קטגוריית הוצאה</span>
                <div class="field-stack">
                  <n-select v-model:value="form.expense_category" :options="categoryOptions" size="large" />
                  <n-input v-model:value="form.expense_category" size="large" placeholder="קטגוריית הוצאה חדשה" />
                </div>
              </label>
              <label>
                <span>לקוח</span>
                <n-input v-model:value="form.client_name" size="large" />
              </label>
            </div>
          </section>

          <section class="side-card">
            <h2>תאריכים</h2>
            <div class="form-grid">
              <label>
                <span>תאריך קבלה</span>
                <n-date-picker
                  v-model:value="receivedDateValue"
                  type="date"
                  size="large"
                  clearable
                />
              </label>
              <label>
                <span>תאריך הוצאה</span>
                <n-date-picker
                  v-model:value="issueDateValue"
                  type="date"
                  size="large"
                  clearable
                />
              </label>
            </div>
          </section>

          <section class="side-card">
            <h2>הערה</h2>
            <n-input
              v-model:value="form.note"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 6 }"
              placeholder="הקלד משהו..."
            />
          </section>

          <section class="side-card side-card--extracted">
            <button class="extracted-toggle" type="button" @click="showExtractedFields = !showExtractedFields">
              <span>
                נתונים שחולצו
                <small>{{ visibleExtractedFields.length }} שדות</small>
              </span>
              <n-icon :component="ChevronDownOutline" :class="{ 'is-open': showExtractedFields }" />
            </button>
            <div v-if="showExtractedFields" class="extracted-panel">
              <div class="extracted-panel__actions">
                <n-button text size="tiny" @click="showEmptyExtractedFields = !showEmptyExtractedFields">
                  {{ showEmptyExtractedFields ? "הסתר ריקים" : "הצג הכל" }}
                </n-button>
              </div>
              <div v-if="visibleExtractedFields.length" class="extracted-fields">
                <div
                  v-for="field in visibleExtractedFields"
                  :key="field.key"
                  class="extracted-field"
                  :class="{ 'extracted-field--missing': field.missing }"
                >
                  <span class="extracted-field__label">{{ field.label }}</span>
                  <span class="extracted-field__value" :dir="field.dir">{{ field.value }}</span>
                </div>
              </div>
              <div v-else class="extracted-empty">אין שדות להצגה</div>
            </div>
          </section>

          <div class="invoice-side__actions">
            <n-button @click="load(true)">בטל</n-button>
            <n-button type="primary" :loading="saving" @click="save">שמור</n-button>
          </div>
        </aside>
      </div>
      <div v-else-if="!loading" class="invoice-detail__missing">החשבונית לא נמצאה</div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NButton, NDatePicker, NIcon, NInput, NSelect, NSpin, useMessage, type SelectOption } from "naive-ui";
import {
  ChevronBackOutline,
  ChevronDownOutline,
  ChevronForwardOutline,
  CloseOutline,
  DocumentTextOutline,
  DownloadOutline,
  FolderOutline,
  MailOutline,
  OpenOutline,
  SearchOutline,
} from "@vicons/ionicons5";
import { api, type ImportedInvoice } from "../services/apiService.js";

const route = useRoute();
const router = useRouter();
const message = useMessage();

const invoice = ref<ImportedInvoice | null>(null);
const loading = ref(false);
const saving = ref(false);
const showExtractedFields = ref(false);
const showEmptyExtractedFields = ref(false);
const form = reactive({
  status: "new",
  payment_status: "paid" as string | null,
  currency: "ILS" as string | null,
  client_name: "",
  expense_category: "General and Administrative" as string | null,
  note: "",
  issue_date: null as string | null,
  payment_due_date: null as string | null,
});

const paymentStatusOptions: SelectOption[] = [
  { label: "שולם", value: "paid" },
  { label: "ממתין", value: "pending" },
  { label: "באיחור", value: "overdue" },
];
const currencyOptions: SelectOption[] = [
  { label: "₪ ILS - Israeli shekels", value: "ILS" },
  { label: "$ USD - US dollar", value: "USD" },
  { label: "€ EUR - Euro", value: "EUR" },
];
const categoryOptions: SelectOption[] = [
  { label: "General and Administrative", value: "General and Administrative" },
  { label: "חשבוניות", value: "חשבוניות" },
  { label: "קבלות", value: "קבלות" },
  { label: "ציוד", value: "ציוד" },
  { label: "תקשורת", value: "תקשורת" },
  { label: "חשמל ומים", value: "חשמל ומים" },
];

const sourceLine = computed(() =>
  invoice.value?.source_email ||
  emailFromSource(invoice.value?.source_subject) ||
  invoice.value?.source_subject ||
  "",
);
const issueDateValue = computed<number | null>({
  get: () => dateToTs(form.issue_date),
  set: (value) => { form.issue_date = tsToDate(value); },
});
const receivedDateValue = computed<number | null>({
  get: () => dateToTs(form.payment_due_date),
  set: (value) => { form.payment_due_date = tsToDate(value); },
});
const taxDisplay = computed(() => {
  const amount = invoice.value?.amount;
  if (!amount) return "—";
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: form.currency || "ILS",
    maximumFractionDigits: 2,
  }).format(amount * 0.1525423729);
});
const extractedFields = computed(() => {
  const fields = invoice.value?.fields ?? {};
  const existingKeys = new Set(Object.keys(fields));
  const rows = Object.entries(fields)
    .filter(([key]) => !key.startsWith("_"))
    .map(([key, value]) => ({
      key,
      label: extractedFieldLabel(key),
      value: formatExtractedValue(value),
      empty: isEmptyExtractedValue(value),
      missing: isMissingExtractedField(key),
      dir: shouldUseLtrValue(key, value) ? "ltr" : "rtl",
    }));

  for (const rawKey of invoice.value?.missing_required_fields ?? []) {
    const key = normalizeMissingFieldKey(rawKey);
    if (!key || existingKeys.has(key)) continue;
    rows.push({
      key,
      label: extractedFieldLabel(key),
      value: "חסר",
      empty: true,
      missing: true,
      dir: "rtl",
    });
  }

  return rows
    .sort((a, b) => fieldSortIndex(a.key) - fieldSortIndex(b.key) || a.label.localeCompare(b.label, "he"));
});
const visibleExtractedFields = computed(() =>
  showEmptyExtractedFields.value
    ? extractedFields.value
    : extractedFields.value.filter((field) => !field.empty || field.missing)
);
const probablyContractDocument = computed(() =>
  hasMissingField("invoice_number") && hasMissingField("amount")
);

watch(() => route.params.id, () => load(true));

onMounted(() => {
  load();
});

async function load(force = false) {
  const id = String(route.params.id ?? "");
  if (!id) return;
  loading.value = true;
  try {
    const row = await api.invoices.get(id, force);
    invoice.value = row;
    form.status = row.status || "new";
    form.payment_status = normalizePaymentStatus(row.payment_status);
    form.currency = row.currency || "ILS";
    form.client_name = row.client_name || clientFromFields(row) || "";
    form.expense_category = row.expense_category || "General and Administrative";
    form.note = row.note || "";
    form.issue_date = normalizeDate(row.issue_date);
    form.payment_due_date = normalizeDate(row.payment_due_date);
  } catch {
    invoice.value = null;
    message.error("שגיאה בטעינת החשבונית");
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!invoice.value) return;
  saving.value = true;
  try {
    const updated = await api.invoices.update(invoice.value.id, {
      status: form.status,
      payment_status: form.payment_status,
      currency: form.currency,
      client_name: form.client_name,
      expense_category: form.expense_category,
      issue_date: form.issue_date,
      payment_due_date: form.payment_due_date,
      note: form.note,
    });
    invoice.value = updated;
    message.success("החשבונית נשמרה");
  } catch {
    message.error("שגיאה בשמירת החשבונית");
  } finally {
    saving.value = false;
  }
}

function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    new: "חדש",
    reviewed: "נבדק",
    outgoing: "יוצא",
    archived: "ארכיון",
  };
  return labels[value] ?? value;
}

function invoiceTypeLabel(row: ImportedInvoice): string {
  const value = String(row.type || row.fields?.document_subtype || row.fields?.invoice_type || "").trim();
  const normalized = value.toLowerCase();
  if (/receipt|קבלה/.test(normalized)) return "קבלה";
  if (/order|הזמנה/.test(normalized)) return "אישור הזמנה";
  if (/payment|תשלום/.test(normalized)) return "אישור תשלום";
  return "חשבונית";
}

function isPdf(row: ImportedInvoice): boolean {
  return row.mime_type === "application/pdf" || row.file_name.toLowerCase().endsWith(".pdf");
}

function isImage(row: ImportedInvoice): boolean {
  return Boolean(row.mime_type?.startsWith("image/"));
}

function downloadInvoice() {
  if (invoice.value?.download_url) window.open(invoice.value.download_url, "_blank");
}

function openDocumentPage() {
  if (invoice.value?.document_id) window.open(`/documents/${invoice.value.document_id}`, "_blank");
}

function clientFromFields(row: ImportedInvoice): string | null {
  const keys = ["client_company", "client_name", "customer_name", "bill_to"];
  for (const key of keys) {
    const value = row.fields?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function normalizePaymentStatus(value: string | null): string {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || text === "שולם" || text === "paid") return "paid";
  if (text === "overdue" || text === "באיחור") return "overdue";
  return "pending";
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : value;
}

function dateToTs(value: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function tsToDate(value: number | null): string | null {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function emailFromSource(value: string | null | undefined): string | null {
  const text = String(value ?? "");
  const match = /<([^<>@\s]+@[^<>@\s]+)>/.exec(text) || /([^\s<>]+@[^\s<>]+)/.exec(text);
  return match?.[1] ?? null;
}

const extractedFieldLabels: Record<string, string> = {
  supplier_name: "שם הספק",
  supplier_id: "ח.פ / מזהה ספק",
  invoice_number: "מספר חשבונית",
  receipt_number: "מספר קבלה",
  document_subtype: "סוג מסמך",
  client_company: "שם הלקוח / חברה",
  client_name: "שם הלקוח",
  client_id: "ח.פ / ת.ז לקוח",
  customer_number: "מספר לקוח / מנוי",
  account_number: "מספר חשבון / חוזה",
  service_address: "כתובת שירות",
  issue_date: "תאריך הוצאה",
  billing_period: "תקופת חיוב",
  billing_period_start: "תחילת תקופת חיוב",
  billing_period_end: "סוף תקופת חיוב",
  payment_due_date: "תאריך לתשלום",
  amount: "סכום לתשלום",
  amount_before_vat: "סכום לפני מע\"מ",
  vat_amount: "סכום מע\"מ",
  currency: "מטבע",
  payment_status: "סטטוס תשלום",
  payment_method: "אמצעי תשלום",
  meter_number: "מספר מונה",
  previous_reading: "קריאה קודמת",
  current_reading: "קריאה נוכחית",
  usage_quantity: "צריכה",
  tariff_plan: "מסלול / תעריף",
  items: "פירוט חיובים",
  notes: "הערות",
};

const missingFieldAliases: Record<string, string> = {
  supplierName: "supplier_name",
  invoiceNumber: "invoice_number",
  clientName: "client_company",
  issueDate: "issue_date",
  paymentDueDate: "payment_due_date",
  totalAmount: "amount",
};

const extractedFieldOrder = [
  "supplier_name",
  "supplier_id",
  "invoice_number",
  "receipt_number",
  "document_subtype",
  "client_company",
  "client_name",
  "client_id",
  "customer_number",
  "account_number",
  "service_address",
  "issue_date",
  "billing_period",
  "billing_period_start",
  "billing_period_end",
  "payment_due_date",
  "amount",
  "amount_before_vat",
  "vat_amount",
  "currency",
  "payment_status",
  "payment_method",
  "items",
  "notes",
];

function extractedFieldLabel(key: string): string {
  const normalized = normalizeMissingFieldKey(key);
  return extractedFieldLabels[normalized] ?? normalized.replace(/_/g, " ");
}

function normalizeMissingFieldKey(key: unknown): string {
  const value = String(key ?? "").trim();
  return missingFieldAliases[value] ?? value;
}

function isMissingExtractedField(key: string): boolean {
  return hasMissingField(key);
}

function hasMissingField(key: string): boolean {
  return Boolean(invoice.value?.missing_required_fields?.some((field) => normalizeMissingFieldKey(field) === key));
}

function fieldSortIndex(key: string): number {
  const index = extractedFieldOrder.indexOf(key);
  return index >= 0 ? index : 10_000;
}

function isEmptyExtractedValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function formatExtractedValue(value: unknown): string {
  if (isEmptyExtractedValue(value)) return "חסר";
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object") {
        return Object.entries(item as Record<string, unknown>)
          .filter(([, nestedValue]) => !isEmptyExtractedValue(nestedValue))
          .map(([nestedKey, nestedValue]) => `${extractedFieldLabel(nestedKey)}: ${formatExtractedValue(nestedValue)}`)
          .join(" · ");
      }
      return String(item);
    }).filter(Boolean).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, nestedValue]) => !isEmptyExtractedValue(nestedValue))
      .map(([nestedKey, nestedValue]) => `${extractedFieldLabel(nestedKey)}: ${formatExtractedValue(nestedValue)}`)
      .join(" · ");
  }
  return String(value);
}

function shouldUseLtrValue(key: string, value: unknown): boolean {
  const text = formatExtractedValue(value);
  return /email|number|id|currency|amount|date|period|method/i.test(key) || /^[\d\s.,:$€£₪A-Za-z@/_().'-]+$/.test(text);
}
</script>

<style scoped>
.invoice-detail {
  min-height: calc(100vh - 92px);
  color: var(--text-primary);
}

.invoice-detail__top {
  display: grid;
  grid-template-columns: 44px 210px 1fr;
  align-items: start;
  gap: 18px;
  margin-bottom: 22px;
  direction: ltr;
}

.invoice-detail__close,
.invoice-preview__bottom-tools button {
  display: inline-grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.invoice-detail__close {
  width: 36px;
  height: 36px;
}

.invoice-detail__pager {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 42px;
  padding: 0 18px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
  direction: rtl;
}

.invoice-detail__title {
  text-align: right;
  direction: rtl;
}

.invoice-detail__title h1 {
  margin: 0;
  font-size: 27px;
  font-weight: 850;
}

.invoice-detail__title p {
  margin: 4px 0 10px;
  color: var(--text-secondary);
  font-size: 13px;
}

.invoice-detail__chips {
  display: flex;
  justify-content: flex-start;
  flex-direction: row-reverse;
  gap: 8px;
}

.status-chip,
.meta-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 750;
}

.status-chip {
  background: color-mix(in srgb, var(--brand-color) 13%, var(--bg-card));
  color: var(--brand-color);
}

.meta-chip {
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.invoice-detail__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 440px;
  gap: 24px;
  align-items: start;
}

.invoice-preview {
  min-height: calc(100vh - 180px);
  border-radius: 8px;
  background: #e8f0ff;
  overflow: hidden;
}

.invoice-preview__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
}

.invoice-preview__tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.invoice-preview__paper {
  width: min(760px, calc(100% - 48px));
  height: calc(100vh - 290px);
  min-height: 580px;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 1px 0 color-mix(in srgb, #000 13%, transparent);
}

.invoice-preview__paper iframe,
.invoice-preview__paper img {
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: contain;
  background: #fff;
}

.invoice-preview__empty {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-secondary);
}

.invoice-preview__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 24px 20px;
  color: var(--text-secondary);
}

.invoice-preview__bottom-tools {
  display: flex;
  align-items: center;
  gap: 18px;
  direction: ltr;
}

.invoice-preview__bottom-tools button {
  width: 26px;
  height: 26px;
}

.invoice-preview__source {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 8px 14px;
  border-radius: 999px;
  background: color-mix(in srgb, #fff 70%, transparent);
  color: #0f4fb8;
}

.invoice-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.invoice-warning {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  background: color-mix(in srgb, #f59e0b 12%, var(--bg-card));
  color: var(--text-primary);
}

.invoice-warning strong {
  font-size: 14px;
  font-weight: 850;
}

.invoice-warning span {
  color: var(--text-secondary);
  font-size: 13px;
}

.side-card {
  padding: 18px;
  border-radius: 8px;
  background: var(--bg-card);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--text-primary) 10%, transparent);
}

.side-card--main {
  background: color-mix(in srgb, var(--bg-card) 88%, #e8f0ff);
}

.side-card h2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 850;
}

.finance-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.finance-summary__amount,
.finance-summary__status {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 78px;
  padding: 14px;
  border-radius: 8px;
}

.finance-summary__amount {
  background: #1b64f2;
  color: #fff;
}

.finance-summary__status {
  border: 1px solid #65a30d;
  background: color-mix(in srgb, #65a30d 9%, var(--bg-card));
}

.finance-summary span,
.form-grid span {
  display: block;
  margin-bottom: 7px;
  color: var(--text-secondary);
  font-size: 12px;
}

.finance-summary strong {
  font-size: 24px;
  font-weight: 850;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-grid label {
  min-width: 0;
}

.field-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.invoice-side__actions {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
}

.side-card--extracted {
  padding: 0;
  overflow: hidden;
}

.extracted-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 16px 18px;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-weight: 850;
  text-align: right;
  cursor: pointer;
}

.extracted-toggle small {
  display: block;
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.extracted-toggle .n-icon {
  transition: transform 0.16s ease;
}

.extracted-toggle .n-icon.is-open {
  transform: rotate(180deg);
}

.extracted-panel {
  padding: 0 18px 18px;
}

.extracted-panel__actions {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 8px;
}

.extracted-fields {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-color);
}

.extracted-field {
  display: grid;
  grid-template-columns: 138px minmax(0, 1fr);
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
}

.extracted-field--missing {
  margin: 4px 0;
  padding: 9px 10px;
  border-bottom-color: color-mix(in srgb, #d03050 18%, var(--border-color));
  border-radius: 6px;
  background: color-mix(in srgb, #d03050 8%, var(--bg-card));
}

.extracted-field--missing .extracted-field__label,
.extracted-field--missing .extracted-field__value {
  color: #d03050;
}

.extracted-field__label {
  color: var(--text-secondary);
  font-weight: 700;
}

.extracted-field__value {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--text-primary);
}

.extracted-field__value[dir="ltr"] {
  text-align: left;
}

.extracted-empty {
  padding: 16px 0 4px;
  color: var(--text-secondary);
  text-align: center;
}

.invoice-detail__missing {
  padding: 60px;
  text-align: center;
  color: var(--text-secondary);
}

@media (max-width: 1180px) {
  .invoice-detail__body {
    grid-template-columns: 1fr;
  }

  .invoice-side {
    order: -1;
  }
}

@media (max-width: 720px) {
  .invoice-detail__top {
    grid-template-columns: 36px 1fr;
  }

  .invoice-detail__pager {
    display: none;
  }

  .invoice-detail__title h1 {
    font-size: 21px;
  }

  .form-grid,
  .finance-summary {
    grid-template-columns: 1fr;
  }

  .invoice-preview__paper {
    width: calc(100% - 24px);
    min-height: 420px;
  }

  .invoice-preview__source {
    max-width: 70%;
  }
}
</style>
