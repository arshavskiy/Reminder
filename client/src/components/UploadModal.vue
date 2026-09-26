<template>
  <n-modal
    v-model:show="visible"
    :bordered="false"
    :mask-closable="false"
    :segmented="false"
    :title="null"
    class="upload-modal"
    preset="card"
    style="width: min(860px, calc(100vw - 24px)); max-height: calc(100vh - 24px)"
  >
    <template #header>
      <span style="font-size: 15px; font-weight: 600">{{ modalTitle }}</span>
    </template>

    <!-- Mode tabs -->
    <n-tabs v-if="activeTab !== 'rescan'" v-model:value="activeTab" size="small" style="margin-bottom: 16px" type="line">
      <n-tab name="upload">{{ l.uploadModal.tabUpload }}</n-tab>
      <n-tab name="extract">{{ l.uploadModal.tabExtract }}</n-tab>
    </n-tabs>

    <!-- ══════════════════════════════════════════════════════ TAB: UPLOAD ══ -->
    <div v-if="activeTab === 'upload'" class="upload-layout">
      <!-- ── Left col: drop zone + file queue ─────────────────────────────── -->
      <div class="upload-col upload-col--drop">
        <div
          :class="{ 'drop-zone--over': dragOver, 'drop-zone--has-files': files.length > 0 }"
          class="drop-zone"
          @click="fileInput?.click()"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="onDrop"
        >
          <input
            ref="fileInput"
            accept=".pdf,.docx,.xlsx,.txt,.md,.png,.jpg,.jpeg,.tif,.tiff"
            class="hidden"
            multiple
            type="file"
            @change="onFileInputChange"
          />
          <div v-if="!files.length" class="drop-zone__empty">
            <div class="drop-zone__icon">☁</div>
            <div class="drop-zone__main">{{ l.uploadModal.dropMain }}</div>
            <div class="drop-zone__or">{{ l.uploadModal.or }}</div>
            <n-button ghost size="small" type="primary" @click.stop="fileInput?.click()">{{ l.uploadModal.chooseFiles }}</n-button>
            <div class="drop-zone__hint">PDF · DOCX · XLSX · PNG · JPG · TIF</div>
          </div>
          <div v-else class="drop-zone__add-more" @click.stop="fileInput?.click()">
            <span>{{ l.uploadModal.addMoreFiles }}</span>
          </div>
        </div>

        <div v-if="files.length" class="file-list">
          <div v-for="(f, i) in files" :key="i" class="file-item">
            <span class="file-item__icon">{{ fileIcon(f.name) }}</span>
            <span :title="f.name" class="file-item__name">{{ f.name }}</span>
            <span class="file-item__size">{{ formatSize(f.size) }}</span>
            <n-button circle quaternary size="tiny" @click="files.splice(i, 1)">✕</n-button>
          </div>
        </div>
      </div>

      <div class="upload-divider" />

      <!-- ── Right col: processing options ──────────────────────────────── -->
      <div class="upload-col upload-col--fields">
        <!-- Pipeline toggles -->
        <div class="pipeline-toggles">
          <div class="pipeline-toggles__title">{{ l.uploadModal.processingOptionsTitle }}</div>
          <label class="toggle-row toggle-row--lite">
            <n-switch v-model:value="liteImport" size="small" />
            <span class="toggle-row__label">{{ l.uploadModal.liteImport }}</span>
            <span class="toggle-row__hint">{{ l.uploadModal.liteImportHint }}</span>
          </label>
          <template v-if="!liteImport">
            <label class="toggle-row">
              <n-select
                  v-model:value="selectedTemplateId"
                  :options="templateOptions"
                  clearable
                  :placeholder="l.uploadModal.autoTemplate"
                  size="small"
                  style="width: 100%"
              />
            </label>
            <label class="toggle-row">
              <n-switch v-model:value="doAi" size="small" />
              <span class="toggle-row__label">{{ l.uploadModal.extractAi }}</span>
              <span class="toggle-row__hint">{{ l.uploadModal.extractAiHint }}</span>
            </label>
            <label :class="{ 'toggle-row--disabled': !doAi }" class="toggle-row">
              <n-switch v-model:value="doEntities" :disabled="!doAi" size="small" />
              <span class="toggle-row__label">{{ l.uploadModal.createClientsContracts }}</span>
              <span class="toggle-row__hint">{{ l.uploadModal.createClientsContractsHint }}</span>
            </label>
            <label :class="{ 'toggle-row--disabled': !doEntities }" class="toggle-row">
              <n-switch v-model:value="doReminders" :disabled="!doEntities" size="small" />
              <span class="toggle-row__label">{{ l.uploadModal.createReminders }}</span>
              <span class="toggle-row__hint">{{ l.uploadModal.createRemindersHint }}</span>
            </label>
          </template>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════ TAB: EXTRACT ══ -->
    <div v-else-if="activeTab === 'extract'" class="extract-tab">
      <!-- Step 1: file picker -->
      <div v-if="extractStep === 'pick'" class="extract-pick">
        <div
          :class="{ 'drop-zone--over': extractDragOver, 'drop-zone--has-files': extractFiles.length > 0 }"
          class="drop-zone"
          @click="extractInput?.click()"
          @dragover.prevent="extractDragOver = true"
          @dragleave.prevent="extractDragOver = false"
          @drop.prevent="onExtractDrop"
        >
          <input
            ref="extractInput"
            accept=".pdf,.docx,.xlsx,.txt,.png,.jpg,.jpeg,.tif,.tiff"
            class="hidden"
            multiple
            type="file"
            @change="onExtractInputChange"
          />
          <div v-if="!extractFiles.length" class="drop-zone__empty">
            <div class="drop-zone__icon">🔍</div>
            <div class="drop-zone__main">{{ l.uploadModal.dropExtractMain }}</div>
            <div class="drop-zone__or">{{ l.uploadModal.or }}</div>
            <n-button ghost size="small" type="primary" @click.stop="extractInput?.click()">{{ l.uploadModal.chooseFiles }}</n-button>
            <div class="drop-zone__hint">{{ l.uploadModal.dropExtractHint }}</div>
          </div>
          <div v-else class="drop-zone__add-more" @click.stop="extractInput?.click()">
            <span>{{ l.uploadModal.addMoreFiles }}</span>
          </div>
        </div>

        <div v-if="extractFiles.length" class="file-list" style="margin-top: 10px">
          <div v-for="(f, i) in extractFiles" :key="i" class="file-item">
            <span class="file-item__icon">{{ fileIcon(f.name) }}</span>
            <span :title="f.name" class="file-item__name">{{ f.name }}</span>
            <span class="file-item__size">{{ formatSize(f.size) }}</span>
            <n-button circle quaternary size="tiny" @click="extractFiles.splice(i, 1)">✕</n-button>
          </div>
        </div>

        <div class="extract-hint-box">
          <div class="extract-hint-box__icon">💡</div>
          <div>
            <strong>{{ l.uploadModal.extractHintTitle }}</strong> — {{ l.uploadModal.extractHintBody }}
          </div>
        </div>
      </div>

      <!-- Step 2: loading -->
      <div v-else-if="extractStep === 'loading'" class="extract-loading">
        <n-spin size="large" />
        <div style="margin-top: 16px; font-size: 14px; color: var(--text-muted)">
          {{ t('uploadModal.extracting', { count: extractFiles.length }) }}
        </div>
      </div>

      <!-- Step 3: preview results -->
      <div v-else-if="extractStep === 'preview'" class="extract-preview">
        <div v-if="!extractPreviews.length" class="fields-empty" style="margin: 32px 0">
          <div class="fields-empty__icon">😕</div>
          <div class="fields-empty__text">{{ l.uploadModal.noRemindersFound }}</div>
          <div class="fields-empty__sub">{{ l.uploadModal.noRemindersFoundSub }}</div>
        </div>

        <div v-else>
          <div class="preview-summary">
            <span class="preview-summary__count">{{ t('uploadModal.remindersSelected', { selected: confirmedCount, total: extractPreviews.length }) }}</span>
            <div style="display: flex; gap: 8px">
              <n-button quaternary size="tiny" @click="selectAll(true)">{{ l.uploadModal.selectAll }}</n-button>
              <n-button quaternary size="tiny" @click="selectAll(false)">{{ l.uploadModal.clearAll }}</n-button>
            </div>
          </div>

          <div class="preview-list">
            <div
              v-for="(p, i) in extractPreviews"
              :key="i"
              :class="{ 'preview-card--selected': p.selected, 'preview-card--duplicate': p.advance_days !== extractPreviews.filter(x => x.expiry_date === p.expiry_date)[0]?.advance_days }"
              class="preview-card"
              @click="p.selected = !p.selected"
            >
              <div class="preview-card__check">
                <n-checkbox v-model:checked="p.selected" @click.stop />
              </div>
              <div class="preview-card__body">
                <div class="preview-card__title">{{ p.title }}</div>
                <div class="preview-card__meta">
                  <span class="preview-card__badge preview-card__badge--date">📅 {{ l.uploadModal.sendDate }}: {{ p.trigger_date }}</span>
                  <span v-if="p.next_check_date" class="preview-card__badge preview-card__badge--next">{{ l.uploadModal.nextCheckDate }}: {{ p.next_check_date }}</span>
                  <span v-if="p.expiry_date" class="preview-card__badge preview-card__badge--expiry">⏰ {{ l.uploadModal.expiryDate }}: {{ p.expiry_date }}</span>
                  <span v-if="p.document_type" class="preview-card__badge">{{ p.document_type }}</span>
                  <span :class="`preview-card__badge--conf-${p.confidence}`" class="preview-card__badge preview-card__badge--conf">{{ confidenceLabel(p.confidence) }}</span>
                </div>
                <div v-if="p.contact_name || p.contact_email || p.contact_phone" class="preview-card__contact">
                  <span v-if="p.contact_name">👤 {{ p.contact_name }}</span>
                  <span v-if="p.contact_phone">📞 {{ p.contact_phone }}</span>
                  <span v-if="p.contact_email">✉️ {{ p.contact_email }}</span>
                </div>
                <div class="preview-card__source">{{ l.uploadModal.sourceFile }}: {{ p.source_file }}</div>
              </div>
            </div>
          </div>

          <div v-if="extractErrors.length" class="extract-errors">
            <div v-for="e in extractErrors" :key="e.file" class="extract-error-row">
              ❌ {{ e.file }}: {{ e.error }}
            </div>
          </div>
        </div>
      </div>

      <!-- Step 4: saved confirmation -->
      <div v-else-if="extractStep === 'saved'" class="extract-saved">
        <div style="font-size: 48px; text-align: center; margin-bottom: 12px">✅</div>
        <div style="font-size: 16px; font-weight: 600; text-align: center">
          {{ t('uploadModal.savedCount', { count: savedCount }) }}
        </div>
        <div style="font-size: 13px; color: var(--text-muted); text-align: center; margin-top: 6px">
          {{ l.uploadModal.savedHint }}
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════ TAB: RESCAN ═══ -->
    <div v-else class="rescan-tab">
      <div class="rescan-hero">
        <n-spin v-if="rescanRunning" size="large" />
        <div v-else class="rescan-hero__done">{{ rescanHasIssues ? "!" : "✓" }}</div>
        <div>
          <div class="rescan-hero__title">{{ rescanTitle }}</div>
          <div class="rescan-hero__sub">{{ rescanSubtitle }}</div>
        </div>
      </div>

      <n-progress
        type="line"
        :percentage="rescanProgress"
        :show-indicator="false"
        :height="7"
        :color="rescanHasIssues ? '#f0a020' : 'var(--brand-color)'"
        rail-color="rgba(128,128,128,0.15)"
      />

      <div class="rescan-summary">
        <div class="rescan-stat">
          <span class="rescan-stat__value">{{ props.rescan?.queued ?? 0 }}</span>
          <span class="rescan-stat__label">{{ isUploadSession ? l.uploadModal.statInProgress : l.uploadModal.statPending }}</span>
        </div>
        <div class="rescan-stat">
          <span class="rescan-stat__value">{{ isUploadSession ? uploadCompleted : rescanAssigned }}</span>
          <span class="rescan-stat__label">{{ isUploadSession ? l.uploadModal.statProcessed : l.uploadModal.statHasReminder }}</span>
        </div>
        <div class="rescan-stat">
          <span class="rescan-stat__value">{{ isUploadSession ? uploadDuplicates : rescanMissing }}</span>
          <span class="rescan-stat__label">{{ isUploadSession ? l.uploadModal.statDuplicates : l.uploadModal.statMissingReminder }}</span>
        </div>
        <div class="rescan-stat">
          <span class="rescan-stat__value">{{ rescanFailed }}</span>
          <span class="rescan-stat__label">{{ l.uploadModal.statErrors }}</span>
        </div>
      </div>

      <div class="preview-list rescan-list">
        <div
          v-for="row in props.rescan?.rows ?? []"
          :key="row.id"
          class="preview-card preview-card--selected preview-card--link"
          role="link"
          tabindex="0"
          @click="emit('view-document', String(row.id))"
          @keydown.enter.prevent="emit('view-document', String(row.id))"
          @keydown.space.prevent="emit('view-document', String(row.id))"
        >
          <div class="preview-card__body">
            <div class="preview-card__title">{{ row.file_name }}</div>
            <div class="preview-card__meta">
              <span :class="rescanRowClass(row)" class="preview-card__badge">
                {{ rescanRowLabel(row) }}
              </span>
              <span v-if="row.duplicate" class="preview-card__badge preview-card__badge--duplicate">{{ l.uploadModal.duplicate }}</span>
              <span v-if="row.reminder_date" class="preview-card__badge preview-card__badge--next">{{ l.uploadModal.nextCheckDate }}: {{ row.reminder_date }}</span>
              <span v-if="row.document_type" class="preview-card__badge">{{ row.document_type }}</span>
            </div>
            <div v-if="row.error_message" class="preview-card__error">
              {{ row.error_message }}
            </div>
          </div>
        </div>
        <div v-if="!(props.rescan?.rows ?? []).length" class="fields-empty">
          <div class="fields-empty__icon">↻</div>
          <div class="fields-empty__text">{{ l.uploadModal.noDocumentsInRescan }}</div>
        </div>
      </div>
    </div>

    <!-- ─────────────────────────────────────────────────────── FOOTER ── -->
    <template #footer>
      <!-- Upload tab footer -->
      <div v-if="activeTab === 'upload'" class="modal-footer">
        <n-button @click="cancel">{{ l.common.cancel }}</n-button>
        <div class="modal-footer__actions">
          <span v-if="files.length" class="footer-count">{{ t('uploadModal.filesSelected', { count: files.length }) }}</span>
          <n-button
            v-if="files.length"
            secondary
            @click="createTemplate"
          >
            {{ l.uploadModal.createFromDocument }}
          </n-button>
          <n-button
            :disabled="!files.length"
            :loading="uploading"
            type="primary"
            @click="submit"
          >
            {{ l.uploadModal.uploadAndProcess }}
          </n-button>
        </div>
      </div>

      <!-- Extract tab footer -->
      <div v-else-if="activeTab === 'extract'" class="modal-footer">
        <n-button @click="cancel">{{ l.common.cancel }}</n-button>
        <div class="modal-footer__actions">
          <!-- Step: pick -->
          <template v-if="extractStep === 'pick'">
            <n-button
              :disabled="!extractFiles.length"
              type="primary"
              @click="runExtract"
            >
              {{ l.uploadModal.extractReminders }}
            </n-button>
          </template>

          <!-- Step: preview -->
          <template v-else-if="extractStep === 'preview'">
            <n-button @click="extractStep = 'pick'">{{ l.uploadModal.back }}</n-button>
            <n-button
              :disabled="confirmedCount === 0 || savingExtract"
              :loading="savingExtract"
              type="primary"
              @click="saveExtracted"
            >
              {{ t('uploadModal.saveNReminders', { count: confirmedCount }) }}
            </n-button>
          </template>

          <!-- Step: saved -->
          <template v-else-if="extractStep === 'saved'">
            <n-button type="primary" @click="cancel">{{ l.common.close }}</n-button>
          </template>
        </div>
      </div>

      <!-- Rescan footer -->
      <div v-else class="modal-footer">
        <n-button @click="cancel">{{ rescanRunning ? l.uploadModal.continueInBackground : l.common.close }}</n-button>
        <div class="modal-footer__actions">
          <span class="footer-count">{{ rescanSubtitle }}</span>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import {NButton, NCheckbox, NInput, NModal, NProgress, NSelect, NSpin, NSwitch, NTab, NTabs, NTag} from "naive-ui";
