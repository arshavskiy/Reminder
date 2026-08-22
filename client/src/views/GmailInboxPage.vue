<template>
  <div class="page-wrap" dir="rtl">
    <div class="page-header">
      <h1 class="page-title">Gmail — קבצים מצורפים <span v-if="connectedEmail" class="connected-email">({{ connectedEmail }})</span></h1>
      <div class="header-actions">
        <n-button v-if="connected && (isAdmin || selectedGuidedFlow)" :loading="loading" type="primary" @click="refreshCurrentFlow">
          <template #icon><n-icon :component="RefreshOutline" /></template>
          רענן
        </n-button>
        <n-select
          v-if="connected && isAdmin"
          v-model:value="selectedTemplateId"
          :options="templateOptions"
          clearable
          placeholder="תבנית אוטומטית"
          size="small"
          style="width: 200px"
        />
        <n-button v-if="connected && (isAdmin || selectedGuidedFlow)" type="success" :loading="importingAll" @click="importAllNew">
          <template #icon><n-icon :component="CloudDownloadOutline" /></template>
          ייבא הכל
        </n-button>
        <n-button v-if="connected && isAdmin && connectionSource === 'oauth'" quaternary type="error" @click="disconnect">
          נתק Gmail
        </n-button>
        <n-button v-if="!connected && !loading" type="primary" @click="connectGmail">
          <template #icon><n-icon :component="LogoGoogle" /></template>
          חבר Gmail
        </n-button>
      </div>
    </div>

    <nav v-if="sectionNavItems.length" class="gmail-section-nav" aria-label="ניווט בעמוד Gmail">
      <a
        v-for="item in sectionNavItems"
        :key="item.id"
        class="gmail-section-nav__link"
        :href="`#${item.id}`"
      >
        <span class="gmail-section-nav__dot" />
        <span>{{ item.label }}</span>
      </a>
    </nav>

    <div v-if="connected && !isAdmin" class="gmail-flow-tabs" role="tablist" aria-label="מסלולי ייבוא Gmail">
      <button
        type="button"
        class="gmail-flow-tab"
        :class="{ 'gmail-flow-tab--active': selectedGuidedFlow === 'invoice' }"
        role="tab"
        :aria-selected="selectedGuidedFlow === 'invoice'"
        @click="selectGuidedFlow('invoice')"
      >
        <n-icon :component="DocumentOutline" :size="18" />
        <span>ייבוא חשבוניות</span>
      </button>
      <button
        type="button"
        class="gmail-flow-tab"
        :class="{ 'gmail-flow-tab--active': selectedGuidedFlow === 'inspection' }"
        role="tab"
        :aria-selected="selectedGuidedFlow === 'inspection'"
        @click="selectGuidedFlow('inspection')"
      >
        <n-icon :component="DocumentOutline" :size="18" />
        <span>ייבוא תסקיר בדיקה</span>
      </button>
    </div>

    <section v-if="connected && !isAdmin && !selectedGuidedFlow" class="guided-import">
      <div class="guided-import__head">
        <h2>מה לייבא מ-Gmail?</h2>
      </div>
      <div class="guided-import__actions">
        <button class="guided-import-card" type="button" @click="startGuidedImport('invoice')">
          <span class="guided-import-card__icon">
            <n-icon :component="DocumentOutline" :size="28" />
          </span>
          <span class="guided-import-card__title">ייבוא חשבוניות</span>
          <span class="guided-import-card__text">חיפוש חשבוניות וקבלות עם קבצים מצורפים</span>
        </button>
        <button class="guided-import-card" type="button" @click="startGuidedImport('inspection')">
          <span class="guided-import-card__icon">
            <n-icon :component="DocumentOutline" :size="28" />
          </span>
          <span class="guided-import-card__title">ייבוא תסקיר בדיקה</span>
          <span class="guided-import-card__text">חיפוש תסקירי בדיקה ודוחות ציוד</span>
        </button>
      </div>
    </section>

    <section v-if="connected && !isAdmin && selectedGuidedFlow" class="guided-flow-bar">
      <div>
        <span class="guided-flow-bar__label">מסלול ייבוא</span>
        <strong>{{ guidedFlowLabel }}</strong>
      </div>
      <span class="guided-flow-bar__query">{{ searchQuery }}</span>
    </section>

    <!-- Filters -->
    <div v-if="connected && isAdmin" class="filter-bar">
      <div class="file-type-checks">
        <n-checkbox v-model:checked="fileTypes.pdf">PDF</n-checkbox>
        <n-checkbox v-model:checked="fileTypes.doc">DOC/DOCX</n-checkbox>
        <n-checkbox v-model:checked="fileTypes.xls">XLS/XLSX</n-checkbox>
        <n-checkbox v-model:checked="fileTypes.img">תמונות</n-checkbox>
      </div>
      <div class="filter-divider" />
      <n-select
        v-model:value="searchTemplateId"
        :options="templateOptions"
        placeholder="סוג מסמך"
        filterable
        clearable
        style="width:220px"
      />
      <n-select
        v-model:value="filterType"
        :options="filterTypeOptions"
        placeholder="סינון נוסף"
        style="width:160px"
        @update:value="onFilterChange"
      />
      <n-select
        v-if="filterType === 'sender'"
        v-model:value="filterSender"
        :options="senderOptions"
        placeholder="שולח"
        filterable
        clearable
        tag
        style="width:220px"
      />
      <n-date-picker
        v-if="filterType === 'date'"
        v-model:value="filterDateRange"
        type="daterange"
        clearable
        style="width:280px"
      />
      <n-input
        v-if="filterType === 'inspection'"
        v-model:value="filterIdentifierText"
        placeholder="מספר רישוי / תסקיר"
        clearable
        style="width:220px"
        :allow-input="(v: string) => /^\d*$/.test(v)"
        @keydown.enter="buildAndSearch"
      />
      <n-button type="primary" @click="buildAndSearch" :loading="loading">
        <template #icon><n-icon :component="SearchOutline" /></template>
        חפש
      </n-button>
    </div>

    <!-- Not connected -->
    <div v-if="!connected && !loading" class="empty-state">
      <n-icon :component="LogoGoogle" size="64" color="#4285F4" />
      <p>חבר את חשבון Gmail שלך כדי לראות חשבוניות PDF</p>
      <n-button type="primary" size="large" @click="connectGmail">חבר Gmail</n-button>
    </div>

    <!-- Loading status -->
    <n-spin v-else-if="loading" size="large" style="margin:80px auto;display:block" />

    <!-- Inbox table -->
    <section v-else-if="isAdmin || selectedGuidedFlow" id="gmail-search-section" class="gmail-search-section">
      <div v-if="!emails.length" class="empty-state">
        <p>לא נמצאו מיילים עם קבצי {{ selectedTypeLabel }} מצורפים</p>
      </div>

      <div v-else class="inbox-table-block">
        <div class="inbox-table-wrap">
          <table class="inbox-table">
          <thead>
            <tr>
              <th class="col-from">מאת</th>
              <th class="col-subject">נושא</th>
              <th class="col-date">תאריך</th>
              <th class="col-file">קובץ</th>
              <th class="col-actions">פעולות</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in emails" :key="row.id">
              <tr
                v-for="(att, attIndex) in row.attachments"
                :key="att.attachmentId"
                class="inbox-row"
              >
                <td v-if="attIndex === 0" class="col-from" :rowspan="row.attachments.length">
                  <span class="inbox-from" :title="row.from">{{ formatFrom(row.from) }}</span>
                </td>
                <td v-if="attIndex === 0" class="col-subject" :rowspan="row.attachments.length">
                  <span class="inbox-subject" :title="row.subject">{{ row.subject || "—" }}</span>
                </td>
                <td v-if="attIndex === 0" class="col-date" :rowspan="row.attachments.length">
                  {{ formatDate(row.internalDate) }}
                </td>
                <td class="col-file">
                  <div class="inbox-file">
                    <n-icon :component="DocumentOutline" :size="14" class="inbox-file__icon" />
                    <span class="inbox-file__name" :title="`${att.filename || 'קובץ מצורף'} · ${formatSize(att.size)}`">{{ att.filename || "קובץ מצורף" }}</span>
                  </div>
                </td>
                <td class="col-actions">
                  <div class="inbox-row-actions">
                    <n-tooltip placement="top">
                      <template #trigger>
                        <button
                          class="btn btn--ghost btn--xs icon-btn"
                          type="button"
                          @click="previewAttachment(row.id, att)"
                        >
                          <n-icon :component="EyeOutline" :size="14" class="btn-icon" />
                        </button>
                      </template>
                      תצוגה מקדימה
                    </n-tooltip>
                    <n-tooltip placement="top">
                      <template #trigger>
                        <button
                          class="btn btn--ghost btn--xs icon-btn"
                          type="button"
                          @click="downloadAttachment(row.id, att)"
                        >
                          <n-icon :component="DownloadOutline" :size="14" class="btn-icon" />
                        </button>
                      </template>
                      הורד
                    </n-tooltip>
                    <n-tooltip placement="top">
                      <template #trigger>
                        <span class="inbox-row-actions__tip">
                          <button
                            class="btn btn--primary btn--xs icon-btn"
                            type="button"
                            :class="{ 'btn--loading': importing[att.attachmentId] }"
                            :disabled="Boolean(importing[att.attachmentId])"
                            @click="importAttachment(row.id, att)"
                          >
                            <n-icon :component="CloudDownloadOutline" :size="14" class="btn-icon" />
                          </button>
                        </span>
                      </template>
                      {{ importing[att.attachmentId] ? "מייבא…" : "ייבא למסמכים" }}
                    </n-tooltip>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
          </table>
        </div>
        <div v-if="nextPageToken" class="load-more-wrap">
          <n-button :loading="loadingMore" @click="loadMore">
            טען עוד
            <template v-if="totalEstimate"> ({{ emails.length }} מתוך ~{{ totalEstimate }})</template>
          </n-button>
        </div>
      </div>
    </section>

    <!-- Import results modal -->
    <n-modal v-model:show="importResults.show" preset="card" title="תוצאות ייבוא" style="max-width:600px">
      <div class="import-results">
        <div class="import-results__summary">
          <span class="import-results__stat import-results__stat--ok">{{ importResults.imported }} יובאו</span>
          <span class="import-results__stat import-results__stat--skip">{{ importResults.skipped }} כבר קיימים</span>
          <span v-if="importResults.errors > 0" class="import-results__stat import-results__stat--err">{{ importResults.errors }} שגיאות</span>
        </div>
        <table v-if="importResults.results.length" class="import-results__table">
          <thead><tr><th>קובץ</th><th>סטטוס</th></tr></thead>
          <tbody>
            <tr v-for="r in importResults.results" :key="r.filename + r.messageId">
              <td class="import-results__file">{{ r.filename }}</td>
              <td>
                <span v-if="r.documentId" class="tag tag--success">יובא</span>
                <span v-else-if="r.error" class="tag tag--danger" :title="r.error">שגיאה</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </n-modal>

    <n-modal
      v-model:show="importedBusinessModal.show"
      preset="card"
      title="הגדר עסק"
      class="gmail-business-modal"
      :style="{ width: '460px', maxWidth: 'calc(100vw - 32px)' }"
    >
      <div class="gmail-business-form" dir="rtl">
        <n-input
          v-model:value="importedBusinessModal.value"
          clearable
          placeholder="שם עסק חדש"
          @keydown.enter="saveImportedBusinessModal"
        />
        <div class="gmail-business-form__actions">
          <n-button @click="importedBusinessModal.show = false">ביטול</n-button>
          <n-button type="primary" :disabled="!importedBusinessModal.value.trim()" @click="saveImportedBusinessModal">
            שמור
          </n-button>
        </div>
      </div>
    </n-modal>

    <section v-if="connected && (isAdmin || selectedGuidedFlow) && importedDocuments.length" id="gmail-imported-section" class="gmail-docs-section">
      <div class="gmail-docs-head">
        <div>
          <h2 class="gmail-docs-title">מסמכים שיובאו מ-Gmail</h2>
          <p class="gmail-docs-subtitle">{{ filteredImportedDocuments.length }} מתוך {{ importedDocuments.length }} מסמכים</p>
        </div>
        <div class="gmail-docs-view">
          <n-button size="small" :type="importedView === 'grid' ? 'primary' : 'default'" @click="importedView = 'grid'">
            כרטיסים
          </n-button>
          <n-button size="small" :type="importedView === 'list' ? 'primary' : 'default'" @click="importedView = 'list'">
            טבלה
          </n-button>
        </div>
      </div>

      <div class="gmail-doc-filters">
        <n-input
          v-model:value="importedSearch"
          clearable
          placeholder="חיפוש ספק, סכום, סוג או שם קובץ..."
          style="min-width:260px;max-width:360px"
        />
        <n-select
          v-model:value="importedStatusFilter"
          :options="importedStatusOptions"
          clearable
          placeholder="כל הסטטוסים"
          style="width:170px"
        />
        <n-select
          v-model:value="importedTypeFilter"
          :options="importedTypeOptions"
          clearable
          filterable
          placeholder="סוג מסמך"
          style="width:190px"
        />
        <n-select
          v-model:value="importedSourceFilter"
          :options="importedSourceOptions"
          clearable
          filterable
          placeholder="מקור"
          style="width:210px"
        />
        <n-date-picker
          v-model:value="importedDateRange"
          type="daterange"
          clearable
          style="width:260px"
        />
      </div>

      <div v-if="filteredImportedDocuments.length && importedView === 'grid'" class="gmail-doc-grid">
        <article
          v-for="doc in pagedImportedDocuments"
          :key="doc.id"
          class="gmail-doc-card"
          @click="openImportedDocument(doc)"
        >
          <div class="gmail-doc-card__status">
            <span class="status-pill" :class="`status-pill--${doc.processing_status}`">{{ importedStatusLabel(doc.processing_status) }}</span>
          </div>
          <div class="gmail-doc-card__preview">
            <img
              v-if="importedDocThumbnailSrc(doc)"
              :src="importedDocThumbnailSrc(doc) || ''"
              :alt="doc.file_name"
              loading="lazy"
            />
            <img
              v-else-if="isImageDoc(doc)"
              :src="importedDocPreviewSrc(doc)"
              :alt="doc.file_name"
              loading="lazy"
            />
            <iframe
              v-else-if="isPdfDoc(doc)"
              :src="importedDocPreviewSrc(doc)"
              :title="doc.file_name"
              loading="lazy"
            />
            <div v-else class="gmail-doc-card__fallback">
              <n-icon :component="DocumentOutline" :size="42" />
            </div>
          </div>
          <div class="gmail-doc-card__body">
            <div class="gmail-doc-card__supplier" :title="importedSupplier(doc)">{{ importedSupplier(doc) }}</div>
            <div class="gmail-doc-card__amount">{{ importedAmount(doc) }}</div>
            <div class="gmail-doc-card__meta">
              <span>{{ importedDocType(doc) }}</span>
              <span>{{ importedDisplayDate(doc) }}</span>
            </div>
            <div class="gmail-doc-card__source" :title="doc.sourceSubject">{{ doc.sourceSubject || doc.file_name }}</div>
            <button class="btn btn--ghost btn--xs gmail-doc-card__download" type="button" @click.stop="downloadImportedDocument(doc)">
              הורד
            </button>
          </div>
        </article>
      </div>

      <div v-else-if="filteredImportedDocuments.length" class="gmail-doc-table-wrap">
        <table class="gmail-doc-table">
          <thead>
            <tr>
              <th>ספק</th>
              <th>סטטוס</th>
              <th>תאריך</th>
              <th>עסק</th>
              <th>סוג</th>
              <th>סכום</th>
              <th class="gmail-doc-table__actions-head">פעולות</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="doc in pagedImportedDocuments" :key="doc.id">
              <td>{{ importedSupplier(doc) }}</td>
              <td>
                <n-select
                  v-if="doc.invoice_id"
                  :value="doc.invoice_status || 'new'"
                  :options="invoiceStatusOptions"
                  size="small"
                  class="gmail-doc-status-select"
                  @update:value="(value) => updateImportedInvoiceStatus(doc, String(value))"
                />
                <span v-else class="status-pill" :class="`status-pill--${doc.processing_status}`">{{ importedStatusLabel(doc.processing_status) }}</span>
              </td>
              <td>{{ importedDisplayDate(doc) }}</td>
              <td>{{ importedBusiness(doc) }}</td>
              <td>{{ importedDocType(doc) }}</td>
              <td class="gmail-doc-table__amount">{{ importedAmount(doc) }}</td>
              <td class="gmail-doc-table__actions">
                <n-dropdown
                  :options="importedDocActionOptions(doc)"
                  placement="bottom-start"
                  trigger="click"
                  @select="(key: string) => handleImportedDocAction(key, doc)"
                >
                  <button class="btn btn--ghost btn--xs icon-btn gmail-doc-row-action" type="button" aria-label="פעולות">
                    <n-icon :component="EllipsisVerticalOutline" class="btn-icon" />
                  </button>
                </n-dropdown>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="filteredImportedDocuments.length > importedPageSize" class="gmail-doc-pagination">
        <n-pagination
          v-model:page="importedPage"
          v-model:page-size="importedPageSize"
          :item-count="filteredImportedDocuments.length"
          :page-sizes="[8, 12, 24, 48]"
          show-size-picker
        />
      </div>

      <div v-if="!filteredImportedDocuments.length" class="gmail-docs-empty">אין מסמכים שתואמים לסינון הנוכחי</div>
    </section>

    <!-- Import history -->
    <div v-if="connected && (isAdmin || selectedGuidedFlow) && filteredHistoryItems.length" id="gmail-history-section" class="history-section">
      <h3 class="history-title" @click="historyOpen = !historyOpen" style="cursor:pointer">
        {{ historyTitle }} ({{ filteredHistoryItems.length }})
        <span class="history-chevron" :class="{ open: historyOpen }">▸</span>
      </h3>
      <div v-if="historyOpen" class="history-list">
        <div v-for="item in filteredHistoryItems" :key="item.message_id" class="history-item">
          <div class="history-item__header">
            <span class="history-item__subject">{{ item.subject || "ללא נושא" }}</span>
            <span class="history-item__date">{{ new Date(item.imported_at).toLocaleDateString("he-IL") }}</span>
          </div>
          <div v-if="item.files?.length" class="history-item__files">
            <span v-for="f in item.files" :key="f.filename" class="history-file" :class="{ 'history-file--err': f.error }">
              {{ f.filename }}
              <span v-if="f.error" class="tag tag--danger tag--xs">שגיאה</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, watch, type Component } from "vue";
