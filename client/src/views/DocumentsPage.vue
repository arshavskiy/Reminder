<template>
  <div class="page2">
    <PageHeader :count="store.total" title="מסמכים">
      <template #actions>
        <n-button :disabled="limitReached" :loading="uploading" type="primary" @click="openUploadModal()">
          📂 העלה קבצים
        </n-button>
        <n-button :loading="store.loading" size="small" @click="store.fetch(undefined, true)">↻ רענן</n-button>
        <n-button :loading="rescanning" size="small" @click="doRescan">↻ סריקה מחדש</n-button>
        <n-button :loading="deletingAll" size="small" type="error" @click="confirmDeleteAll">🗑 מחק הכל</n-button>

        <!-- Pipeline settings popover -->
        <n-popover :width="320" placement="bottom-end" trigger="click">
          <template #trigger>
            <n-button size="small" title="הגדרות עיבוד">⚙ הגדרות</n-button>
          </template>
          <div class="settings-pop">
            <div class="settings-pop__title">שירותי עיבוד</div>
            <n-space size="small" vertical>
              <n-tooltip placement="left">
                <template #trigger><n-checkbox v-model:checked="flagOcr">OCR (זיהוי טקסט)</n-checkbox></template>
                הפעל זיהוי תווים אופטי (Tesseract) לחילוץ טקסט מ-PDF ותמונות
              </n-tooltip>
              <n-tooltip placement="left">
                <template #trigger><n-checkbox v-model:checked="flagAi">AI (חילוץ שדות)</n-checkbox></template>
                הפעל מודל AI לחילוץ אוטומטי של שדות
              </n-tooltip>
              <n-tooltip placement="left">
                <template #trigger><n-checkbox v-model:checked="flagS3">S3 (אחסון ענן)</n-checkbox></template>
                העלה את הקובץ לאחסון ענן. כבה כדי לשמור מקומית בלבד
              </n-tooltip>
              <n-tooltip placement="left">
                <template #trigger><n-checkbox v-model:checked="flagEntities">ישויות (לקוחות / חוזים)</n-checkbox></template>
                צור אוטומטית לקוחות, חוזים ותזכורות מנתוני הקובץ
              </n-tooltip>
            </n-space>
          </div>
        </n-popover>
      </template>
    </PageHeader>

    <!-- Quota bar (role = user only) -->
    <div v-if="isRegularUser" class="quota-bar">
      <div class="quota-bar__text">
        <span>מסמכים שנסרקו: {{ store.totalAll }} / {{ store.documentLimit }}</span>
        <span v-if="limitReached" class="quota-bar__limit">הגעת למגבלת סריקות — שדרג ל-Pro</span>
      </div>
      <n-progress
        type="line"
        :percentage="quotaPercent"
        :color="quotaPercent >= 100 ? '#e88080' : quotaPercent >= 80 ? '#f0a020' : 'var(--brand-color)'"
        :height="6"
        :show-indicator="false"
        rail-color="rgba(128,128,128,0.15)"
      />
    </div>

    <!-- Thin drop strip -->
    <div
      :class="{ 'drop-strip--active': isDragging, 'drop-strip--disabled': limitReached }"
      class="drop-strip"
      @dragover.prevent="!limitReached && (isDragging = true)"
      @dragleave.prevent="isDragging = false"
      @click="!limitReached && openUploadModal()"
      @drop.prevent="!limitReached && onStripDrop($event)"
    >
      <span v-if="limitReached">הגעת למגבלת {{ store.documentLimit }} סריקות</span>
      <span v-else-if="isDragging">שחרר כאן לייבוא...</span>
      <span v-else>גרור קבצים לכאן או לחץ "העלה קבצים"</span>
    </div>

    <n-alert
      v-if="queuedCount > 0"
      type="info"
      class="mb-3"
      :title="`${queuedCount} מסמכים בתור עיבוד`"
      closable
      @close="queuedCount = 0"
    />

    <!-- ── Toolbar ─────────────────────────────────────────────────────── -->
    <div class="toolbar">
      <n-input
        v-model:value="search"
        clearable
        placeholder="חיפוש לפי שם קובץ..."
        class="!flex-1 !min-w-[220px]"
        @update:value="currentPage = 1"
      />
      <n-select
        v-model:value="filterClientId"
        :options="[{ label: 'כל הלקוחות', value: null }, ...clientOptions]"
        :virtual-scroll="false"
        class="!w-[200px]"
        clearable
        filterable
        placeholder="סינון לפי לקוח"
        @update:value="currentPage = 1"
      />
      <n-date-picker
        v-model:value="filterDateRange"
        class="!w-[260px]"
        clearable
        placeholder="סינון לפי תאריך ייבוא"
        type="daterange"
        @update:value="currentPage = 1"
      />
      <div class="toolbar__view-toggle">
        <n-button
          :type="viewMode === 'grid' ? 'primary' : 'default'"
          size="small"
          @click="viewMode = 'grid'"
        >▦ אריחים</n-button>
        <n-button
          :type="viewMode === 'list' ? 'primary' : 'default'"
          size="small"
          @click="viewMode = 'list'"
        >☰ רשימה</n-button>
      </div>
    </div>

    <!-- ── Tile grid ──────────────────────────────────────────────────── -->
    <n-spin :show="store.loading">
      <div v-if="pagedRows.length && viewMode === 'grid'" class="tile-grid">
        <article
          v-for="row in pagedRows"
          :key="row.id"
          :class="{ [`tile--${fileKind(row.mime_type)}`]: true }"
          class="tile"
          @click="router.push(`/documents/${row.id}`)"
        >
          <div class="tile__thumb">
            <div v-if="fileKind(row.mime_type) === 'pdf'" class="tile__pdf-icon">
              <div class="pdf-doc">
                <div class="pdf-label">PDF</div>
              </div>
            </div>
            <span v-else class="tile__icon">{{ fileIcon(row.mime_type) }}</span>
            <StatusBadge :status="row.processing_status" class="tile__status" />
          </div>
          <div class="tile__body">
            <div :title="row.file_name" class="tile__name">{{ row.file_name }}</div>
            <div class="tile__meta">
              <span v-if="(row as any).client_name" class="tile__meta-item">{{ (row as any).client_name }}</span>
              <span v-if="(row as any).document_type" class="tile__meta-item">{{ (row as any).document_type }}</span>
            </div>
            <div class="tile__date">{{ formatDate(row.import_date) }}</div>
          </div>
          <div class="tile__actions" @click.stop>
            <n-dropdown
              :options="rowActions()"
              placement="bottom-end"
              trigger="click"
              @select="(k: string) => handleRowAction(k, row)"
            >
              <n-button circle quaternary size="small">⋮</n-button>
            </n-dropdown>
          </div>
        </article>
      </div>

      <!-- ── List view (compact) ──────────────────────────────────────── -->
      <div v-else-if="pagedRows.length && viewMode === 'list'" class="cards">
        <ListCard
          v-for="row in pagedRows"
          :key="row.id"
          @click="router.push(`/documents/${row.id}`)"
        >
          <template #title>
            <div v-if="fileKind(row.mime_type) === 'pdf'" class="list-pdf-icon">
              <div class="pdf-doc-small">
                <div class="pdf-label-small">PDF</div>
              </div>
            </div>
            <span v-else class="text-lg shrink-0">{{ fileIcon(row.mime_type) }}</span>
            <span class="truncate font-semibold">{{ row.file_name }}</span>
          </template>
          <template #actions>
            <n-button size="tiny" @click.stop="openDownload(row)">⬇</n-button>
            <n-button size="tiny" @click.stop="openExtractModal(String(row.id))">✨</n-button>
            <n-button size="tiny" type="error" @click.stop="store.deleteDoc(row.id)">🗑</n-button>
          </template>
          <template #pills>
            <StatusBadge :status="row.processing_status" />
            <span class="tag tag--neutral">{{ row.mime_type }}</span>
          </template>
          <template #footer>
            <div class="flex flex-col gap-1">
              <span v-if="(row as any).client_name" class="kv"><strong>לקוח:</strong> {{ (row as any).client_name }}</span>
              <span class="kv"><strong>ייבוא:</strong> {{ formatDate(row.import_date) }}</span>
            </div>
            <div class="flex flex-col gap-1 items-end">
              <span v-if="(row as any).document_type" class="kv"><strong>סוג:</strong> {{ (row as any).document_type }}</span>
              <span v-if="(row as any).expiry_date" class="kv">
                <strong>תפוגה:</strong>
                <span :class="expiryClass((row as any).expiry_date)">{{ formatDate((row as any).expiry_date) }}</span>
              </span>
            </div>
          </template>
        </ListCard>
      </div>

      <div v-else-if="!store.loading" class="empty">
        <p>אין מסמכים להצגה</p>
        <n-button :disabled="limitReached" class="mt-3" type="primary" @click="openUploadModal()">
          📂 העלה מסמך ראשון
        </n-button>
      </div>
    </n-spin>

    <PaginationBar
      v-model:page="currentPage"
      :page-size="pageSize"
      :total-items="filteredRows.length"
      label="מסמכים"
    />

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
      <p class="text-sm text-[var(--text-secondary)]">שדרג לחשבון Pro להעלאה בלתי מוגבלת.</p>
    </n-modal>

    <!-- ── Delete all confirm ──────────────────────────────────────────── -->
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
      <p class="text-sm text-[var(--text-secondary)]">פעולה זו אינה הפיכה.</p>
    </n-modal>

    <!-- ── Upload modal ───────────────────────────────────────────────── -->
    <UploadModal
      ref="uploadModalRef"
      v-model="showUploadModal"
      :uploading="uploading"
      @upload="onModalUpload"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from "vue";
