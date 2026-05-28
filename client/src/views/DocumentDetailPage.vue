<template>
  <div class="page2 doc-detail">
    <PageHeader v-if="doc" :title="doc.file_name">
      <template #actions>
        <StatusBadge :status="doc.processing_status" />
        <n-button size="small" @click="$router.back()">← חזרה</n-button>
        <n-button :loading="downloading" size="small" @click="openDownload">⬇ הורד</n-button>
        <n-button :loading="extracting" size="small" type="primary" @click="rerunExtract">✨ חלץ AI</n-button>
      </template>
    </PageHeader>

    <n-alert v-if="doc?.error_message" class="mb-4" title="שגיאה בעיבוד" type="error">
      {{ doc.error_message }}
    </n-alert>

    <div v-if="doc" class="doc-detail__grid">
      <!-- ── Left column: preview ───────────────────────────────────── -->
      <aside class="doc-detail__left">
        <div class="preview-card">
          <div class="preview-card__head">
            <span class="preview-card__title">תצוגה מקדימה</span>
            <n-tag v-if="doc.mime_type" :bordered="false" size="small">{{ doc.mime_type }}</n-tag>
          </div>
          <div class="preview-card__body">
            <iframe
              v-if="previewUrl && isPdf"
              :src="previewUrl"
              class="preview-frame"
              type="application/pdf"
            />
            <img v-else-if="previewUrl && isImage" :src="previewUrl" class="preview-img" />
            <div v-else-if="previewError" class="preview-empty preview-empty--error">{{ previewError }}</div>
            <div v-else-if="!previewUrl" class="preview-empty">
              <n-spin size="small" />
              <span class="mt-2">טוען תצוגה...</span>
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
            <n-tag v-if="extractedFields.length" :bordered="false" size="small" type="success">
              {{ extractedFields.length }} שדות
            </n-tag>
          </div>
          <div class="data-card__body">
            <div v-if="!extractedFields.length" class="data-empty">
              <span>עדיין לא חולצו נתונים מהמסמך</span>
              <n-button :loading="extracting" class="mt-3" size="small" type="primary" @click="rerunExtract">
                ✨ הרץ חילוץ AI
              </n-button>
            </div>
            <div v-else class="fields-table">
              <div v-for="f in extractedFields" :key="f.key" class="fields-row">
                <span class="fields-label">{{ f.label }}</span>
                <span class="fields-value">
                  <template v-if="Array.isArray(f.value)">{{ f.value.join(', ') || '—' }}</template>
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
import type {Document} from "@shared/types.js";
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

const isPdf = computed(() => doc.value?.mime_type === "application/pdf");
const isImage = computed(() => doc.value?.mime_type?.startsWith("image/") ?? false);

async function loadPreview() {
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
    await api.documents.extract(String(doc.value.id));
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

const LABEL_MAP: Record<string, string> = {
  client_company: "פרטי הלקוח/תופש",
  client_name: "איש קשר",
  contact_person: "איש קשר",
  client_phone: "נייד",
  contact_phone: "נייד",
  client_email: "מייל",
  contact_email: "מייל",
  client_address: "ישוב / רחוב",
  po_box: "ת.ד",
  client_zipcode: "מיקוד",
  client_id: "ח.פ / ת.ז",
  report_number: "מספר תסקיר",
  document_number: "מספר מסמך",
  contract_number: "מספר חוזה",
  invoice_number: "מספר חשבונית",
  document_type: "סוג מסמך",
  contract_type: "סוג חוזה",
  inspection_date: "תאריך בדיקה",
  next_inspection_date: "בתוקף עד",
  start_date: "תאריך התחלה",
  expiry_date: "תאריך תפוגה",
  issue_date: "תאריך הוצאה",
  payment_due_date: "תאריך לתשלום",
  equipment_description: "תיאור מכונת הרמה",
  license_number: "מספר רישוי",
  equipment_type: "סוג ציוד",
  manufacturer: "יצרן",
  model: "דגם",
  serial_number: "מספר סידורי",
  load_capacity: "כושר עמיסה",
  findings: "ממצאים",
  notes: "הערות",
  summary_hebrew: "תקציר",
  auto_renewal: "חידוש אוטומטי",
  counterparty: "צד שכנגד",
  vat_amount: 'סכום מע"מ',
};

const SKIP_KEYS = new Set(["_equipment", "parties", "tasks", "amount", "currency"]);

const extractedFields = computed(() => {
  const raw = extractionRaw.value;
  if (!raw) return [];
  return Object.entries(raw)
    .filter(([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== "" && v !== undefined)
    .map(([k, v]) => ({ key: k, label: LABEL_MAP[k] ?? k, value: v }));
});

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

const equipmentColumns = [
  { title: "תיאור", key: "name", ellipsis: true },
  { title: "יצרן", key: "manufacturer", width: 110 },
  { title: "דגם", key: "model", width: 120 },
  { title: 'מ"ס סידורי', key: "serial_number", width: 130 },
  { title: "עומס עבודה", key: "load_capacity_work", width: 110, render: (row: any) => joinArr(row.load_capacity_work) },
  { title: "עומס מבחן", key: "load_capacity_test", width: 110, render: (row: any) => joinArr(row.load_capacity_test) },
  { title: "רדיוס", key: "load_radius", width: 80, render: (row: any) => joinArr(row.load_radius) },
];

async function reloadDoc() {
  const id = route.params.id as string;
  doc.value = await api.documents.get(id);
  const rows = await fetch(`${SERVER}/api/documents/${id}/extractions`, { credentials: "include" })
    .then((r) => r.ok ? r.json() : [])
    .catch(() => []);
  if (Array.isArray(rows) && rows.length) {
    const best = rows.find((r: any) => r.parsed_ok && r.result_json) ?? rows[0];
    if (best?.result_json) {
      try { extractionRaw.value = JSON.parse(best.result_json); } catch {}
    }
    if (best?.raw_text) extractionRawText.value = best.raw_text;
  }
  if (!extractionRaw.value && (doc.value as any).extracted_fields) {
    try { extractionRaw.value = JSON.parse((doc.value as any).extracted_fields); } catch {}
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
.preview-frame { width: 100%; height: 100%; border: none; background: #fff; }
.preview-img { max-width: 100%; max-height: 100%; object-fit: contain; }
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
