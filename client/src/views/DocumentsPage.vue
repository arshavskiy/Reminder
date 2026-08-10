<template>
  <div class="page2">
    <PageHeader :count="store.total" title="מסמכים">
      <template #actions>
        <n-button :disabled="limitReached" :loading="uploading" type="primary" @click="openUploadModal()">
          📂 העלה קבצים
        </n-button>
        <n-button :loading="store.loading" size="small" @click="store.fetch(undefined, true)">↻ רענן</n-button>
        <n-button v-if="rescanStore.hasSession" size="small" secondary @click="openRescanModal">
          {{ rescanStore.kind === "upload" ? "הצג העלאה אחרונה" : "הצג סריקה אחרונה" }}
        </n-button>
        <n-button :disabled="rescanningAll" :loading="rescanning" size="small" @click="doRescan">↻ סריקה מחדש</n-button>
        <n-button
          v-if="authStore.isAdmin"
          :disabled="rescanning"
          :loading="rescanningAll"
          secondary
          size="small"
          type="warning"
          @click="showRescanAllConfirm = true"
        >
          ↻ סרוק הכל מחדש
        </n-button>
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
      v-if="rescanStore.hasSession && !showUploadModal"
      type="info"
      class="mb-3"
      :title="rescanAlertTitle"
      closable
      @close="rescanStore.clear()"
    />

    <!-- ── Unified filter bar ─────────────────────────────────────────── -->
    <div class="filterbar filterbar--compact">
      <button
        v-for="f in combinedFilters"
        :key="f.key"
        class="pill pill--compact"
        :class="{ 'pill--active': activeFilterKey === f.key }"
        @click="applyFilter(f)"
      >
        {{ f.label }}
        <span class="pill__badge">{{ f.count }}</span>
      </button>
    </div>

    <!-- ── Toolbar ─────────────────────────────────────────────────────── -->
    <div class="toolbar">
      <n-input
        v-model:value="search"
        clearable
        placeholder="חיפוש לפי שם קובץ..."
        class="toolbar__search"
        @update:value="currentPage = 1"
      />
      <n-select
        v-model:value="filterClientId"
        :options="[{ label: 'כל הלקוחות', value: null }, ...clientOptions]"
        :virtual-scroll="false"
        class="toolbar__client"
        clearable
        filterable
        placeholder="סינון לפי לקוח"
        @update:value="currentPage = 1"
      />
      <n-date-picker
        v-model:value="filterDateRange"
        class="toolbar__dates"
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
            <n-tag
              :type="reminderTagType((row as any).reminder_status)"
              class="tile__reminder-status"
              round
              size="small"
            >
              {{ reminderStatusLabel((row as any).reminder_status) }}
            </n-tag>
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
            <n-tag :type="reminderTagType((row as any).reminder_status)" round size="small">
              {{ reminderStatusLabel((row as any).reminder_status) }}
            </n-tag>
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
              <span v-if="(row as any).reminder_date" class="kv">
                <strong>תוקף:</strong>
                <span :class="expiryClass((row as any).reminder_date)">{{ formatDate((row as any).reminder_date) }}</span>
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

    <n-modal
      v-model:show="showRescanAllConfirm"
      negative-text="ביטול"
      positive-text="סרוק הכל מחדש"
      preset="dialog"
      title="סריקה מחדש לכל המסמכים"
      type="warning"
      @positive-click="doRescanAll"
      @negative-click="showRescanAllConfirm = false"
    >
      <div class="rescan-confirm" dir="rtl">
        <p>
          הפעולה תסרוק מחדש את כל המסמכים הזמינים ותיצור מחדש את הנתונים שנוצרו מהם.
        </p>
        <ul>
          <li>חוזים ותסקירים שנוצרו מהמסמך ייבנו מחדש.</li>
          <li>תזכורות שנוצרו מהמסמך יימחקו ויחושבו מחדש.</li>
          <li>הפעולה מיועדת לתיקוני מערכת כמו חישוב הפרש חודשים.</li>
        </ul>
      </div>
    </n-modal>

    <!-- ── Upload modal ───────────────────────────────────────────────── -->
    <UploadModal
      ref="uploadModalRef"
      v-model="showUploadModal"
      :rescan="rescanModalState"
      :uploading="uploading"
      @upload="onModalUpload"
      @view-document="openDocumentFromModal"
      @create-template="onCreateTemplate"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from "vue";
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
  NTag,
  NTooltip,
  useMessage,
} from "naive-ui";
import {useDocumentsStore} from "../stores/documents.js";
import {useAuthStore} from "../stores/auth.js";
import {useRescanModalStore} from "../stores/rescanModal.js";
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
const rescanStore = useRescanModalStore();
const router = useRouter();
const message = useMessage();

