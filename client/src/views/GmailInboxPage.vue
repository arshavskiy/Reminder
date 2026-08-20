<template>
  <div class="page-wrap" dir="rtl">
    <div class="page-header">
      <h1 class="page-title">Gmail — קבצים מצורפים <span v-if="connectedEmail" class="connected-email">({{ connectedEmail }})</span></h1>
      <div class="header-actions">
        <n-button v-if="connected" :loading="loading" type="primary" @click="loadInbox">
          <template #icon><n-icon :component="RefreshOutline" /></template>
          רענן
        </n-button>
        <n-select
          v-if="connected"
          v-model:value="selectedTemplateId"
          :options="templateOptions"
          clearable
          placeholder="תבנית אוטומטית"
          size="small"
          style="width: 200px"
        />
        <n-button v-if="connected" type="success" :loading="importingAll" @click="importAllNew">
          <template #icon><n-icon :component="CloudDownloadOutline" /></template>
          ייבא הכל
        </n-button>
        <n-button v-if="connected && connectionSource === 'oauth'" quaternary type="error" @click="disconnect">
          נתק Gmail
        </n-button>
        <n-button v-if="!connected && !loading" type="primary" @click="connectGmail">
          <template #icon><n-icon :component="LogoGoogle" /></template>
          חבר Gmail
        </n-button>
      </div>
    </div>

    <!-- Filters -->
    <div v-if="connected" class="filter-bar">
      <div class="file-type-checks">
        <n-checkbox v-model:checked="fileTypes.pdf">PDF</n-checkbox>
        <n-checkbox v-model:checked="fileTypes.doc">DOC/DOCX</n-checkbox>
        <n-checkbox v-model:checked="fileTypes.xls">XLS/XLSX</n-checkbox>
        <n-checkbox v-model:checked="fileTypes.img">תמונות</n-checkbox>
      </div>
      <div class="filter-divider" />
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
    <template v-else>
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
    </template>

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

    <!-- Import history -->
    <div v-if="connected && historyItems.length" class="history-section">
      <h3 class="history-title" @click="historyOpen = !historyOpen" style="cursor:pointer">
        היסטוריית ייבוא ({{ historyItems.length }})
        <span class="history-chevron" :class="{ open: historyOpen }">▸</span>
      </h3>
      <div v-if="historyOpen" class="history-list">
        <div v-for="item in historyItems" :key="item.message_id" class="history-item">
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
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import {
  NButton, NCheckbox, NDatePicker, NIcon, NInput, NModal, NSelect, NSpin, NTooltip,
  useMessage, type SelectOption,
} from "naive-ui";
import { CloudDownloadOutline, DocumentOutline, DownloadOutline, EyeOutline, LogoGoogle, RefreshOutline, SearchOutline } from "@vicons/ionicons5";
import { api, type GmailAttachment, type GmailEmail } from "../services/apiService.js";
import type { DocTemplate } from "../shared/types.js";

const route = useRoute();
const message = useMessage();

const selectedTemplateId = ref<string | null>(null);
const templateOptions = ref<{ label: string; value: string }[]>([]);

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

// Import results modal
const importResults = ref<{
  show: boolean;
  imported: number;
  skipped: number;
  errors: number;
  results: Array<{ messageId: string; filename: string; documentId?: string; error?: string }>;
}>({ show: false, imported: 0, skipped: 0, errors: 0, results: [] });

// Import history
type HistoryItem = { message_id: string; subject: string; imported_at: string; files?: Array<{ filename: string; document_id: string | null; error: string | null }> };
const historyItems = ref<HistoryItem[]>([]);
const historyOpen = ref(false);

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

const filterTypeOptions: SelectOption[] = [
  { label: "ללא", value: "none" },
  { label: "לפי שולח", value: "sender" },
  { label: "לפי תאריך", value: "date" },
  { label: "תסקירים (מספר רישוי)", value: "inspection" },
];

const senderOptions: SelectOption[] = [
  { label: "חברת חשמל", value: "iec.co.il" },
  { label: "Morning (חשבונית ירוקה)", value: "morning.co" },
  { label: "GitHub", value: "github.com" },
  { label: "DigitalOcean", value: "digitalocean.com" },
  { label: "Google", value: "google.com" },
];

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
    parts.push(`from:${filterSender.value}`);
  }
  if (filterType.value === "date" && filterDateRange.value) {
    const [from, to] = filterDateRange.value;
    parts.push(`after:${fmtDate(from)}`, `before:${fmtDate(to + 86400000)}`);
  }
  if (filterType.value === "inspection" && filterIdentifierText.value.trim()) {
    parts.push(`filename:${filterIdentifierText.value.trim()}`);
  }

  searchQuery.value = parts.join(" ");
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
  } catch {
    message.error("שגיאה בהתחברות ל-Gmail");
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
    await api.gmail.importAttachment(messageId, att.attachmentId, att.filename, selectedTemplateId.value ?? undefined);
    message.success(`${att.filename} יובא בהצלחה`);
  } catch (err: any) {
    message.error(`שגיאה: ${err.message}`);
  } finally {
    const next = { ...importing.value };
    delete next[att.attachmentId];
    importing.value = next;
  }
}

async function importAllNew() {
  importingAll.value = true;
  try {
    const result = await api.gmail.importAll(searchQuery.value || undefined, undefined, selectedTemplateId.value ?? undefined);
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
    message.error(`שגיאה בייבוא: ${err.message}`);
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
  api.docTemplates.list().then(templates => {
    templateOptions.value = templates.map(t => ({
      label: `${t.name} (${t.document_kind})`,
      value: t.id,
    }));
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
      buildSearchQuery();
      await Promise.all([loadInbox(), loadHistory()]);
    }
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.page-wrap {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 80px 0;
  color: var(--n-text-color-3);
}

.inbox-table-block {
  display: flex;
  flex-direction: column;
  min-height: 0;
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
