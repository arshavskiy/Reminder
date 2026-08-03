<template>
  <div class="page2 doc-detail">
    <PageHeader v-if="doc" :title="doc.file_name">
      <template #actions>
        <StatusBadge :status="doc.processing_status" />
        <n-button size="small" @click="$router.back()">   חזרה</n-button>
        <n-button :loading="downloading" size="small" @click="openDownload"> הורד</n-button>
        <n-button :loading="extracting" size="small" type="primary" @click="rerunExtract">✨ חלץ AI</n-button>
      </template>
    </PageHeader>

    <n-alert v-if="doc?.error_message" class="mb-4" title="שגיאה בעיבוד" type="error">
      {{ doc.error_message }}
    </n-alert>

    <section v-if="linkedContracts.length" class="linked-contracts">
      <ContractCard
        v-for="contract in linkedContracts"
        :key="contract.id"
        :bulk-mode="false"
        :kind="contractKind(contract)"
        :reminders="remindersForContract(contract.id)"
        :row="contract"
        :selected="false"
        :sending-reminder="null"
        :show-actions="false"
        :show-reminder-actions="false"
      />
    </section>

    <div v-if="doc" class="doc-detail__grid">
      <!-- ── Left column: preview ───────────────────────────────────── -->
      <aside class="doc-detail__left">
        <div class="preview-card">
          <div class="preview-card__head">
            <span class="preview-card__title">תצוגה מקדימה</span>
            <n-tag v-if="doc.mime_type" :bordered="false" size="small">{{ doc.mime_type }}</n-tag>
          </div>
          <div :class="{ 'preview-card__body--sheet': isSpreadsheet }" class="preview-card__body">
            <iframe
              v-if="previewUrl && isPdf"
              :src="previewUrl"
              class="preview-frame"
              type="application/pdf"
            />
            <img v-else-if="previewUrl && isImage" :src="previewUrl" class="preview-img" />
            <div v-else-if="isSpreadsheet && xlsxPreviewSheets.length" class="xlsx-preview">
              <section v-for="sheet in xlsxPreviewSheets" :key="sheet.name" class="xlsx-sheet">
                <div class="xlsx-sheet__name">{{ sheet.name }}</div>
                <div class="xlsx-table-wrap">
                  <table class="xlsx-table">
                    <tbody>
                      <tr v-for="(row, rowIndex) in sheet.rows" :key="rowIndex">
                        <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell || " " }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <div v-else-if="previewError" class="preview-empty preview-empty--error">{{ previewError }}</div>
            <div v-else-if="!previewUrl && !isSpreadsheet" class="preview-empty">
              <n-spin size="small" />
              <span class="mt-2">טוען תצוגה...</span>
            </div>
            <div v-else-if="isSpreadsheet" class="preview-empty">
              <span>אין עדיין טקסט טבלאי להצגה</span>
              <n-button :loading="extracting" class="mt-3" size="small" type="primary" @click="rerunExtract">
                עבד את הקובץ מחדש
              </n-button>
            </div>
            <div v-else class="preview-empty">
              <span>אין תצוגה מקדימה זמינה לסוג קובץ זה</span>
              <n-button class="mt-3" size="small" @click="openExternal">פתח בחלון חיצוני ↗</n-button>
            </div>
          </div>
        </div>

        <!-- File metadata under preview (admin only) -->
        <div v-if="authStore.user?.role === 'admin'" class="meta-card">
          <div class="meta-card__title">פרטי קובץ</div>
          <div class="meta-grid">
            <div class="meta-row"><span class="meta-row__label">סוג קובץ</span><span class="meta-row__value">{{ doc.mime_type }}</span></div>
            <div class="meta-row"><span class="meta-row__label">גודל</span><span class="meta-row__value">{{ formatSize(doc.file_size_bytes) }}</span></div>
            <div class="meta-row"><span class="meta-row__label">ייבוא</span><span class="meta-row__value">{{ formatDate(doc.import_date) }}</span></div>
            <div v-if="doc.page_count" class="meta-row"><span class="meta-row__label">עמודים</span><span class="meta-row__value">{{ doc.page_count }}</span></div>
            <div v-if="(doc as any).document_type" class="meta-row"><span class="meta-row__label">סוג מסמך</span><span class="meta-row__value">{{ (doc as any).document_type }}</span></div>
          </div>
        </div>
      </aside>

      <!-- ── Right column: data ─────────────────────────────────────── -->
      <section class="doc-detail__right">
        <!-- Extracted fields -->
        <div class="data-card">
          <div class="data-card__head">
            <span class="data-card__title">נתונים שחולצו</span>
            <div class="data-card__head-actions">
              <n-tag v-if="extractionRaw" :bordered="false" size="small" type="success">
                {{ extractedFields.filter(f => f.value !== null && f.value !== '').length }} שדות
              </n-tag>
              <template v-if="editingFields">
                <n-button size="small" @click="cancelEdit">ביטול</n-button>
                <n-button :loading="savingFields" size="small" type="primary" @click="saveFields">שמור</n-button>
              </template>
              <template v-else-if="extractionRaw">
                <n-button size="small" @click="showEmptyFields = !showEmptyFields">
                  {{ showEmptyFields ? 'הסתר ריקים' : 'הצג הכל' }}
                </n-button>
                <n-button size="small" @click="startEdit">✎ ערוך</n-button>
              </template>
            </div>
          </div>
          <div class="data-card__body">
            <div v-if="!extractionRaw" class="data-empty">
              <span>עדיין לא חולצו נתונים מהמסמך</span>
              <n-button :loading="extracting" class="mt-3" size="small" type="primary" @click="rerunExtract">
                ✨ הרץ חילוץ AI
              </n-button>
            </div>
            <div v-else class="fields-table">
              <div
                v-for="f in extractedFields"
                v-show="shouldShowExtractedField(f)"
                :key="f.key"
                class="fields-row"
              >
                <span class="fields-label">{{ f.label }}</span>
                <span class="fields-value">
                  <template v-if="editingFields && !Array.isArray(f.value) && (f.value === null || typeof f.value !== 'object')">
                    <input
                      v-model="fieldEdits[f.key]"
                      :placeholder="f.label"
                      class="fields-input"
                    />
                  </template>
                  <template v-else-if="Array.isArray(f.value)">{{ f.value.join(', ') || '—' }}</template>
                  <template v-else-if="f.value && typeof f.value === 'object'">{{ JSON.stringify(f.value) }}</template>
                  <template v-else>{{ f.value ?? '—' }}</template>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Equipment table -->
        <div v-if="equipment.length" class="data-card">
          <div class="data-card__head">
            <span class="data-card__title">ציוד שנבדק</span>
            <n-tag :bordered="false" size="small">{{ equipment.length }} פריטים</n-tag>
          </div>
          <div class="data-card__body">
            <n-data-table
              :bordered="false"
              :columns="equipmentColumns"
              :data="equipment"
              :pagination="false"
              size="small"
            />
          </div>
        </div>

        <!-- Raw text (admin only) -->
        <div v-if="displayText && authStore.user?.role === 'admin'" class="data-card">
          <div class="data-card__head">
            <span class="data-card__title">טקסט גולמי</span>
            <n-tag :bordered="false" size="small" type="info">{{ displayText.length.toLocaleString() }} תווים</n-tag>
          </div>
          <div class="data-card__body data-card__body--no-pad">
            <n-scrollbar class="raw-scroll">
              <pre class="raw-text">{{ displayText }}</pre>
            </n-scrollbar>
          </div>
        </div>
      </section>
    </div>

    <n-spin v-if="!doc" :show="loading" class="loading-center" />
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from "vue";
import {useRoute} from "vue-router";
import {NAlert, NButton, NDataTable, NScrollbar, NSpin, NTag, useMessage,} from "naive-ui";
import {api} from "../services/apiService.js";
import StatusBadge from "../components/StatusBadge.vue";
import PageHeader from "../components/PageHeader.vue";
import ContractCard from "../components/contracts/ContractCard.vue";
import type {ContractWithClient, Document, ReminderWithContext} from "@shared/types.js";
import {useAuthStore} from "../stores/auth.js";