import {api} from "../services/apiService.js";
import {useI18n} from "../composables/useI18n.js";

const {l, t} = useI18n();

const API = import.meta.env.VITE_API_BASE ?? "";


export interface UploadOptions {
  doAi: boolean;
  doEntities: boolean;
  doReminders: boolean;
  templateId?: number
}

interface ReminderPreview {
  title: string;
  trigger_date: string;
  expiry_date: string | null;
  next_check_date: string | null;
  advance_days: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  document_type: string | null;
  source_file: string;
  confidence: "high" | "medium" | "low";
  selected: boolean;
}
interface RescanRow {
  id: string | number;
  file_name: string;
  processing_status: string;
  reminder_status?: string | null;
  reminder_date?: string | null;
  document_type?: string | null;
  error_message?: string | null;
  duplicate?: boolean;
}
interface RescanState {
  queued: number;
  remaining: number;
  rows: RescanRow[];
  done: boolean;
  kind?: "rescan" | "upload";
}

const props = defineProps<{ uploading: boolean; rescan?: RescanState | null }>();
const emit = defineEmits<{
  (e: "upload", files: File[], options: UploadOptions): void;
  (e: "reminders-saved", count: number): void;
  (e: "view-document", id: string): void;
  (e: "create-template", file: File): void;
}>();