import {useRouter} from "vue-router";
import {
  NAlert,
  NButton,
  NCheckbox,
  NDatePicker,
  NDropdown,
  NInput,
  NModal,
  NPopover,
  NProgress,
  NSelect,
  NSpace,
  NSpin,
  NTooltip,
  useMessage,
} from "naive-ui";
import {useDocumentsStore} from "../stores/documents.js";
import {useAuthStore} from "../stores/auth.js";
import {api} from "../services/apiService.js";
import StatusBadge from "../components/StatusBadge.vue";
import PageHeader from "../components/PageHeader.vue";
import ListCard from "../components/ListCard.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UploadModal from "../components/UploadModal.vue";
import type {Document} from "@shared/types.js";

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const store = useDocumentsStore();
const authStore = useAuthStore();
const router = useRouter();
const message = useMessage();

const isRegularUser = computed(() => authStore.user?.role === "user");
const quotaPercent = computed(() => Math.min(100, Math.round((store.totalAll / store.documentLimit) * 100)));
const limitReached = computed(() => isRegularUser.value && store.totalAll >= store.documentLimit);

const uploading = ref(false);
const isDragging = ref(false);
const queuedCount = ref(0);
const rescanning = ref(false);
const deletingAll = ref(false);
const showDeleteAllConfirm = ref(false);
const showLimitModal = ref(false);
const viewMode = ref<"grid" | "list">("list");

