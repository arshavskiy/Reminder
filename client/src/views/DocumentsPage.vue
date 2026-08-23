<template>
  <div class="page2">
    <PageHeader
      :count="store.total"
      title="מסמכים"
      subtitle="צפייה, סינון וניהול של כל המסמכים במערכת"
    >
      <template #hero>
        <button
            v-if="authStore.isAdmin || true"
            :class="{ 'rbtn--loading': uploading }"
            :disabled="limitReached || uploading"
            class="rbtn rbtn--primary"
            type="button"
            @click="openUploadModal()"
        >
          <n-icon :component="CloudUploadOutline" class="btn-icon"/>
          העלה קבצים
        </button>
        <button
            :class="{ 'rbtn--loading': importingFromGmail }"
            :disabled="importingFromGmail"
            class="rbtn rbtn--ghost"
            type="button"
            @click="handleGmailImport"
        >
          <GmailLogo :size="16" class="btn-icon" />
          ייבוא תסקיר בדיקה
        </button>
      </template>
      <template #actions>
        <div class="documents-actions">
          <button :disabled="store.loading" class="rbtn rbtn--ghost" type="button"
                  @click="store.fetch(undefined, true)">
            <n-icon :class="{ 'refresh-icon--spin': store.loading }" :component="RefreshOutline" class="btn-icon"/>
            רענן
          </button>
          <button v-if="rescanStore.hasSession" class="rbtn rbtn--ghost" type="button" @click="openRescanModal">
            {{ rescanStore.kind === "upload" ? "הצג העלאה אחרונה" : "הצג סריקה אחרונה" }}
          </button>
          <button
              :disabled="rescanningAll || rescanning"
              class="rbtn rbtn--ghost"
              type="button"
              @click="doRescan"
          >
            <n-icon :class="{ 'refresh-icon--spin': rescanning }" :component="RefreshOutline" class="btn-icon"/>
            סריקה מחדש
          </button>
          <button
              v-if="authStore.isAdmin"
              :disabled="rescanning || rescanningAll"
              class="rbtn rbtn--ghost rbtn--warning"
              type="button"
              @click="showRescanAllConfirm = true"
          >
            <n-icon :class="{ 'refresh-icon--spin': rescanningAll }" :component="RefreshOutline" class="btn-icon"/>
            סרוק הכל מחדש
          </button>
          <button
              v-if="authStore.isAdmin"
              :class="{ 'rbtn--loading': deletingAll }"
              :disabled="deletingAll"
              class="rbtn rbtn--danger"
              type="button"
              @click="confirmDeleteAll"
          >
            <n-icon :component="TrashOutline" class="btn-icon"/>
            מחק הכל
          </button>
          <div v-if="store.rows.length" class="bulk-action-anchor">
            <div class="bulk-action-anchor__row">
              <button
                  :class="{ 'rbtn--ghost-active': bulkMode }"
                  class="rbtn rbtn--ghost"
                  title="בחירה מרובה"
                  type="button"
                  @click="toggleBulkMode"
              >
                <n-icon :component="CheckboxOutline" class="btn-icon"/>
                בחירה מרובה
                <span v-if="selectedIds.size">({{ selectedIds.size }})</span>
              </button>
              <button
                  v-if="bulkMode && filteredRows.length"
                  class="rbtn rbtn--ghost"
                  type="button"
                  @click="selectAll"
              >
                {{ selectedIds.size === filteredRows.length ? 'בטל הכל' : 'בחר הכל' }}
              </button>
            </div>
            <div v-if="bulkMode && selectedIds.size > 0" class="bulk-action-anchor__actions">
              <button
                  :class="{ 'bulk-action-item--loading': bulkDownloading }"
                  :disabled="bulkDownloading"
                  class="bulk-action-item bulk-action-item--primary"
                  type="button"
                  @click="bulkDownload"
              >
                <n-icon :component="DownloadOutline" class="bulk-action-item__icon"/>
                <span class="bulk-action-item__text">הורד נבחרים</span>
                <span class="bulk-action-item__count">{{ selectedIds.size }}</span>
              </button>
              <button
                  :class="{ 'bulk-action-item--loading': bulkDeleting }"
                  :disabled="bulkDeleting"
                  class="bulk-action-item bulk-action-item--danger"
                  type="button"
                  @click="confirmBulkDelete"
              >
                <n-icon :component="TrashOutline" class="bulk-action-item__icon"/>
                <span class="bulk-action-item__text">מחק נבחרים</span>
                <span class="bulk-action-item__count">{{ selectedIds.size }}</span>
              </button>
            </div>
          </div>

          <!-- Pipeline settings popover -->
          <n-popover :width="320" placement="bottom-end" trigger="click">
            <template #trigger>
              <button class="rbtn rbtn--ghost" title="הגדרות עיבוד" type="button">
                <n-icon :component="SettingsOutline" class="btn-icon"/>
                הגדרות
              </button>
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
        </div>
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

    <!-- Drop strip with inline upload + results modal -->
    <div v-if="limitReached" class="drop-strip drop-strip--disabled">
      <span>הגעת למגבלת {{ store.documentLimit }} סריקות</span>
    </div>
    <DocumentDropStrip v-else @uploaded="store.fetch(undefined, true)" />

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
        placeholder="חיפוש לפי שם קובץ או מספר תסקיר..."
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
      <n-select
        v-model:value="filterDocumentType"
        :options="[{ label: 'כל הסוגים', value: null }, ...documentTypeOptions]"
        :virtual-scroll="false"
        class="toolbar__type"
        clearable
        filterable
        placeholder="סינון לפי סוג"
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
        <n-tooltip placement="top">
          <template #trigger>
            <button
              :class="{ 'rbtn--ghost-active': viewMode === 'grid' }"
              :aria-label="'אריחים'"
              class="rbtn rbtn--ghost rbtn--icon"
              type="button"
              @click="viewMode = 'grid'"
            >
              <n-icon :component="GridOutline" :size="16" class="btn-icon"/>
            </button>
          </template>
          אריחים
        </n-tooltip>
        <n-tooltip placement="top">
          <template #trigger>
            <button
              :class="{ 'rbtn--ghost-active': viewMode === 'list' }"
              :aria-label="'רשימה'"
              class="rbtn rbtn--ghost rbtn--icon"
              type="button"
              @click="viewMode = 'list'"
            >
              <n-icon :component="ListOutline" :size="16" class="btn-icon"/>
            </button>
          </template>
          רשימה
        </n-tooltip>
      </div>
    </div>


    <!-- ── Tile grid ──────────────────────────────────────────────────── -->
    <n-spin :show="store.loading">
      <div v-if="pagedRows.length && viewMode === 'grid'" class="tile-grid">
        <article
          v-for="row in pagedRows"
          :key="row.id"
          :class="{
            [`tile--${fileKind(row.mime_type)}`]: true,
            'tile--selected': selectedIds.has(String(row.id)),
            'tile--selectable': bulkMode,
          }"
          class="tile"
          @click="onDocumentClick(row)"
        >
          <div class="tile__head">
            <n-checkbox
              v-if="bulkMode"
              :checked="selectedIds.has(String(row.id))"
              class="tile__check"
              @click.stop
              @update:checked="toggleSelect(String(row.id))"
            />
            <StatusBadge :status="row.processing_status" />
            <div class="tile__actions" @click.stop>
              <n-dropdown
                :options="rowActionsFor(row)"
                placement="bottom-end"
                trigger="click"
                @select="(k: string) => handleRowAction(k, row)"
              >
                <button class="btn btn--ghost btn--xs icon-btn" title="פעולות" type="button">
                  <n-icon :component="EllipsisVerticalOutline" class="btn-icon"/>
                </button>
              </n-dropdown>
            </div>
          </div>
          <div class="tile__thumb">
            <n-icon
              :component="fileTypeIcon(row.mime_type)"
              :size="40"
              class="tile__file-icon"
            />
          </div>
          <div class="tile__body">
            <div :title="row.file_name" class="tile__name">{{ row.file_name }}</div>
            <div class="tile__meta">
              <span v-if="documentReportNumberLabel(row)" class="tile__meta-item tile__meta-item--num">
                {{ documentReportNumberLabel(row) }}
              </span>
              <span v-if="(row as any).client_name" class="tile__meta-item">{{ (row as any).client_name }}</span>
              <span v-if="documentTypeLabel(row)" class="tile__meta-item">{{ documentTypeLabel(row) }}</span>
            </div>
            <div class="tile__pills">
              <n-tag
                v-if="shouldShowReminderBadge(row)"
                :type="reminderTagType((row as any).reminder_status)"
                round
                size="small"
              >
                {{ reminderStatusLabel((row as any).reminder_status) }}
              </n-tag>
              <n-tag
                v-for="issue in documentIssues(row)"
                :key="issue.kind"
                round
                size="small"
                :type="issue.tagClass === 'tag--bad' ? 'error' : 'warning'"
              >
                {{ issue.label }}
              </n-tag>
            </div>
            <div class="tile__date">{{ formatDate(row.import_date) }}</div>
          </div>
        </article>
      </div>

      <!-- ── List view (compact) ──────────────────────────────────────── -->
      <div v-else-if="pagedRows.length && viewMode === 'list'" class="cards">
        <ListCard
          v-for="row in pagedRows"
          :key="row.id"
          :selected="selectedIds.has(String(row.id))"
          @click="onDocumentClick(row)"
        >
          <template #title>
            <n-checkbox
              v-if="bulkMode"
              :checked="selectedIds.has(String(row.id))"
              @click.stop
              @update:checked="toggleSelect(String(row.id))"
            />
            <n-icon
              :component="fileTypeIcon(row.mime_type)"
              :class="['list-file-icon', `file-type-icon--${fileKind(row.mime_type)}`]"
              :size="22"
            />
            <span class="truncate font-semibold">{{ row.file_name }}</span>
          </template>
          <template #actions>
            <button class="btn btn--ghost btn--xs icon-btn" title="הורד" type="button" @click.stop="openDownload(row)">
              <n-icon :component="DownloadOutline" class="btn-icon"/>
            </button>
            <button
                v-if="canExtractDocument(row)"
                class="btn btn--ghost btn--xs icon-btn"
                title="חלץ AI"
                type="button"
                @click.stop="openExtractModal(String(row.id))"
            >
              <n-icon :component="FlashOutline" class="btn-icon"/>
            </button>
            <button
                class="btn btn--danger-ghost btn--xs icon-btn"
                title="מחק"
                type="button"
                @click.stop="confirmDeleteDocument(row)"
            >
              <n-icon :component="TrashOutline" class="btn-icon"/>
            </button>
          </template>
          <template #pills>
            <StatusBadge :status="row.processing_status" />
            <n-tag
              v-if="shouldShowReminderBadge(row)"
              :type="reminderTagType((row as any).reminder_status)"
              round
              size="small"
            >
              {{ reminderStatusLabel((row as any).reminder_status) }}
            </n-tag>
            <span
              v-for="issue in documentIssues(row)"
              :key="issue.kind"
              :class="['tag', issue.tagClass]"
            >
              {{ issue.label }}
            </span>
            <span class="tag tag--neutral">{{ row.mime_type }}</span>
          </template>
          <template #footer>
            <div class="flex flex-col gap-1">
              <span v-if="(row as any).client_name" class="kv">
                <strong>חברה:</strong> {{ (row as any).client_name }}
              </span>
              <span class="kv"><strong>ייבוא:</strong> {{ formatDate(row.import_date) }}</span>
            </div>
            <div class="flex flex-col gap-1 items-end">
              <span v-if="documentTypeLabel(row)" class="kv"><strong>סוג:</strong> {{ documentTypeLabel(row) }}</span>
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
        <button :disabled="limitReached" class="rbtn rbtn--primary mt-3" type="button" @click="openUploadModal()">
          <n-icon :component="CloudUploadOutline" class="btn-icon"/>
          העלה מסמך ראשון
        </button>
      </div>
    </n-spin>

    <PaginationBar
      v-if="filteredRows.length"
      v-model:page="currentPage"
      v-model:page-size="pageSize"
      :item-count="filteredRows.length"
    />

    <!-- ── Document limit modal ────────────────────────────────────────── -->
    <n-modal
      v-model:show="showLimitModal"
      :class="confirmDialogClass"
      :negative-button-props="confirmCancelButtonProps"
      :positive-button-props="confirmActionButtonProps('warning')"
      :show-icon="false"
      negative-text="סגור"
      positive-text="שדרג ל-Pro"
      preset="dialog"
      type="warning"
      @positive-click="showLimitModal = false"
      @negative-click="showLimitModal = false"
    >
      <template #header>
        <ConfirmDialogHead title="הגעת למגבלת המסמכים" type="warning"/>
      </template>
      <p>הגעת למגבלת <strong>{{ store.documentLimit }}</strong> המסמכים בחשבון החינמי.</p>
      <p class="text-sm text-[var(--text-secondary)]">שדרג לחשבון Pro להעלאה בלתי מוגבלת.</p>
    </n-modal>

    <n-modal
      v-model:show="showRescanAllConfirm"
      :class="confirmDialogClass"
      :negative-button-props="confirmCancelButtonProps"
      :positive-button-props="confirmActionButtonProps('warning')"
      :show-icon="false"
      negative-text="ביטול"
      positive-text="סרוק הכל מחדש"
      preset="dialog"
      type="warning"
      @positive-click="doRescanAll"
      @negative-click="showRescanAllConfirm = false"
    >
      <template #header>
        <ConfirmDialogHead title="סריקה מחדש לכל המסמכים" type="warning"/>
      </template>
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
import {computed, h, nextTick, onMounted, onUnmounted, ref, watch, type Component} from "vue";
import {useRouter} from "vue-router";
import {
  NAlert,
  NCheckbox,
  NDatePicker,
  NDropdown,
  NIcon,
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
import {
  CloudUploadOutline,
  DocumentOutline,
  DocumentTextOutline,
  DownloadOutline,
  EllipsisVerticalOutline,
  EyeOutline,
  FlashOutline,
  GridOutline,
  ImageOutline,
  ListOutline,
  RefreshOutline,
  CheckboxOutline,
  SettingsOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import {useDocumentsStore} from "../stores/documents.js";
import {useAuthStore} from "../stores/auth.js";
import {useRescanModalStore} from "../stores/rescanModal.js";
import {api} from "../services/apiService.js";
import StatusBadge from "../components/StatusBadge.vue";
import PageHeader from "../components/PageHeader.vue";
import ListCard from "../components/ListCard.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UploadModal from "../components/UploadModal.vue";
import DocumentDropStrip from "../components/DocumentDropStrip.vue";
import GmailLogo from "../components/GmailLogo.vue";
import type {DocTemplate, Document} from "@shared/types.js";
import {
  countDuplicateReportRows,
  documentReportNumber,
  documentReportNumberLabel,
  duplicateReportNumberSet,
  isDuplicateReportNumber,
  listDocumentRowIssues,
} from "@shared/rowIssues.js";
import {
  documentTypeFromTemplate,
  pickBestTemplateForExtraction,
} from "@shared/missingDocumentFields.js";
import {readRememberedFilter, writeRememberedFilter} from "@shared/rememberedUi.js";
import {confirmActionButtonProps, confirmCancelButtonProps, CONFIRM_DIALOG_CLASS, useConfirm} from "../composables/useConfirm.js";
import ConfirmDialogHead from "../components/ConfirmDialogHead.vue";

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const store = useDocumentsStore();
const authStore = useAuthStore();
const rescanStore = useRescanModalStore();
const router = useRouter();
const message = useMessage();
const {confirm} = useConfirm();
const confirmDialogClass = CONFIRM_DIALOG_CLASS;

const isRegularUser = computed(() => authStore.user?.role === "user");
const quotaPercent = computed(() => Math.min(100, Math.round((store.totalAll / store.documentLimit) * 100)));
const limitReached = computed(() => isRegularUser.value && store.totalAll >= store.documentLimit);

const uploading = ref(false);
const importingFromGmail = ref(false);
let rescanPollTimer: ReturnType<typeof setInterval> | null = null;
const rescanning = ref(false);
const rescanningAll = ref(false);
const deletingAll = ref(false);
const bulkMode = ref(false);
const selectedIds = ref(new Set<string>());
const bulkDeleting = ref(false);
const bulkDownloading = ref(false);
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

async function handleGmailImport() {
  importingFromGmail.value = true;
  try {
    const status = await api.gmail.status();
    if (!status.connected) {
      const { url } = await api.gmail.authUrl();
      window.location.assign(url);
      return;
    }
    const template = docTemplates.value.find(
      (t) => t.document_kind === "inspection_report" || /תסקיר|בדיקה|ציוד|הרמה/i.test(t.name)
    ) ?? null;
    const templateId = template?.id ? String(template.id) : undefined;
    const result = await api.gmail.importAll(undefined, undefined, templateId);
    const failed = result.results.filter((r) => r.error).length;
    const imported = result.imported ?? 0;
    if (imported) {
      message.success(`יובאו ${imported} תסקירים מ-Gmail`);
    } else if (failed) {
      message.warning("לא יובאו מסמכים. חלק מהקבצים נכשלו בעיבוד.");
    } else {
      message.info("לא נמצאו תסקירים חדשים לייבוא");
    }
    await store.fetch(undefined, true);
  } catch (err: any) {
    const code = String(err?.message ?? "");
    if (code.includes("gmail_not_connected")) {
      message.error("Gmail לא מחובר. לחץ שוב כדי להתחבר.");
    } else if (code.includes("document_monthly_quota_exceeded")) {
      message.error("הגעת למגבלת הייבוא החודשית של המנוי.");
    } else {
      message.error("שגיאה בייבוא מ-Gmail");
    }
  } finally {
    importingFromGmail.value = false;
  }
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
  router.push("/settings/doc-templates");
}

async function openRescanModal() {
  showUploadModal.value = true;
  await nextTick();
  uploadModalRef.value?.openRescan();
}

async function onModalUpload(
  files: File[],
  fields: { key: string; label_he: string; type: string }[],
  options: { doAi: boolean; doEntities: boolean; doReminders: boolean; templateId?: string }
) {
  await uploadFiles(files, options);
  showUploadModal.value = false;
}

// ── Filters ───────────────────────────────────────────────────────────────────
type DocumentStatusFilter = "all" | "done" | "in_progress" | "error" | "no_reminder" | "no_email" | "contract_expired" | "duplicate_report_number";

const DOCUMENT_FILTER_KEYS = new Set<DocumentStatusFilter>([
  "all", "done", "in_progress", "error", "no_reminder", "no_email", "contract_expired", "duplicate_report_number",
]);
function initialDocumentFilter(): DocumentStatusFilter {
  const stored = readRememberedFilter("documents");
  return DOCUMENT_FILTER_KEYS.has(stored as DocumentStatusFilter) ? stored as DocumentStatusFilter : "all";
}

const search = ref("");
const filterClientId = ref<string | null>(null);
const filterDocumentType = ref<string | null>(null);
const filterDateRange = ref<[number, number] | null>(null);
const statusFilter = ref<DocumentStatusFilter>(initialDocumentFilter());

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  inspection_report: "תסקיר בדיקה",
  contract: "חוזה / הסכם",
  invoice: "חשבונית",
  certificate: "תעודה / הסמכה",
  unknown: "לא ידוע",
  "חוזה שירות": "חוזה / הסכם",
  חשבונית: "חשבונית",
  "תסקיר בדיקה": "תסקיר בדיקה",
};

function formatDocumentTypeLabel(raw: string): string {
  return DOCUMENT_TYPE_LABELS[raw] ?? raw;
}

const documentTypeOptions = computed(() => {
  const seen = new Set<string>();
  for (const row of store.rows ?? []) {
    const label = documentTypeLabel(row);
    if (label) seen.add(label);
  }
  for (const tpl of docTemplates.value) {
    const label = formatDocumentTypeLabel(documentTypeFromTemplate(tpl));
    if (label) seen.add(label);
  }
  return [...seen]
    .sort((a, b) => a.localeCompare(b, "he"))
    .map((value) => ({ label: value, value }));
});

type CombinedFilter = {
  key: string;
  label: string;
  count: number;
  statusValue?: DocumentStatusFilter;
};

const combinedFilters = computed<CombinedFilter[]>(() => {
  const c = store.counts;
  const rows = store.rows ?? [];
  const duplicateCount = countDuplicateReportRows(rows, documentReportNumber);
  return [
    { key: "all",         label: "הכל",         count: c.all,          statusValue: "all" },
    { key: "done",        label: "הושלם",       count: c.done,         statusValue: "done" },
    { key: "in_progress", label: "בעיבוד",      count: c.in_progress,  statusValue: "in_progress" },
    { key: "error",       label: "שגיאה",       count: c.error,        statusValue: "error" },
    { key: "no_reminder",       label: "ללא תזכורת", count: rows.filter((row) => (row as any).reminder_status === "missing" && !isPayslipDocument(row)).length, statusValue: "no_reminder" },
    { key: "no_email",          label: "חסר אימייל", count: rows.filter((row) => !documentHasEmail(row)).length, statusValue: "no_email" },
    { key: "contract_expired",  label: "פג תוקף",   count: rows.filter((row) => (row as any).contract_status === "expired" || (row as any).contract_status === "overdue").length, statusValue: "contract_expired" },
    { key: "duplicate_report_number", label: "כפילות מספר", count: duplicateCount, statusValue: "duplicate_report_number" },
  ];
});

const duplicateDocumentNumbers = computed(() =>
  duplicateReportNumberSet(store.rows ?? [], documentReportNumber),
);

function documentIssues(row: Document) {
  return listDocumentRowIssues(row as Document & { reminder_status?: string; contract_status?: string }, duplicateDocumentNumbers.value);
}

const activeFilterKey = ref(statusFilter.value);

function applyFilter(f: CombinedFilter) {
  activeFilterKey.value = f.key;
  statusFilter.value = f.statusValue ?? "all";
  currentPage.value = 1;
  writeRememberedFilter("documents", f.key);
}

const clientOptions = ref<{ label: string; value: string }[]>([]);
async function loadClients() {
  try {
    const r = await api.clients.list({ limit: 0 });
    clientOptions.value = r.rows.map((c) => ({ label: c.display_name, value: String(c.id) }));
  } catch { /* non-fatal */ }
}

// ── Pagination ─────────────────────────────────────────────────────────────────
const pageSize = ref(20);
const currentPage = ref(1);
watch([search, filterClientId, filterDocumentType, filterDateRange, statusFilter, pageSize], () => {
  currentPage.value = 1;
});

// Refetch from server whenever the client filter changes (so we always get
// the canonical client→document mapping rather than relying on cached rows).
watch(filterClientId, (cid) => {
  store.fetch({ clientId: cid ?? undefined, limit: 0 }, true);
});

const filteredRows = computed(() => {
  let rows = store.rows ?? [];
  if (statusFilter.value !== "all") {
    rows = rows.filter((row) => matchesStatusFilter(row, statusFilter.value));
  }
  if (filterDocumentType.value) {
    rows = rows.filter((row) => documentTypeLabel(row) === filterDocumentType.value);
  }
  const q = search.value.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      (r.file_name ?? "").toLowerCase().includes(q) ||
      (documentReportNumber(r)?.includes(q) ?? false),
    );
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

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredRows.value.slice(start, start + pageSize.value);
});