const visible = defineModel<boolean>({ required: true });

// ── Upload tab state ────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const files = ref<File[]>([]);
const liteImport = ref(false);
const doAi = ref(true);
const doEntities = ref(false);
const doReminders = ref(false);
const selectedTemplateId = ref<string | null>(null);
const templateOptions = ref<{ label: string; value: string }[]>([]);

onMounted(async () => {
  try {
    const templates = await api.docTemplates.list();
    templateOptions.value = templates.map(t => ({
      label: `${t.name} (${t.document_kind})`,
      value: t.id,
    }));
  } catch {
  }
});

// ── Extract tab state ───────────────────────────────────────────────────────
const activeTab = ref<"upload" | "extract" | "rescan">("upload");
const extractInput = ref<HTMLInputElement | null>(null);
const extractDragOver = ref(false);
const extractFiles = ref<File[]>([]);
const extractStep = ref<"pick" | "loading" | "preview" | "saved">("pick");
const extractPreviews = ref<ReminderPreview[]>([]);
const extractErrors = ref<{ file: string; error: string }[]>([]);
const savingExtract = ref(false);
const savedCount = ref(0);

const confirmedCount = computed(() => extractPreviews.value.filter((p) => p.selected).length);
const isUploadSession = computed(() => props.rescan?.kind === "upload");
const modalTitle = computed(() => activeTab.value === "rescan" ? (isUploadSession.value ? l.value.uploadModal.titleReprocessUpload : l.value.uploadModal.titleRescan) : l.value.uploadModal.titleUpload);
const rescanRunning = computed(() => activeTab.value === "rescan" && !!props.rescan && !props.rescan.done);
const rescanAssigned = computed(() => (props.rescan?.rows ?? []).filter((row) => row.reminder_status === "assigned").length);
const rescanMissing = computed(() => (props.rescan?.rows ?? []).filter((row) => row.reminder_status === "missing").length);
const rescanFailed = computed(() => (props.rescan?.rows ?? []).filter((row) => row.processing_status === "error").length);
const uploadCompleted = computed(() => (props.rescan?.rows ?? []).filter((row) => row.processing_status === "done").length);
const uploadDuplicates = computed(() => (props.rescan?.rows ?? []).filter((row) => row.duplicate).length);
const rescanHasIssues = computed(() => rescanMissing.value > 0 || rescanFailed.value > 0);
const rescanProgress = computed(() => {
  const queued = props.rescan?.queued ?? 0;
  if (!queued) return 0;
  return Math.round(((queued - (props.rescan?.remaining ?? 0)) / queued) * 100);
});
const rescanTitle = computed(() => {
  if (!props.rescan?.queued) return isUploadSession.value ? l.value.uploadModal.noDocumentsInProcessing : l.value.uploadModal.noDocumentsForRescan;
  if (rescanRunning.value) return isUploadSession.value ? l.value.uploadModal.reprocessActive : l.value.uploadModal.rescanActive;
  return isUploadSession.value ? l.value.uploadModal.reprocessDone : l.value.uploadModal.rescanDone;
});
const rescanSubtitle = computed(() => {
  const queued = props.rescan?.queued ?? 0;
  if (!queued) return isUploadSession.value ? l.value.uploadModal.noDocumentsInProcessingSub : l.value.uploadModal.noDocumentsForRescanSub;
  if (rescanRunning.value) return t("uploadModal.ofStillProcessing", { remaining: props.rescan?.remaining ?? 0, queued });
  if (isUploadSession.value) return t("uploadModal.uploadStats", { completed: uploadCompleted.value, duplicates: uploadDuplicates.value, errors: rescanFailed.value });
  return t("uploadModal.rescanStats", { assigned: rescanAssigned.value, missing: rescanMissing.value, errors: rescanFailed.value });
});


