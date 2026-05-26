<template>
  <div>
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
      <n-h2 style="margin: 0">מסמכים</n-h2>
      <n-space>
        <input
          ref="fileInput"
          type="file"
          multiple
          accept=".pdf,.docx,.xlsx,.txt,.md,.png,.jpg,.jpeg,.tif,.tiff"
          style="display: none"
          @change="onFileInputChange"
        />
        <n-button @click="fileInput?.click()" :loading="uploading" :disabled="limitReached">📂 בחר קבצים</n-button>
        <n-button type="warning" :loading="rescanning" @click="doRescan">↻ סריקה מחדש</n-button>
        <n-button :loading="deletingAll" type="error" @click="confirmDeleteAll">🗑 מחק הכל</n-button>
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

    <!-- ── Filters toolbar ──────────────────────────────────────────────── -->
    <n-space style="margin-bottom: 14px" align="center" justify="space-between" :wrap="true">
      <n-input
        v-model:value="search"
        clearable
        placeholder="חיפוש לפי שם קובץ..."
        style="width: 280px"
        @update:value="currentPage = 1"
      />
      <n-space align="center" :wrap="true">
        <n-select
          v-model:value="filterClientId"
          :options="[{ label: 'כל הלקוחות', value: null }, ...clientOptions]"
          :virtual-scroll="false"
          clearable
          filterable
          placeholder="סינון לפי לקוח"
          style="width: 200px"
          @update:value="currentPage = 1"
        />
        <n-date-picker
          v-model:value="filterDateRange"
          clearable
          placeholder="סינון לפי תאריך ייבוא"
          style="width: 260px"
          type="daterange"
          @update:value="currentPage = 1"
        />
      </n-space>
    </n-space>

    <!-- ── Table ────────────────────────────────────────────────────────── -->
    <n-data-table
      :columns="columns"
      :data="pagedRows"
      :loading="store.loading"
      :pagination="false"
      :row-key="(r: any) => r.id"
    />

    <!-- Pagination -->
    <div v-if="filteredRows.length > pageSize" class="pagination">
      <n-pagination
        v-model:page="currentPage"
        :page-count="pageCount"
        :page-slot="5"
        show-quick-jumper
      />
      <span class="pagination__info">{{ filteredRows.length }} מסמכים</span>
    </div>

    <!-- ── Document limit modal ────────────────────────────────────────── -->
    <n-modal
      v-model:show="showLimitModal"
      preset="dialog"
      type="warning"
      title="הגעת למגבלת המסמכים"
      positive-text="שדרג ל-Pro"
      negative-text="סגור"
      @positive-click="showLimitModal = false"
      @negative-click="showLimitModal = false"
    >
      <p>הגעת למגבלת <strong>{{ store.documentLimit }}</strong> המסמכים בחשבון החינמי.</p>
      <p style="font-size:13px; color:var(--text-secondary)">שדרג לחשבון Pro להעלאה בלתי מוגבלת.</p>
    </n-modal>

    <!-- ── Delete all confirm ───────────────────────────────────────────── -->
    <n-modal
      v-model:show="showDeleteAllConfirm"
      negative-text="ביטול"
      positive-text="מחק הכל"
      preset="dialog"
      title="מחיקת כל המסמכים"
      type="error"
      @positive-click="doDeleteAll"
      @negative-click="showDeleteAllConfirm = false"
    >
      <p>האם למחוק את כל <strong>{{ store.rows.length }}</strong> המסמכים?</p>
      <p style="font-size:13px; color:var(--text-secondary)">פעולה זו אינה הפיכה.</p>
    </n-modal>

    <!-- AI extraction modal -->
    <n-modal v-model:show="showAiModal" :title="aiModalMode === 'existing' ? 'חילוץ AI — הגדר שדות' : 'העלאה עם AI — הגדר שדות'" preset="card"
      style="width: 580px">
      <n-space size="medium" vertical>
        <div style="font-size: 13px; color: #aaa">
          {{ aiModalMode === 'existing'
            ? 'הגדר אילו שדות ה-AI יחלץ מהמסמך. השאר ריק לחילוץ אוטומטי.'
            : `${pendingFiles?.length ?? 0} קובץ/ים ממתינים. הגדר שדות לחילוץ AI:` }}
        </div>
        <div v-for="(f, i) in extractionFields" :key="i" class="field-row">
          <n-space :wrap="false" align="center">
            <n-input v-model:value="f.key" placeholder="key (אנגלית)" size="small" style="width: 140px; direction: ltr" />
            <n-input v-model:value="f.label_he" placeholder="תווית עברית" size="small" style="flex: 1" />
            <n-select v-model:value="f.type" :options="fieldTypeOptions" :virtual-scroll="false" size="small" style="width: 100px" />
            <n-button quaternary size="small" @click="extractionFields.splice(i, 1)">✕</n-button>
          </n-space>
        </div>
        <n-button dashed size="small" @click="addExtractionField">+ הוסף שדה</n-button>
        <div style="font-size: 12px; color: #666; border-top: 1px solid rgba(255,255,255,0.07); padding-top: 10px">
          שדות ריקים = AI יחלץ שדות סטנדרטיים אוטומטית (לקוח, תאריכים, סכומים)
        </div>
        <n-space justify="end">
          <n-button @click="showAiModal = false">ביטול</n-button>
          <n-button v-if="aiModalMode === 'upload'" secondary @click="skipAiModal">העלה ללא הגדרה</n-button>
          <n-button :loading="extracting" type="primary" @click="confirmAiModal">
            {{ aiModalMode === 'existing' ? 'הרץ חילוץ' : 'העלה ועבד' }}
          </n-button>
        </n-space>
      </n-space>
    </n-modal>

    <!-- Server-path import modal -->
    <n-modal v-model:show="showImport" title="ייבוא לפי נתיב שרת" preset="dialog" style="width: 520px">
      <n-alert type="info" :show-icon="false" style="margin-bottom: 12px">
        השתמש באפשרות זו רק כאשר הקובץ נמצא כבר על מחשב השרת
      </n-alert>
      <n-space vertical>
        <n-input v-model:value="importPath" clearable placeholder="C:\Documents\contract.pdf" @keyup.enter="doImportPath" />
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
  NDatePicker,
  NDropdown,
  NH2,
  NInput,
  NModal,
  NPagination,
  NProgress,
  NSelect,
  NSpace,
  NTooltip,
  useMessage,
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
const message = useMessage();