const isRegularUser = computed(() => authStore.user?.role === "user");
const quotaPercent = computed(() => Math.min(100, Math.round((store.totalAll / store.documentLimit) * 100)));
const limitReached = computed(() => isRegularUser.value && store.totalAll >= store.documentLimit);

const uploading = ref(false);
const isDragging = ref(false);
let rescanPollTimer: ReturnType<typeof setInterval> | null = null;
const rescanning = ref(false);
const rescanningAll = ref(false);
const deletingAll = ref(false);
const showDeleteAllConfirm = ref(false);
const showRescanAllConfirm = ref(false);
const showLimitModal = ref(false);
const viewMode = ref<"grid" | "list">("list");
const rescanAlertTitle = computed(() => {
  const action = rescanStore.kind === "upload" ? "העלאה" : "סריקה מחדש";
  if (rescanStore.remaining > 0) {
    return `${action} פעילה: ${rescanStore.remaining} מתוך ${rescanStore.queued} עדיין בעיבוד`;
  }
  return `${rescanStore.queued} מסמכים נשלחו ל${rescanStore.kind === "upload" ? "עיבוד" : "סריקה מחדש"}`;
});
const rescanRows = computed(() =>
  rescanStore.ids
    .map((id) => store.rows.find((row) => String(row.id) === id))
    .filter((row): row is Document => Boolean(row))
);
const rescanModalState = computed(() => ({
  queued: rescanStore.queued,
  remaining: rescanStore.remaining,
  done: rescanStore.done,
  kind: rescanStore.kind,
  rows: rescanStore.rows,
}));

// ── Upload modal ───────────────────────────────────────────────────────────────
const showUploadModal = ref(false);
const uploadModalRef = ref<InstanceType<typeof UploadModal> | null>(null);

function openUploadModal() {
  showUploadModal.value = true;
}

function openDocumentFromModal(id: string) {
  showUploadModal.value = false;
  router.push(`/documents/${id}`);
}

function onCreateTemplate(file: File) {
  // Store the file in sessionStorage key so DocTemplatesPage can pick it up
  // We navigate there; the page reads the flag and auto-opens the generator
  sessionStorage.setItem("doc_templates_pending_file_name", file.name);
  sessionStorage.setItem("doc_templates_pending_file_size", String(file.size));
  // Store the actual file in a module-level variable (same session)
  (window as any).__pendingTemplateFile = file;
  router.push("/doc-templates");
}

async function openRescanModal() {
  showUploadModal.value = true;
  await nextTick();
  uploadModalRef.value?.openRescan();
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
type DocumentStatusFilter = "all" | "done" | "in_progress" | "error" | "no_reminder" | "contract_expired";

const search = ref("");
const filterClientId = ref<string | null>(null);
const filterDateRange = ref<[number, number] | null>(null);
const statusFilter = ref<DocumentStatusFilter>("all");

type CombinedFilter = {
  key: string;
  label: string;
  count: number;
  statusValue?: DocumentStatusFilter;
};

const combinedFilters = computed<CombinedFilter[]>(() => {
  const c = store.counts;
  const rows = store.rows ?? [];
  return [
    { key: "all",         label: "הכל",         count: c.all,          statusValue: "all" },
    { key: "done",        label: "הושלם",       count: c.done,         statusValue: "done" },
    { key: "in_progress", label: "בעיבוד",      count: c.in_progress,  statusValue: "in_progress" },
    { key: "error",       label: "שגיאה",       count: c.error,        statusValue: "error" },
    { key: "no_reminder",       label: "ללא תזכורת", count: rows.filter((row) => (row as any).reminder_status === "missing").length,                                                              statusValue: "no_reminder" },
    { key: "contract_expired",  label: "פג תוקף",   count: rows.filter((row) => (row as any).contract_status === "expired" || (row as any).contract_status === "overdue").length, statusValue: "contract_expired" },
  ];
});

const activeFilterKey = ref("all");

function applyFilter(f: CombinedFilter) {
  activeFilterKey.value = f.key;
  statusFilter.value = f.statusValue ?? "all";
  currentPage.value = 1;
}

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
watch([search, filterClientId, filterDateRange, statusFilter], () => { currentPage.value = 1; });

// Refetch from server whenever the client filter changes (so we always get
// the canonical client→document mapping rather than relying on cached rows).
watch(filterClientId, (cid) => {
  store.fetch({ clientId: cid ?? undefined, limit: 500 }, true);
});

const filteredRows = computed(() => {
  let rows = store.rows ?? [];
  if (statusFilter.value !== "all") {
    rows = rows.filter((row) => matchesStatusFilter(row, statusFilter.value));
  }
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
function reminderStatusLabel(status: string | null | undefined) {
  if (status === "assigned") return "תזכורת נקבעה";
  if (status === "missing") return "אין תזכורת";
  if (status === "error") return "שגיאת סריקה";
  return "ממתין";
}
function reminderTagType(status: string | null | undefined): "success" | "warning" | "error" | "info" | "default" {
  if (status === "assigned") return "success";
  if (status === "missing") return "warning";
  if (status === "error") return "error";
  return "info";
}
function matchesStatusFilter(row: Document, filter: DocumentStatusFilter) {
  if (filter === "all") return true;
  if (filter === "done") return row.processing_status === "done";
  if (filter === "in_progress") return row.processing_status === "queued" || row.processing_status === "processing";
  if (filter === "error") return row.processing_status === "error";
  if (filter === "no_reminder") return (row as any).reminder_status === "missing";
  if (filter === "contract_expired") return (row as any).contract_status === "expired" || (row as any).contract_status === "overdue";
  return true;
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
  store.fetch({ limit: 500 }, true);
  loadPipelineFlags();
  loadClients();
});
onUnmounted(() => {
  if (saveFlagsTimer) clearTimeout(saveFlagsTimer);
  stopRescanPolling();
});


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
    rescanStore.start({ queued: ids.length, ids, duplicates, kind: "upload" });
    await store.fetch({ limit: 500 }, true);
    updateRescanRowsFromDocuments();
    await openRescanModal();
    startBatchPolling(ids);
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
    await runRescan(false);
  } catch {
    message.error("שגיאה בסריקה מחדש");
  } finally {
    rescanning.value = false;
  }
}