watch(visible, (v) => {
  if (v) resetAll();
});

function resetAll() {
  files.value = []; dragOver.value = false;
  doAi.value = true; doEntities.value = true; doReminders.value = true;
  activeTab.value = "upload";
  resetExtract();
}

function resetExtract() {
  extractFiles.value = [];
  extractStep.value = "pick";
  extractPreviews.value = [];
  extractErrors.value = [];
  extractDragOver.value = false;
  savingExtract.value = false;
  savedCount.value = 0;
}

// ── Upload tab handlers ─────────────────────────────────────────────────────
function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement;
  addFiles(Array.from(input.files ?? []));
  input.value = "";
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  addFiles(Array.from(e.dataTransfer?.files ?? []));
}

function addFiles(incoming: File[]) {
  const existing = new Set(files.value.map((f) => f.name + f.size));
  for (const f of incoming) {
    if (!existing.has(f.name + f.size)) files.value.push(f);
  }
}

function cancel() {
  visible.value = false;
}

function createTemplate() {
  if (!files.value.length) return;
  emit("create-template", files.value[0]);
  visible.value = false;
}

function submit() {
  if (!files.value.length) return;
  emit("upload", [...files.value], {
    doAi: !liteImport.value && doAi.value,
    doEntities: !liteImport.value && doEntities.value && doAi.value,
    doReminders: liteImport.value || (doReminders.value && doEntities.value),
    liteImport: liteImport.value,
    templateId: liteImport.value ? undefined : (selectedTemplateId.value ?? undefined),
  });
}