import { useRoute } from "vue-router";
import {
  NButton, NCheckbox, NDatePicker, NDropdown, NIcon, NInput, NModal, NPagination, NSelect, NSpin, NTooltip,
  useMessage, type SelectOption,
} from "naive-ui";
import {
  ArchiveOutline,
  BriefcaseOutline,
  CloudDownloadOutline,
  DocumentOutline,
  DownloadOutline,
  EllipsisVerticalOutline,
  EyeOutline,
  LogoGoogle,
  PricetagOutline,
  RefreshOutline,
  SearchOutline,
} from "@vicons/ionicons5";
import { api, type GmailAttachment, type GmailEmail, type GmailImportedDocument, type GmailImportHistoryItem, type GmailSearchProvider } from "../services/apiService.js";
import { useAuthStore } from "../stores/auth.js";
import type { DocTemplate } from "../shared/types.js";

const route = useRoute();
const message = useMessage();
const authStore = useAuthStore();

const selectedTemplateId = ref<string | null>(null);
const searchTemplateId = ref<string | null>(null);
const templateOptions = ref<{ label: string; value: string }[]>([]);
const templates = ref<DocTemplate[]>([]);

const connected = ref(false);
const connectionSource = ref<string | null>(null);
const connectedEmail = ref<string | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const importingAll = ref(false);
const emails = ref<GmailEmail[]>([]);
const searchQuery = ref("");
const nextPageToken = ref<string | null>(null);
const totalEstimate = ref<number | null>(null);
const importing = ref<Record<string, boolean>>({});
const selectedGuidedFlow = ref<"invoice" | "inspection" | null>(null);
const isAdmin = computed(() => authStore.user?.role === "admin");
const guidedFlowLabel = computed(() => selectedGuidedFlow.value === "invoice" ? "חשבוניות" : "תסקיר בדיקה");
const historyTitle = computed(() =>
  selectedGuidedFlow.value === "inspection"
    ? "היסטוריית ייבוא תסקירי בדיקה"
    : selectedGuidedFlow.value === "invoice"
      ? "היסטוריית ייבוא חשבוניות"
      : "היסטוריית ייבוא"
);
const sectionNavItems = computed(() => {
  if (!connected.value) return [];
  const items: Array<{ id: string; label: string }> = [];
  if (isAdmin.value || selectedGuidedFlow.value) items.push({ id: "gmail-search-section", label: "חיפוש" });
  if ((isAdmin.value || selectedGuidedFlow.value) && importedDocuments.value.length) items.push({ id: "gmail-imported-section", label: "מסמכים שיובאו" });
  if ((isAdmin.value || selectedGuidedFlow.value) && filteredHistoryItems.value.length) items.push({ id: "gmail-history-section", label: "היסטוריה" });
  return items;
});