const authStore = useAuthStore();
const message = useMessage();

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const route = useRoute();
const doc = ref<Document | null>(null);
const extractionRaw = ref<Record<string, any> | null>(null);
const extractionRawText = ref<string | null>(null);
const loading = ref(true);
const previewUrl = ref<string | null>(null);
const previewError = ref<string | null>(null);
const downloading = ref(false);
const extracting = ref(false);
const linkedContracts = ref<ContractWithClient[]>([]);
const linkedReminders = ref<ReminderWithContext[]>([]);
const editingFields = ref(false);
const savingFields = ref(false);
const fieldEdits = ref<Record<string, string>>({});
const showEmptyFields = ref(false);

const isPdf = computed(() => doc.value?.mime_type === "application/pdf");
const isImage = computed(() => doc.value?.mime_type?.startsWith("image/") ?? false);
const isSpreadsheet = computed(() =>
  doc.value?.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
  doc.value?.file_name?.toLowerCase().endsWith(".xlsx") ||
  doc.value?.file_name?.toLowerCase().endsWith(".xls")
);
const xlsxPreviewSheets = computed(() => {
  if (!isSpreadsheet.value || !displayText.value) return [];
  const sheets: Array<{ name: string; rows: string[][] }> = [];
  let current: { name: string; rows: string[][] } | null = null;

  for (const line of displayText.value.split(/\r?\n/)) {
    const sheetMatch = line.match(/^===\s*(.*?)\s*===$/);
    if (sheetMatch) {
      current = { name: sheetMatch[1] || "Sheet", rows: [] };
      sheets.push(current);
      continue;
    }
    if (!current) continue;
    if (!line.trim() || line.startsWith("--- detected") || line.startsWith("--- table")) continue;
    if (!line.includes("\t")) continue;
    current.rows.push(line.split("\t").map((cell) => cell.trim()));
    if (current.rows.length >= 80) current = null;
  }

  return sheets.filter((sheet) => sheet.rows.length).slice(0, 4);
});

