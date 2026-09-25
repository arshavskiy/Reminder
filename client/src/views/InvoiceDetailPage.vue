<template>
  <div class="invoice-detail" :dir="dir">
    <PageHeader
      :title="invoice?.supplier_name || l.invoices.fallbackTitle"
      :subtitle="sourceLine ? t('invoices.from', {source: sourceLine}) : undefined"
    >
      <template #breadcrumb>
        <router-link :to="href('/invoices')">{{ l.invoices.title }}</router-link>
        <span class="sep">/</span>
        <span>{{ invoice?.invoice_number || l.invoiceDetailMsg.details }}</span>
      </template>
      <template #actions>
        <button class="rbtn rbtn--ghost" type="button" @click="router.push('/invoices')">
          <n-icon :component="ArrowForwardOutline" class="btn-icon" />
          {{ l.invoiceDetailMsg.back }}
        </button>
        <button class="rbtn rbtn--ghost" type="button" :disabled="!invoice?.download_url" @click="downloadInvoice">
          <n-icon :component="DownloadOutline" class="btn-icon" />
          {{ l.invoiceDetailMsg.download }}
        </button>
        <button class="rbtn rbtn--ghost" type="button" :disabled="!invoice?.document_id" @click="openDocumentPage">
          <n-icon :component="OpenOutline" class="btn-icon" />
          {{ l.invoiceDetailMsg.sourceDoc }}
        </button>
      </template>
    </PageHeader>

    <div v-if="invoice" class="invoice-detail__chips">
      <span class="status-chip">{{ statusLabel(invoice.status) }}</span>
      <span class="meta-chip">{{ invoice.invoice_number || l.invoiceDetailMsg.noNumber }}</span>
      <span class="meta-chip">{{ invoiceTypeLabel(invoice) }}</span>
      <span v-if="invoice.inline_no_file" class="meta-chip">{{ l.invoicesMsg.noFile }}</span>
      <span class="meta-chip" :class="form.cash_flow === 'income' ? 'meta-chip--income' : 'meta-chip--expense'">
        {{ form.cash_flow === "income" ? l.invoiceDetailMsg.income : l.invoiceDetailMsg.expense }}
      </span>
      <StorageSyncIcons
        :in-s3="invoice.in_s3"
        :drive-synced="Boolean(invoice.drive_file_id)"
        :drive-link="invoice.drive_web_link"
        :download-url="invoice.download_url"
      />
    </div>

    <n-spin :show="loading">
      <div v-if="invoice" class="invoice-detail__body">
        <section class="invoice-preview">
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
            <iframe
              v-else-if="invoice.preview_html"
              class="invoice-preview__html"
              sandbox=""
              referrerpolicy="no-referrer"
              :srcdoc="invoice.preview_html"
              :title="l.invoiceDetailMsg.emailPreview"
            />
            <div v-else class="invoice-preview__empty">
              <n-icon :component="DocumentTextOutline" :size="48" />
              <span>{{ invoice.inline_no_file ? l.invoiceDetailMsg.savedFromEmail : l.invoiceDetailMsg.noPreview }}</span>
            </div>
          </div>
        </section>

        <aside class="invoice-side">
          <div v-if="probablyContractDocument" class="invoice-warning">
            <strong>{{ l.invoiceDetailMsg.notInvoiceTitle }}</strong>
            <span>{{ l.invoiceDetailMsg.notInvoiceBody }}</span>
          </div>

          <section class="side-card side-card--main">
            <h2>{{ l.invoiceDetailMsg.finance }}</h2>
            <div class="finance-summary">
              <div class="finance-summary__amount">
                <span>{{ l.invoiceDetailMsg.totalAmount }}</span>
                <strong>{{ invoice.currency !== 'ILS' && invoice.amount_ils !== null ? formatIls(invoice.amount_ils) : invoice.amount_display }}</strong>
                <span v-if="invoice.currency !== 'ILS'" class="finance-summary__amount-ils">
                  ({{ invoice.amount_display }})
                </span>
              </div>
              <label class="finance-summary__status">
                <span>{{ l.invoiceDetailMsg.paymentStatus }}</span>
                <n-select
                  v-model:value="form.payment_status"
                  :options="paymentStatusOptions"
                  size="large"
                />
              </label>
            </div>
            <div class="form-grid">
              <label>
                <span>{{ l.invoiceDetailMsg.currency }}</span>
                <n-select v-model:value="form.currency" :options="currencyOptions" size="large" />
              </label>
              <label>
                <span>{{ l.invoiceDetailMsg.vat }}</span>
                <n-input :value="vatDisplay" size="large" readonly />
              </label>
            </div>
          </section>

          <section class="side-card">
            <h2>
              {{ l.invoiceDetailMsg.classification }}
              <n-icon :component="FolderOutline" :size="18" />
            </h2>
            <div class="form-grid">
              <label>
                <span>{{ l.invoiceDetailMsg.cashFlowType }}</span>
                <n-select v-model:value="form.cash_flow" :options="cashFlowOptions" size="large" />
              </label>
              <label>
                <span>{{ l.invoiceDetailMsg.providerCategory }}</span>
                <n-select
                  v-model:value="form.provider_category"
                  :options="providerCategoryOptions"
                  clearable
                  filterable
                  size="large"
                  :placeholder="l.providerCategory.payment"
                />
              </label>
              <label>
                <span>{{ form.cash_flow === "income" ? l.invoiceDetailMsg.incomeCategory : l.invoiceDetailMsg.expenseCategory }}</span>
                <n-select
                    v-model:value="form.expense_category"
                    :options="categoryOptions"
                    :placeholder="form.cash_flow === 'income' ? l.invoiceDetailMsg.pickIncomeCategory : l.invoiceDetailMsg.pickExpenseCategory"
                    clearable
                    filterable
                    size="large"
                    tag
                />
              </label>
              <label v-if="!isReceiptDocument">
                <span>{{ l.invoiceDetailMsg.client }}</span>
                <n-input v-model:value="form.client_name" size="large" />
              </label>
            </div>
          </section>

          <section class="side-card">
            <h2>{{ l.invoiceDetailMsg.dates }}</h2>
            <div class="form-grid">
              <label>
                <span>{{ l.invoiceDetailMsg.receivedDate }}</span>
                <n-date-picker
                  v-model:value="receivedDateValue"
                  type="date"
                  size="large"
                  disabled
                />
              </label>
              <label>
                <span>{{ form.cash_flow === "income" ? l.invoiceDetailMsg.issuedDate : l.invoiceDetailMsg.expenseDate }}</span>
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
            <h2>{{ l.invoiceDetailMsg.note }}</h2>
            <n-input
              v-model:value="form.note"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 6 }"
              :placeholder="l.invoiceDetailMsg.notePlaceholder"
            />
          </section>

          <section class="side-card side-card--extracted">
            <button class="extracted-toggle" type="button" @click="showExtractedFields = !showExtractedFields">
              <span>
                {{ l.invoiceDetailMsg.extracted }}
                <small>{{ t("invoiceDetailMsg.fieldCount", {count: visibleExtractedFields.length}) }}</small>
              </span>
              <n-icon :component="ChevronDownOutline" :class="{ 'is-open': showExtractedFields }" />
            </button>
            <div v-if="showExtractedFields" class="extracted-panel">
              <div class="extracted-panel__actions">
                <n-button text size="tiny" @click="showEmptyExtractedFields = !showEmptyExtractedFields">
                  {{ showEmptyExtractedFields ? l.invoiceDetailMsg.hideEmpty : l.invoiceDetailMsg.showAll }}
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
              <div v-else class="extracted-empty">{{ l.invoiceDetailMsg.noFields }}</div>
            </div>
          </section>

          <div class="invoice-side__actions">
            <n-button @click="load(true)">{{ l.invoiceDetailMsg.discard }}</n-button>
            <n-button type="primary" :loading="saving" @click="save">{{ l.invoiceDetailMsg.save }}</n-button>
          </div>
        </aside>
      </div>
      <div v-else-if="!loading" class="invoice-detail__missing">{{ l.invoiceDetailMsg.notFound }}</div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NButton, NDatePicker, NIcon, NInput, NSelect, NSpin, useMessage, type SelectOption } from "naive-ui";