const allSelected = computed(() =>
  bulkMode.value && selectedIds.value.size > 0 && selectedIds.value.size === filteredRows.value.length
);

watch(filteredRows, (rows, oldRows) => {
  const count = Math.max(1, Math.ceil(rows.length / pageSize.value));
  if (currentPage.value > count) currentPage.value = count;
  if (bulkMode.value && selectedIds.value.size > 0) {
    const wasAllSelected = oldRows && selectedIds.value.size === oldRows.length;
    if (wasAllSelected) {
      selectedIds.value = new Set(rows.map((r) => String(r.id)));
    } else {
      const visible = new Set(rows.map((r) => String(r.id)));
      selectedIds.value = new Set([...selectedIds.value].filter((id) => visible.has(id)));
    }
  }
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
  if (status === "not_applicable") return "";
  return "ממתין";
}
function reminderTagType(status: string | null | undefined): "success" | "warning" | "error" | "info" | "default" {
  if (status === "assigned") return "success";
  if (status === "missing") return "warning";
  if (status === "error") return "error";
  return "info";
}

/** Salary / payslip docs — no reminder workflow. */
function isPayslipDocument(row: Document | Record<string, unknown>): boolean {
  const type = `${(row as any).document_type ?? ""} ${(row as any).document_kind ?? ""}`;
  if (/תלוש/.test(type)) return true;
  if ((row as any).reminder_status === "not_applicable") return true;
  try {
    const fields = typeof (row as any).extracted_fields === "string"
      ? JSON.parse((row as any).extracted_fields)
      : (row as any).extracted_fields ?? {};
    return Boolean(
      fields.payroll_month ||
      fields.employee_name ||
      fields.net_payment ||
      fields.base_salary,
    );
  } catch {
    return false;
  }
}

function shouldShowReminderBadge(row: Document): boolean {
  if (isPayslipDocument(row)) return false;
  const status = (row as any).reminder_status;
  return status !== "not_applicable";
}

/** Prefer the linked/matched template's document_kind (e.g. תלוש משכורת). */
function documentTypeLabel(row: Document | Record<string, unknown>): string {
  let extracted: Record<string, unknown> = {};
  try {
    const raw = (row as any).extracted_fields;
    extracted = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
  } catch {
    extracted = {};
  }
  const preferredId = (row as any).template_id != null ? String((row as any).template_id) : null;
  const matched =
    pickBestTemplateForExtraction(docTemplates.value, extracted, preferredId) ||
    (preferredId
      ? docTemplates.value.find((t) => String(t.id) === preferredId) ?? null
      : null);
  const fromTemplate = documentTypeFromTemplate(matched);
  if (fromTemplate) return formatDocumentTypeLabel(fromTemplate);

  const kind = String((row as any).document_kind ?? "").trim();
  const type = String((row as any).document_type ?? "").trim();
  const builtins = new Set([
    "inspection_report",
    "contract",
    "invoice",
    "certificate",
    "unknown",
    "חשבונית",
    "חוזה שירות",
    "תסקיר בדיקה",
  ]);
  if (kind && !builtins.has(kind)) return formatDocumentTypeLabel(kind);
  if (type && !builtins.has(type)) return formatDocumentTypeLabel(type);
  if (type) return formatDocumentTypeLabel(type);
  if (kind && kind !== "unknown") return formatDocumentTypeLabel(kind);
  return "";
}

function documentHasEmail(row: Document): boolean {
  try {
    const fields = typeof (row as any).extracted_fields === "string"
      ? JSON.parse((row as any).extracted_fields)
      : (row as any).extracted_fields ?? {};
    return !!(fields.client_email || fields.contact_email || fields.email);
  } catch { return false; }
}

function matchesStatusFilter(row: Document, filter: DocumentStatusFilter) {
  if (filter === "all") return true;
  if (filter === "done") return row.processing_status === "done";
  if (filter === "in_progress") return row.processing_status === "queued" || row.processing_status === "processing";
  if (filter === "error") return row.processing_status === "error";
  if (filter === "no_reminder") {
    return (row as any).reminder_status === "missing" && !isPayslipDocument(row);
  }
  if (filter === "no_email") return !documentHasEmail(row);
  if (filter === "contract_expired") return (row as any).contract_status === "expired" || (row as any).contract_status === "overdue";
  if (filter === "duplicate_report_number") {
    return isDuplicateReportNumber(documentReportNumber(row), duplicateDocumentNumbers.value);
  }
  return true;
}
function fileKind(mime: string | null | undefined) {
  if (!mime) return "other";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("word") || mime.includes("docx")) return "doc";
  if (mime.includes("sheet") || mime.includes("xlsx")) return "xls";
  if (mime.includes("image")) return "img";
  return "other";
}

