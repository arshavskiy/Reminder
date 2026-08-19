<template>
  <div class="page-wrap" dir="rtl">
    <div class="page-header">
      <h1 class="page-title">Gmail — קבצים מצורפים <span v-if="connectedEmail" class="connected-email">({{ connectedEmail }})</span></h1>
      <div class="header-actions">
        <n-button v-if="connected" :loading="loading" type="primary" @click="loadInbox">
          <template #icon><n-icon :component="RefreshOutline" /></template>
          רענן
        </n-button>
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
        <p>לא נמצאו מיילים עם קבצי PDF מצורפים</p>
      </div>

      <div v-else class="inbox-table-wrap">
        <n-data-table
          :columns="columns"
          :data="emails"
          :row-key="(r) => r.id"
          size="small"
          :max-height="600"
          virtual-scroll
        />
        <div v-if="nextPageToken" class="load-more-wrap">
          <n-button :loading="loadingMore" @click="loadMore">
            טען עוד
            <template v-if="totalEstimate"> ({{ emails.length }} מתוך ~{{ totalEstimate }})</template>
          </n-button>
        </div>
      </div>
    </template>

    <!-- Import drawer -->
    <n-drawer v-model:show="importDrawer.show" :width="480" placement="left">
      <n-drawer-content :title="importDrawer.subject" closable>
        <div v-for="att in importDrawer.attachments" :key="att.attachmentId" class="att-row">
          <n-icon :component="DocumentOutline" />
          <span class="att-name">{{ att.filename }}</span>
          <span class="att-size">{{ formatSize(att.size) }}</span>
          <div class="att-actions">
            <n-button size="small" quaternary @click="previewAttachment(importDrawer.messageId, att)">
              <template #icon><n-icon :component="EyeOutline" /></template>
            </n-button>
            <n-button size="small" quaternary @click="downloadAttachment(importDrawer.messageId, att)">
              <template #icon><n-icon :component="DownloadOutline" /></template>
            </n-button>
            <n-button
              size="small"
              type="primary"
              :loading="importing[att.attachmentId]"
              @click="importAttachment(importDrawer.messageId, att)"
            >
              ייבא
            </n-button>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { h, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import {
  NButton, NCheckbox, NDataTable, NDatePicker, NDrawer, NDrawerContent, NIcon, NInput, NSelect, NSpin,
  useMessage, type DataTableColumns, type SelectOption,
} from "naive-ui";
import { CloudDownloadOutline, DocumentOutline, DownloadOutline, EyeOutline, LogoGoogle, RefreshOutline, SearchOutline } from "@vicons/ionicons5";
import { api, type GmailAttachment, type GmailEmail } from "../services/apiService.js";

const route = useRoute();
const message = useMessage();

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
const importDrawer = ref<{ show: boolean; messageId: string; subject: string; attachments: GmailAttachment[] }>({
  show: false, messageId: "", subject: "", attachments: [],
});

// File type checkboxes
const fileTypes = ref({ pdf: true, doc: false, xls: false, img: false });

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
  if (exts.length) {
    for (const ext of exts) parts.push(`filename:${ext}`);
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

function previewAttachment(messageId: string, att: GmailAttachment) {
  const url = api.gmail.attachmentUrl(messageId, att.attachmentId, att.filename) + "&preview=1";
  window.open(url, "_blank");
}

function downloadAttachment(messageId: string, att: GmailAttachment) {
  const url = api.gmail.attachmentUrl(messageId, att.attachmentId, att.filename);
  const a = document.createElement("a");
  a.href = url;
  a.download = att.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const columns: DataTableColumns<GmailEmail> = [
  {
    title: "מאת",
    key: "from",
    width: 200,
    ellipsis: { tooltip: true },
    render: (row) => formatFrom(row.from),
  },
  {
    title: "נושא",
    key: "subject",
    ellipsis: { tooltip: true },
  },
  {
    title: "תאריך",
    key: "date",
    width: 130,
    render: (row) => formatDate(row.internalDate),
  },
  {
    title: "קבצים",
    key: "attachments",
    width: 80,
    render: (row) => `${row.attachments.length} PDF`,
  },
  {
    title: "",
    key: "actions",
    width: 100,
    render: (row) =>
      h(NButton, {
        size: "small",
        type: "primary",
        ghost: true,
        onClick: () => openImport(row),
      }, { default: () => "ייבא" }),
  },
];

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

function openImport(row: GmailEmail) {
  importDrawer.value = { show: true, messageId: row.id, subject: row.subject, attachments: row.attachments };
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
  importing.value[att.attachmentId] = true;
  try {
    await api.gmail.importAttachment(messageId, att.attachmentId, att.filename);
    message.success(`${att.filename} יובא בהצלחה`);
  } catch (err: any) {
    message.error(`שגיאה: ${err.message}`);
  } finally {
    importing.value[att.attachmentId] = false;
  }
}

async function importAllNew() {
  importingAll.value = true;
  try {
    const result = await api.gmail.importAll(searchQuery.value || undefined);
    if (result.imported > 0) {
      message.success(`יובאו ${result.imported} קבצים חדשים (${result.skipped} כבר קיימים)`);
    } else {
      message.info(`אין קבצים חדשים לייבוא (${result.skipped} כבר יובאו)`);
    }
  } catch (err: any) {
    message.error(`שגיאה בייבוא: ${err.message}`);
  } finally {
    importingAll.value = false;
  }
}

onMounted(async () => {
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
      await loadInbox();
    }
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.page-wrap {
  padding: 24px;
  max-width: 1100px;
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
  padding: 16px 0;
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

.inbox-table-wrap {
  border-radius: 8px;
  overflow: hidden;
}

.att-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--n-border-color);
}

.att-name {
  flex: 1;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.att-size {
  font-size: 12px;
  color: var(--n-text-color-3);
  white-space: nowrap;
}

.att-actions {
  display: flex;
  align-items: center;
  gap: 4px;
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
</style>
