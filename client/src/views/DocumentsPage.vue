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
<!--        <n-button type="primary" @click="showImport = true" :disabled="limitReached">+ נתיב שרת</n-button>-->
        <n-button type="warning" :loading="rescanning" @click="doRescan">↻ סריקה מחדש</n-button>
<!--        <n-button type="error" :loading="deletingCorrupt" @click="doDeleteCorrupt">🗑 מחק פגומים</n-button>-->
      </n-space>
    </n-space>

    <!-- Quota counter for role 'user' -->
    <div v-if="isRegularUser" style="margin-bottom: 12px">
      <n-space justify="space-between" style="margin-bottom: 4px">
        <span style="font-size: 13px; color: var(--text-secondary)">
          מסמכים שנסרקו: {{ store.totalAll }} / {{ store.documentLimit }}
        </span>
        <span v-if="limitReached" style="font-size: 13px; color: #e88080; font-weight: 600">
          הגעת למגבלת סריקות — שדרג ל-Pro
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
      <span v-if="limitReached" style="color: #e88080">הגעת למגבלת {{ store.documentLimit }} סריקות</span>
      <span v-else-if="isDragging">שחרר כאן לייבוא...</span>
      <span v-else style="color: #666">גרור קבצים לכאן (PDF, DOCX, XLSX, PNG...)</span>
    </div>

    <!-- Pipeline service flags -->
    <div class="pipeline-flags" style="margin-bottom: 14px">
      <span class="pipeline-flags__label">שירותי עיבוד:</span>
      <n-tooltip placement="top" trigger="hover">
        <template #trigger>
          <n-checkbox v-model:checked="flagOcr">OCR (זיהוי טקסט)</n-checkbox>
        </template>
        הפעל זיהוי תווים אופטי (Tesseract) לחילוץ טקסט מ-PDF ותמונות
      </n-tooltip>
      <n-tooltip placement="top" trigger="hover">
        <template #trigger>
          <n-checkbox v-model:checked="flagAi">AI (חילוץ שדות)</n-checkbox>
        </template>
        הפעל מודל AI לחילוץ אוטומטי של שדות: לקוח, תאריכים, סכומים ועוד
      </n-tooltip>
      <n-tooltip placement="top" trigger="hover">
        <template #trigger>
          <n-checkbox v-model:checked="flagS3">S3 (אחסון ענן)</n-checkbox>
        </template>
        העלה את הקובץ לאחסון ענן (S3). כבה כדי לשמור מקומית בלבד
      </n-tooltip>
      <n-tooltip placement="top" trigger="hover">
        <template #trigger>
          <n-checkbox v-model:checked="flagEntities">ישויות (לקוחות / חוזים)</n-checkbox>
        </template>
        צור אוטומטית לקוחות, חוזים ותזכורות מנתוני הקובץ
      </n-tooltip>
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

    <!-- AI extraction modal — define fields to extract -->
    <n-modal v-model:show="showAiModal" :title="aiModalMode === 'existing' ? 'חילוץ AI — הגדר שדות' : 'העלאה עם AI — הגדר שדות'" preset="card"
      style="width: 580px">
      <n-space size="medium" vertical>
        <div style="font-size: 13px; color: #aaa">
          {{ aiModalMode === 'existing'
            ? 'הגדר אילו שדות ה-AI יחלץ מהמסמך. השאר ריק לחילוץ אוטומטי.'
            : `${pendingFiles?.length ?? 0} קובץ/ים ממתינים. הגדר שדות לחילוץ AI:` }}
        </div>

        <!-- Field rows -->
        <div v-for="(f, i) in extractionFields" :key="i" class="field-row">
          <n-space :wrap="false" align="center">
            <n-input
              v-model:value="f.key"
              placeholder="key (אנגלית)"
              size="small"
              style="width: 140px; direction: ltr"
            />
            <n-input
              v-model:value="f.label_he"
              placeholder="תווית עברית"
              size="small"
              style="flex: 1"
            />
            <n-select
              v-model:value="f.type"
              :options="fieldTypeOptions"
              :virtual-scroll="false"
              size="small"
              style="width: 100px"
            />
            <n-button quaternary size="small" @click="extractionFields.splice(i, 1)">✕</n-button>
          </n-space>
        </div>

        <n-button dashed size="small" @click="addExtractionField">+ הוסף שדה</n-button>

        <div style="font-size: 12px; color: #666; border-top: 1px solid rgba(255,255,255,0.07); padding-top: 10px">
          שדות ריקים = AI יחלץ שדות סטנדרטיים אוטומטית (לקוח, תאריכים, סכומים)
        </div>

        <n-space justify="end">
          <n-button @click="showAiModal = false">ביטול</n-button>
          <n-button v-if="aiModalMode === 'upload'" secondary @click="skipAiModal">
            העלה ללא הגדרה
          </n-button>
          <n-button :loading="extracting" type="primary" @click="confirmAiModal">
            {{ aiModalMode === 'existing' ? 'הרץ חילוץ' : 'העלה ועבד' }}
          </n-button>
        </n-space>
      </n-space>
    </n-modal>

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
        <!-- Pipeline flags (shared with main page — same reactive state) -->
        <div class="pipeline-flags pipeline-flags--modal">
          <span class="pipeline-flags__label">שירותי עיבוד:</span>
          <n-checkbox v-model:checked="flagOcr">OCR</n-checkbox>
          <n-checkbox v-model:checked="flagAi">AI</n-checkbox>
          <n-checkbox v-model:checked="flagS3">S3</n-checkbox>
          <n-checkbox v-model:checked="flagEntities">ישויות</n-checkbox>
        </div>
        <n-button type="primary" :loading="importing" @click="doImportPath" block>ייבוא</n-button>
      </n-space>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import {computed, h, onMounted, onUnmounted, ref, watch} from "vue";
