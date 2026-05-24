<template>
  <div>
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
      <n-h2 style="margin: 0">מסמכים</n-h2>
      <n-space>
        <!-- Hidden file input — triggered by the button below -->
        <input
          ref="fileInput"
          type="file"
          multiple
          accept=".pdf,.docx,.xlsx,.txt,.md,.png,.jpg,.jpeg,.tif,.tiff"
          style="display: none"
          @change="onFileInputChange"
        />
        <n-button @click="fileInput?.click()" :loading="uploading" :disabled="limitReached">📂 בחר קבצים</n-button>
        <n-button type="primary" @click="showImport = true" :disabled="limitReached">+ נתיב שרת</n-button>
        <n-button type="warning" :loading="rescanning" @click="doRescan">↻ סריקה מחדש</n-button>
        <n-button type="error" :loading="deletingCorrupt" @click="doDeleteCorrupt">🗑 מחק פגומים</n-button>
      </n-space>
    </n-space>

    <!-- Quota counter for role 'user' -->
    <div v-if="isRegularUser" style="margin-bottom: 12px">
      <n-space justify="space-between" style="margin-bottom: 4px">
        <span style="font-size: 13px; color: var(--text-secondary)">
          מסמכים שהועלו: {{ store.total }} / {{ settingsStore.userDocumentLimit }}
        </span>
        <span v-if="limitReached" style="font-size: 13px; color: #e88080; font-weight: 600">
          הגעת למגבלה — שדרג ל-Pro
        </span>
      </n-space>
      <n-progress
        type="line"
        :percentage="quotaPercent"
        :color="quotaPercent >= 100 ? '#e88080' : quotaPercent >= 80 ? '#f0a020' : '#18a058'"
        :rail-color="'rgba(128,128,128,0.15)'"
        :show-indicator="false"
        style="margin-bottom: 4px"
      />
    </div>

    <!-- Drag-drop zone -->
    <div
      class="drop-zone"
      :class="{ 'drop-zone--active': isDragging, 'drop-zone--disabled': limitReached }"
      @dragover.prevent="!limitReached && (isDragging = true)"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="!limitReached && onDrop($event)"
    >
      <span v-if="limitReached" style="color: #e88080">הגעת למגבלת {{ settingsStore.userDocumentLimit }} המסמכים</span>
      <span v-else-if="isDragging">שחרר כאן לייבוא...</span>
      <span v-else style="color: #666">גרור קבצים לכאן (PDF, DOCX, XLSX, PNG...)</span>
    </div>

    <n-alert
      v-if="queuedCount > 0"
      type="info"
      style="margin-bottom: 12px"
      :title="`${queuedCount} מסמכים בתור עיבוד`"
      closable
      @close="queuedCount = 0"
    />

    <n-data-table
      :columns="columns"
      :data="store.rows"
      :loading="store.loading"
      :pagination="{ pageSize: 20 }"
      :row-key="(r: any) => r.id"
    />

    <!-- Server-path import modal (for files already on the server machine) -->
    <n-modal v-model:show="showImport" title="ייבוא לפי נתיב שרת" preset="dialog" style="width: 520px">
      <n-alert type="info" :show-icon="false" style="margin-bottom: 12px">
        השתמש באפשרות זו רק כאשר הקובץ נמצא כבר על מחשב השרת
      </n-alert>
      <n-space vertical>
        <n-input
          v-model:value="importPath"
          placeholder="C:\Documents\contract.pdf"
          clearable
          @keyup.enter="doImportPath"
        />
        <n-button type="primary" :loading="importing" @click="doImportPath" block>ייבוא</n-button>
      </n-space>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, h } from "vue";
const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
import { useRouter } from "vue-router";
import { NH2, NSpace, NButton, NDataTable, NModal, NInput, NAlert, NProgress, useMessage } from "naive-ui";
import { useDocumentsStore } from "../stores/documents.js";
import { useSettingsStore } from "../stores/settings.js";
import { useAuthStore } from "../stores/auth.js";
import { api } from "../services/apiService.js";
import StatusBadge from "../components/StatusBadge.vue";
import type { Document } from "@shared/types.js";

const store = useDocumentsStore();
const settingsStore = useSettingsStore();
const authStore = useAuthStore();
const router = useRouter();

const isRegularUser = computed(() => authStore.user?.role === "user");
const quotaPercent = computed(() =>
  Math.min(100, Math.round((store.total / settingsStore.userDocumentLimit) * 100))
);
const limitReached = computed(() => isRegularUser.value && store.total >= settingsStore.userDocumentLimit);
const message = useMessage();

const fileInput = ref<HTMLInputElement | null>(null);
const showImport = ref(false);
const importPath = ref("");
const importing = ref(false);
const uploading = ref(false);
const isDragging = ref(false);
const queuedCount = ref(0);
const rescanning = ref(false);
const deletingCorrupt = ref(false);

