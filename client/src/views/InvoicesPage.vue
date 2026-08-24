<template>
  <div class="page2 invoices-page" dir="rtl">
    <PageHeader
      :count="total"
      title="חשבוניות"
      subtitle="חשבוניות שיובאו מ-Gmail — צפייה, סינון וניהול"
    >
      <template #hero>
        <button
          v-if="selectedInvoiceCount > 0"
          :class="{ 'rbtn--loading': deletingSelected }"
          :disabled="loading || deletingSelected"
          class="rbtn rbtn--danger"
          type="button"
          @click="confirmDeleteSelected"
        >
          <n-icon :component="TrashOutline" class="btn-icon" />
          מחק {{ selectedInvoiceCount }}
        </button>
        <button
          :class="{ 'rbtn--loading': exporting }"
          :disabled="loading || total === 0 || exporting"
          class="rbtn rbtn--ghost"
          type="button"
          @click="exportInvoicesToExcel"
        >
          <n-icon :component="DownloadOutline" class="btn-icon" />
          ייצוא לאקסל
        </button>
        <button
          :disabled="loading"
          class="rbtn rbtn--ghost"
          type="button"
          @click="load(true)"
        >
          <n-icon :class="{ 'refresh-icon--spin': loading }" :component="RefreshOutline" class="btn-icon" />
          רענן
        </button>
        <button
          :class="{ 'rbtn--loading': importingFromGmail }"
          :disabled="loading || importingFromGmail"
          class="rbtn rbtn--primary"
          type="button"
          @click="handleGmailImportButton"
        >
          <GmailLogo :size="16" class="btn-icon" />
          {{ gmailImportButtonLabel }}
        </button>
        <button
            v-if="driveAllowed"
            :class="{ 'rbtn--loading': exportingToDrive }"
            :disabled="exportingToDrive"
            class="rbtn rbtn--ghost"
            type="button"
            @click="handleDriveExport"
        >
          <n-icon :component="CloudUploadOutline" class="btn-icon"/>
          ייצוא ל-Drive
        </button>
        <button class="rbtn rbtn--ghost" type="button" @click="showMonthlyReport = true">
          <n-icon :component="DocumentTextOutline" class="btn-icon"/>
          דוח חודשי
        </button>
      </template>
    </PageHeader>

    <InvoiceSectionNav />

    <div class="filterbar filterbar--compact">
      <button
        v-for="option in statusStrip"
        :key="option.value"
        type="button"
        class="pill pill--compact"
        :class="{ 'pill--active': (filters.status ?? '') === option.value }"
        @click="setStatus(option.value)"
      >
        {{ option.label }}
        <span class="pill__badge">{{ option.count }}</span>
      </button>
      <div class="toolbar__view-toggle">
        <n-tooltip placement="top">
          <template #trigger>
            <button
              :class="{ 'rbtn--ghost-active': viewMode === 'cards' }"
              :aria-label="'כרטיסים'"
              class="rbtn rbtn--ghost rbtn--icon"
              type="button"
              @click="viewMode = 'cards'"
            >
              <n-icon :component="GridOutline" :size="16" class="btn-icon"/>
            </button>
          </template>
          כרטיסים
        </n-tooltip>
        <n-tooltip placement="top">
          <template #trigger>
            <button
              :class="{ 'rbtn--ghost-active': viewMode === 'table' }"
              :aria-label="'טבלה'"
              class="rbtn rbtn--ghost rbtn--icon"
              type="button"
              @click="viewMode = 'table'"
            >
              <n-icon :component="ListOutline" :size="16" class="btn-icon"/>
            </button>
          </template>
          טבלה
        </n-tooltip>
      </div>
    </div>

    <div class="toolbar">
      <n-input
        v-model:value="filters.q"
        clearable
        placeholder="חיפוש ספק, מספר, כתובת או קובץ..."
        class="toolbar__search"
        @keydown.enter="load(true)"
      />
      <n-select
        v-model:value="filters.type"
        :options="typeOptions"
        clearable
        filterable
        placeholder="סוג מסמך"
        class="toolbar__type"
        @update:value="load(true)"
      />
      <n-select
        v-model:value="filters.category"
        :options="categoryOptions"
        clearable
        filterable
        placeholder="קטגוריה"
        class="toolbar__type"
        @update:value="load(true)"
      />
      <n-select
        v-model:value="filters.suppliers"
        :options="supplierOptions"
        clearable
        filterable
        multiple
        max-tag-count="responsive"
        placeholder="שם הספק"
        class="toolbar__supplier"
        @update:value="load(true)"
      />
      <button
        v-if="suppliers.length >= 2"
        class="rbtn rbtn--ghost"
        type="button"
        @click="openVendorMergeModal"
      >
        <n-icon :component="BriefcaseOutline" class="btn-icon" />
        מזג ספקים
      </button>
      <n-date-picker
        v-model:value="dateRange"
        type="daterange"
        clearable
        class="toolbar__dates"
        @update:value="load(true)"
      />
    </div>

    <GmailImportJobStatus
      v-if="visibleGmailImportJob"
      :job="visibleGmailImportJob"
      :dismissible="!importingFromGmail"
      @dismiss="lastGmailImportJob = null"
    />

    <n-spin :show="loading">
      <div v-if="!rows.length && !loading" class="empty">
        <n-icon :component="DocumentTextOutline" :size="48" class="empty__icon" />
        <p>לא נמצאו חשבוניות מיובאות</p>
        <button
          :class="{ 'rbtn--loading': importingFromGmail }"
          :disabled="importingFromGmail"
          class="rbtn rbtn--primary mt-3"
          type="button"
          @click="handleGmailImportButton"
        >
          <GmailLogo :size="16" class="btn-icon" />
          {{ gmailImportButtonLabel }}
        </button>
      </div>

      <div v-else-if="rows.length && viewMode === 'cards'" class="invoice-grid">
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
              <span>קטגוריה</span>
              <span class="invoice-category-chip" :title="row.provider_label || undefined">{{ invoiceProviderCategoryLabel(row) }}</span>
            </div>
            <div class="invoice-card__line invoice-card__line--muted">
              <span>{{ row.invoice_number || "ללא מספר" }}</span>
              <span>{{ row.billing_period || "" }}</span>
            </div>
          </div>
        </article>
      </div>

      <div v-else-if="rows.length && viewMode === 'table'" class="invoice-table-wrap">
        <table class="invoice-table">
          <colgroup>
            <col class="invoice-table__col invoice-table__col--select" />
            <col class="invoice-table__col invoice-table__col--supplier" />
            <col class="invoice-table__col invoice-table__col--status" />
            <col class="invoice-table__col invoice-table__col--date" />
            <col class="invoice-table__col invoice-table__col--client" />
            <col class="invoice-table__col invoice-table__col--category" />
            <col class="invoice-table__col invoice-table__col--type" />
            <col class="invoice-table__col invoice-table__col--amount" />
            <col class="invoice-table__col invoice-table__col--actions" />
          </colgroup>
          <thead>
            <tr>
              <th class="invoice-col invoice-col--select" @click.stop>
                <n-checkbox
                  :checked="allVisibleSelected"
                  :indeterminate="someVisibleSelected && !allVisibleSelected"
                  aria-label="בחר את כל החשבוניות בעמוד"
                  @update:checked="toggleSelectVisible"
                />
              </th>
              <th class="invoice-col invoice-col--supplier">
                <button class="invoice-sort-button" type="button" :aria-label="sortAriaLabel('supplier')" @click="setSort('supplier')">
                  <span>ספק</span>
                  <n-icon :component="sortIcon('supplier')" :size="14" />
                </button>
              </th>
              <th class="invoice-col invoice-col--status">
                <button class="invoice-sort-button" type="button" :aria-label="sortAriaLabel('status')" @click="setSort('status')">
                  <span>סטטוס</span>
                  <n-icon :component="sortIcon('status')" :size="14" />
                </button>
              </th>
              <th class="invoice-col invoice-col--date">
                <button class="invoice-sort-button" type="button" :aria-label="sortAriaLabel('date')" @click="setSort('date')">
                  <span>תאריך</span>
                  <n-icon :component="sortIcon('date')" :size="14" />
                </button>
              </th>
              <th class="invoice-col invoice-col--client">
                <button class="invoice-sort-button" type="button" :aria-label="sortAriaLabel('client')" @click="setSort('client')">
                  <span>לקוח</span>
                  <n-icon :component="sortIcon('client')" :size="14" />
                </button>
              </th>
              <th class="invoice-col invoice-col--category">
                <button class="invoice-sort-button" type="button" :aria-label="sortAriaLabel('category')" @click="setSort('category')">
                  <span>קטגוריה</span>
                  <n-icon :component="sortIcon('category')" :size="14" />
                </button>
              </th>
              <th class="invoice-col invoice-col--type">
                <button class="invoice-sort-button" type="button" :aria-label="sortAriaLabel('type')" @click="setSort('type')">
                  <span>סוג</span>
                  <n-icon :component="sortIcon('type')" :size="14" />
                </button>
              </th>
              <th class="invoice-col invoice-col--amount">
                <button class="invoice-sort-button invoice-sort-button--amount" type="button" :aria-label="sortAriaLabel('amount')" @click="setSort('amount')">
                  <span>סכום</span>
                  <n-icon :component="sortIcon('amount')" :size="14" />
                </button>
              </th>
              <th class="invoice-col invoice-col--actions">פעולות</th>
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
              <td class="invoice-col invoice-col--select" @click.stop>
                <n-checkbox
                  :checked="selectedInvoiceIds.has(row.id)"
                  :aria-label="`בחר חשבונית של ${row.supplier_name}`"
                  @update:checked="(checked) => toggleSelectInvoice(row.id, checked)"
                />
              </td>
              <td class="cell-strong invoice-col invoice-col--supplier">
                <span class="invoice-cell-truncate" dir="auto" :title="row.supplier_name">{{ row.supplier_name }}</span>
              </td>
              <td class="invoice-col invoice-col--status" @click.stop>
                <n-select
                  :value="row.status"
                  :options="invoiceStatusOptions"
                  size="small"
                  class="invoice-status-select"
                  @update:value="(value) => updateInvoiceStatus(row, String(value))"
                />
              </td>
              <td class="invoice-col invoice-col--date">{{ formatDate(row.issue_date) }}</td>
              <td class="invoice-col invoice-col--client">
                <span class="invoice-cell-truncate" dir="auto" :title="clientLabel(row)">{{ clientLabel(row) }}</span>
              </td>
              <td class="invoice-col invoice-col--category">
                <n-select
                  :value="row.provider_category"
                  :options="providerCategoryOptions"
                  clearable
                  filterable
                  size="small"
                  class="invoice-category-select"
                  placeholder="לא מסווג"
                  @click.stop
                  @update:value="(value) => updateInvoiceProviderCategory(row, value)"
                />
              </td>
              <td class="invoice-col invoice-col--type">{{ invoiceTypeLabel(row) }}</td>
              <td class="cell-amount invoice-col invoice-col--amount" dir="ltr">{{ row.amount_display }}</td>
              <td class="cell-actions invoice-col invoice-col--actions" @click.stop>
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

      <div v-if="total > pageSize" class="invoice-pagination">
        <n-pagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :item-count="total"
          :page-sizes="[10, 20, 50, 100]"
          show-size-picker
          @update:page="() => load(false)"
          @update:page-size="() => load(true)"
        />
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

    <n-modal
      v-model:show="vendorMergeModal.show"
      preset="card"
      title="מיזוג ספקים"
      class="invoice-vendor-merge-modal"
      :style="{ width: '560px', maxWidth: 'calc(100vw - 32px)' }"
    >
      <div class="invoice-business-form" dir="rtl">
        <label class="invoice-form-label">
          שמות ספקים למיזוג
          <n-select
            v-model:value="vendorMergeModal.sourceNames"
            :options="supplierOptions"
            clearable
            filterable
            multiple
            max-tag-count="responsive"
            placeholder="בחר ספקים"
          />
        </label>
        <label class="invoice-form-label">
          שם ספק מאוחד
          <n-select
            v-model:value="vendorMergeModal.canonicalName"
            :options="supplierOptions"
            clearable
            filterable
            tag
            placeholder="לדוגמה: גולן טלקום בע&quot;מ"
          />
        </label>
        <p class="invoice-form-hint">
          כל החשבוניות של הספקים שנבחרו יישמרו תחת שם הספק המאוחד.
        </p>
        <div class="invoice-business-form__actions">
          <n-button @click="vendorMergeModal.show = false">ביטול</n-button>
          <n-button
            type="primary"
            :loading="vendorMergeModal.saving"
            :disabled="vendorMergeModal.sourceNames.length < 2 || !String(vendorMergeModal.canonicalName ?? '').trim()"
            @click="saveVendorMerge"
          >
            מזג ושמור
          </n-button>
        </div>
      </div>
    </n-modal>
    <MonthlyReportModal v-model:show="showMonthlyReport"/>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch, type Component } from "vue";