import {
  ArrowForwardOutline,
  ChevronDownOutline,
  DocumentTextOutline,
  DownloadOutline,
  FolderOutline,
  OpenOutline,
} from "@vicons/ionicons5";
import { api, type ImportedInvoice } from "../services/apiService.js";
import PageHeader from "../components/PageHeader.vue";
import {useI18n} from "../composables/useI18n.js";
import StorageSyncIcons from "../components/StorageSyncIcons.vue";

const route = useRoute();
const {l, t, href, dir} = useI18n();
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
  cash_flow: "expense" as "income" | "expense",
  client_name: "",
  expense_category: "כללי וניהול" as string | null,
  provider_category: null as ImportedInvoice["provider_category"] | null,
  note: "",
  issue_date: null as string | null,
  payment_due_date: null as string | null,
});

const paymentStatusOptions = computed<SelectOption[]>(() => [
  { label: l.value.invoiceDetailMsg.paid, value: "paid" },
  { label: l.value.invoiceDetailMsg.pending, value: "pending" },
  { label: l.value.invoiceDetailMsg.overdue, value: "overdue" },
]);
const cashFlowOptions = computed<SelectOption[]>(() => [
  { label: l.value.invoiceDetailMsg.expense, value: "expense" },
  { label: l.value.invoiceDetailMsg.income, value: "income" },
]);
const currencyOptions: SelectOption[] = [
  { label: "₪ ILS - Israeli shekels", value: "ILS" },
  { label: "$ USD - US dollar", value: "USD" },
  { label: "€ EUR - Euro", value: "EUR" },
];
// Values are the stored (Hebrew) expense category names.
const categoryOptions = computed<SelectOption[]>(() => [
  { label: l.value.invoiceDetailMsg.catGeneral, value: "כללי וניהול" },
  { label: l.value.invoiceDetailMsg.catInvoices, value: "חשבוניות" },
  { label: l.value.invoiceDetailMsg.catReceipts, value: "קבלות" },
  { label: l.value.invoiceDetailMsg.catEquipment, value: "ציוד" },
  { label: l.value.invoiceDetailMsg.catTelecom, value: "תקשורת" },
  { label: l.value.invoiceDetailMsg.catUtilities, value: "חשמל ומים" },
]);
const providerCategoryOptions = computed<SelectOption[]>(() => ([
  "household",
  "transport",
  "parking",
  "fuel",
  "tv",
  "marketplace",
  "food",
  "payment",
  "government",
  "insurance",
  "finance",
  "travel",
  "healthcare",
  "education",
  "retail",
  "electronics",
  "nonprofit",
  "digital",
  "development",
  "general",
] as const).map((value) => ({ label: l.value.providerCategory[value], value })));

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
  get: () => dateToTs(normalizeDate(invoice.value?.import_date ?? null)),
  set: () => {},
});
const vatDisplay = computed(() => {
  const amount = invoice.value?.vat_amount;
  if (amount == null) return "—";
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: form.currency || "ILS",
    maximumFractionDigits: 2,
  }).format(amount);
});
const extractedFields = computed(() => {
  const fields = invoice.value?.fields ?? {};
  const existingKeys = new Set(Object.keys(fields));
  const rows = Object.entries(fields)
      .filter(([key]) => !(isReceiptDocument.value && isClientFieldKey(key)))
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
    if (isReceiptDocument.value && isClientFieldKey(key)) continue;
    if (!key || existingKeys.has(key)) continue;
    rows.push({
      key,
      label: extractedFieldLabel(key),
      value: l.value.invoiceDetailMsg.missing,
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
const isReceiptDocument = computed(() =>
    invoice.value ? isReceiptRow(invoice.value) : false
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
    form.cash_flow = row.cash_flow === "income" ? "income" : "expense";
    form.client_name = isReceiptRow(row) ? "" : row.client_name || clientFromFields(row) || "";
    form.expense_category = normalizeExpenseCategory(row.expense_category);
    form.provider_category = row.provider_category ?? null;
    form.note = row.note || "";
    form.issue_date = normalizeDate(row.issue_date);
    form.payment_due_date = normalizeDate(row.payment_due_date);
  } catch {
    invoice.value = null;
    message.error(l.value.invoiceDetailMsg.loadError);
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
      cash_flow: form.cash_flow,
      client_name: isReceiptDocument.value ? null : form.client_name,
      expense_category: form.expense_category,
      provider_category: form.provider_category,
      issue_date: form.issue_date,
      payment_due_date: form.payment_due_date,
      note: form.note,
    });
    invoice.value = updated;
    message.success(l.value.invoiceDetailMsg.saved);
  } catch {
    message.error(l.value.invoiceDetailMsg.saveError);
  } finally {
    saving.value = false;
  }
}

function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    new: l.value.invoiceDetailMsg.statusNew,
    reviewed: l.value.invoiceDetailMsg.statusReviewed,
    outgoing: l.value.invoiceDetailMsg.statusOutgoing,
    archived: l.value.invoiceDetailMsg.statusArchived,
  };
  return labels[value] ?? value;
}

