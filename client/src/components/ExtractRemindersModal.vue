<template>
  <n-modal
    v-model:show="visible"
    :mask-closable="activeTab === 'extract' ? step !== 'loading' : true"
    class="extract-reminders-modal"
    preset="card"
    role="dialog"
    style="width: min(900px, 96vw)"
    :title="l.uploadModal.importRemindersTitle"
  >
    <n-tabs v-model:value="activeTab" type="line" size="small" style="margin-bottom: 12px">
      <n-tab name="extract">{{ l.uploadModal.tabAiExtract }}</n-tab>
      <n-tab name="table">{{ l.uploadModal.tabTableImport }}</n-tab>
    </n-tabs>

    <!-- ══════════════════════ TAB: TABLE IMPORT ══════════════════════════ -->
    <div v-if="activeTab === 'table'">
      <ReminderTableImport variant="embedded" @imported="onTableImported" @close="close" />
    </div>

    <!-- ══════════════════════ TAB: AI EXTRACT ════════════════════════════ -->
    <template v-if="activeTab === 'extract'">
    <!-- Step 1: file picker -->
    <div v-if="step === 'pick'" class="extract-pick">
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
          accept=".pdf,.docx,.xlsx,.txt,.png,.jpg,.jpeg,.tif,.tiff"
          class="hidden"
          multiple
          type="file"
          @change="onFileInputChange"
        />
        <div v-if="!files.length" class="drop-zone__empty">
          <div class="drop-zone__icon">🔍</div>
          <div class="drop-zone__main">{{ l.uploadModal.dropExtractMain }}</div>
          <div class="drop-zone__or">{{ l.uploadModal.or }}</div>
          <n-button ghost size="small" type="primary" @click.stop="fileInput?.click()">{{ l.uploadModal.chooseFiles }}</n-button>
          <div class="drop-zone__hint">{{ l.uploadModal.dropExtractHint }}</div>
        </div>
        <div v-else class="drop-zone__add-more" @click.stop="fileInput?.click()">
          <span>{{ l.uploadModal.addMoreFiles }}</span>
        </div>
      </div>

      <div v-if="files.length" class="file-list">
        <div v-for="(f, i) in files" :key="i" class="file-item">
          <span class="file-item__icon">{{ fileIconEmoji(f.name) }}</span>
          <span :title="f.name" class="file-item__name">{{ f.name }}</span>
          <span class="file-item__size">{{ formatSize(f.size) }}</span>
          <n-button circle quaternary size="tiny" @click="files.splice(i, 1)">✕</n-button>
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
    <div v-else-if="step === 'loading'" class="extract-loading">
      <n-spin size="large" />
      <div style="margin-top: 16px; font-size: 14px; color: var(--text-muted)">
        {{ t('uploadModal.extracting', { count: files.length }) }}
      </div>
    </div>

    <!-- Step 3: preview results -->
    <div v-else-if="step === 'preview'" class="extract-preview">
      <div v-if="!previews.length" class="empty-state">
        <div class="empty-state__icon">😕</div>
        <div class="empty-state__text">{{ l.uploadModal.noRemindersFound }}</div>
        <div class="empty-state__sub">{{ l.uploadModal.noRemindersFoundSub }}</div>
      </div>

      <div v-else>
        <div class="preview-summary">
          <span class="preview-summary__count">{{ t('uploadModal.remindersSelected', { selected: confirmedCount, total: previews.length }) }}</span>
          <div style="display: flex; gap: 8px">
            <n-button quaternary size="tiny" @click="selectAll(true)">{{ l.uploadModal.selectAll }}</n-button>
            <n-button quaternary size="tiny" @click="selectAll(false)">{{ l.uploadModal.clearAll }}</n-button>
          </div>
        </div>

        <div class="preview-list">
          <div
            v-for="(p, i) in previews"
            :key="i"
            :class="{ 'preview-card--selected': p.selected }"
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

        <div v-if="errors.length" class="extract-errors">
          <div v-for="e in errors" :key="e.file" class="extract-error-row">
            ❌ {{ e.file }}: {{ e.error }}
          </div>
        </div>
      </div>
    </div>

    <!-- Step 4: saved confirmation -->
    <div v-else-if="step === 'saved'" class="extract-saved">
      <div style="font-size: 48px; text-align: center; margin-bottom: 12px">✅</div>
      <div style="font-size: 16px; font-weight: 600; text-align: center">
        {{ t('uploadModal.savedCount', { count: savedCount }) }}
      </div>
      <div style="font-size: 13px; color: var(--text-muted); text-align: center; margin-top: 6px">
        {{ l.uploadModal.savedHint }}
      </div>
    </div>
    </template>

    <template v-if="activeTab === 'extract'" #footer>
      <div class="modal-footer">
        <n-button @click="close">{{ l.common.cancel }}</n-button>
        <div class="modal-footer__actions">
          <template v-if="step === 'pick'">
            <n-button
              :disabled="!files.length"
              type="primary"
              @click="runExtract"
            >
              {{ l.uploadModal.extractReminders }}
            </n-button>
          </template>

          <template v-else-if="step === 'preview'">
            <n-button @click="step = 'pick'">{{ l.uploadModal.back }}</n-button>
            <n-button
              :disabled="confirmedCount === 0 || saving"
              :loading="saving"
              type="primary"
              @click="saveExtracted"
            >
              {{ t('uploadModal.saveNReminders', { count: confirmedCount }) }}
            </n-button>
          </template>

          <template v-else-if="step === 'saved'">
            <n-button type="primary" @click="close">{{ l.common.close }}</n-button>
          </template>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import { NButton, NCheckbox, NModal, NSpin, NTab, NTabs } from "naive-ui";