import {useRouter} from "vue-router";
import {
  NAlert,
  NButton,
  NCheckbox,
  NDataTable,
  NH2,
  NInput,
  NModal,
  NProgress,
  NSelect,
  NSpace,
  NTooltip,
  useMessage
} from "naive-ui";
import {useDocumentsStore} from "../stores/documents.js";
import {useAuthStore} from "../stores/auth.js";
import {api} from "../services/apiService.js";
import StatusBadge from "../components/StatusBadge.vue";
import type {Document} from "@shared/types.js";

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const store = useDocumentsStore();
const authStore = useAuthStore();
const router = useRouter();

const isRegularUser = computed(() => authStore.user?.role === "user");
const quotaPercent = computed(() =>
  Math.min(100, Math.round((store.totalAll / store.documentLimit) * 100))
);
const limitReached = computed(() => isRegularUser.value && store.totalAll >= store.documentLimit);
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

// ── AI extraction modal ───────────────────────────────────────────────────────
interface ExtractionField { key: string; label_he: string; type: string }

const showAiModal      = ref(false);
const aiModalMode      = ref<"upload" | "existing">("upload");
const pendingFiles     = ref<File[] | null>(null);
const pendingDocIds    = ref<string[]>([]);
const extractionFields = ref<ExtractionField[]>([]);
const extracting       = ref(false);

const fieldTypeOptions = [
  { label: "טקסט",    value: "text" },
  { label: "מספר",    value: "number" },
  { label: "תאריך",   value: "date" },
  { label: "טלפון",   value: "phone" },
  { label: "אימייל",  value: "email" },
  { label: "מטבע",    value: "currency" },
  { label: "רשימה",   value: "list" },
];

function addExtractionField() {
  extractionFields.value.push({ key: "", label_he: "", type: "text" });
}

function openExtractModal(docId: string) {
  pendingDocIds.value = [docId];
  pendingFiles.value = null;
  aiModalMode.value = "existing";
  extractionFields.value = [];
  showAiModal.value = true;
}

async function skipAiModal() {
  const files = pendingFiles.value;
  showAiModal.value = false;
  pendingFiles.value = null;
  if (files) await uploadFiles(files);
}

async function confirmAiModal() {
  const fields = extractionFields.value.filter(f => f.key.trim() && f.label_he.trim());

  if (aiModalMode.value === "existing") {
    extracting.value = true;
    try {
      for (const id of pendingDocIds.value) {
        await api.documents.extract(id, fields);
      }
      message.success(`חילוץ AI הושלם עבור ${pendingDocIds.value.length} מסמך/ים`);
      await store.fetch();
    } catch (e) {
      message.error(String(e));
    } finally {
      extracting.value = false;
      showAiModal.value = false;
    }
  } else if (pendingFiles.value) {
    showAiModal.value = false;
    await uploadFiles(pendingFiles.value);
    pendingFiles.value = null;
  }
}

