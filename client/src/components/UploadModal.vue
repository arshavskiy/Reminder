<template>
  <n-modal v-model:show="visible" :bordered="false" :mask-closable="false" :segmented="false" :title="null" preset="card" style="width: 860px">
    <template #header>
      <span style="font-size: 15px; font-weight: 600">העלאת מסמכים</span>
    </template>

    <!-- Mode tabs -->
    <n-tabs v-model:value="activeTab" size="small" style="margin-bottom: 16px" type="line">
      <n-tab name="upload">העלאת מסמך</n-tab>
      <n-tab name="extract">חילוץ תזכורות</n-tab>
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
            <div class="drop-zone__main">גרור קבצים לכאן</div>
            <div class="drop-zone__or">או</div>
            <n-button ghost size="small" type="primary" @click.stop="fileInput?.click()">בחר קבצים</n-button>
            <div class="drop-zone__hint">PDF · DOCX · XLSX · PNG · JPG · TIF</div>
          </div>
          <div v-else class="drop-zone__add-more" @click.stop="fileInput?.click()">
            <span>+ הוסף עוד קבצים</span>
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

      <!-- ── Right col: extraction fields ─────────────────────────────────── -->
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

    <!-- ══════════════════════════════════════════════════ TAB: EXTRACT ══ -->
    <div v-else class="extract-tab">
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
            <div class="drop-zone__main">גרור קבצים לחילוץ תזכורות</div>
            <div class="drop-zone__or">או</div>
            <n-button ghost size="small" type="primary" @click.stop="extractInput?.click()">בחר קבצים</n-button>
            <div class="drop-zone__hint">PDF · DOCX · XLSX · PNG · JPG — ללא שמירת מסמך</div>
          </div>
          <div v-else class="drop-zone__add-more" @click.stop="extractInput?.click()">
            <span>+ הוסף עוד קבצים</span>
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
            <strong>מצב חילוץ תזכורות</strong> — ה-AI סורק את הקבצים, מזהה תאריכי פקיעה וחידוש,
            ומציג תצוגה מקדימה. לא נשמרים מסמכים ולא נוצרים לקוחות.
            ניתן לאשר או לדחות כל תזכורת לפני השמירה.
          </div>
        </div>
      </div>

      <!-- Step 2: loading -->
      <div v-else-if="extractStep === 'loading'" class="extract-loading">
        <n-spin size="large" />
        <div style="margin-top: 16px; font-size: 14px; color: var(--text-muted)">
          מחלץ תזכורות מ-{{ extractFiles.length }} קובץ/ים…
        </div>
      </div>

      <!-- Step 3: preview results -->
      <div v-else-if="extractStep === 'preview'" class="extract-preview">
        <div v-if="!extractPreviews.length" class="fields-empty" style="margin: 32px 0">
          <div class="fields-empty__icon">😕</div>
          <div class="fields-empty__text">לא נמצאו תזכורות בקבצים אלו</div>
          <div class="fields-empty__sub">נסה קבצים אחרים עם תאריכי פקיעה</div>
        </div>

        <div v-else>
          <div class="preview-summary">
            <span class="preview-summary__count">{{ confirmedCount }} / {{ extractPreviews.length }} תזכורות נבחרו</span>
            <div style="display: flex; gap: 8px">
              <n-button quaternary size="tiny" @click="selectAll(true)">בחר הכל</n-button>
              <n-button quaternary size="tiny" @click="selectAll(false)">נקה הכל</n-button>
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
                  <span class="preview-card__badge preview-card__badge--date">📅 שלח: {{ p.trigger_date }}</span>
                  <span v-if="p.expiry_date" class="preview-card__badge preview-card__badge--expiry">⏰ יעד: {{ p.expiry_date }}</span>
                  <span v-if="p.document_type" class="preview-card__badge">{{ p.document_type }}</span>
                  <span :class="`preview-card__badge--conf-${p.confidence}`" class="preview-card__badge preview-card__badge--conf">{{ confidenceLabel(p.confidence) }}</span>
                </div>
                <div v-if="p.contact_name || p.contact_email || p.contact_phone" class="preview-card__contact">
                  <span v-if="p.contact_name">👤 {{ p.contact_name }}</span>
                  <span v-if="p.contact_phone">📞 {{ p.contact_phone }}</span>
                  <span v-if="p.contact_email">✉️ {{ p.contact_email }}</span>
                </div>
                <div class="preview-card__source">מקור: {{ p.source_file }}</div>
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
          {{ savedCount }} תזכורות נשמרו בהצלחה
        </div>
        <div style="font-size: 13px; color: var(--text-muted); text-align: center; margin-top: 6px">
          ניתן לראות אותן בעמוד התזכורות
        </div>
      </div>
    </div>

    <!-- ─────────────────────────────────────────────────────── FOOTER ── -->
    <template #footer>
      <!-- Upload tab footer -->
      <div v-if="activeTab === 'upload'" class="modal-footer">
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

      <!-- Extract tab footer -->
      <div v-else class="modal-footer">
        <n-button @click="cancel">ביטול</n-button>
        <div style="display: flex; gap: 8px; align-items: center">
          <!-- Step: pick -->
          <template v-if="extractStep === 'pick'">
            <n-button
              :disabled="!extractFiles.length"
              type="primary"
              @click="runExtract"
            >
              חלץ תזכורות →
            </n-button>
          </template>

          <!-- Step: preview -->
          <template v-else-if="extractStep === 'preview'">
            <n-button @click="extractStep = 'pick'">חזור</n-button>
            <n-button
              :disabled="confirmedCount === 0 || savingExtract"
              :loading="savingExtract"
              type="primary"
              @click="saveExtracted"
            >
              שמור {{ confirmedCount }} תזכורות
            </n-button>
          </template>

          <!-- Step: saved -->
          <template v-else-if="extractStep === 'saved'">
            <n-button type="primary" @click="cancel">סגור</n-button>
          </template>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {NButton, NCheckbox, NInput, NModal, NSelect, NSpin, NSwitch, NTab, NTabs, NTag} from "naive-ui";

