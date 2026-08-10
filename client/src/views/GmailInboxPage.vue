<template>
  <div class="page-wrap" dir="rtl">
    <div class="page-header">
      <h1 class="page-title">Gmail — חשבוניות PDF</h1>
      <div class="header-actions">
        <n-input
          v-if="connected"
          v-model:value="searchQuery"
          placeholder="חיפוש (Gmail query)"
          clearable
          style="width:280px"
          @keydown.enter="loadInbox"
        >
          <template #prefix><n-icon :component="SearchOutline" /></template>
        </n-input>
        <n-button v-if="connected" :loading="loading" type="primary" @click="loadInbox">
          <template #icon><n-icon :component="RefreshOutline" /></template>
          רענן
        </n-button>
        <n-button v-if="connected" quaternary type="error" @click="disconnect">
          נתק Gmail
        </n-button>
        <n-button v-if="!connected && !loading" type="primary" @click="connectGmail">
          <template #icon><n-icon :component="LogoGoogle" /></template>
          חבר Gmail
        </n-button>
      </div>
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
      </div>
    </template>

    <!-- Import drawer -->
    <n-drawer v-model:show="importDrawer.show" :width="480" placement="left">
      <n-drawer-content :title="importDrawer.subject" closable>
        <div v-for="att in importDrawer.attachments" :key="att.attachmentId" class="att-row">
          <n-icon :component="DocumentOutline" />
          <span class="att-name">{{ att.filename }}</span>
          <span class="att-size">{{ formatSize(att.size) }}</span>
          <n-button
            size="small"
            type="primary"
            :loading="importing[att.attachmentId]"
            @click="importAttachment(importDrawer.messageId, att)"
          >
            ייבא
          </n-button>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { h, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import {
  NButton, NDataTable, NDrawer, NDrawerContent, NIcon, NInput, NSpin,
  useMessage, type DataTableColumns,
} from "naive-ui";
import { DocumentOutline, LogoGoogle, RefreshOutline, SearchOutline } from "@vicons/ionicons5";
import { api, type GmailAttachment, type GmailEmail } from "../services/apiService.js";

const route = useRoute();
const message = useMessage();

const connected = ref(false);
const loading = ref(false);
const emails = ref<GmailEmail[]>([]);
const searchQuery = ref("has:attachment filename:pdf");
const importing = ref<Record<string, boolean>>({});
const importDrawer = ref<{ show: boolean; messageId: string; subject: string; attachments: GmailAttachment[] }>({
  show: false, messageId: "", subject: "", attachments: [],
});

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
  try {
    const { emails: rows } = await api.gmail.inbox(searchQuery.value || undefined);
    emails.value = rows;
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

async function disconnect() {
  await api.gmail.disconnect();
  connected.value = false;
  emails.value = [];
  message.success("Gmail נותק");
}

async function importAttachment(messageId: string, att: GmailAttachment) {
  importing.value[att.attachmentId] = true;
  try {
    const url = api.gmail.attachmentUrl(messageId, att.attachmentId, att.filename);
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const file = new File([blob], att.filename, { type: "application/pdf" });

    const fd = new FormData();
    fd.append("files", file);
    const uploadRes = await fetch("/api/documents/upload", { method: "POST", body: fd, credentials: "include" });
    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

    message.success(`${att.filename} יובא בהצלחה`);
  } catch (err: any) {
    message.error(`שגיאה: ${err.message}`);
  } finally {
    importing.value[att.attachmentId] = false;
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
    const { connected: c } = await api.gmail.status();
    connected.value = c;
    if (c) await loadInbox();
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
</style>