import { useI18n } from "../composables/useI18n.js";
import ReminderTableImport from "./ReminderTableImport.vue";

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

const emit = defineEmits<{
  (e: "reminders-saved", count: number): void;
}>();

const visible = defineModel<boolean>({ required: true });
const { l, t, locale } = useI18n();
const API = import.meta.env.VITE_API_BASE ?? "";

const activeTab = ref<"extract" | "table">("extract");
const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const files = ref<File[]>([]);
const step = ref<"pick" | "loading" | "preview" | "saved">("pick");
const previews = ref<ReminderPreview[]>([]);
const errors = ref<{ file: string; error: string }[]>([]);
const saving = ref(false);
const savedCount = ref(0);

const confirmedCount = computed(() => previews.value.filter((p) => p.selected).length);

watch(visible, (v) => {
  if (v) reset();
});

function reset() {
  files.value = [];
  step.value = "pick";
  previews.value = [];
  errors.value = [];
  dragOver.value = false;
  saving.value = false;
  savedCount.value = 0;
  activeTab.value = "extract";
}

function onTableImported() {
  emit("reminders-saved", 0);
  close();
}

function close() {
  visible.value = false;
}

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

async function runExtract() {
  if (!files.value.length) return;
  step.value = "loading";

  const fd = new FormData();
  for (const f of files.value) fd.append("files", f);

  try {
    const resp = await fetch(`${API}/api/extract/reminders?locale=${locale.value}`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? t("uploadModal.extractionFailed"));

    previews.value = (data.reminders ?? []).map((r: any) => ({
      ...r,
      next_check_date: r.next_check_date ?? r.expiry_date ?? null,
      selected: true,
    }));
    errors.value = data.errors ?? [];
    step.value = "preview";
  } catch (err) {
    errors.value = [{ file: l.value.uploadModal.allFiles, error: String(err) }];
    step.value = "preview";
  }
}

function selectAll(val: boolean) {
  previews.value.forEach((p) => (p.selected = val));
}

async function saveExtracted() {
  const toSave = previews.value.filter((p) => p.selected);
  if (!toSave.length) return;
  saving.value = true;

  try {
    const resp = await fetch(`${API}/api/extract/reminders/save?locale=${locale.value}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminders: toSave }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? t("uploadModal.saveFailed"));

    savedCount.value = data.saved ?? toSave.length;
    step.value = "saved";
    emit("reminders-saved", savedCount.value);
  } catch (err) {
    errors.value = [{ file: l.value.uploadModal.saveErrorLabel, error: String(err) }];
  } finally {
    saving.value = false;
  }
}

function fileIconEmoji(name: string) {
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
</script>

<style scoped>
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

.hidden { display: none; }

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
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 13px;
}
.file-item__icon { flex-shrink: 0; }
.file-item__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-item__size { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }

.extract-pick {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 360px;
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
  min-height: 300px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 48px 0;
  text-align: center;
}
.empty-state__icon { font-size: 36px; opacity: 0.5; }
.empty-state__text { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
.empty-state__sub { font-size: 11px; color: var(--text-muted); }

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

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.modal-footer__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

@media (max-width: 720px) {
  .drop-zone {
    min-height: 140px;
  }

  .preview-card__title {
    white-space: normal;
  }
}
</style>

<style>
.extract-reminders-modal.n-card {
  overflow: hidden;
  border-radius: 16px;
  font-family: var(--font-ui);
}

.extract-reminders-modal .n-card-header {
  padding: 18px 20px 12px;
  padding-inline-end: 48px;
}

.extract-reminders-modal .n-card__content {
  padding: 4px 20px 12px;
}

.extract-reminders-modal .n-card__footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border-color);
}
</style>