function fileTypeIcon(mime: string | null | undefined) {
  const kind = fileKind(mime);
  if (kind === "pdf") return DocumentTextOutline;
  if (kind === "xls") return GridOutline;
  if (kind === "img") return ImageOutline;
  return DocumentOutline;
}

function renderActionIcon(icon: Component) {
  return () => h(NIcon, {component: icon});
}
function rowActions() {
  return [
    {label: "צפה", key: "view", icon: renderActionIcon(EyeOutline)},
    {label: "הורד", key: "download", icon: renderActionIcon(DownloadOutline)},
    {label: "חלץ AI", key: "extract", icon: renderActionIcon(FlashOutline)},
    { type: "divider", key: "d1" },
    {
      label: "מחק",
      key: "delete",
      icon: renderActionIcon(TrashOutline),
      props: {style: "color: var(--color-error, #d03050)"},
    },
  ];
}
function rowActionsFor(row: Document) {
  return rowActions().filter((action) => action.key !== "extract" || canExtractDocument(row));
}
function handleRowAction(key: string, row: Document) {
  if (key === "view") router.push(`/documents/${row.id}`);
  if (key === "download") openDownload(row);
  if (key === "extract") openExtractModal(String(row.id));
  if (key === "delete") confirmDeleteDocument(row);
}