const API = import.meta.env.VITE_API_URL ?? "";

interface ExtractionField { key: string; label_he: string; type: string }
export interface UploadOptions { doAi: boolean; doEntities: boolean; doReminders: boolean }

interface ReminderPreview {
  title: string;
  trigger_date: string;
  expiry_date: string | null;
  advance_days: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  document_type: string | null;
  source_file: string;
  confidence: "high" | "medium" | "low";
  selected: boolean;
}

const props = defineProps<{ uploading: boolean }>();
const emit = defineEmits<{
  (e: "upload", files: File[], fields: ExtractionField[], options: UploadOptions): void;
  (e: "reminders-saved", count: number): void;
}>();

const visible = defineModel<boolean>({ required: true });

// ── Upload tab state ────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const files = ref<File[]>([]);
const fields = ref<ExtractionField[]>([]);
const doAi = ref(true);
const doEntities = ref(true);
const doReminders = ref(true);

// ── Extract tab state ───────────────────────────────────────────────────────
const activeTab = ref<"upload" | "extract">("upload");
const extractInput = ref<HTMLInputElement | null>(null);
const extractDragOver = ref(false);
const extractFiles = ref<File[]>([]);
const extractStep = ref<"pick" | "loading" | "preview" | "saved">("pick");
const extractPreviews = ref<ReminderPreview[]>([]);
const extractErrors = ref<{ file: string; error: string }[]>([]);
const savingExtract = ref(false);
const savedCount = ref(0);

const confirmedCount = computed(() => extractPreviews.value.filter((p) => p.selected).length);

const typeOptions = [
  { label: "טקסט",   value: "text" },
  { label: "מספר",   value: "number" },
  { label: "תאריך",  value: "date" },
  { label: "טלפון",  value: "phone" },
  { label: "אימייל", value: "email" },
  { label: "מטבע",   value: "currency" },
  { label: "רשימה",  value: "list" },
];

watch(visible, (v) => {
  if (v) resetAll();
});

function resetAll() {
  files.value = []; fields.value = []; dragOver.value = false;
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
    if (!resp.ok) throw new Error(data.error ?? "שגיאה בחילוץ");

    extractPreviews.value = (data.reminders ?? []).map((r: any) => ({ ...r, selected: true }));
    extractErrors.value = data.errors ?? [];
    extractStep.value = "preview";
  } catch (err) {
    extractErrors.value = [{ file: "כלל הקבצים", error: String(err) }];
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
    if (!resp.ok) throw new Error(data.error ?? "שגיאה בשמירה");

    savedCount.value = data.saved ?? toSave.length;
    extractStep.value = "saved";
    emit("reminders-saved", savedCount.value);
  } catch (err) {
    extractErrors.value = [{ file: "שמירה", error: String(err) }];
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
  return c === "high" ? "בטוח" : c === "medium" ? "בינוני" : "נמוך";
}

defineExpose({ addFiles });
</script>

<style scoped>
.hidden { display: none; }

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
}
.footer-count { font-size: 13px; color: var(--text-muted); }
</style>