// ── Upload modal ───────────────────────────────────────────────────────────────
const showUploadModal = ref(false);
const uploadModalRef = ref<InstanceType<typeof UploadModal> | null>(null);

function openUploadModal() {
  showUploadModal.value = true;
}

function onStripDrop(e: DragEvent) {
  isDragging.value = false;
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (!files.length) return;
  showUploadModal.value = true;
  // Pre-load dropped files after the modal mounts on next tick
  setTimeout(() => uploadModalRef.value?.addFiles(files), 50);
}

async function onModalUpload(
  files: File[],
  fields: { key: string; label_he: string; type: string }[],
  options: { doAi: boolean; doEntities: boolean; doReminders: boolean }
) {
  await uploadFiles(files, options);
  showUploadModal.value = false;
}

// ── Filters ───────────────────────────────────────────────────────────────────
const search = ref("");
const filterClientId = ref<string | null>(null);
const filterDateRange = ref<[number, number] | null>(null);

const clientOptions = ref<{ label: string; value: string }[]>([]);
async function loadClients() {
  try {
    const r = await api.clients.list({ limit: 500 });
    clientOptions.value = r.rows.map((c) => ({ label: c.display_name, value: String(c.id) }));
  } catch { /* non-fatal */ }
}

// ── Pagination ─────────────────────────────────────────────────────────────────
const pageSize = 24;
const currentPage = ref(1);
watch([search, filterClientId, filterDateRange], () => { currentPage.value = 1; });