// ── Pipeline feature flags ────────────────────────────────────────────────────
const flagOcr      = ref(true);
const flagAi       = ref(true);
const flagS3       = ref(true);
const flagEntities = ref(true);
let saveFlagsTimer: ReturnType<typeof setTimeout> | null = null;

async function loadPipelineFlags() {
  try {
    const s = await api.userSettings.get();
    flagOcr.value      = s.pipeline_ocr      ?? true;
    flagAi.value       = s.pipeline_ai       ?? true;
    flagS3.value       = s.pipeline_s3       ?? true;
    flagEntities.value = s.pipeline_entities ?? true;
  } catch { /* ignore — defaults stay */ }
}

function savePipelineFlags() {
  if (saveFlagsTimer) clearTimeout(saveFlagsTimer);
  saveFlagsTimer = setTimeout(async () => {
    try {
      await api.userSettings.save({
        pipeline_ocr:      flagOcr.value,
        pipeline_ai:       flagAi.value,
        pipeline_s3:       flagS3.value,
        pipeline_entities: flagEntities.value,
      });
    } catch { /* ignore */ }
  }, 600);
}

watch([flagOcr, flagAi, flagS3, flagEntities], savePipelineFlags);

// ── Status polling ────────────────────────────────────────────────────────────
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function hasInProgress(): boolean {
  return store.rows.some(r => r.processing_status === "queued" || r.processing_status === "processing");
}

function schedulePoll() {
  if (pollTimer) return;
  pollTimer = setTimeout(async () => {
    pollTimer = null;
    await store.fetch();
    if (hasInProgress()) schedulePoll();
  }, 3000);
}

onMounted(() => {
  store.fetch().then(() => { if (hasInProgress()) schedulePoll(); });
  loadPipelineFlags();
});
onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer);
  if (saveFlagsTimer) clearTimeout(saveFlagsTimer);
});

// ── Browser file picker ───────────────────────────────────────────────────────
async function onFileInputChange(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? []);
  if (!files.length) return;
  (e.target as HTMLInputElement).value = ""; // reset so same file can be re-selected
  await handleFiles(files);
}

// ── Drag & drop ───────────────────────────────────────────────────────────────
async function onDrop(e: DragEvent) {
  isDragging.value = false;
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length) await handleFiles(files);
}

// ── Intercept: open AI modal if flagAi is on ──────────────────────────────────
async function handleFiles(files: File[]) {
  if (flagAi.value) {
    pendingFiles.value = files;
    pendingDocIds.value = [];
    aiModalMode.value = "upload";
    extractionFields.value = [];
    showAiModal.value = true;
  } else {
    await uploadFiles(files);
  }
}

// ── Upload to server ──────────────────────────────────────────────────────────
async function uploadFiles(files: File[]) {
  uploading.value = true;
  try {
    const { ids, duplicates } = await api.documents.upload(files);
    const newCount = ids.length - (duplicates?.length ?? 0);
    if (newCount > 0) message.info(`${newCount} מסמכים נוספו לתור עיבוד`);
    if (duplicates?.length) message.warning(`${duplicates.length} קובץ/ים כבר קיים/ים: ${duplicates.join(", ")}`);
    await store.fetch();
    schedulePoll();
  } catch (e: any) {
    if (e?.message === "document_limit_reached") {
      message.error(e.serverMessage ?? `הגעת למגבלת ${store.documentLimit} המסמכים. שדרג לחשבון Pro להעלאה בלתי מוגבלת.`);
      store.fetch();
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
    await store.fetch();
    schedulePoll();
  } catch (e: any) {
    if (e?.message?.includes("document_limit_reached")) {
      message.error(`הגעת למגבלת ${store.documentLimit} המסמכים. שדרג לחשבון Pro להעלאה בלתי מוגבלת.`);
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
          h(NButton, { size: "small", onClick: () => openExtractModal(String(row.id)) }, { default: () => "↻" }),
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
  margin-bottom: 12px;
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

.pipeline-flags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding: 8px 12px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  background: rgba(255,255,255,0.02);
}
.pipeline-flags--modal {
  margin-top: 4px;
}
.pipeline-flags__label {
  font-size: 12px;
  color: #888;
  margin-left: 4px;
}

.field-row {
  padding: 6px 8px;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 4px;
}
</style>