function canExtractDocument(row: Document): boolean {
  return row.document_source !== "generated";
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

const docTemplates = ref<DocTemplate[]>([]);

async function loadDocTemplates() {
  try {
    docTemplates.value = await api.docTemplates.list();
  } catch {
    docTemplates.value = [];
  }
}

onMounted(() => {
  store.fetch(undefined, true);
  loadPipelineFlags();
  loadClients();
  void loadDocTemplates();
});
onUnmounted(() => {
  if (saveFlagsTimer) clearTimeout(saveFlagsTimer);
  stopRescanPolling();
});


// ── File handling ─────────────────────────────────────────────────────────────
async function uploadFiles(
  files: File[],
  options?: { doAi: boolean; doEntities: boolean; doReminders: boolean; templateId?: string }
) {
  uploading.value = true;
  try {
    const {ids, duplicates} = await api.documents.upload(files, options, options?.templateId);
    const newCount = ids.length - (duplicates?.length ?? 0);
    if (newCount > 0) message.info(`${newCount} מסמכים נוספו לתור עיבוד`);
    if (duplicates?.length) message.warning(`${duplicates.length} קובץ/ים כבר קיים/ים: ${duplicates.join(", ")}`);
    rescanStore.start({ queued: ids.length, ids, duplicates, kind: "upload" });
    await store.fetch(undefined, true);
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
    await store.fetch(undefined, true);
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
      await store.fetch(undefined, true);
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
function confirmDeleteAll() {
  const count = filteredRows.value.length;
  confirm({
    title: "מחיקת מסמכים",
    content: `האם למחוק את ${count} המסמכים המסוננים? פעולה זו אינה הפיכה.`,
    confirmText: "מחק הכל",
    onConfirm: doDeleteAll,
  });
}

function confirmDeleteDocument(row: Document) {
  confirm({
    title: "מחיקת מסמך",
    content: `למחוק את המסמך "${row.file_name}"? פעולה זו אינה הפיכה.`,
    confirmText: "מחק",
    onConfirm: async () => {
      try {
        await store.deleteDoc(row.id);
        message.success("המסמך נמחק");
      } catch (e) {
        message.error(String(e));
      }
    },
  });
}
function toggleBulkMode() {
  bulkMode.value = !bulkMode.value;
  if (!bulkMode.value) selectedIds.value = new Set();
}
function selectAll() {
  if (selectedIds.value.size === filteredRows.value.length) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(filteredRows.value.map((r) => String(r.id)));
  }
}
function toggleSelect(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}
function onDocumentClick(row: Document) {
  if (bulkMode.value) {
    toggleSelect(String(row.id));
    return;
  }
  router.push(`/documents/${row.id}`);
}
function confirmBulkDelete() {
  const count = selectedIds.value.size;
  if (!count) return;
  confirm({
    title: "מחיקת מסמכים נבחרים",
    content: `האם למחוק ${count} מסמכים נבחרים? פעולה זו אינה הפיכה.`,
    confirmText: "מחק נבחרים",
    onConfirm: doBulkDelete,
  });
}
async function doBulkDelete() {
  const ids = [...selectedIds.value];
  if (!ids.length || bulkDeleting.value) return;
  bulkDeleting.value = true;
  try {
    await Promise.all(ids.map((id) => api.documents.delete(id)));
    message.success(ids.length === 1 ? "המסמך נמחק" : `${ids.length} מסמכים נמחקו`);
    selectedIds.value = new Set();
    bulkMode.value = false;
    await store.fetch(undefined, true);
  } catch {
    message.error("שגיאה במחיקת המסמכים");
  } finally {
    bulkDeleting.value = false;
  }
}
async function doDeleteAll() {
  deletingAll.value = true;
  try {
    const ids = filteredRows.value.map((r) => r.id);
    await Promise.all(ids.map((id) => store.deleteDoc(id)));
    message.success(`${ids.length} מסמכים נמחקו`);
    await store.fetch(undefined, true);
  } catch {
    message.error("שגיאה במחיקת המסמכים");
  } finally {
    deletingAll.value = false;
  }
}
async function openDownload(row: Document) {
  window.open(`${SERVER}/api/documents/${row.id}/download?dl=1`, "_blank", "noopener");
}

async function bulkDownload() {
  const ids = [...selectedIds.value];
  if (!ids.length || bulkDownloading.value) return;
  bulkDownloading.value = true;
  try {
    for (const id of ids) {
      window.open(`${SERVER}/api/documents/${id}/download?dl=1`, "_blank", "noopener");
      await new Promise((r) => setTimeout(r, 400));
    }
    message.success(`${ids.length} קבצים הורדו`);
  } finally {
    bulkDownloading.value = false;
  }
}
</script>

<style scoped>
.hidden { display: none; }

.documents-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  width: 100%;
}

.rbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  line-height: 1;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  white-space: nowrap;
}