const isRegularUser = computed(() => authStore.user?.role === "user");
const quotaPercent = computed(() =>
  Math.min(100, Math.round((store.totalAll / store.documentLimit) * 100))
);
const limitReached = computed(() => isRegularUser.value && store.totalAll >= store.documentLimit);

const fileInput = ref<HTMLInputElement | null>(null);
const showImport = ref(false);
const importPath = ref("");
const importing = ref(false);
const uploading = ref(false);
const isDragging = ref(false);
const queuedCount = ref(0);
const rescanning = ref(false);
const deletingAll = ref(false);
const showDeleteAllConfirm = ref(false);
const showLimitModal = ref(false);

// ── Filters ───────────────────────────────────────────────────────────────────
const search = ref("");
const filterClientId = ref<string | null>(null);
const filterDateRange = ref<[number, number] | null>(null);

// ── Client options for filter ─────────────────────────────────────────────────
const clientOptions = ref<{ label: string; value: string }[]>([]);

async function loadClients() {
  try {
    const r = await api.clients.list({ limit: 500 });
    clientOptions.value = r.rows.map((c) => ({ label: c.display_name, value: String(c.id) }));
  } catch { /* non-fatal */ }
}

// ── Pagination ─────────────────────────────────────────────────────────────────
const pageSize = 20;
const currentPage = ref(1);
watch([search, filterClientId, filterDateRange], () => { currentPage.value = 1; });

const filteredRows = computed(() => {
  let rows = store.rows ?? [];
  const q = search.value.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => (r.file_name ?? "").toLowerCase().includes(q));
  }
  if (filterClientId.value) {
    // filter by client_id stored on document (set during extraction)
    rows = rows.filter((r) => (r as any).client_id === filterClientId.value);
  }
  if (filterDateRange.value) {
    const [from, to] = filterDateRange.value;
    rows = rows.filter((r) => {
      if (!r.import_date) return false;
      const d = new Date(r.import_date).getTime();
      return d >= from && d <= to;
    });
  }
  return rows;
});

