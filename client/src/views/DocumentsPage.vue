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
        <n-button @click="fileInput?.click()" :loading="uploading">📂 בחר קבצים</n-button>
        <n-button type="primary" @click="showImport = true">+ נתיב שרת</n-button>
        <n-button type="warning" :loading="rescanning" @click="doRescan">↻ סריקה מחדש</n-button>
        <n-button type="error" :loading="deletingCorrupt" @click="doDeleteCorrupt">🗑 מחק פגומים</n-button>
      </n-space>
    </n-space>

    <!-- Drag-drop zone -->
    <div
      class="drop-zone"
      :class="{ 'drop-zone--active': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
    >
      <span v-if="isDragging">שחרר כאן לייבוא...</span>
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
import { onMounted, ref, h } from "vue";
const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
import { useRouter } from "vue-router";
import { NH2, NSpace, NButton, NDataTable, NModal, NInput, NAlert, useMessage } from "naive-ui";
import { useDocumentsStore } from "../stores/documents.js";
import { api } from "../services/apiService.js";
import StatusBadge from "../components/StatusBadge.vue";
import type { Document } from "@shared/types.js";

const store = useDocumentsStore();
const router = useRouter();
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
  } catch (e) {
    message.error(String(e));
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
  } catch (e) {
    message.error(String(e));
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
</style>