// ── Extract tab handlers ────────────────────────────────────────────────────
function onExtractInputChange(e: Event) {
  const input = e.target as HTMLInputElement;
  addExtractFiles(Array.from(input.files ?? []));
  input.value = "";
}

function onExtractDrop(e: DragEvent) {
  extractDragOver.value = false;
  addExtractFiles(Array.from(e.dataTransfer?.files ?? []));
}

function addExtractFiles(incoming: File[]) {
  const existing = new Set(extractFiles.value.map((f) => f.name + f.size));
  for (const f of incoming) {
    if (!existing.has(f.name + f.size)) extractFiles.value.push(f);
  }
}

async function runExtract() {
  if (!extractFiles.value.length) return;
  extractStep.value = "loading";

  const fd = new FormData();
  for (const f of extractFiles.value) fd.append("files", f);

  try {
    const resp = await fetch(`${API}/api/extract/reminders`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? t("uploadModal.extractionFailed"));

    extractPreviews.value = (data.reminders ?? []).map((r: any) => ({
      ...r,
      next_check_date: r.next_check_date ?? r.expiry_date ?? null,
      selected: true,
    }));
    extractErrors.value = data.errors ?? [];
    extractStep.value = "preview";
  } catch (err) {
    extractErrors.value = [{ file: l.value.uploadModal.allFiles, error: String(err) }];
    extractStep.value = "preview";
  }
}