const pageCount = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize)));
const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredRows.value.slice(start, start + pageSize);
});

function rowActions(row: Document) {
  return [
    { label: "📄 צפה",     key: "view" },
    { label: "⬇ הורד",    key: "download" },
    { label: "✨ חלץ AI",  key: "extract" },
    { type: "divider",     key: "d1" },
    { label: "🗑 מחק",     key: "delete",  props: { style: "color: var(--color-error, #d03050)" } },
  ];
}

function handleRowAction(key: string, row: Document) {
  if (key === "view")     router.push(`/documents/${row.id}`);
  if (key === "download") openDownload(row);
  if (key === "extract")  openExtractModal(String(row.id));
  if (key === "delete")   store.deleteDoc(row.id);
}


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
  openKebab.value = null;
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
  } catch { /* ignore */ }
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

// ── Status polling ─────────────────────────────────────────────────────────────
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
  loadClients();
});
onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer);
  if (saveFlagsTimer) clearTimeout(saveFlagsTimer);
});

// ── File picker ───────────────────────────────────────────────────────────────
async function onFileInputChange(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? []);
  if (!files.length) return;
  (e.target as HTMLInputElement).value = "";
  await handleFiles(files);
}

async function onDrop(e: DragEvent) {
  isDragging.value = false;
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length) await handleFiles(files);
}

async function handleFiles(files: File[]) {
  await uploadFiles(files);
}

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
      showLimitModal.value = true;
      store.fetch();
    } else {
      message.error(String(e));
    }
  } finally {
    uploading.value = false;
  }
}

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
      showLimitModal.value = true;
    } else {
      message.error(String(e));
    }
  } finally {
    importing.value = false;
  }
}

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

function confirmDeleteAll() {
  showDeleteAllConfirm.value = true;
}

async function doDeleteAll() {
  deletingAll.value = true;
  try {
    await Promise.all(store.rows.map((r) => store.deleteDoc(r.id)));
    message.success("כל המסמכים נמחקו");
    await store.fetch();
  } catch {
    message.error("שגיאה במחיקת המסמכים");
  } finally {
    deletingAll.value = false;
    showDeleteAllConfirm.value = false;
  }
}

async function openDownload(row: Document) {
  try {
    const res = await fetch(`${SERVER}/api/documents/${row.id}/download`, { credentials: "include" });
    if (!res.ok) throw new Error(await res.text());
    const { url } = await res.json() as { url: string };
    window.open(url, "_blank", "noopener");
  } catch (e) {
    message.error(`לא ניתן לפתוח את הקובץ: ${e}`);
  }
}

// ── Table columns ─────────────────────────────────────────────────────────────
const columns = [
  {
    title: "שם קובץ",
    key: "file_name",
    render: (row: Document) =>
      h("a", {
        style: "cursor:pointer;color:#63e2b7",
        onClick: () => router.push(`/documents/${row.id}`),
        title: "פתח מסמך",
      }, row.file_name),
  },
  { title: "סוג", key: "mime_type", width: 180 },
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
    width: 48,
    render: (row: Document) =>
      h(NDropdown, {
        trigger: "click",
        placement: "bottom-end",
        options: rowActions(row),
        onSelect: (key: string) => handleRowAction(key, row),
      }, {
        default: () => h(NButton, { quaternary: true, circle: true, size: "small" }, { default: () => "⋮" }),
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
.drop-zone--active { border-color: #63e2b7; background: rgba(99,226,183,0.06); }
.drop-zone--disabled { border-color: #e88080; background: rgba(232,128,128,0.05); cursor: not-allowed; opacity: 0.7; }

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
.pipeline-flags--modal { margin-top: 4px; }
.pipeline-flags__label { font-size: 12px; color: #888; margin-left: 4px; }

/* ── Pagination ──────────────────────────────────────────────────────────── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
.pagination__info { font-size: 13px; color: var(--text-secondary); }


.field-row {
  padding: 6px 8px;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 4px;
}
</style>