.rbtn:hover:not(.rbtn--primary):not(.rbtn--danger):not(.rbtn--warning):not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.rbtn:active {
  transform: scale(0.97);
}

.rbtn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.rbtn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 600;
}

.rbtn--primary:hover:not(:disabled) {
  background: var(--brand-color-hover);
  border-color: var(--brand-color-hover);
  color: var(--text-inverse, #fff);
}

.rbtn--primary:active:not(:disabled) {
  background: var(--brand-color-pressed);
  border-color: var(--brand-color-pressed);
}

.rbtn--danger {
  background: transparent;
  border-color: rgba(208, 48, 80, 0.35);
  color: #d03050;
}

.rbtn--warning {
  background: transparent;
  border-color: rgba(240, 160, 32, 0.45);
  color: #f0a020;
}

.rbtn--warning:hover {
  background: rgba(240, 160, 32, 0.1);
  border-color: #f0a020;
}

.rbtn--ghost-active {
  background: var(--bg-elevated);
  border-color: var(--brand-color);
  color: var(--brand-color);
}

.bulk-action-anchor {
  position: relative;
}

.bulk-action-anchor__row {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.bulk-action-anchor__actions {
  display: grid;
  gap: 8px;
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
  min-width: 210px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: var(--shadow-lg, 0 14px 32px rgba(15, 23, 42, 0.14));
}

.bulk-action-anchor__actions::before {
  content: "";
  position: absolute;
  top: -6px;
  right: 24px;
  width: 10px;
  height: 10px;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  transform: rotate(-45deg);
}

.bulk-action-item {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: start;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.bulk-action-item:hover {
  background: var(--bg-hover);
}

.bulk-action-item:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.bulk-action-item--danger {
  color: #d03050;
}

.bulk-action-item__icon {
  display: inline-flex;
  justify-content: center;
  width: 26px;
  font-size: 19px;
  line-height: 1;
}

.bulk-action-item__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bulk-action-item__count {
  min-width: 24px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.bulk-action-item--loading .bulk-action-item__icon {
  animation: spin 0.75s linear infinite;
}

.rbtn--loading {
  opacity: 0.75;
  pointer-events: none;
}

.rbtn--loading::before {
  content: "";
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-inline-start-color: transparent;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
  flex: 0 0 auto;
}

.refresh-icon--spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.icon-btn {
  padding: 4px 6px;
  min-width: 32px;
  justify-content: center;
}

.icon-btn .btn-icon {
  margin: 0;
}

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
  color: var(--brand-color);
  font-weight: 700;
  background: #fff;
  border: 2px solid var(--brand-color);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand-color) 55%, transparent);
}
.pill--active .pill__badge {
  background: color-mix(in srgb, var(--brand-color) 22%, transparent);
  color: inherit;
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
.toolbar__type {
  width: 200px;
}
.toolbar__dates {
  width: 260px;
}
.toolbar__view-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  margin-right: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.toolbar__view-toggle .rbtn {
  min-height: 32px;
  min-width: 32px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
}

.toolbar__view-toggle .rbtn:hover {
  background: var(--bg-hover);
  border-color: transparent;
}

.toolbar__view-toggle .rbtn--ghost-active {
  background: var(--bg-card);
  border-color: transparent;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.rbtn--icon {
  justify-content: center;
}

.status-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: -6px 0 16px;
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
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}
.tile {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  min-width: 0;
  transition: box-shadow 0.15s, border-color 0.15s, transform 0.1s;
}
.tile:hover {
  border-color: var(--brand-color);
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  transform: translateY(-1px);
}
.tile--selected {
  border-color: var(--brand-color);
  box-shadow: 0 0 0 1px var(--brand-color);
}
.tile__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 0;
  min-width: 0;
}
.tile__head :deep(.n-tag) {
  min-width: 0;
  max-width: 100%;
}
.tile__check {
  flex-shrink: 0;
}
.tile__actions {
  margin-inline-start: auto;
  flex-shrink: 0;
}
.tile__thumb {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-color);
}
.tile__file-icon { color: var(--text-secondary); }
.tile--pdf .tile__file-icon { color: #d03050; }
.tile--doc .tile__file-icon { color: #2080f0; }
.tile--xls .tile__file-icon { color: #1a7951; }
.tile--img .tile__file-icon { color: #b27a02; }
.list-file-icon { flex-shrink: 0; color: var(--text-secondary); }
.file-type-icon--pdf { color: #d03050; }
.file-type-icon--doc { color: #2080f0; }
.file-type-icon--xls { color: #1a7951; }
.file-type-icon--img { color: #b27a02; }
.tile--pdf .tile__thumb { background: linear-gradient(135deg, rgba(208,48,80,0.08), rgba(208,48,80,0.02)); }
.tile--doc .tile__thumb { background: linear-gradient(135deg, rgba(32,128,240,0.08), rgba(32,128,240,0.02)); }
.tile--xls .tile__thumb { background: linear-gradient(135deg, rgba(99,226,183,0.08), rgba(99,226,183,0.02)); }
.tile--img .tile__thumb { background: linear-gradient(135deg, rgba(240,160,32,0.08), rgba(240,160,32,0.02)); }
.tile__body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.tile__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.35;
}
.tile__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 11px;
  color: var(--text-primary);
}
.tile__meta-item {
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.tile__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.tile__pills :deep(.n-tag) {
  max-width: 100%;
}
.tile__date {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: auto;
}

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
.tag--warn { background: rgba(240, 160, 32, 0.14); color: #9a6700; border: 1px solid rgba(240, 160, 32, 0.35); }
.tag--bad { background: rgba(208, 48, 80, 0.12); color: #b42318; border: 1px solid rgba(208, 48, 80, 0.28); }
.tile__meta-item--num { font-family: ui-monospace, monospace; direction: ltr; }
.kv { font-size: 12px; color: var(--text-primary); display: inline-flex; align-items: center; gap: 6px; }
.kv strong { color: var(--text-secondary); font-weight: 600; }
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

  :deep(.page-header) {
    margin-bottom: 18px;
  }

  :deep(.page-header__actions) {
    width: 100%;
  }

  .documents-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    width: 100%;
  }

  .documents-actions > .rbtn--primary {
    grid-column: 1 / -1;
  }

  .documents-actions > .rbtn,
  .documents-actions > .bulk-action-anchor,
  .documents-actions :deep(.n-popover),
  .documents-actions :deep(.n-popover-trigger),
  .documents-actions :deep(.n-popover-trigger) > .rbtn {
    width: 100%;
    min-width: 0;
  }

  .documents-actions > .bulk-action-anchor {
    grid-column: 1 / -1;
  }

  .bulk-action-anchor__row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    width: 100%;
  }

  .bulk-action-anchor__row > .rbtn {
    width: 100%;
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
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: 8px;
  }

  .toolbar__search {
    grid-column: 1 / -1;
    width: 100%;
    min-width: 0;
  }

  .toolbar__client,
  .toolbar__type,
  .toolbar__dates {
    width: 100%;
    min-width: 0;
    flex-basis: auto;
  }

  .toolbar__dates {
    grid-column: 1 / -1;
  }

  .toolbar__view-toggle {
    grid-column: 1 / -1;
    width: auto;
    margin-right: 0;
    justify-self: end;
  }

  .status-filter {
    gap: 6px;
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

  .list-file-icon {
    padding-top: 2px;
  }

  .tag {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@media (max-width: 420px) {
  :deep(.list-card__row) {
    flex-direction: column-reverse;
  }

  :deep(.list-card__actions) {
    align-self: flex-start;
    display: grid;
    grid-template-columns: repeat(3, 34px);
  }

  :deep(.list-card__actions .btn) {
    width: 34px;
  }
}

</style>