function selectAll(val: boolean) {
  extractPreviews.value.forEach((p) => (p.selected = val));
}

async function saveExtracted() {
  const toSave = extractPreviews.value.filter((p) => p.selected);
  if (!toSave.length) return;
  savingExtract.value = true;

  try {
    const resp = await fetch(`${API}/api/extract/reminders/save`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminders: toSave }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? t("uploadModal.saveFailed"));

    savedCount.value = data.saved ?? toSave.length;
    extractStep.value = "saved";
    emit("reminders-saved", savedCount.value);
  } catch (err) {
    extractErrors.value = [{ file: l.value.uploadModal.saveErrorLabel, error: String(err) }];
  } finally {
    savingExtract.value = false;
  }
}

// ── Shared helpers ──────────────────────────────────────────────────────────
function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "📕";
  if (["docx", "doc"].includes(ext)) return "📝";
  if (["xlsx", "xls"].includes(ext)) return "📊";
  if (["png", "jpg", "jpeg", "tif", "tiff"].includes(ext)) return "🖼";
  return "📄";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function confidenceLabel(c: string) {
  return c === "high" ? l.value.uploadModal.confidenceHigh : c === "medium" ? l.value.uploadModal.confidenceMedium : l.value.uploadModal.confidenceLow;
}

function openRescan() {
  activeTab.value = "rescan";
}

function rescanRowLabel(row: RescanRow) {
  if (row.processing_status === "queued" || row.processing_status === "processing") return l.value.uploadModal.rowStatusProcessing;
  if (row.processing_status === "error") return l.value.uploadModal.rowStatusError;
  if (isUploadSession.value && row.duplicate) return l.value.uploadModal.rowStatusDuplicate;
  if (isUploadSession.value && row.processing_status === "done") return l.value.uploadModal.rowStatusProcessed;
  if (row.reminder_status === "assigned") return l.value.uploadModal.rowStatusAssigned;
  if (row.reminder_status === "missing") return l.value.uploadModal.rowStatusMissing;
  return l.value.uploadModal.rowStatusWaiting;
}