function formatIls(amount: number): string {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(amount);
}

function invoiceTypeLabel(row: ImportedInvoice): string {
  const value = String(row.type || row.fields?.document_subtype || row.fields?.invoice_type || "").trim();
  const normalized = value.toLowerCase();
  if (/receipt|קבלה/.test(normalized)) return l.value.invoices.typeReceipt;
  if (/order|הזמנה/.test(normalized)) return l.value.invoiceDetailMsg.typeOrder;
  if (/payment|תשלום/.test(normalized)) return l.value.invoiceDetailMsg.typePayment;
  return l.value.invoiceDetailMsg.typeInvoice;
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
  if (isReceiptRow(row)) return null;
  const keys = ["client_company", "client_name", "customer_name", "bill_to"];
  for (const key of keys) {
    const value = row.fields?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function isReceiptRow(row: ImportedInvoice): boolean {
  return row.document_category === "receipt" || /receipt|קבלה/i.test(String(row.type ?? ""));
}

function normalizeExpenseCategory(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text || text === "General and Administrative") return "כללי וניהול";
  return text;
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

function isClientFieldKey(key: string): boolean {
  const normalized = normalizeMissingFieldKey(key);
  return normalized === "client_company" ||
      normalized === "client_name" ||
      normalized === "customer_name" ||
      normalized === "bill_to";
}

function extractedFieldLabel(key: string): string {
  const normalized = normalizeMissingFieldKey(key);
  const labels: Record<string, string> = l.value.invoiceField;
  return labels[normalized] ?? normalized.replace(/_/g, " ");
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
  if (isEmptyExtractedValue(value)) return l.value.invoiceDetailMsg.missing;
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--text-primary);
}

.invoice-detail__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: -8px;
  margin-bottom: 8px;
}