async function loadPreview() {
  if (isSpreadsheet.value) return;
  if (!doc.value?.spaces_key) return;
  try {
    const res = await fetch(`${SERVER}/api/documents/${doc.value.id}/download`, { credentials: "include" });
    if (!res.ok) throw new Error(await res.text());
    const { url } = await res.json() as { url: string };
    previewUrl.value = url;
  } catch (e) {
    previewError.value = `לא ניתן לטעון תצוגה מקדימה: ${e}`;
  }
}

async function openDownload() {
  if (!doc.value) return;
  downloading.value = true;
  try {
    const res = await fetch(`${SERVER}/api/documents/${doc.value.id}/download`, { credentials: "include" });
    if (!res.ok) throw new Error(await res.text());
    const { url } = await res.json() as { url: string };
    window.open(url, "_blank", "noopener");
  } catch (e) {
    message.error(`לא ניתן להוריד: ${e}`);
  } finally {
    downloading.value = false;
  }
}

function openExternal() {
  if (previewUrl.value) window.open(previewUrl.value, "_blank", "noopener");
}

async function rerunExtract() {
  if (!doc.value) return;
  extracting.value = true;
  try {
    if (!doc.value.raw_text?.trim()) {
      const result = await api.documents.reprocess(String(doc.value.id));
      if (result.document) doc.value = result.document;
      extractionRaw.value = result.fields ?? null;
      extractionRawText.value = null;
      message.success("המסמך נשלח לעיבוד מחדש");
      await reloadDoc();
      return;
    }
    const result = await api.documents.extract(String(doc.value.id));
    if (result.document) doc.value = result.document;
    extractionRaw.value = result.fields ?? null;
    extractionRawText.value = null;
    message.success("חילוץ AI הושלם");
    await reloadDoc();
  } catch (e) {
    message.error(String(e));
  } finally {
    extracting.value = false;
  }
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL");
}
function formatSize(bytes: number | null | undefined) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const DEFAULT_FIELDS: { key: string; label: string }[] = [
  { key: "report_number",         label: "מספר תסקיר" },
  { key: "client_company",        label: "שם החברה / תופש" },
  { key: "contact_person",        label: "איש קשר" },
  { key: "contact_phone",         label: "נייד" },
  { key: "contact_email",         label: "מייל" },
  { key: "inspection_date",       label: "תאריך בדיקה" },
  { key: "next_inspection_date",  label: "בתוקף עד" },
  { key: "equipment_description", label: "תיאור" },
  { key: "checked_equipment",     label: "ציוד שנבדק" },
  { key: "license_number",        label: "מספר רישוי" },
  { key: "manufacturer",          label: "יצרן" },
  { key: "model",                 label: "דגם" },
  { key: "serial_number",         label: "מספר סידורי" },
  { key: "load_capacity",         label: "כושר עמיסה" },
  { key: "findings",              label: "ממצאים / הערות" },
  { key: "notes",                 label: "תיאור" },
];

const LABEL_MAP: Record<string, string> = Object.fromEntries(
  DEFAULT_FIELDS.map(f => [f.key, f.label])
);

const SKIP_KEYS = new Set(["parties", "tasks", "amount", "currency", "client_address", "po_box", "client_zipcode"]);
const ALWAYS_VISIBLE_FIELD_KEYS = new Set(["license_number"]);