async function doRescanAll() {
  showRescanAllConfirm.value = false;
  rescanningAll.value = true;
  try {
    await runRescan(true);
  } catch {
    message.error("שגיאה בסריקה מחדש של כל המסמכים");
  } finally {
    rescanningAll.value = false;
  }
}

async function runRescan(all: boolean) {
  const data = await api.documents.rescan(all ? { all: true } : undefined);
  if (data.queued === 0) {
    message.info(all ? "אין מסמכים זמינים לסריקה מחדש" : "אין מסמכים שצריכים סריקה מחדש");
  } else {
    message.success(`${data.queued} מסמכים נשלחו לסריקה מחדש`);
    rescanStore.start({ queued: data.queued, ids: data.ids ?? [], mode: data.mode, kind: "rescan" });
    await store.fetch({ limit: 500 }, true);
    updateRescanRowsFromDocuments();
    await openRescanModal();
    startBatchPolling(data.ids ?? []);
  }
  await store.fetch(undefined, true);
}

function stopRescanPolling() {
  if (rescanPollTimer) {
    clearInterval(rescanPollTimer);
    rescanPollTimer = null;
  }
}

function startBatchPolling(ids: string[]) {
  stopRescanPolling();
  const watchIds = new Set(ids.map(String));
  if (!watchIds.size) return;

  let attempts = 0;
  rescanPollTimer = setInterval(async () => {
    attempts += 1;
    try {
      await store.fetch({ limit: 500 }, true);
      const watchedRows = store.rows.filter((row) => watchIds.has(String(row.id)));
      updateRescanRowsFromDocuments();
      const running = watchedRows.filter((row) => row.processing_status === "queued" || row.processing_status === "processing");
      rescanStore.setRemaining(running.length);

      if (running.length === 0 && watchedRows.length > 0) {
        stopRescanPolling();
        rescanStore.markDone();
        const assigned = watchedRows.filter((row) => (row as any).reminder_status === "assigned").length;
        const missing = watchedRows.filter((row) => (row as any).reminder_status === "missing").length;
        const failed = watchedRows.filter((row) => row.processing_status === "error").length;
        if (rescanStore.kind === "upload") {
          const completed = watchedRows.filter((row) => row.processing_status === "done").length;
          if (failed) {
            message.warning(`העלאה הסתיימה: ${completed} עובדו, ${failed} שגיאות`);
          } else {
            message.success(`העלאה הסתיימה: ${completed} מסמכים עובדו`);
          }
        } else if (missing || failed) {
          message.warning(`סריקה הסתיימה: ${assigned} עם תזכורת, ${missing} ללא תזכורת, ${failed} שגיאות`);
        } else {
          message.success(`סריקה הסתיימה: ${assigned} מסמכים קיבלו תזכורת`);
        }
      } else if (attempts >= 40) {
        stopRescanPolling();
        rescanStore.markBackground();
        message.info("הסריקה עדיין רצה ברקע, הרשימה תתעדכן ברענון הבא");
      }
    } catch {
      if (attempts >= 3) stopRescanPolling();
    }
  }, 3000);
}