// Refetch from server whenever the client filter changes (so we always get
// the canonical client→document mapping rather than relying on cached rows).
watch(filterClientId, (cid) => {
  store.fetch({ clientId: cid ?? undefined, limit: 500 }, true);
});

const filteredRows = computed(() => {
  let rows = store.rows ?? [];
  const q = search.value.trim().toLowerCase();
  if (q) rows = rows.filter((r) => (r.file_name ?? "").toLowerCase().includes(q));
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

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredRows.value.slice(start, start + pageSize);
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL");
}
function expiryClass(date: string | null | undefined) {
  if (!date) return "";
  const diff = (new Date(date).getTime() - Date.now()) / 86400000;
  if (diff < 0) return "expiry expiry--expired";
  if (diff < 30) return "expiry expiry--warn";
  return "expiry expiry--ok";
}
function fileIcon(mime: string | null | undefined) {
  if (!mime) return "📄";
  if (mime.includes("pdf")) return "📕";
  if (mime.includes("word") || mime.includes("docx")) return "📝";
  if (mime.includes("sheet") || mime.includes("xlsx")) return "📊";
  if (mime.includes("image")) return "🖼";
  return "📄";
}
function fileKind(mime: string | null | undefined) {
  if (!mime) return "other";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("word") || mime.includes("docx")) return "doc";
  if (mime.includes("sheet") || mime.includes("xlsx")) return "xls";
  if (mime.includes("image")) return "img";
  return "other";
}

function rowActions() {
  return [
    { label: "📄 צפה", key: "view" },
    { label: " הורד", key: "download" },
    { label: "✨ חלץ AI", key: "extract" },
    { type: "divider", key: "d1" },
    { label: "🗑 מחק", key: "delete", props: { style: "color: var(--color-error, #d03050)" } },
  ];
}
function handleRowAction(key: string, row: Document) {
  if (key === "view") router.push(`/documents/${row.id}`);
  if (key === "download") openDownload(row);
  if (key === "extract") openExtractModal(String(row.id));
  if (key === "delete") store.deleteDoc(row.id);
}

// ── Re-extract existing doc (row action ✨) ────────────────────────────────────
const extracting = ref(false);

async function openExtractModal(docId: string) {
  extracting.value = true;
  try {
    await api.documents.extract(docId);
    message.success("חילוץ AI הושלם");
    await store.fetch(undefined, true);
  } catch (e) {
    message.error(String(e));
  } finally {
    extracting.value = false;
  }
}

// ── Pipeline feature flags ────────────────────────────────────────────────────
const flagOcr = ref(true);
const flagAi = ref(true);
const flagS3 = ref(true);
const flagEntities = ref(true);
let saveFlagsTimer: ReturnType<typeof setTimeout> | null = null;