// Import results modal
const importResults = ref<{
  show: boolean;
  imported: number;
  skipped: number;
  errors: number;
  results: Array<{ messageId: string; filename: string; documentId?: string; error?: string }>;
}>({ show: false, imported: 0, skipped: 0, errors: 0, results: [] });

// Import history
type ImportedDocumentCard = GmailImportedDocument & {
  sourceSubject: string;
  sourceDate: string | null;
  sourceMessageId: string;
  sourceFilename: string;
};
const historyItems = ref<GmailImportHistoryItem[]>([]);
const historyOpen = ref(false);
const importedView = ref<"grid" | "list">("grid");
const importedSearch = ref("");
const importedStatusFilter = ref<string | null>(null);
const importedTypeFilter = ref<string | null>(null);
const importedSourceFilter = ref<string | null>(null);
const importedDateRange = ref<[number, number] | null>(null);
const importedPage = ref(1);
const importedPageSize = ref(12);
const importedBusinessModal = ref<{
  show: boolean;
  doc: ImportedDocumentCard | null;
  value: string;
}>({ show: false, doc: null, value: "" });
const invoiceStatusOptions: SelectOption[] = [
  { label: "חדש", value: "new" },
  { label: "נבדק", value: "reviewed" },
  { label: "יוצא", value: "outgoing" },
  { label: "ארכיון", value: "archived" },
];