const extractedFields = computed(() => {
  const raw = extractionRaw.value ?? {};
  const defaultKeys = new Set(DEFAULT_FIELDS.map(f => f.key));
  // Extra keys in raw that aren't in the default list and aren't skipped
  const extraFields = Object.keys(raw)
    .filter(k => !k.startsWith("_") && !SKIP_KEYS.has(k) && !defaultKeys.has(k))
    .map(k => ({ key: k, label: LABEL_MAP[k] ?? k }));
  return [...DEFAULT_FIELDS, ...extraFields].map(f => ({
    key: f.key,
    label: f.label,
    value: raw[f.key] ?? null,
  }));
});

function shouldShowExtractedField(field: { key: string; value: unknown }) {
  if (editingFields.value || showEmptyFields.value || ALWAYS_VISIBLE_FIELD_KEYS.has(field.key)) return true;
  if (Array.isArray(field.value)) return field.value.length > 0;
  return field.value !== null && field.value !== "";
}

const displayText = computed(() => extractionRawText.value ?? doc.value?.raw_text ?? null);

const equipment = computed<any[]>(() => {
  const raw = extractionRaw.value;
  if (!raw || !Array.isArray(raw._equipment)) return [];
  return raw._equipment.filter((e: any) => e && e.name);
});

function joinArr(v: unknown): string {
  if (Array.isArray(v)) return v.filter(Boolean).join(" / ");
  return v != null ? String(v) : "";
}

const ALL_EQUIPMENT_COLUMNS = [
  { title: "תיאור", key: "name", ellipsis: true },
  { title: "יצרן", key: "manufacturer", width: 110 },
  { title: "דגם", key: "model", width: 120 },
  { title: 'מ"ס סידורי', key: "serial_number", width: 130 },
  { title: "עומס עבודה", key: "load_capacity_work", width: 110, render: (row: any) => joinArr(row.load_capacity_work) },
  { title: "עומס מבחן", key: "load_capacity_test", width: 110, render: (row: any) => joinArr(row.load_capacity_test) },
  // { title: "רדיוס", key: "load_radius", width: 80, render: (row: any) => joinArr(row.load_radius) },
];

// Only show columns that have at least one non-empty value across all rows
const equipmentColumns = computed(() => {
  const rows = equipment.value;
  return ALL_EQUIPMENT_COLUMNS.filter(col => {
    return rows.some(row => {
      const v = row[col.key];
      if (Array.isArray(v)) return v.some(Boolean);
      return v !== null && v !== undefined && v !== "";
    });
  });
});

async function reloadDoc() {
  const id = route.params.id as string;
  extractionRaw.value = null;
  extractionRawText.value = null;
  doc.value = await api.documents.get(id);
  await loadLinkedContracts(id);
  const extractionPayload = await fetch(`${SERVER}/api/documents/${id}/extractions`, { credentials: "include" })
    .then((r) => r.ok ? r.json() : null)
    .catch(() => null);
  if (extractionPayload?.fields) {
    extractionRaw.value = extractionPayload.fields;
  } else if ((doc.value as any).extracted_fields) {
    try { extractionRaw.value = JSON.parse((doc.value as any).extracted_fields); } catch {}
  }
}

async function loadLinkedContracts(documentId: string) {
  try {
    // Force-refresh: the linked contract's client_name/type is populated as
    // extraction/linking completes, so a cached (often empty) response would
    // leave the header showing dashes.
    linkedContracts.value = await api.contracts.byDocument(documentId, true);
    if (linkedContracts.value.length) {
      await loadLinkedReminders();
    }
  } catch {
    linkedContracts.value = [];
  }
}

async function loadLinkedReminders() {
  try {
    const { rows } = await api.reminders.list({ limit: 1000 });
    const ids = new Set(linkedContracts.value.map((contract) => String(contract.id)));
    linkedReminders.value = rows.filter((reminder) =>
      reminder.source_id != null && ids.has(String(reminder.source_id))
    );
  } catch {
    linkedReminders.value = [];
  }
}

function remindersForContract(contractId: string | number): ReminderWithContext[] {
  return linkedReminders.value.filter((reminder) => String(reminder.source_id) === String(contractId));
}

function contractKind(contract: ContractWithClient): "contract" | "inspection" | "all" {
  const text = `${contract.contract_type ?? ""} ${contract.document_name ?? ""}`;
  return text.includes("תסקיר") || text.toLowerCase().includes("inspection") ? "inspection" : "contract";
}