async function loadPipelineFlags() {
  try {
    const s = await api.userSettings.get();
    flagOcr.value = s.pipeline_ocr ?? flagOcr.value;
    flagAi.value = s.pipeline_ai ?? flagAi.value;
    flagS3.value = s.pipeline_s3 ?? flagS3.value;
    flagEntities.value = s.pipeline_entities ?? flagEntities.value;
  } catch { /* ignore */ }
}
function savePipelineFlags() {
  if (saveFlagsTimer) clearTimeout(saveFlagsTimer);
  saveFlagsTimer = setTimeout(async () => {
    try {
      await api.userSettings.save({
        pipeline_ocr: flagOcr.value, pipeline_ai: flagAi.value,
        pipeline_s3: flagS3.value, pipeline_entities: flagEntities.value,
      });
    } catch { /* ignore */ }
  }, 600);
}
watch([flagOcr, flagAi, flagS3, flagEntities], savePipelineFlags);

onMounted(() => {
  store.fetch(undefined, true);
  loadPipelineFlags();
  loadClients();
});
onUnmounted(() => {
  if (saveFlagsTimer) clearTimeout(saveFlagsTimer);
  stopProcessingPoll();
});

// ── Poll while any document is still queued/processing ─────────────────────
let processingPollTimer: ReturnType<typeof setInterval> | null = null;
function stopProcessingPoll() {
  if (processingPollTimer) {
    clearInterval(processingPollTimer);
    processingPollTimer = null;
  }
}
watch(
  () => store.hasInProgress,
  (inProgress) => {
    if (inProgress && !processingPollTimer) {
      processingPollTimer = setInterval(() => store.fetch(undefined, true), 3000);
    } else if (!inProgress) {
      stopProcessingPoll();
    }
  },
  { immediate: true }
);