import { useRouter } from "vue-router";
import { NButton, NCheckbox, NDatePicker, NDropdown, NIcon, NInput, NModal, NPagination, NSelect, NSpin, NTooltip, useMessage, type SelectOption } from "naive-ui";
import {
  ArchiveOutline,
  ArrowDownOutline,
  ArrowUpOutline,
  BriefcaseOutline,
  CloudUploadOutline,
  DocumentTextOutline,
  DownloadOutline,
  EllipsisVerticalOutline,
  EyeOutline,
  GridOutline,
  ListOutline,
  PricetagOutline,
  RefreshOutline,
  SwapVerticalOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import PageHeader from "../components/PageHeader.vue";
import InvoiceSectionNav from "../components/InvoiceSectionNav.vue";
import GmailLogo from "../components/GmailLogo.vue";
import MonthlyReportModal from "../components/MonthlyReportModal.vue";
import GmailImportJobStatus from "../components/GmailImportJobStatus.vue";
import { api, type GmailImportJob, type ImportedInvoice } from "../services/apiService.js";
import type { DocTemplate } from "../shared/types.js";
import {useAuthStore} from "../stores/auth.js";
import {planAllowsGoogleDrive, resolveUserPlan} from "../shared/pricingPlans.js";
import {useConfirm} from "../composables/useConfirm.js";

const router = useRouter();
const message = useMessage();
const {confirm} = useConfirm();
const authStore = useAuthStore();
const driveAllowed = computed(() => planAllowsGoogleDrive(resolveUserPlan(authStore.user)));

const rows = ref<ImportedInvoice[]>([]);
const total = ref(0);
const totalAll = ref(0);
const visibleLimit = ref<number | null>(null);
const loading = ref(false);
const exporting = ref(false);
const deletingSelected = ref(false);
const showMonthlyReport = ref(false);
const exportingToDrive = ref(false);
const importingFromGmail = ref(false);
const activeGmailImportJob = ref<GmailImportJob | null>(null);
const lastGmailImportJob = ref<GmailImportJob | null>(null);
const gmailConnected = ref<boolean | null>(null);
const viewMode = ref<"cards" | "table">("table");
const selectedInvoiceIds = ref(new Set<string>());
const dateRange = ref<[number, number] | null>(null);
const page = ref(1);
const pageSize = ref(20);
type InvoiceSortKey = "supplier" | "status" | "date" | "client" | "category" | "type" | "amount";
const sortBy = ref<InvoiceSortKey>("date");
const sortDir = ref<"asc" | "desc">("desc");
const counts = ref<Record<string, number>>({});
const types = ref<string[]>([]);
const categories = ref<string[]>([]);
const suppliers = ref<string[]>([]);
const filters = reactive({
  q: "",
  status: null as string | null,
  type: null as string | null,
  category: null as string | null,
  suppliers: [] as string[],
});
const businessModal = reactive({
  show: false,
  row: null as ImportedInvoice | null,
  value: "",
});
const vendorMergeModal = reactive({
  show: false,
  sourceNames: [] as string[],
  canonicalName: "" as string | null,
  saving: false,
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
const categoryOptions = computed<SelectOption[]>(() => categories.value.map((value) => ({
  label: providerCategoryLabel(value),
  value,
})));
const providerCategoryOptions = computed<SelectOption[]>(() => PROVIDER_CATEGORIES.map((value) => ({
  label: providerCategoryLabel(value),
  value,
})));
const supplierOptions = computed<SelectOption[]>(() => [
  {label: "ספק לא מזוהה", value: "__unidentified__"},
  ...suppliers.value.map((value) => ({label: value, value})),
]);
const gmailImportButtonLabel = computed(() => gmailConnected.value === false ? "חבר Gmail" : "ייבא הכל");
const visibleGmailImportJob = computed(() => activeGmailImportJob.value ?? lastGmailImportJob.value);
const selectedInvoiceCount = computed(() => selectedInvoiceIds.value.size);
const visibleRowIds = computed(() => rows.value.map((row) => row.id));
const someVisibleSelected = computed(() => visibleRowIds.value.some((id) => selectedInvoiceIds.value.has(id)));
const allVisibleSelected = computed(() => (
  visibleRowIds.value.length > 0 && visibleRowIds.value.every((id) => selectedInvoiceIds.value.has(id))
));
const statusStrip = computed(() => [
  { label: "הכל", value: "", count: totalAll.value },
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
  refreshGmailStatus();
});

async function refreshGmailStatus() {
  try {
    const status = await api.gmail.status();
    gmailConnected.value = status.connected;
  } catch {
    gmailConnected.value = false;
  }
}

async function load(force = false) {
  if (force) page.value = 1;
  loading.value = true;
  try {
    const [dateFrom, dateTo] = dateRange.value ?? [];
    const result = await api.invoices.list({
      q: filters.q,
      status: filters.status ?? undefined,
      type: filters.type ?? undefined,
      category: filters.category ?? undefined,
      supplier: supplierFilterParam(),
      sortBy: sortBy.value,
      sortDir: sortDir.value,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString().slice(0, 10) : undefined,
      dateTo: dateTo ? new Date(dateTo).toISOString().slice(0, 10) : undefined,
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
    }, force);
    rows.value = result.rows;
    total.value = result.total;
    totalAll.value = result.totalAll;
    visibleLimit.value = result.visibleLimit;
    counts.value = result.counts;
    types.value = result.types;
    categories.value = result.categories;
    suppliers.value = result.suppliers;
    pruneSelectedInvoices();
  } catch {
    message.error("שגיאה בטעינת החשבוניות");
  } finally {
    loading.value = false;
  }
}

function toggleSelectInvoice(id: string, checked: boolean) {
  const next = new Set(selectedInvoiceIds.value);
  if (checked) {
    next.add(id);
  } else {
    next.delete(id);
  }
  selectedInvoiceIds.value = next;
}

function toggleSelectVisible(checked: boolean) {
  const next = new Set(selectedInvoiceIds.value);
  for (const id of visibleRowIds.value) {
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
  }
  selectedInvoiceIds.value = next;
}

function pruneSelectedInvoices() {
  if (selectedInvoiceIds.value.size === 0) return;
  const visible = new Set(rows.value.map((row) => row.id));
  selectedInvoiceIds.value = new Set([...selectedInvoiceIds.value].filter((id) => visible.has(id)));
}

function confirmDeleteSelected() {
  const ids = [...selectedInvoiceIds.value];
  if (!ids.length) return;
  confirm({
    title: "מחיקת חשבוניות",
    content: `למחוק ${ids.length} חשבוניות שנבחרו? הפעולה תמחק גם את המסמכים המקושרים.`,
    confirmText: "מחק",
    type: "warning",
    onConfirm: () => deleteSelectedInvoices(ids),
  });
}

async function deleteSelectedInvoices(ids: string[]) {
  deletingSelected.value = true;
  try {
    const result = await api.invoices.deleteSelected({ ids });
    selectedInvoiceIds.value = new Set();
    message.success(`נמחקו ${result.deleted} חשבוניות`);
    await load(true);
  } catch {
    message.error("שגיאה במחיקת החשבוניות");
  } finally {
    deletingSelected.value = false;
  }
}

function setStatus(value: string) {
  filters.status = value || null;
  load(true);
}

function setSort(key: InvoiceSortKey) {
  if (sortBy.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortBy.value = key;
    sortDir.value = key === "date" || key === "amount" ? "desc" : "asc";
  }
  load(true);
}

function sortIcon(key: InvoiceSortKey): Component {
  if (sortBy.value !== key) return SwapVerticalOutline;
  return sortDir.value === "asc" ? ArrowUpOutline : ArrowDownOutline;
}

function sortAriaLabel(key: InvoiceSortKey): string {
  const labels: Record<InvoiceSortKey, string> = {
    supplier: "ספק",
    status: "סטטוס",
    date: "תאריך",
    client: "לקוח",
    category: "קטגוריה",
    type: "סוג",
    amount: "סכום",
  };
  const nextDirection = sortBy.value === key && sortDir.value === "asc" ? "יורד" : "עולה";
  return `מיין לפי ${labels[key]} בסדר ${nextDirection}`;
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

function isoDate(value: string | null): string {
  if (!value) return "";
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : value;
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

function invoiceProviderCategoryLabel(row: ImportedInvoice): string {
  return row.provider_category ? providerCategoryLabel(row.provider_category) : "לא מסווג";
}

const PROVIDER_CATEGORIES: Array<NonNullable<ImportedInvoice["provider_category"]>> = [
  "electricity",
  "telecom",
  "water",
  "transport",
  "parking",
  "fuel",
  "gas",
  "tv",
  "marketplace",
  "food",
  "payment",
  "government",
  "municipality",
  "insurance",
  "finance",
  "travel",
  "healthcare",
  "education",
  "retail",
  "nonprofit",
  "digital",
  "development",
  "general",
];

function providerCategoryLabel(category: string | null): string {
  const labels: Record<string, string> = {
    electricity: "חשמל",
    telecom: "תקשורת",
    water: "מים",
    transport: "תחבורה",
    parking: "חניה",
    fuel: "דלק",
    gas: "גז",
    tv: "טלוויזיה וסטרימינג",
    marketplace: "קניות",
    food: "מזון",
    payment: "תשלומים וחשבוניות",
    government: "ממשלה",
    municipality: "עירייה",
    insurance: "ביטוח",
    finance: "פיננסים",
    travel: "תיירות",
    healthcare: "בריאות",
    education: "לימודים",
    retail: "קמעונאות",
    nonprofit: "עמותות",
    digital: "דיגיטל",
    development: "פיתוח",
    general: "כללי",
  };
  return labels[category] ?? category;
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

async function exportInvoicesToExcel() {
  exporting.value = true;
  try {
    const [dateFrom, dateTo] = dateRange.value ?? [];
    const result = await api.invoices.list({
      q: filters.q,
      status: filters.status ?? undefined,
      type: filters.type ?? undefined,
      category: filters.category ?? undefined,
      supplier: supplierFilterParam(),
      sortBy: sortBy.value,
      sortDir: sortDir.value,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString().slice(0, 10) : undefined,
      dateTo: dateTo ? new Date(dateTo).toISOString().slice(0, 10) : undefined,
      limit: Math.max(total.value, 1),
      offset: 0,
    }, true);
    const { utils, writeFile } = await import("xlsx");
    const data = result.rows.map((row) => ({
      "ספק": row.supplier_name,
      "סטטוס": statusLabel(row.status),
      "תאריך חשבונית": isoDate(row.issue_date),
      "תאריך לתשלום": isoDate(row.payment_due_date),
      "לקוח": clientLabel(row),
      "סוג": invoiceTypeLabel(row),
      "סכום": row.amount ?? "",
      "מטבע": row.currency,
      "מספר חשבונית": row.invoice_number ?? "",
      "מספר לקוח": row.customer_number ?? "",
      "תקופת חיוב": row.billing_period ?? "",
      "קטגוריית ספק": invoiceProviderCategoryLabel(row),
      "ספק מזוהה": row.provider_label ?? "",
      "קטגוריית הוצאה": row.expense_category ?? "",
      "קובץ": row.file_name,
    }));
    const ws = utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 28 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
      { wch: 24 },
      { wch: 18 },
      { wch: 12 },
      { wch: 10 },
      { wch: 20 },
      { wch: 16 },
      { wch: 24 },
      { wch: 22 },
      { wch: 36 },
    ];
    const wb = utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    utils.book_append_sheet(wb, ws, "חשבוניות");
    writeFile(wb, `invoices-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch {
    message.error("שגיאה בייצוא לאקסל");
  } finally {
    exporting.value = false;
  }
}

async function handleDriveExport() {
  if (!driveAllowed.value) {
    message.warning("ייצוא ל-Google Drive זמין במסלולים בסיסי ועסקי בלבד");
    return;
  }
  try {
    const status = await api.drive.status();
    if (!status.allowed) {
      message.warning("ייצוא ל-Google Drive זמין במסלולים בסיסי ועסקי בלבד");
      return;
    }
    if (!status.syncEnabled) {
      message.warning("יש להפעיל סנכרון Drive בהגדרות הפרופיל לפני ייצוא");
      return;
    }
    const folderGone = status.folderState === "missing" || status.folderState === "trashed";
    if (folderGone) {
      const count = status.syncedFileCount ?? 0;
      confirm({
        title: status.folderState === "trashed" ? "תיקיית Drive בפח" : "תיקיית Drive נמחקה",
        content: count
          ? `${count} מסמכים סומנו כמסונכרנים אבל הם כבר לא בתיקייה. ליצור תיקייה חדשה ולהעלות מחדש?`
          : "תיקיית Google Drive נמחקה. ליצור תיקייה חדשה ולהעלות את המסמכים?",
        confirmText: "העלה מחדש",
        type: "warning",
        onConfirm: runDriveExport,
      });
      return;
    }
    await runDriveExport();
  } catch (err: any) {
    if (String(err?.message ?? "").includes("drive_plan_required")) {
      message.warning("ייצוא ל-Google Drive זמין במסלולים בסיסי ועסקי בלבד");
    } else {
      message.error("שגיאה בייצוא ל-Drive");
    }
  }
}

async function runDriveExport() {
  exportingToDrive.value = true;
  try {
    const result = await api.drive.exportAll();
    const folderHint = result.folderName ? ` לתיקיית "${result.folderName}"` : "";
    if (result.recreated) {
      message.success(`נוצרה תיקייה חדשה והועלו ${result.uploaded} מסמכים${folderHint}${result.failed > 0 ? ` (${result.failed} נכשלו)` : ""}`);
    } else if (result.total === 0) {
      message.info("כל המסמכים כבר מסונכרנים ל-Drive");
    } else {
      message.success(`הועלו ${result.uploaded} מסמכים${folderHint} ב-Google Drive${result.failed > 0 ? ` (${result.failed} נכשלו)` : ""}`);
    }
    if (result.folderUrl) {
      window.open(result.folderUrl, "_blank", "noopener,noreferrer");
    }
  } catch (err: any) {
    if (String(err?.message ?? "").includes("drive_plan_required")) {
      message.warning("ייצוא ל-Google Drive זמין במסלולים בסיסי ועסקי בלבד");
    } else if (String(err?.message ?? "").includes("drive_scope_missing")) {
      message.warning("יש להתחבר מחדש ל-Gmail כדי לאשר גישה ל-Drive");
    } else {
      message.error("שגיאה בייצוא ל-Drive");
    }
  } finally {
    exportingToDrive.value = false;
  }
}

async function handleGmailImportButton() {
  importingFromGmail.value = true;
  lastGmailImportJob.value = null;
  try {
    const status = await api.gmail.status();
    gmailConnected.value = status.connected;
    if (!status.connected) {
      const { url } = await api.gmail.authUrl();
      window.location.assign(url);
      return;
    }
    const template = await findInvoiceTemplate();
    const started = await api.gmail.importAll(invoiceGmailQuery(template), undefined, template?.id ? String(template.id) : undefined);
    activeGmailImportJob.value = started;
    message.info("ייבוא החשבוניות מ-Gmail התחיל ברקע");
    const result = await waitForGmailImportJob(started.jobId);
    lastGmailImportJob.value = result;
    const failed = result.errors || result.results.filter((item) => item.error).length;
    const imported = result.imported ?? 0;
    if (imported) {
      message.success(`יובאו ${imported} מסמכים מ-Gmail`);
    } else if (failed) {
      message.warning("לא יובאו מסמכים. חלק מהקבצים נכשלו בעיבוד.");
    } else {
      message.info("לא נמצאו מסמכים חדשים לייבוא");
    }
    await load(true);
  } catch (err: any) {
    const code = String(err?.message ?? "");
    if (code.includes("gmail_not_connected")) {
      gmailConnected.value = false;
      message.error("Gmail לא מחובר. לחץ שוב כדי להתחבר.");
    } else if (code.includes("document_monthly_quota_exceeded")) {
      message.error("הגעת למגבלת הייבוא החודשית של המנוי.");
    } else {
      message.error("שגיאה בייבוא מ-Gmail");
    }
  } finally {
    activeGmailImportJob.value = null;
    importingFromGmail.value = false;
  }
}

async function waitForGmailImportJob(jobId: string): Promise<GmailImportJob> {
  let last: GmailImportJob | null = null;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    last = await api.gmail.importJob(jobId);
    activeGmailImportJob.value = last;
    if (last.status === "completed") return last;
    if (last.status === "failed") throw new Error(last.error || "gmail_import_failed");
    await delay(2000);
  }
  throw new Error("gmail_import_timeout");
}

function delay(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function findInvoiceTemplate(): Promise<DocTemplate | null> {
  const templates = await api.docTemplates.list();
  return templates.find((template) =>
    template.document_kind === "invoice" || /חשבונית|קבלה|דרישת\s*תשלום/i.test(template.name)
  ) ?? null;
}

function invoiceGmailQuery(template: DocTemplate | null): string {
  const parts = ["has:attachment", "{filename:pdf filename:doc filename:docx filename:xls filename:xlsx}"];
  const terms = invoiceTemplateTerms(template);
  if (terms.length === 1) {
    parts.push(formatGmailSearchTerm(terms[0]));
  } else if (terms.length > 1) {
    parts.push(`{${terms.map(formatGmailSearchTerm).join(" ")}}`);
  }
  return parts.join(" ");
}

function invoiceTemplateTerms(template: DocTemplate | null): string[] {
  if (!template) return ["חשבונית", "invoice", "receipt", "קבלה"];
  const candidates = [
    template.name,
    template.document_kind !== "unknown" ? template.document_kind : "",
    ...(template.match_keywords ?? []),
  ];
  const seen = new Set<string>();
  return candidates
    .map((term) => String(term ?? "").trim())
    .filter((term) => term.length >= 3)
    .filter((term) => {
      const key = term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function formatGmailSearchTerm(term: string): string {
  return `"${term.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
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

function supplierFilterParam(): string | undefined {
  return filters.suppliers.length ? filters.suppliers.join("||") : undefined;
}

function openVendorMergeModal() {
  vendorMergeModal.sourceNames = [...filters.suppliers];
  vendorMergeModal.canonicalName = filters.suppliers[0] ?? "";
  vendorMergeModal.show = true;
}

async function saveVendorMerge() {
  const sourceNames = [...new Set(vendorMergeModal.sourceNames.map((name) => name.trim()).filter(Boolean))];
  const canonicalName = String(vendorMergeModal.canonicalName ?? "").trim();
  if (sourceNames.length < 2 || !canonicalName) return;
  vendorMergeModal.saving = true;
  try {
    const result = await api.invoices.mergeVendors({ supplierNames: sourceNames, canonicalName });
    vendorMergeModal.show = false;
    filters.suppliers = [result.supplierName];
    message.success(`${result.modified} חשבוניות מוזגו תחת ${result.supplierName}`);
    await load(true);
  } catch {
    message.error("שגיאה במיזוג ספקים");
  } finally {
    vendorMergeModal.saving = false;
  }
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

async function updateInvoiceProviderCategory(row: ImportedInvoice, value: string | null) {
  if ((row.provider_category ?? null) === (value ?? null)) return;
  await updateInvoiceMeta(row, { provider_category: normalizeProviderCategory(value) });
}

function normalizeProviderCategory(value: string | null): ImportedInvoice["provider_category"] | null {
  return PROVIDER_CATEGORIES.includes(value as NonNullable<ImportedInvoice["provider_category"]>)
    ? value as NonNullable<ImportedInvoice["provider_category"]>
    : null;
}

async function updateInvoiceMeta(row: ImportedInvoice, body: { client_name?: string; business?: string; expense_category?: string; provider_category?: ImportedInvoice["provider_category"] | null }) {
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
.invoices-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  width: 100%;
}

.rbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  line-height: 1;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  white-space: nowrap;
}

.rbtn:hover:not(.rbtn--primary):not(.rbtn--danger):not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.rbtn:active {
  transform: scale(0.97);
}

.rbtn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.rbtn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 600;
}

.rbtn--primary:hover:not(:disabled) {
  background: var(--brand-color-hover);
  border-color: var(--brand-color-hover);
  color: var(--text-inverse, #fff);
}

.rbtn--primary:active:not(:disabled) {
  background: var(--brand-color-pressed);
  border-color: var(--brand-color-pressed);
}

.rbtn--danger {
  background: var(--color-error, #d03050);
  border-color: var(--color-error, #d03050);
  color: #fff;
  font-weight: 700;
}

.rbtn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-error, #d03050) 88%, #000);
  border-color: color-mix(in srgb, var(--color-error, #d03050) 88%, #000);
}

.rbtn--ghost-active {
  background: var(--bg-elevated);
  border-color: var(--brand-color);
  color: var(--brand-color);
}

.rbtn--loading {
  opacity: 0.75;
  pointer-events: none;
}

.rbtn--loading::before {
  content: "";
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-inline-start-color: transparent;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
  flex: 0 0 auto;
}

.refresh-icon--spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.filterbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 6px;
  background: var(--bg-elevated);
  border-radius: 14px;
  border: 1px solid var(--border-color);
}

.filterbar--compact {
  margin-top: 10px;
  padding: 5px;
  background: transparent;
}

.invoices-page :deep(.invoice-section-nav) {
  margin-top: 2px;
}

.pill {
  padding: 8px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.pill--compact {
  padding: 6px 13px;
  font-size: 12px;
}

.pill:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.pill--active {
  color: var(--brand-color);
  font-weight: 700;
  background: var(--bg-card);
  border: 2px solid var(--brand-color);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand-color) 55%, transparent);
}

.pill--active .pill__badge {
  background: color-mix(in srgb, var(--brand-color) 22%, transparent);
  color: inherit;
}

.pill__badge {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 999px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.toolbar__search {
  flex: 1 1 260px;
  min-width: 220px;
}

.toolbar__type {
  width: 200px;
}

.toolbar__supplier {
  width: 260px;
}

.toolbar__dates {
  width: 260px;
}

.toolbar__view-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  margin-inline-start: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.toolbar__view-toggle .rbtn {
  min-height: 32px;
  min-width: 32px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
}

.toolbar__view-toggle .rbtn:hover {
  background: var(--bg-hover);
  border-color: transparent;
}

.toolbar__view-toggle .rbtn--ghost-active {
  background: var(--bg-card);
  border-color: transparent;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.rbtn--icon {
  justify-content: center;
}

.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
  font-size: 14px;
}

.empty__icon {
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.mt-3 {
  margin-top: 12px;
}

.invoice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.invoice-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
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
  background: var(--bg-card);
}

.invoice-card__fallback {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-secondary);
}

.invoice-card__status {
  position: absolute;
  top: 10px;
  right: 10px;
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
  color: var(--text-primary);
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

.invoice-category-chip {
  display: inline-flex;
  align-items: center;
  max-width: 180px;
  min-height: 24px;
  padding: 3px 9px;
  border: 1px solid color-mix(in srgb, var(--brand-color) 22%, var(--border-color));
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-color) 7%, var(--bg-card));
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invoice-table-wrap {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: auto;
}

.invoice-table {
  width: 100%;
  min-width: 1020px;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
}

.invoice-table__col--select {
  width: 46px;
}

.invoice-table__col--supplier {
  width: clamp(180px, 23vw, 280px);
}

.invoice-table__col--status {
  width: 132px;
}

.invoice-table__col--date {
  width: 132px;
}

.invoice-table__col--client {
  width: clamp(170px, 22vw, 260px);
}

.invoice-table__col--category {
  width: 144px;
}

.invoice-table__col--type {
  width: 108px;
}

.invoice-table__col--amount {
  width: 128px;
}

.invoice-table__col--actions {
  width: 72px;
}

.invoice-table th,
.invoice-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-color);
  text-align: right;
  white-space: nowrap;
  vertical-align: middle;
}

.invoice-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-weight: 800;
}

.invoice-sort-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
}

.invoice-sort-button span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invoice-sort-button :deep(.n-icon) {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--text-secondary) 78%, var(--brand-color));
}

.invoice-sort-button:hover,
.invoice-sort-button:focus-visible {
  color: var(--brand-color);
}

.invoice-sort-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--brand-color) 45%, transparent);
  outline-offset: 3px;
  border-radius: 6px;
}