// File type checkboxes
const fileTypes = ref({ pdf: true, doc: false, xls: false, img: false });

const fileTypeLabels: Record<string, string> = { pdf: "PDF", doc: "DOC/DOCX", xls: "XLS/XLSX", img: "תמונות" };
const selectedTypeLabel = computed(() => {
  const active = Object.entries(fileTypes.value).filter(([, v]) => v).map(([k]) => fileTypeLabels[k]);
  return active.length ? active.join(" / ") : "קבצים";
});

// Extra filters
const filterType = ref<string>("none");
const filterSender = ref<string | null>(null);
const filterDateRange = ref<[number, number] | null>(null);
const filterIdentifierText = ref("");
const senderProviders = ref<GmailSearchProvider[]>([]);

const filterTypeOptions: SelectOption[] = [
  { label: "ללא", value: "none" },
  { label: "לפי שולח", value: "sender" },
  { label: "לפי תאריך", value: "date" },
  { label: "תסקירים (מספר רישוי)", value: "inspection" },
];

const senderOptions = computed<SelectOption[]>(() => senderProviders.value.map((option) => ({
  label: option.label,
  value: option.id,
})));
const senderQueryByValue = computed(() => new Map(senderProviders.value.map((option) => [option.id, option.terms])));

const filteredHistoryItems = computed<GmailImportHistoryItem[]>(() => {
  if (isAdmin.value || !selectedGuidedFlow.value) return historyItems.value;
  return historyItems.value
    .map((item) => ({
      ...item,
      files: (item.files ?? []).filter((file) => {
        if (!file.document) return false;
        return documentMatchesFlow(file.document, selectedGuidedFlow.value!);
      }),
    }))
    .filter((item) => (item.files ?? []).length > 0);
});

const importedDocuments = computed<ImportedDocumentCard[]>(() => filteredHistoryItems.value.flatMap((item) =>
  (item.files ?? [])
    .filter((file) => file.document)
    .map((file) => ({
      ...(file.document as GmailImportedDocument),
      sourceSubject: item.subject || "",
      sourceDate: item.imported_at || null,
      sourceMessageId: item.message_id,
      sourceFilename: file.filename,
    })),
));

const importedStatusOptions = computed<SelectOption[]>(() => uniqueOptions(
  importedDocuments.value.map((doc) => doc.processing_status),
  importedStatusLabel,
));

const importedTypeOptions = computed<SelectOption[]>(() => uniqueOptions(
  importedDocuments.value.map((doc) => importedDocType(doc)),
));

const importedSourceOptions = computed<SelectOption[]>(() => uniqueOptions(
  importedDocuments.value.map((doc) => importedSupplier(doc)).filter((value) => value !== "ספק לא מזוהה"),
));

