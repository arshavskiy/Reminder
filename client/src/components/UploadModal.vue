<template>
  <n-modal v-model:show="visible" :bordered="false" :mask-closable="false" :segmented="false" :title="null" preset="card" style="width: 860px">
    <template #header>
      <span style="font-size: 15px; font-weight: 600">העלאת מסמכים</span>
    </template>

    <div class="upload-layout">
      <!-- ── Left col (RTL: right side): drop zone + file queue ─────────── -->
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
            <div class="drop-zone__main">גרור קבצים לכאן</div>
            <div class="drop-zone__or">או</div>
            <n-button ghost size="small" type="primary" @click.stop="fileInput?.click()">בחר קבצים</n-button>
            <div class="drop-zone__hint">PDF · DOCX · XLSX · PNG · JPG · TIF</div>
          </div>
          <div v-else class="drop-zone__add-more" @click.stop="fileInput?.click()">
            <span>+ הוסף עוד קבצים</span>
          </div>
        </div>

        <!-- File queue -->
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

      <!-- ── Right col (RTL: left side): extraction fields ─────────────── -->
      <div class="upload-col upload-col--fields">
        <div class="fields-header">
          <span class="fields-title">שדות לחילוץ</span>
          <n-tag :bordered="false" size="small" type="info">אופציונלי</n-tag>
        </div>
        <p class="fields-hint">הגדר שדות שה-AI יחלץ. השאר ריק לחילוץ סטנדרטי אוטומטי.</p>

        <div class="fields-list">
          <div v-if="!fields.length" class="fields-empty">
            <div class="fields-empty__icon">✨</div>
            <div class="fields-empty__text">AI יחלץ שדות סטנדרטיים</div>
            <div class="fields-empty__sub">לקוח · תאריכים · סכומים · מספרי מסמך</div>
          </div>

          <div v-for="(f, i) in fields" :key="i" class="field-row">
            <n-input
              v-model:value="f.key"
              class="field-row__key"
              placeholder="key"
              size="small"
              style="direction: ltr; font-family: monospace"
            />
            <n-input
              v-model:value="f.label_he"
              class="field-row__label"
              placeholder="תווית עברית"
              size="small"
            />
            <n-select
              v-model:value="f.type"
              :options="typeOptions"
              :virtual-scroll="false"
              class="field-row__type"
              size="small"
            />
            <n-button circle quaternary size="tiny" @click="fields.splice(i, 1)">✕</n-button>
          </div>
        </div>

        <n-button dashed size="small" style="margin-top: 8px; width: 100%" @click="addField">
          + הוסף שדה
        </n-button>

        <!-- Pipeline toggles -->
        <div class="pipeline-toggles">
          <div class="pipeline-toggles__title">אפשרויות עיבוד</div>
          <label class="toggle-row">
            <n-switch v-model:value="doAi" size="small" />
            <span class="toggle-row__label">חילוץ AI</span>
            <span class="toggle-row__hint">זיהוי שדות, תאריכים וסכומים</span>
          </label>
          <label :class="{ 'toggle-row--disabled': !doAi }" class="toggle-row">
            <n-switch v-model:value="doEntities" :disabled="!doAi" size="small" />
            <span class="toggle-row__label">צור לקוחות וחוזים</span>
            <span class="toggle-row__hint">שמור ישויות ממסמך זה</span>
          </label>
          <label :class="{ 'toggle-row--disabled': !doEntities }" class="toggle-row">
            <n-switch v-model:value="doReminders" :disabled="!doEntities" size="small" />
            <span class="toggle-row__label">צור תזכורות</span>
            <span class="toggle-row__hint">תזכורת לפי תאריך פקיעה</span>
          </label>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="cancel">ביטול</n-button>
        <div style="display: flex; gap: 8px; align-items: center">
          <span v-if="files.length" class="footer-count">{{ files.length }} קובץ/ים נבחרו</span>
          <n-button
            :disabled="!files.length"
            :loading="uploading"
            type="primary"
            @click="submit"
          >
            העלה ועבד →
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script lang="ts" setup>
import {ref, watch} from "vue";
import {NButton, NInput, NModal, NSelect, NSwitch, NTag} from "naive-ui";

interface ExtractionField { key: string; label_he: string; type: string }
export interface UploadOptions { doAi: boolean; doEntities: boolean; doReminders: boolean }

const props = defineProps<{ uploading: boolean }>();
const emit = defineEmits<{
  (e: "upload", files: File[], fields: ExtractionField[], options: UploadOptions): void;
}>();

const visible = defineModel<boolean>({ required: true });

const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const files = ref<File[]>([]);
const fields = ref<ExtractionField[]>([]);
const doAi = ref(true);
const doEntities = ref(true);
const doReminders = ref(true);

const typeOptions = [
  { label: "טקסט",   value: "text" },
  { label: "מספר",   value: "number" },
  { label: "תאריך",  value: "date" },
  { label: "טלפון",  value: "phone" },
  { label: "אימייל", value: "email" },
  { label: "מטבע",   value: "currency" },
  { label: "רשימה",  value: "list" },
];

// Reset state each time the modal opens
watch(visible, (v) => {
  if (v) {
    files.value = []; fields.value = []; dragOver.value = false;
    doAi.value = true; doEntities.value = true; doReminders.value = true;
  }
});

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

function addField() {
  fields.value.push({ key: "", label_he: "", type: "text" });
}

function cancel() {
  visible.value = false;
}

function submit() {
  if (!files.value.length) return;
  emit("upload", [...files.value], [...fields.value], {
    doAi: doAi.value,
    doEntities: doEntities.value && doAi.value,
    doReminders: doReminders.value && doEntities.value,
  });
}

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

// Expose for parent to pre-load files (e.g. from the drop strip)
defineExpose({ addFiles });
</script>

<style scoped>
.hidden { display: none; }

/* ── Two-column layout ───────────────────────────────────────────────────── */
.upload-layout {
  display: flex;
  gap: 0;
  min-height: 380px;
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
  transition: border-color 0.18s, background 0.18s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  flex-shrink: 0;
}
.drop-zone:hover,
.drop-zone--over {
  border-color: var(--brand-color);
  background: rgba(99, 226, 183, 0.05);
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
.fields-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.fields-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.fields-hint { font-size: 12px; color: var(--text-muted); margin: 0 0 12px; }

.fields-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
  overflow-y: auto;
}

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

.field-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.field-row__key { width: 110px; flex-shrink: 0; }
.field-row__label { flex: 1; min-width: 0; }
.field-row__type { width: 90px; flex-shrink: 0; }

/* ── Pipeline toggles ────────────────────────────────────────────────────── */
.pipeline-toggles {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
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

/* ── Footer ──────────────────────────────────────────────────────────────── */
.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.footer-count { font-size: 13px; color: var(--text-muted); }
</style>