// ── File handling ─────────────────────────────────────────────────────────────
async function uploadFiles(
  files: File[],
  options?: { doAi: boolean; doEntities: boolean; doReminders: boolean }
) {
  uploading.value = true;
  try {
    const { ids, duplicates } = await api.documents.upload(files, options);
    const newCount = ids.length - (duplicates?.length ?? 0);
    if (newCount > 0) message.info(`${newCount} מסמכים נוספו לתור עיבוד`);
    if (duplicates?.length) message.warning(`${duplicates.length} קובץ/ים כבר קיים/ים: ${duplicates.join(", ")}`);
    await store.fetch(undefined, true);
  } catch (e: any) {
    if (e?.message === "document_limit_reached") {
      showLimitModal.value = true;
      store.fetch(undefined, true);
    } else {
      message.error(String(e));
    }
  } finally {
    uploading.value = false;
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
    await store.fetch(undefined, true);
  } catch {
    message.error("שגיאה בסריקה מחדש");
  } finally {
    rescanning.value = false;
  }
}
function confirmDeleteAll() { showDeleteAllConfirm.value = true; }
async function doDeleteAll() {
  deletingAll.value = true;
  try {
    await Promise.all(store.rows.map((r) => store.deleteDoc(r.id)));
    message.success("כל המסמכים נמחקו");
    await store.fetch(undefined, true);
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
</script>

<style scoped>
.hidden { display: none; }

/* ── Quota bar ───────────────────────────────────────────────────────────── */
.quota-bar { margin-bottom: 12px; }
.quota-bar__text { display: flex; justify-content: space-between; font-size: 13px; color: var(--text-secondary); margin-bottom: 5px; }
.quota-bar__limit { color: #e88080; font-weight: 600; }

/* ── Drop strip ──────────────────────────────────────────────────────────── */
.drop-strip {
  border: 1px dashed black;
  border-radius: 10px;
  padding: 20px 14px;
  text-align: center;
  margin-bottom: 14px;
  font-size: 13px;
  color: var(--text-muted);
  transition: border-color 0.2s, background 0.2s;
}
.drop-strip--active { border-color: var(--brand-color); background: rgba(99,226,183,0.06); color: var(--text-primary); }
.drop-strip--disabled { border-color: #e88080; background: rgba(232,128,128,0.05); color: #e88080; }

/* ── Settings popover ────────────────────────────────────────────────────── */
.settings-pop { padding: 6px 4px; }
.settings-pop__title { font-size: 13px; font-weight: 600; margin-bottom: 10px; color: var(--text-primary); }

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.toolbar__view-toggle { display: flex; gap: 4px; margin-right: auto; }

/* ── Tile grid ───────────────────────────────────────────────────────────── */
.tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
}
.tile {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.15s, border-color 0.15s, transform 0.1s;
}
.tile:hover {
  border-color: var(--brand-color);
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  transform: translateY(-1px);
}
.tile__thumb {
  position: relative;
  height: 110px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-color);
}
.tile__icon { font-size: 44px; opacity: 0.85; }
.tile__pdf-icon { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.pdf-doc {
  width: 36px;
  height: 45px;
  background: linear-gradient(135deg, #d03050 0%, #e88080 100%);
  border-radius: 3px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 4px;
  box-shadow: 0 1px 4px rgba(208, 48, 80, 0.25);
  position: relative;
}
.pdf-doc::before {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  right: 3px;
  height: 2px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 1px;
}
.pdf-doc::after {
  content: '';
  position: absolute;
  top: 9px;
  left: 3px;
  right: 3px;
  height: 1px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 1px;
}
.pdf-label {
  font-size: 8px;
  font-weight: 700;
  color: white;
  letter-spacing: 0.3px;
  z-index: 1;
}
.list-pdf-icon { display: flex; align-items: center; shrink: 0; }
.pdf-doc-small {
  width: 32px;
  height: 40px;
  background: linear-gradient(135deg, #d03050 0%, #e88080 100%);
  border-radius: 3px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 4px;
  box-shadow: 0 1px 4px rgba(208, 48, 80, 0.25);
  position: relative;
}
.pdf-doc-small::before {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  right: 3px;
  height: 2px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 1px;
}
.pdf-doc-small::after {
  content: '';
  position: absolute;
  top: 8px;
  left: 3px;
  right: 3px;
  height: 1px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 1px;
}
.pdf-label-small {
  font-size: 7px;
  font-weight: 700;
  color: white;
  letter-spacing: 0.3px;
  z-index: 1;
}
.tile__status { position: absolute; top: 8px; right: 8px; }
.tile--pdf .tile__thumb { background: linear-gradient(135deg, rgba(208,48,80,0.08), rgba(208,48,80,0.02)); }
.tile--doc .tile__thumb { background: linear-gradient(135deg, rgba(32,128,240,0.08), rgba(32,128,240,0.02)); }
.tile--xls .tile__thumb { background: linear-gradient(135deg, rgba(99,226,183,0.08), rgba(99,226,183,0.02)); }
.tile--img .tile__thumb { background: linear-gradient(135deg, rgba(240,160,32,0.08), rgba(240,160,32,0.02)); }
.tile__body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
.tile__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.3;
  min-height: 2.6em;
}
.tile__meta { display: flex; flex-wrap: wrap; gap: 4px; font-size: 11px; color: var(--text-secondary); }
.tile__meta-item {
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.tile__date { font-size: 11px; color: var(--text-muted); margin-top: auto; }
.tile__actions { position: absolute; top: 6px; left: 6px; }

/* ── List card extras ────────────────────────────────────────────────────── */
.cards { display: flex; flex-direction: column; gap: 12px; }
.tag {
  display: inline-flex; align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
.tag--neutral { background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border-color); }
.kv { font-size: 12px; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 6px; }
.kv strong { color: var(--text-muted); font-weight: 500; }
.expiry { font-weight: 600; }
.expiry--ok { color: #1a7951; }
.expiry--warn { color: #b27a02; }
.expiry--expired { color: var(--color-error, #d03050); }

/* ── Empty ───────────────────────────────────────────────────────────────── */
.empty { text-align: center; padding: 60px 20px; color: var(--text-muted); font-size: 14px; }

</style>