function rescanRowClass(row: RescanRow) {
  if (row.processing_status === "error") return "preview-card__badge--rescan-error";
  if (row.processing_status === "queued" || row.processing_status === "processing") return "preview-card__badge--rescan-pending";
  return `preview-card__badge--rescan-${row.reminder_status ?? "pending"}`;
}

defineExpose({ addFiles, openRescan });
</script>

<style scoped>
.hidden { display: none; }

:global(.upload-modal.n-card) {
  overflow: hidden;
}

:global(.upload-modal .n-card__content) {
  overflow-x: hidden;
  overflow-y: auto;
}

/* ── Two-column layout (upload tab) ─────────────────────────────────────── */
.upload-layout {
  display: flex;
  gap: 0;
  min-height: 360px;
}
.upload-col {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding: 4px 0;
}
.upload-col--drop { padding-left: 8px; }
.upload-col--fields { padding-right: 8px; }

.upload-divider {
  width: 1px;
  background: var(--border-color);
  margin: 0 20px;
  flex-shrink: 0;
}

/* ── Drop zone ───────────────────────────────────────────────────────────── */
.drop-zone {
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  background:
    linear-gradient(135deg, rgba(24, 160, 88, 0.08), rgba(32, 128, 240, 0.05)),
    var(--bg-card);
  transition: border-color 0.18s, background 0.18s, transform 0.12s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  flex-shrink: 0;
}
.drop-zone:hover,
.drop-zone--over {
  border-color: var(--brand-color);
  background:
    linear-gradient(135deg, rgba(99, 226, 183, 0.16), rgba(32, 128, 240, 0.08)),
    var(--bg-card);
  transform: translateY(-1px);
}
.drop-zone--has-files {
  min-height: 52px;
  border-style: solid;
  border-color: var(--brand-color);
  opacity: 0.75;
}
.drop-zone--has-files:hover { opacity: 1; }

.drop-zone__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 24px 16px;
  text-align: center;
}
.drop-zone__icon { font-size: 36px; line-height: 1; opacity: 0.5; }
.drop-zone__main { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.drop-zone__or { font-size: 12px; color: var(--text-muted); }
.drop-zone__hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

.drop-zone__add-more {
  font-size: 13px;
  color: var(--brand-color);
  padding: 12px 16px;
  font-weight: 500;
}

/* ── File list ───────────────────────────────────────────────────────────── */
.file-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 210px;
  overflow-y: auto;
}
.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-elevated);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  font-size: 13px;
}
.file-item__icon { font-size: 16px; flex-shrink: 0; }
.file-item__name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
}
.file-item__size { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }

/* ── Fields column ───────────────────────────────────────────────────────── */
.fields-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 32px 16px;
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  text-align: center;
}
.fields-empty__icon { font-size: 28px; opacity: 0.4; }
.fields-empty__text { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
.fields-empty__sub { font-size: 11px; color: var(--text-muted); }

/* ── Pipeline toggles ────────────────────────────────────────────────────── */
.pipeline-toggles {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pipeline-toggles__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}
.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}
.toggle-row--disabled { opacity: 0.45; }
.toggle-row--lite {
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--bg-card-alt, var(--bg-card));
  margin-bottom: 6px;
}
.toggle-row__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 130px;
}
.toggle-row__hint {
  font-size: 11px;
  color: var(--text-muted);
}

/* ── Extract tab ─────────────────────────────────────────────────────────── */
.extract-tab {
  min-height: 360px;
  display: flex;
  flex-direction: column;
}

.extract-pick {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.extract-hint-box {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 4px;
}
.extract-hint-box__icon { font-size: 18px; flex-shrink: 0; }

.extract-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 0;
}

.extract-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.preview-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.preview-summary__count {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.preview-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 340px;
  overflow-y: auto;
}

.preview-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.preview-card:hover { border-color: var(--brand-color); }
.preview-card--link:focus-visible {
  outline: 2px solid var(--brand-color);
  outline-offset: 2px;
}
.preview-card--selected {
  border-color: var(--brand-color);
  background: rgba(99, 226, 183, 0.06);
}

.preview-card__check { padding-top: 2px; flex-shrink: 0; }

.preview-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preview-card__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}