const filteredImportedDocuments = computed(() => {
  const query = importedSearch.value.trim().toLowerCase();
  return importedDocuments.value.filter((doc) => {
    if (importedStatusFilter.value && doc.processing_status !== importedStatusFilter.value) return false;
    if (importedTypeFilter.value && importedDocType(doc) !== importedTypeFilter.value) return false;
    if (importedSourceFilter.value && importedSupplier(doc) !== importedSourceFilter.value) return false;
    if (importedDateRange.value) {
      const ts = importedDocumentTime(doc);
      const [from, to] = importedDateRange.value;
      if (!ts || ts < from || ts > to + 86_399_999) return false;
    }
    if (!query) return true;
    const haystack = [
      doc.file_name,
      doc.sourceSubject,
      importedSupplier(doc),
      importedDocType(doc),
      importedAmount(doc),
      importedDisplayDate(doc),
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
});

const pagedImportedDocuments = computed(() => {
  const start = (importedPage.value - 1) * importedPageSize.value;
  return filteredImportedDocuments.value.slice(start, start + importedPageSize.value);
});

watch(
  [importedSearch, importedStatusFilter, importedTypeFilter, importedSourceFilter, importedDateRange, importedView],
  () => {
    importedPage.value = 1;
  },
);

watch(importedPageSize, () => {
  importedPage.value = 1;
});

watch(filteredImportedDocuments, (rows) => {
  const maxPage = Math.max(1, Math.ceil(rows.length / importedPageSize.value));
  if (importedPage.value > maxPage) importedPage.value = maxPage;
});

function onFilterChange() {
  filterSender.value = null;
  filterDateRange.value = null;
  filterIdentifierText.value = "";
}

const fileTypeMap: Record<string, string[]> = {
  pdf: ["pdf"],
  doc: ["doc", "docx"],
  xls: ["xls", "xlsx"],
  img: ["jpg", "jpeg", "png"],
};

function buildSearchQuery() {
  const parts: string[] = ["has:attachment"];

  const exts: string[] = [];
  for (const [key, extensions] of Object.entries(fileTypeMap)) {
    if (fileTypes.value[key as keyof typeof fileTypes.value]) {
      exts.push(...extensions);
    }
  }
  if (exts.length === 1) {
    parts.push(`filename:${exts[0]}`);
  } else if (exts.length > 1) {
    parts.push(`{${exts.map(e => `filename:${e}`).join(" ")}}`);
  }

  if (filterType.value === "sender" && filterSender.value) {
    parts.push(buildSenderQuery(filterSender.value));
  }
  if (filterType.value === "date" && filterDateRange.value) {
    const [from, to] = filterDateRange.value;
    parts.push(`after:${fmtDate(from)}`, `before:${fmtDate(to + 86400000)}`);
  }
  if (filterType.value === "inspection" && filterIdentifierText.value.trim()) {
    parts.push(`filename:${filterIdentifierText.value.trim()}`);
  }
  const templateTerms = selectedSearchTemplateTerms();
  if (templateTerms.length === 1) {
    parts.push(formatGmailSearchTerm(templateTerms[0]));
  } else if (templateTerms.length > 1) {
    parts.push(`{${templateTerms.map(formatGmailSearchTerm).join(" ")}}`);
  }
  if (selectedGuidedFlow.value === "inspection") {
    parts.push(`-${formatGmailSearchTerm("דוח חודשי")}`, `-${formatGmailSearchTerm("monthly report")}`);
  }

  searchQuery.value = parts.join(" ");
}

function guidedTemplateId(flow: "invoice" | "inspection"): string | null {
  const matcher = flow === "invoice"
    ? (template: DocTemplate) => template.document_kind === "invoice" || /חשבונית|קבלה|דרישת\s*תשלום/i.test(template.name)
    : (template: DocTemplate) => template.document_kind === "inspection_report" || /תסקיר|בדיקה|ציוד|הרמה/i.test(template.name);
  return templates.value.find(matcher)?.id ?? null;
}

function configureGuidedFlow(flow: "invoice" | "inspection") {
  selectedGuidedFlow.value = flow;
  const templateId = guidedTemplateId(flow);
  selectedTemplateId.value = templateId;
  searchTemplateId.value = templateId;
  fileTypes.value = flow === "invoice"
    ? { pdf: true, doc: false, xls: false, img: true }
    : { pdf: true, doc: true, xls: false, img: true };
  filterType.value = "none";
  filterSender.value = null;
  filterDateRange.value = null;
  filterIdentifierText.value = "";
  buildSearchQuery();
}

function startGuidedImport(flow: "invoice" | "inspection") {
  configureGuidedFlow(flow);
  loadInbox();
}

function selectGuidedFlow(flow: "invoice" | "inspection") {
  if (selectedGuidedFlow.value === flow && emails.value.length) return;
  configureGuidedFlow(flow);
  importedSearch.value = "";
  importedStatusFilter.value = null;
  importedTypeFilter.value = null;
  importedSourceFilter.value = null;
  importedDateRange.value = null;
  importedPage.value = 1;
  historyOpen.value = true;
  loadInbox();
}

function resetGuidedFlow() {
  selectedGuidedFlow.value = null;
  selectedTemplateId.value = null;
  searchTemplateId.value = null;
  emails.value = [];
  nextPageToken.value = null;
  totalEstimate.value = null;
  searchQuery.value = "";
}

function refreshCurrentFlow() {
  if (selectedGuidedFlow.value) configureGuidedFlow(selectedGuidedFlow.value);
  else buildSearchQuery();
  loadInbox();
}

function selectedSearchTemplateTerms(): string[] {
  const template = templates.value.find((t) => String(t.id) === searchTemplateId.value);
  if (!template) return [];
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

function buildSenderQuery(value: string): string {
  const mappedTerms = senderQueryByValue.value.get(value);
  if (mappedTerms?.length) {
    return `{${mappedTerms.map((term) => looksLikeDomain(term) ? `from:${term}` : formatGmailSearchTerm(term)).join(" ")}}`;
  }
  const freeValue = value.trim();
  return looksLikeDomain(freeValue) || freeValue.includes("@")
    ? `from:${freeValue}`
    : formatGmailSearchTerm(freeValue);
}

function looksLikeDomain(value: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim());
}

function buildAndSearch() {
  buildSearchQuery();
  loadInbox();
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

async function previewAttachment(messageId: string, att: GmailAttachment) {
  const url = api.gmail.attachmentUrl(messageId, att.attachmentId, att.filename) + "&preview=1";
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  } catch {
    window.$message?.error("שגיאה בטעינת הקובץ");
  }
}

async function downloadAttachment(messageId: string, att: GmailAttachment) {
  const url = api.gmail.attachmentUrl(messageId, att.attachmentId, att.filename);
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = att.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.$message?.error("שגיאה בהורדת הקובץ");
  }
}

function formatFrom(from: string) {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from;
}

function formatDate(internalDate: string) {
  return new Date(Number(internalDate)).toLocaleDateString("he-IL");
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function connectGmail() {
  loading.value = true;
  try {
    const { url } = await api.gmail.authUrl();
    window.location.href = url;
  } catch (err: any) {
    if (err?.status === 403 || err?.message === "forbidden") {
      message.error("חיבור Gmail זמין למשתמשי Pro ומנהלים בלבד");
    } else {
      message.error("שגיאה בהתחברות ל-Gmail");
    }
    loading.value = false;
  }
}

async function loadInbox() {
  loading.value = true;
  nextPageToken.value = null;
  try {
    const result = await api.gmail.inbox(searchQuery.value || undefined);
    emails.value = result.emails;
    nextPageToken.value = result.nextPageToken;
    totalEstimate.value = result.resultSizeEstimate;
  } catch (err: any) {
    if (err?.message?.includes("gmail_not_connected")) {
      connected.value = false;
    } else if (err?.message?.includes("gmail_auth_invalid")) {
      connected.value = false;
      message.error("ההרשאה ל-Gmail פגה או לא תקינה. נתק וחבר Gmail מחדש.");
    } else if (err?.status === 403 || err?.message === "forbidden") {
      message.error("גישה ל-Gmail זמינה למשתמשי Pro ומנהלים בלבד");
    } else {
      message.error("שגיאה בטעינת תיבת הדואר");
    }
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (!nextPageToken.value) return;
  loadingMore.value = true;
  try {
    const result = await api.gmail.inbox(searchQuery.value || undefined, undefined, nextPageToken.value);
    emails.value = [...emails.value, ...result.emails];
    nextPageToken.value = result.nextPageToken;
  } catch {
    message.error("שגיאה בטעינת עמוד נוסף");
  } finally {
    loadingMore.value = false;
  }
}

async function disconnect() {
  await api.gmail.disconnect();
  connected.value = false;
  emails.value = [];
  message.success("Gmail נותק");
}

async function importAttachment(messageId: string, att: GmailAttachment) {
  importing.value = { ...importing.value, [att.attachmentId]: true };
  try {
    await api.gmail.importAttachment(messageId, att.attachmentId, att.filename, importTemplateId());
    message.success(`${att.filename} יובא בהצלחה`);
    loadHistory();
  } catch (err: any) {
    message.error(gmailErrorMessage(err));
  } finally {
    const next = { ...importing.value };
    delete next[att.attachmentId];
    importing.value = next;
  }
}

async function importAllNew() {
  importingAll.value = true;
  try {
    const result = await api.gmail.importAll(searchQuery.value || undefined, undefined, importTemplateId());
    const errors = result.results.filter(r => r.error).length;
    importResults.value = {
      show: true,
      imported: result.imported,
      skipped: result.skipped,
      errors,
      results: result.results,
    };
    loadHistory();
  } catch (err: any) {
    message.error(`שגיאה בייבוא: ${gmailErrorMessage(err)}`);
  } finally {
    importingAll.value = false;
  }
}

async function loadHistory() {
  try {
    const { history } = await api.gmail.importHistory();
    historyItems.value = history;
  } catch {}
}

onMounted(async () => {
  const setupPromise = Promise.all([
    api.docTemplates.list(),
    api.gmail.searchProviders(),
  ]).then(([rows, providerResult]) => {
    templates.value = rows;
    templateOptions.value = rows.map(t => ({
      label: `${t.name} (${t.document_kind})`,
      value: t.id,
    }));
    senderProviders.value = providerResult.providers;
  }).catch(() => {});

  // Handle OAuth callback with error
  const error = route.query.error as string | undefined;
  if (error) {
    message.error(`שגיאת Gmail: ${error}`);
    return;
  }

  loading.value = true;
  try {
    const status = await api.gmail.status();
    connected.value = status.connected;
    connectionSource.value = status.source;
    connectedEmail.value = status.email ?? null;
    if (status.connected) {
      await setupPromise;
      if (isAdmin.value) {
        buildSearchQuery();
        await Promise.all([loadInbox(), loadHistory()]);
      } else {
        await loadHistory();
      }
    }
  } catch (err: any) {
    if (err?.message?.includes("gmail_auth_invalid")) {
      connected.value = false;
      message.error("ההרשאה ל-Gmail פגה או לא תקינה. חבר Gmail מחדש.");
    } else if (err?.status === 403 || err?.message === "forbidden") {
      message.error("גישה ל-Gmail זמינה למשתמשי Pro ומנהלים בלבד");
    }
  } finally {
    loading.value = false;
  }
});

function gmailErrorMessage(err: unknown): string {
  const messageText = err instanceof Error ? err.message : String(err ?? "");
  if (messageText.includes("gmail_auth_invalid")) {
    return "ההרשאה ל-Gmail פגה או לא תקינה. חבר Gmail מחדש.";
  }
  if (messageText.includes("gmail_scope_missing")) {
    return "חסרה הרשאת Gmail. חבר Gmail מחדש ואשר את ההרשאות.";
  }
  if (messageText.includes("gmail_permission_denied")) {
    return "אין הרשאה לגשת ל-Gmail.";
  }
  if (messageText.includes("gmail_rate_limited")) {
    return "Gmail מגביל כרגע את כמות הבקשות. נסה שוב בעוד רגע.";
  }
  if (messageText.includes("monthly_report_not_imported")) {
    return "דוח חודשי לא מיובא במסלול תסקיר בדיקה.";
  }
  return messageText || "שגיאת Gmail";
}

function importTemplateId(): string | undefined {
  if (selectedGuidedFlow.value) return guidedTemplateId(selectedGuidedFlow.value) ?? undefined;
  return selectedTemplateId.value ?? searchTemplateId.value ?? undefined;
}

function uniqueOptions(values: Array<string | null | undefined>, labeler?: (value: string) => string): SelectOption[] {
  const seen = new Set<string>();
  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .sort((a, b) => a.localeCompare(b, "he"))
    .map((value) => ({ label: labeler ? labeler(value) : value, value }));
}

function importedField(doc: ImportedDocumentCard, keys: string[]): string | null {
  for (const key of keys) {
    const value = doc.extracted_fields?.[key];
    if (value === undefined || value === null || value === "") continue;
    return String(value).trim() || null;
  }
  return null;
}

function importedSupplier(doc: ImportedDocumentCard): string {
  return importedField(doc, ["supplier_name", "vendor_name", "counterparty", "issuer_name", "company_name", "client_company"]) ?? "ספק לא מזוהה";
}

function importedDocType(doc: ImportedDocumentCard): string {
  const value = importedField(doc, ["document_subtype", "invoice_type", "receipt_type"]) ?? doc.document_type ?? doc.document_kind ?? "מסמך";
  const normalized = value.toLowerCase();
  if (/receipt|קבלה/.test(normalized)) return "קבלה";
  if (/order|הזמנה/.test(normalized)) return "אישור הזמנה";
  if (/payment|תשלום/.test(normalized)) return "אישור תשלום";
  if (/invoice|bill|חשבונית|חיוב/.test(normalized)) return "חשבונית";
  return value;
}

function documentMatchesFlow(doc: GmailImportedDocument, flow: "invoice" | "inspection"): boolean {
  const kind = String(doc.document_kind ?? "").toLowerCase();
  const type = String(doc.document_type ?? "").toLowerCase();
  const extractedType = String(doc.extracted_fields?.document_subtype ?? doc.extracted_fields?.invoice_type ?? doc.extracted_fields?.receipt_type ?? "").toLowerCase();
  const text = `${kind} ${type} ${extractedType}`;
  if (flow === "inspection") {
    return /inspection|תסקיר|בדיקה|ציוד|הרמה/.test(text);
  }
  return Boolean(doc.invoice_id) || /invoice|receipt|bill|חשבונית|קבלה|חיוב|דרישת\s*תשלום/.test(text);
}

function importedBusiness(doc: ImportedDocumentCard): string {
  return doc.business ?? importedField(doc, ["business", "business_name", "expense_business", "client_company", "client_name"]) ?? "Business";
}

function importedAmount(doc: ImportedDocumentCard): string {
  const raw = importedField(doc, ["amount", "total_amount", "amount_due", "total_to_pay", "total"]);
  if (!raw) return "—";
  const numeric = Number(String(raw).replace(/[₪$€£,\s]/g, ""));
  if (Number.isFinite(numeric)) {
    const currency = normalizeCurrencyCode(importedField(doc, ["currency"]) ?? raw);
    try {
      return new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(numeric);
    } catch {
      return `${numeric.toLocaleString("he-IL")} ${currency}`;
    }
  }
  return raw;
}

function normalizeCurrencyCode(value: unknown): string {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text || /₪|ש"?ח|שקל|NIS|ILS/.test(text)) return "ILS";
  if (/\$|USD|DOLLAR/.test(text)) return "USD";
  if (/€|EUR/.test(text)) return "EUR";
  if (/£|GBP/.test(text)) return "GBP";
  return /^[A-Z]{3}$/.test(text) ? text : "ILS";
}

function importedDateValue(doc: ImportedDocumentCard): string | null {
  return importedField(doc, ["issue_date", "invoice_date", "receipt_date", "date"]) ?? doc.import_date ?? doc.created_at ?? doc.sourceDate;
}

function importedDocumentTime(doc: ImportedDocumentCard): number | null {
  const value = importedDateValue(doc);
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function importedDisplayDate(doc: ImportedDocumentCard): string {
  const ts = importedDocumentTime(doc);
  return ts ? new Date(ts).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function importedStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "בתור",
    processing: "בעיבוד",
    done: "חדש",
    error: "שגיאה",
  };
  return labels[status] ?? status;
}

function importedDocPreviewSrc(doc: ImportedDocumentCard): string {
  return `${api.documents.downloadUrl(doc.id)}?raw=1`;
}

function importedDocThumbnailSrc(doc: ImportedDocumentCard): string | null {
  return doc.thumbnail_url ?? null;
}

function isPdfDoc(doc: ImportedDocumentCard): boolean {
  return doc.mime_type === "application/pdf" || doc.file_name.toLowerCase().endsWith(".pdf");
}

function isImageDoc(doc: ImportedDocumentCard): boolean {
  return Boolean(doc.mime_type?.startsWith("image/"));
}

function openImportedDocument(doc: ImportedDocumentCard) {
  window.open(`/documents/${doc.id}`, "_blank");
}

function downloadImportedDocument(doc: ImportedDocumentCard) {
  window.open(`${api.documents.downloadUrl(doc.id)}?dl=1`, "_blank");
}

function renderActionIcon(icon: Component) {
  return () => h(NIcon, { component: icon });
}

function importedDocActionOptions(doc: ImportedDocumentCard) {
  return [
    { label: "פתח מסמך", key: "open", icon: renderActionIcon(EyeOutline) },
    { label: "ייצא מסמך", key: "download", icon: renderActionIcon(DownloadOutline) },
    { type: "divider", key: "d1" },
    {
      label: "הגדר עסק",
      key: "business",
      disabled: !doc.invoice_id,
      icon: renderActionIcon(BriefcaseOutline),
      children: [
        { label: "Business", key: "business:Business" },
        { label: "עסק חדש...", key: "business:custom" },
      ],
    },
    {
      label: "הגדר קטגוריית הוצאה",
      key: "category",
      disabled: !doc.invoice_id,
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
      disabled: !doc.invoice_id,
      icon: renderActionIcon(ArchiveOutline),
      props: { style: "color: var(--color-error, #d03050)" },
    },
  ];
}

async function handleImportedDocAction(key: string, doc: ImportedDocumentCard) {
  if (key === "open") return openImportedDocument(doc);
  if (key === "download") return downloadImportedDocument(doc);
  if (key === "archive") return updateImportedInvoiceStatus(doc, "archived");
  if (key === "business:custom") return openImportedBusinessModal(doc);
  if (key.startsWith("business:")) return updateImportedInvoiceMeta(doc, { business: key.slice("business:".length) });
  if (key.startsWith("category:")) return updateImportedInvoiceMeta(doc, { expense_category: key.slice("category:".length) });
}

function openImportedBusinessModal(doc: ImportedDocumentCard) {
  importedBusinessModal.value = {
    show: true,
    doc,
    value: importedBusiness(doc) === "Business" ? "" : importedBusiness(doc),
  };
}

async function saveImportedBusinessModal() {
  const doc = importedBusinessModal.value.doc;
  const value = importedBusinessModal.value.value.trim();
  if (!doc || !value) return;
  await updateImportedInvoiceMeta(doc, { business: value });
  importedBusinessModal.value.show = false;
}

async function updateImportedInvoiceStatus(doc: ImportedDocumentCard, status: string) {
  if (!doc.invoice_id) return;
  try {
    const updated = await api.invoices.update(doc.invoice_id, { status });
    patchImportedInvoice(doc.id, updated);
    message.success("הסטטוס עודכן");
  } catch {
    message.error("שגיאה בעדכון הסטטוס");
  }
}

async function updateImportedInvoiceMeta(doc: ImportedDocumentCard, body: { business?: string; expense_category?: string }) {
  if (!doc.invoice_id) return;
  try {
    const updated = await api.invoices.update(doc.invoice_id, body);
    patchImportedInvoice(doc.id, updated);
    message.success("המסמך עודכן");
  } catch {
    message.error("שגיאה בעדכון המסמך");
  }
}

function patchImportedInvoice(documentId: string, invoice: Awaited<ReturnType<typeof api.invoices.update>>) {
  historyItems.value = historyItems.value.map((item) => ({
    ...item,
    files: item.files?.map((file) => file.document?.id === documentId
      ? {
          ...file,
          document: {
            ...file.document,
            invoice_id: invoice.id,
            invoice_status: invoice.status,
            possible_not_invoice: invoice.possible_not_invoice,
            invoice_validation_status: invoice.invoice_validation_status,
            missing_required_fields: invoice.missing_required_fields,
            business: invoice.business,
            expense_category: invoice.expense_category,
          },
        }
      : file),
  }));
}
</script>

<style scoped>
.page-wrap {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.gmail-section-nav {
  position: fixed;
  top: 138px;
  right: max(16px, calc((100vw - 1200px) / 2 - 128px));
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 118px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  box-shadow: 0 10px 26px color-mix(in srgb, var(--text-primary) 9%, transparent);
}

.gmail-section-nav__link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  border-radius: 7px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.gmail-section-nav__link:hover {
  background: color-mix(in srgb, var(--brand-color) 10%, transparent);
  color: var(--brand-color);
}

.gmail-section-nav__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.74;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.load-more-wrap {
  display: flex;
  justify-content: center;
  padding: 10px 0;
}

.connected-email {
  font-size: 14px;
  font-weight: 400;
  color: var(--text-color-3, #999);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.gmail-flow-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  max-width: 760px;
  margin: 0 auto 18px;
  padding: 6px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}

.gmail-flow-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.gmail-flow-tab:hover {
  color: var(--brand-color);
  background: color-mix(in srgb, var(--brand-color) 7%, transparent);
}

.gmail-flow-tab--active {
  border-color: var(--brand-color);
  background: color-mix(in srgb, var(--brand-color) 11%, var(--bg-card));
  color: var(--brand-color);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 80px 0;
  color: var(--n-text-color-3);
}

.guided-import {
  margin: 28px auto 24px;
  max-width: 760px;
}

.guided-import__head {
  margin-bottom: 18px;
  text-align: center;
}

.guided-import__head h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
}

.guided-import__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.guided-import-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-height: 154px;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  text-align: right;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.guided-import-card:hover {
  border-color: var(--brand-color);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--text-primary) 10%, transparent);
  transform: translateY(-1px);
}

.guided-import-card__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--brand-color) 12%, var(--bg-card));
  color: var(--brand-color);
}