.invoice-sort-button--amount {
  direction: rtl;
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

.invoice-cell-truncate {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invoice-pagination {
  display: flex;
  justify-content: center;
  padding: 14px 0 4px;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cell-strong,
.cell-amount {
  font-weight: 700;
  color: var(--text-primary);
}

.cell-actions {
  width: 72px;
}

.invoice-col--amount {
  direction: ltr;
  text-align: left;
}

.invoice-col--actions {
  text-align: center;
}

.invoice-col--select {
  text-align: center;
}

.invoice-col--supplier,
.invoice-col--status,
.invoice-col--date,
.invoice-col--client,
.invoice-col--category,
.invoice-col--type {
  direction: rtl;
  text-align: right;
}

.invoice-status-select {
  width: 108px;
}

.invoice-row-action {
  color: var(--text-secondary);
}

.invoice-row-action:hover {
  color: var(--brand-color);
}

:global(.invoice-business-modal.n-card),
:global(.invoice-vendor-merge-modal.n-card) {
  max-width: calc(100vw - 32px) !important;
}

:global(.invoice-business-modal.n-card) {
  width: 460px !important;
}

:global(.invoice-vendor-merge-modal.n-card) {
  width: 560px !important;
}

@media (max-width: 1180px) {
  .invoice-table {
    min-width: 840px;
  }

  .invoice-col--type {
    display: none;
  }
}

@media (max-width: 920px) {
  .invoice-table {
    min-width: 720px;
  }

  .invoice-col--date {
    display: none;
  }
}

@media (max-width: 760px) {
  .invoice-table {
    min-width: 620px;
  }

  .invoice-col--client {
    display: none;
  }
}

.invoice-business-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.invoice-form-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.invoice-form-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.invoice-business-form__actions {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
}

@media (max-width: 640px) {
  .invoices-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
  }

  .invoices-actions > .rbtn {
    width: 100%;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .toolbar__search,
  .toolbar__type,
  .toolbar__supplier,
  .toolbar__dates {
    width: 100%;
    min-width: 0;
    flex-basis: auto;
  }

  .invoice-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 420px) {
  .invoices-actions {
    grid-template-columns: 1fr;
  }
}
</style>