.preview-card__badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 20px;
  background: var(--bg-base);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  white-space: nowrap;
}
.preview-card__badge--date { color: var(--info-color, #3b82f6); border-color: currentColor; }
.preview-card__badge--next { color: #22c55e; border-color: currentColor; }
.preview-card__badge--expiry { color: var(--warning-color, #f59e0b); border-color: currentColor; }

.preview-card__badge--conf { font-weight: 600; }
.preview-card__badge--conf-high { color: #22c55e; border-color: #22c55e; }
.preview-card__badge--conf-medium { color: #f59e0b; border-color: #f59e0b; }
.preview-card__badge--conf-low { color: #94a3b8; border-color: #94a3b8; }

.preview-card__contact {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-muted);
  flex-wrap: wrap;
}

.preview-card__source {
  font-size: 10px;
  color: var(--text-muted);
  opacity: 0.7;
}

.extract-errors {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.extract-error-row {
  font-size: 12px;
  color: var(--error-color, #ef4444);
  padding: 6px 10px;
  background: rgba(239, 68, 68, 0.06);
  border-radius: 6px;
}

.extract-saved {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
}

/* ── Footer ──────────────────────────────────────────────────────────────── */
.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

/* ── Rescan mode ─────────────────────────────────────────────────────────── */
.rescan-tab {
  min-height: 360px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rescan-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.rescan-hero__done {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(24, 160, 88, 0.12);
  color: var(--brand-color);
  font-size: 22px;
  font-weight: 800;
}

.rescan-hero__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.rescan-hero__sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.rescan-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.rescan-stat {
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  text-align: center;
}

.rescan-stat__value {
  display: block;
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}

.rescan-stat__label {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 5px;
}

.rescan-list {
  max-height: 260px;
}

.preview-card__badge--rescan-assigned { color: #22c55e; border-color: #22c55e; }
.preview-card__badge--rescan-missing { color: #f59e0b; border-color: #f59e0b; }
.preview-card__badge--rescan-error { color: #ef4444; border-color: #ef4444; }
.preview-card__badge--rescan-pending { color: var(--info-color, #3b82f6); border-color: currentColor; }
.preview-card__badge--duplicate { color: #8b5cf6; border-color: #8b5cf6; }
.preview-card__error {
  margin-top: 8px;
  color: #ef4444;
  font-size: 12px;
  line-height: 1.5;
  direction: ltr;
  text-align: left;
  word-break: break-word;
}
.modal-footer__actions { display: flex; gap: 8px; align-items: center; }
.footer-count { font-size: 13px; color: var(--text-muted); }

@media (max-width: 720px) {
  :global(.upload-modal.n-card) {
    width: calc(100vw - 16px) !important;
    max-height: calc(100vh - 16px) !important;
  }

  :global(.upload-modal .n-card-header) {
    padding: 18px 18px 10px;
  }

  :global(.upload-modal .n-card__content) {
    padding: 0 18px 14px;
  }

  :global(.upload-modal .n-card__footer) {
    padding: 12px 18px 18px;
  }

  .upload-layout {
    flex-direction: column;
    min-height: 0;
    gap: 16px;
  }

  .upload-col {
    width: 100%;
    padding: 0;
  }

  .upload-col--drop,
  .upload-col--fields {
    padding: 0;
  }

  .upload-divider {
    width: 100%;
    height: 1px;
    margin: 0;
  }

  .drop-zone {
    min-height: 190px;
  }

  .drop-zone--has-files {
    min-height: 56px;
  }

  .fields-list {
    flex: initial;
    max-height: none;
  }

  .fields-empty {
    min-height: 150px;
    padding: 24px 14px;
  }

  .toggle-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .toggle-row__label {
    min-width: 0;
  }

  .toggle-row__hint {
    flex-basis: 100%;
    padding-inline-start: 46px;
  }

  .extract-tab {
    min-height: 0;
  }

  .extract-hint-box {
    align-items: flex-start;
  }

  .preview-summary {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .preview-list {
    max-height: none;
  }

  .preview-card__title {
    white-space: normal;
  }

  .modal-footer {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .modal-footer > .n-button,
  .modal-footer__actions,
  .modal-footer__actions > .n-button {
    width: 100%;
  }

  .modal-footer__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .footer-count {
    text-align: center;
  }
}

@media (max-width: 420px) {
  :global(.upload-modal.n-card) {
    width: calc(100vw - 8px) !important;
  }

  :global(.upload-modal .n-card-header),
  :global(.upload-modal .n-card__content),
  :global(.upload-modal .n-card__footer) {
    padding-inline: 14px;
  }

  .drop-zone {
    min-height: 168px;
  }

  .file-item {
    flex-wrap: wrap;
  }

  .file-item__name {
    flex-basis: calc(100% - 72px);
  }
}
</style>