.guided-import-card__title {
  font-size: 17px;
  font-weight: 800;
}

.guided-import-card__text {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.guided-flow-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--brand-color) 32%, var(--border-color));
  border-radius: 8px;
  background: color-mix(in srgb, var(--brand-color) 7%, var(--bg-card));
}

.guided-flow-bar__label {
  display: block;
  margin-bottom: 2px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.guided-flow-bar__query {
  min-width: 0;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 12px;
  direction: ltr;
}

.inbox-table-block {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.gmail-search-section,
.gmail-docs-section,
.history-section {
  scroll-margin-top: 86px;
}

.inbox-table-wrap {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: auto;
  max-height: min(53vh, 760px);
}

.inbox-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
}

.inbox-table th,
.inbox-table td {
  padding: 6px 8px;
  text-align: right;
  vertical-align: middle;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  line-height: 1.3;
}

.inbox-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  padding: 6px 8px;
}

.inbox-table tbody tr:last-child td {
  border-bottom: none;
}

.inbox-row:hover td {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
}

.col-from {
  width: 34%;
}

.col-subject {
  width: 18%;
}

.col-date {
  width: 88px;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 12px;
}

.col-file {
  width: 16%;
}

.col-actions {
  width: 108px;
  white-space: nowrap;
}

.col-from,
.col-subject,
.col-file {
  overflow: hidden;
}