function startEdit() {
  fieldEdits.value = Object.fromEntries(
    extractedFields.value.map(f => [f.key, f.value != null && !Array.isArray(f.value) && typeof f.value !== 'object' ? String(f.value) : ''])
  );
  editingFields.value = true;
}

function cancelEdit() {
  editingFields.value = false;
  fieldEdits.value = {};
}

async function saveFields() {
  if (!doc.value) return;
  savingFields.value = true;
  try {
    await api.documents.updateFields(String(doc.value.id), fieldEdits.value);
    editingFields.value = false;
    fieldEdits.value = {};
    message.success("הנתונים עודכנו — תזכורות מקושרות עודכנו אוטומטית");
    await reloadDoc();
  } catch (e) {
    message.error(String(e));
  } finally {
    savingFields.value = false;
  }
}

onMounted(async () => {
  try {
    await reloadDoc();
    loadPreview();
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.doc-detail { padding-bottom: 24px; }

.linked-contracts {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
}

.doc-detail__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

@media (max-width: 1024px) {
  .doc-detail__grid { grid-template-columns: 1fr; }
}

/* ── Left column ─────────────────────────────────────────────────────────── */
.doc-detail__left { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 16px; }

@media (max-width: 1024px) {
  .doc-detail__left { position: static; }
}

.preview-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.preview-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-elevated);
}
.preview-card__title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.preview-card__body {
  background: #1a1a1a;
  min-height: 640px;
  height: calc(100vh - 220px);
  max-height: 900px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-card__body--sheet {
  background: var(--bg-card);
  align-items: flex-start;
  justify-content: flex-start;
  overflow: auto;
  padding: 0;
  color: var(--text-primary);
}
.preview-frame { width: 100%; height: 100%; border: none; background: #fff; }
.preview-img { max-width: 100%; max-height: 100%; object-fit: contain; }
.xlsx-preview {
  align-self: stretch;
  width: 100%;
  overflow: auto;
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 12px;
}
.xlsx-sheet + .xlsx-sheet { margin-top: 18px; }
.xlsx-sheet__name {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-bottom: none;
  font-size: 13px;
  font-weight: 600;
}
.xlsx-table-wrap { overflow: auto; border: 1px solid var(--border-color); }
.xlsx-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  direction: rtl;
  background: var(--bg-card);
  font-size: 12px;
}
.xlsx-table td {
  min-width: 90px;
  max-width: 240px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  white-space: pre-wrap;
  vertical-align: top;
}
.preview-empty {
  color: var(--text-muted);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 20px;
  text-align: center;
}
.preview-empty--error { color: #e88080; }

/* ── Meta card ───────────────────────────────────────────────────────────── */
.meta-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px 16px;
}
.meta-card__title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px; }
.meta-grid { display: flex; flex-direction: column; gap: 6px; }
.meta-row { display: flex; justify-content: space-between; font-size: 12px; gap: 12px; }
.meta-row__label { color: var(--text-muted); }
.meta-row__value { color: var(--text-primary); font-weight: 500; }

/* ── Right column ────────────────────────────────────────────────────────── */
.doc-detail__right { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

.data-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  overflow: hidden;
}
.data-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-elevated);
}
.data-card__head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.data-card__title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.data-card__body { padding: 14px 16px; }
.data-card__body--no-pad { padding: 0; }

.data-empty {
  text-align: center;
  padding: 32px 16px;
  color: var(--text-muted);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* ── Fields table ────────────────────────────────────────────────────────── */
.fields-table { display: flex; flex-direction: column; }
.fields-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
  direction: rtl;
}
.fields-row:last-child { border-bottom: none; }
.fields-label {
  flex: 0 0 140px;
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}
.fields-value {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-word;
}
.fields-input {
  width: 100%;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--bg-body);
  border: 1px solid var(--brand-color);
  border-radius: 6px;
  padding: 4px 8px;
  outline: none;
  direction: rtl;
  box-sizing: border-box;
}
.fields-input:focus {
  box-shadow: 0 0 0 2px rgba(99, 226, 183, 0.2);
}

/* ── Raw text ────────────────────────────────────────────────────────────── */
.raw-scroll { max-height: 500px; }
.raw-text {
  white-space: pre-wrap;
  direction: rtl;
  font-size: 12px;
  line-height: 1.6;
  font-family: inherit;
  padding: 14px 16px;
  margin: 0;
  color: var(--text-primary);
}

/* ── Loading ─────────────────────────────────────────────────────────────── */
.loading-center { padding: 80px; display: flex; justify-content: center; }
</style>