onMounted(() => store.fetch());

// ── Browser file picker ───────────────────────────────────────────────────────
async function onFileInputChange(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? []);
  if (!files.length) return;
  (e.target as HTMLInputElement).value = ""; // reset so same file can be re-selected
  await uploadFiles(files);
}

// ── Drag & drop ───────────────────────────────────────────────────────────────
async function onDrop(e: DragEvent) {
  isDragging.value = false;
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length) await uploadFiles(files);
}

// ── Upload to server ──────────────────────────────────────────────────────────
async function uploadFiles(files: File[]) {
  uploading.value = true;
  try {
    const { ids } = await api.documents.upload(files);
    queuedCount.value += ids.length;
    message.info(`${ids.length} מסמכים נוספו לתור עיבוד`);
    store.fetch();
  } catch (e: any) {
    if (e?.message === "document_limit_reached") {
      message.error("הגעת למגבלת ${settingsStore.userDocumentLimit} המסמכים. שדרג לחשבון Pro להעלאה בלתי מוגבלת.");
    } else {
      message.error(String(e));
    }
  } finally {
    uploading.value = false;
  }
}

// ── Server-path import ────────────────────────────────────────────────────────
async function doImportPath() {
  if (!importPath.value.trim()) return;
  importing.value = true;
  try {
    await api.documents.import(importPath.value.trim());
    queuedCount.value++;
    message.info("המסמך נוסף לתור עיבוד");
    showImport.value = false;
    importPath.value = "";
    store.fetch();
  } catch (e: any) {
    if (e?.message?.includes("document_limit_reached")) {
      message.error("הגעת למגבלת ${settingsStore.userDocumentLimit} המסמכים. שדרג לחשבון Pro להעלאה בלתי מוגבלת.");
    } else {
      message.error(String(e));
    }
  } finally {
    importing.value = false;
  }
}

// ── Rescan corrupt documents ──────────────────────────────────────────────────
async function doRescan() {
  rescanning.value = true;
  try {
    const res = await fetch(`${SERVER}/api/documents/rescan`, { method: "POST", credentials: "include" });
    const data = await res.json() as { queued: number };
    if (data.queued === 0) {
      message.info("אין מסמכים שגויים לסריקה מחדש");
    } else {
      message.success(`${data.queued} מסמכים נשלחו לסריקה מחדש`);
      queuedCount.value += data.queued;
    }
    await store.fetch();
  } catch {
    message.error("שגיאה בסריקה מחדש");
  } finally {
    rescanning.value = false;
  }
}

// ── Delete corrupt documents ──────────────────────────────────────────────────
async function doDeleteCorrupt() {
  deletingCorrupt.value = true;
  try {
    const res = await fetch(`${SERVER}/api/documents/corrupt`, { method: "DELETE", credentials: "include" });
    const data = await res.json() as { deleted: number };
    if (data.deleted === 0) {
      message.info("אין מסמכים פגומים למחיקה");
    } else {
      message.success(`${data.deleted} מסמכים פגומים נמחקו`);
    }
    await store.fetch();
  } catch {
    message.error("שגיאה במחיקת מסמכים פגומים");
  } finally {
    deletingCorrupt.value = false;
  }
}

// ── Table ─────────────────────────────────────────────────────────────────────
const columns = [
  {
    title: "שם קובץ",
    key: "file_name",
    render: (row: Document) =>
      h("a", { style: "cursor:pointer;color:#63e2b7", onClick: () => router.push(`/documents/${row.id}`) }, row.file_name),
  },
  { title: "סוג", key: "mime_type", width: 200 },
  {
    title: "סטטוס",
    key: "processing_status",
    width: 110,
    render: (row: Document) => h(StatusBadge, { status: row.processing_status }),
  },
  { title: "תאריך ייבוא", key: "import_date", width: 160 },
  {
    title: "",
    key: "actions",
    width: 120,
    render: (row: Document) =>
      h(NSpace, { size: "small" }, {
        default: () => [
          h(NButton, { size: "small", onClick: () => { api.documents.reprocess(row.id); store.fetch(); } }, { default: () => "↻" }),
          h(NButton, { size: "small", type: "error", onClick: () => store.deleteDoc(row.id) }, { default: () => "מחק" }),
        ],
      }),
  },
];
</script>

<style scoped>
.drop-zone {
  border: 2px dashed #444;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  margin-bottom: 16px;
  transition: border-color 0.2s, background 0.2s;
  cursor: pointer;
}
.drop-zone--active {
  border-color: #63e2b7;
  background: rgba(99, 226, 183, 0.06);
}
.drop-zone--disabled {
  border-color: #e88080;
  background: rgba(232, 128, 128, 0.05);
  cursor: not-allowed;
  opacity: 0.7;
}
</style>