.inbox-from,
.inbox-subject,
.inbox-file__name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inbox-from {
  font-weight: 600;
  font-size: 12px;
  color: var(--text-primary);
}

.inbox-subject {
  color: var(--text-primary);
  font-size: 12px;
}

.inbox-file {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.inbox-file__icon {
  flex: 0 0 auto;
  color: var(--brand-color);
}

.inbox-file__name {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  font-weight: 600;
}

.inbox-row-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 2px;
}

.icon-btn {
  padding: 2px;
  min-width: 26px;
  min-height: 26px;
  justify-content: center;
}

.inbox-row-actions__tip {
  display: inline-flex;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.file-type-checks {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-divider {
  width: 1px;
  height: 24px;
  background: var(--n-border-color, #555);
  margin: 0 4px;
}

/* Import results modal */
.import-results__summary {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.import-results__stat {
  font-size: 15px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 8px;
}

.import-results__stat--ok {
  background: color-mix(in srgb, var(--brand-color) 15%, transparent);
  color: var(--brand-color);
}

.import-results__stat--skip {
  background: color-mix(in srgb, var(--text-secondary) 10%, transparent);
  color: var(--text-secondary);
}

.import-results__stat--err {
  background: color-mix(in srgb, #e74c3c 15%, transparent);
  color: #e74c3c;
}

.import-results__table {
  width: 100%;
  border-collapse: collapse;
}

.import-results__table th,
.import-results__table td {
  padding: 8px 10px;
  text-align: right;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
}

.import-results__table th {
  font-weight: 700;
  color: var(--text-secondary);
}

.import-results__file {
  max-width: 350px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gmail-docs-section {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.gmail-docs-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.gmail-docs-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
}

.gmail-docs-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.gmail-docs-view,
.gmail-doc-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.gmail-doc-filters {
  margin-bottom: 16px;
}

.gmail-doc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 16px;
}

.gmail-doc-card {
  position: relative;
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.gmail-doc-card:hover {
  border-color: var(--brand-color);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text-primary) 10%, transparent);
  transform: translateY(-1px);
}

.gmail-doc-card__status {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
}

.gmail-doc-card__preview {
  height: 210px;
  background: color-mix(in srgb, var(--bg-elevated) 82%, var(--bg-card));
  border-bottom: 1px solid var(--border-color);
  overflow: hidden;
}

.gmail-doc-card__preview img,
.gmail-doc-card__preview iframe {
  width: 100%;
  border: 0;
  object-fit: cover;
  background: #fff;
}

.gmail-doc-card__fallback {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-secondary);
}

.gmail-doc-card__body {
  padding: 12px 14px 14px;
  min-width: 0;
}

.gmail-doc-card__supplier,
.gmail-doc-card__source,
.gmail-doc-table__file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gmail-doc-card__supplier {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.gmail-doc-card__amount {
  margin-top: 4px;
  font-size: 20px;
  line-height: 1.2;
  font-weight: 800;
  color: var(--text-primary);
}

.gmail-doc-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-secondary);
}

.gmail-doc-card__source {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.gmail-doc-card__download {
  margin-top: 10px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 9px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--brand-color) 13%, var(--bg-card));
  color: var(--brand-color);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.status-pill--queued,
.status-pill--processing {
  background: color-mix(in srgb, #f0b429 16%, var(--bg-card));
  color: #a16207;
}

.status-pill--error {
  background: color-mix(in srgb, #e74c3c 14%, var(--bg-card));
  color: #c0392b;
}

.gmail-doc-table-wrap {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  overflow: auto;
}

.gmail-doc-table {
  width: 100%;
  min-width: 900px;
  border-collapse: separate;
  border-spacing: 0;
}

.gmail-doc-table th,
.gmail-doc-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  text-align: right;
  font-size: 13px;
  white-space: nowrap;
}

.gmail-doc-table th {
  color: var(--text-secondary);
  background: var(--bg-elevated);
  font-weight: 800;
}

.gmail-doc-table tbody tr:last-child td {
  border-bottom: none;
}

.gmail-doc-table__amount {
  font-weight: 800;
  color: var(--text-primary);
}

.gmail-doc-table__actions,
.gmail-doc-table__actions-head {
  width: 72px;
}

.gmail-doc-status-select {
  width: 112px;
}

.gmail-doc-row-action {
  color: var(--text-secondary);
}

.gmail-doc-row-action:hover {
  color: var(--brand-color);
}

.gmail-business-modal {
  width: 460px;
  max-width: calc(100vw - 32px);
}

:global(.gmail-business-modal.n-card) {
  width: 460px !important;
  max-width: calc(100vw - 32px) !important;
}

.gmail-business-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.gmail-business-form__actions {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
}

.gmail-docs-empty {
  padding: 28px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  text-align: center;
  color: var(--text-secondary);
  background: var(--bg-card);
}

.gmail-doc-pagination {
  display: flex;
  justify-content: center;
  padding-top: 16px;
}

@media (max-width: 1480px) {
  .gmail-section-nav {
    position: static;
    flex-direction: row;
    width: 100%;
    margin-bottom: 16px;
    overflow-x: auto;
  }

  .gmail-section-nav__link {
    flex: 0 0 auto;
  }
}

@media (max-width: 720px) {
  .guided-import__actions {
    grid-template-columns: 1fr;
  }

  .guided-flow-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .guided-flow-bar__query {
    max-width: none;
  }

  .gmail-docs-head {
    flex-direction: column;
    align-items: stretch;
  }

  .gmail-docs-view,
  .gmail-doc-filters {
    width: 100%;
  }

  .gmail-doc-filters :deep(.n-input),
  .gmail-doc-filters :deep(.n-select),
  .gmail-doc-filters :deep(.n-date-picker) {
    width: 100% !important;
    max-width: none !important;
  }

  .gmail-doc-grid {
    grid-template-columns: 1fr;
  }
}

/* History section */
.history-section {
  margin-top: 32px;
  border-top: 1px solid var(--border-color);
  padding-top: 16px;
}

.history-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.history-chevron {
  display: inline-block;
  transition: transform 0.2s;
  font-size: 14px;
}

.history-chevron.open {
  transform: rotate(90deg);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}

.history-item__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.history-item__subject {
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.history-item__date {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.history-item__files {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.history-file {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--brand-color) 10%, transparent);
  color: var(--text-primary);
}

.history-file--err {
  background: color-mix(in srgb, #e74c3c 10%, transparent);
}
</style>