.status-chip,
.meta-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.status-chip {
  background: color-mix(in srgb, var(--brand-color) 13%, var(--bg-card));
  color: var(--brand-color);
}

.meta-chip {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.meta-chip--income {
  color: var(--brand-color);
  border-color: color-mix(in srgb, var(--brand-color) 45%, var(--border-color));
}

.meta-chip--expense {
  color: var(--text-primary);
}

.rbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.rbtn:hover:not(.rbtn--primary):not(:disabled) { border-color: var(--brand-color); color: var(--brand-color); }
.rbtn--primary:hover:not(:disabled) {
  background: var(--brand-color-hover);
  border-color: var(--brand-color-hover);
  color: var(--text-inverse, #fff);
}
.rbtn:disabled { opacity: 0.55; cursor: not-allowed; }
.rbtn--ghost { background: transparent; }
.btn-icon { flex: 0 0 auto; }

.invoice-detail__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 400px);
  gap: 20px;
  align-items: start;
}

.invoice-preview {
  min-height: 520px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-elevated);
  overflow: hidden;
}

.invoice-preview__paper {
  width: 100%;
  height: min(78vh, 860px);
  min-height: 520px;
  background: var(--bg-card);
}

.invoice-preview__paper iframe,
.invoice-preview__paper img {
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: contain;
  background: var(--bg-card);
}

.invoice-preview__html {
  background: #fff;
}

.invoice-preview__empty {
  display: grid;
  place-items: center;
  gap: 8px;
  height: 100%;
  color: var(--text-secondary);
}

.invoice-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.invoice-warning {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, #f59e0b 55%, var(--border-color));
  border-radius: 12px;
  background: color-mix(in srgb, #f59e0b 12%, var(--bg-card));
}

.invoice-warning strong { font-size: 14px; font-weight: 800; }
.invoice-warning span { color: var(--text-secondary); font-size: 13px; }

.side-card {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.side-card--main {
  background: color-mix(in srgb, var(--brand-color) 6%, var(--bg-card));
}

.side-card h2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 800;
}

.finance-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

.finance-summary__amount,
.finance-summary__status {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 74px;
  padding: 12px;
  border-radius: 10px;
}

.finance-summary__amount {
  background: var(--brand-color);
  color: #fff;
}

.finance-summary__status {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
}

.finance-summary span,
.form-grid span {
  display: block;
  margin-bottom: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

.finance-summary__amount span { color: rgba(255,255,255,0.85); }
.finance-summary__amount-ils {
  display: block !important;
  margin-top: 4px;
  font-size: 13px;
  color: rgba(255,255,255,0.75) !important;
}
.finance-summary strong { font-size: 22px; font-weight: 800; }

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-grid label { min-width: 0; }

.invoice-side__actions {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
  position: sticky;
  bottom: 12px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
  backdrop-filter: blur(8px);
}

.side-card--extracted { padding: 0; overflow: hidden; }

.extracted-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 16px;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-weight: 800;
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
.extracted-toggle .n-icon { transition: transform 0.16s ease; }
.extracted-toggle .n-icon.is-open { transform: rotate(180deg); }

.extracted-panel { padding: 0 16px 16px; }
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
  grid-template-columns: 130px minmax(0, 1fr);
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
}

.extracted-field--missing {
  margin: 4px 0;
  padding: 9px 10px;
  border-radius: 8px;
  border-bottom-color: transparent;
  background: color-mix(in srgb, #d03050 8%, var(--bg-card));
}
.extracted-field--missing .extracted-field__label,
.extracted-field--missing .extracted-field__value { color: #d03050; }

.extracted-field__label { color: var(--text-secondary); font-weight: 700; }
.extracted-field__value {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--text-primary);
}
.extracted-field__value[dir='ltr'] { text-align: left; }
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

@media (max-width: 1100px) {
  .invoice-detail__body { grid-template-columns: 1fr; }
  .invoice-side { order: -1; }
}

@media (max-width: 720px) {
  .form-grid,
  .finance-summary { grid-template-columns: 1fr; }
  .invoice-preview__paper { min-height: 380px; height: 55vh; }
}
</style>