function updateRescanRowsFromDocuments() {
  const rows = rescanRows.value.map((row) => ({
    id: row.id,
    file_name: row.file_name,
    processing_status: row.processing_status,
    reminder_status: (row as any).reminder_status ?? null,
    reminder_date: (row as any).reminder_date ?? null,
    document_type: (row as any).document_type ?? null,
    error_message: (row as any).error_message ?? null,
  }));
  rescanStore.updateRows(rows);
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

/* ── Filter bar ──────────────────────────────────────────────────────────── */
.filterbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  padding: 6px;
  background: var(--bg-elevated);
  border-radius: 14px;
  border: 1px solid var(--border-color);
}
.filterbar--compact {
  margin-top: -8px;
  padding: 5px;
  background: transparent;
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
.pill--compact { padding: 6px 13px; font-size: 12px; }
.pill:hover { background: var(--bg-hover); color: var(--text-primary); }
.pill--active {
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}
.pill__badge {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 999px;
}

/* ── Quota bar ───────────────────────────────────────────────────────────── */
.quota-bar { margin-bottom: 12px; }
.quota-bar__text { display: flex; justify-content: space-between; font-size: 13px; color: var(--text-secondary); margin-bottom: 5px; }
.quota-bar__limit { color: #e88080; font-weight: 600; }

/* ── Drop strip ──────────────────────────────────────────────────────────── */
.drop-strip {
  border: 1px dashed rgba(24, 160, 88, 0.42);
  border-radius: 12px;
  padding: 22px 16px;
  text-align: center;
  margin-bottom: 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  background:
    linear-gradient(135deg, rgba(24, 160, 88, 0.10), rgba(32, 128, 240, 0.06)),
    var(--bg-card);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  transition: border-color 0.2s, background 0.2s, color 0.2s, transform 0.12s;
}
.drop-strip:hover {
  border-color: var(--brand-color);
  color: var(--text-primary);
}
.drop-strip--active {
  border-color: var(--brand-color);
  background:
    linear-gradient(135deg, rgba(99,226,183,0.18), rgba(32,128,240,0.10)),
    var(--bg-card);
  color: var(--text-primary);
  transform: translateY(-1px);
}
.drop-strip--disabled { border-color: #e88080; background: rgba(232,128,128,0.05); color: #e88080; }

/* ── Settings popover ────────────────────────────────────────────────────── */
.settings-pop { padding: 6px 4px; }
.settings-pop__title { font-size: 13px; font-weight: 600; margin-bottom: 10px; color: var(--text-primary); }
.rescan-confirm {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.65;
}
.rescan-confirm p {
  margin: 0 0 10px;
}
.rescan-confirm ul {
  margin: 0;
  padding-inline-start: 20px;
}
.rescan-confirm li + li {
  margin-top: 4px;
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
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
.toolbar__client {
  width: 200px;
}
.toolbar__dates {
  width: 260px;
}
.toolbar__view-toggle { display: flex; gap: 4px; margin-right: auto; }

.status-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: -6px 0 16px;
}
.status-filter :deep(.n-button__content) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.status-filter__count {
  min-width: 24px;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}
.status-filter__btn--active .status-filter__count {
  background: rgba(255, 255, 255, 0.22);
  color: inherit;
}

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
.tile__reminder-status {
  position: absolute;
  right: 8px;
  bottom: 8px;
  max-width: calc(100% - 16px);
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

@media (max-width: 640px) {
  .page2 {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  :deep(.page-header__actions) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  :deep(.page-header__actions > .n-button),
  :deep(.page-header__actions > .n-popover) {
    width: 100%;
  }

  :deep(.page-header__actions .n-button) {
    justify-content: center;
  }

  .quota-bar__text {
    flex-direction: column;
    gap: 4px;
  }

  .drop-strip {
    min-height: 86px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px 14px;
    line-height: 1.55;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .toolbar__search,
  .toolbar__client,
  .toolbar__dates {
    width: 100%;
    min-width: 0;
    flex-basis: auto;
  }

  .toolbar__view-toggle {
    width: 100%;
    margin-right: 0;
  }

  .toolbar__view-toggle :deep(.n-button) {
    flex: 1;
  }

  .status-filter {
    gap: 6px;
  }

  .status-filter :deep(.n-button) {
    flex: 1 1 calc(50% - 6px);
  }

  :deep(.list-card) {
    border-radius: 12px;
    padding: 12px;
  }

  :deep(.list-card__row) {
    align-items: flex-start;
    gap: 10px;
  }

  :deep(.list-card__title) {
    align-items: flex-start;
    min-width: 0;
  }

  :deep(.list-card__actions) {
    gap: 5px;
  }

  :deep(.list-card__foot) {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .list-pdf-icon {
    padding-top: 2px;
  }

  .tag {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@media (max-width: 420px) {
  :deep(.page-header__actions) {
    grid-template-columns: 1fr;
  }

  :deep(.list-card__row) {
    flex-direction: column-reverse;
  }

  :deep(.list-card__actions) {
    align-self: flex-start;
    display: grid;
    grid-template-columns: repeat(3, 34px);
  }

  :deep(.list-card__actions .n-button) {
    width: 34px;
  }
}

</style>
