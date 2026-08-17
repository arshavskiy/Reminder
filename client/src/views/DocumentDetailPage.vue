<template>
  <div class="page2 doc-detail">
    <PageHeader v-if="doc" :title="doc.file_name">
      <template #breadcrumb>
        <router-link v-if="route.query.from === 'contracts'" to="/contracts">חוזים ותסקירים</router-link>
        <router-link v-else-if="route.query.from === 'calendar'" to="/">לוח שנה</router-link>
        <router-link v-else to="/documents">מסמכים</router-link>
        <span class="sep">/</span>
        <span>{{ doc.file_name }}</span>
      </template>
      <template #actions>
        <div class="doc-detail-actions">
          <StatusBadge :status="doc.processing_status"/>
          <button v-if="!props.docId" class="rbtn rbtn--ghost" type="button" @click="$router.back()">
            <n-icon :component="ArrowBackOutline" class="btn-icon"/>
            חזרה
          </button>
          <button
              :class="{ 'rbtn--loading': downloading }"
              :disabled="downloading"
              class="rbtn rbtn--ghost"
              type="button"
              @click="openDownload"
          >
            <n-icon :component="DownloadOutline" class="btn-icon"/>
            הורד
          </button>
          <button
              v-if="canExtractDocument"
              :class="{ 'rbtn--loading': extracting }"
              :disabled="extracting"
              class="rbtn rbtn--primary"
              type="button"
              @click="rerunExtract"
          >
            <n-icon :component="FlashOutline" class="btn-icon"/>
            חלץ AI
          </button>
          <button
              :class="{ 'rbtn--loading': deleting }"
              :disabled="deleting"
              class="rbtn rbtn--danger"
              type="button"
              @click="deleteDoc"
          >
            <n-icon :component="TrashOutline" class="btn-icon"/>
            מחק
          </button>
        </div>
      </template>
    </PageHeader>

    <n-alert v-if="doc?.error_message" class="mb-4" title="שגיאה בעיבוד" type="error">
      {{ doc.error_message }}
    </n-alert>

    <n-alert
      v-if="showMissingFieldsBanner"
      class="mb-4"
      title="חסרים שדות ליצירת תזכורת"
      type="warning"
    >
      <div>OCR לא מילא {{ missingExpiryLabel }}. מלא/י את השדות כדי ליצור תזכורות.</div>
      <n-button size="small" type="primary" style="margin-top:10px" @click="showMissingFieldsModal = true">
        מלא שדות חסרים
      </n-button>
    </n-alert>

    <MissingFieldsModal
      v-if="doc"
      v-model:show="showMissingFieldsModal"
      :document-id="String(doc.id)"
      :file-name="doc.file_name"
      :missing="missingFieldsList"
      :initial-values="missingFieldInitials"
      @saved="onMissingFieldsSaved"
    />

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
              <button
                  v-if="canExtractDocument"
                  :class="{ 'rbtn--loading': extracting }"
                  :disabled="extracting"
                  class="rbtn rbtn--primary mt-3"
                  type="button"
                  @click="rerunExtract"
              >
                <n-icon :component="FlashOutline" class="btn-icon"/>
                עבד את הקובץ מחדש
              </button>
            </div>
            <div v-else class="preview-empty">
              <span>אין תצוגה מקדימה זמינה לסוג קובץ זה</span>
              <button class="rbtn rbtn--ghost mt-3" type="button" @click="openExternal">
                <n-icon :component="OpenOutline" class="btn-icon"/>
                פתח בחלון חיצוני
              </button>
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
        <div v-if="showContractSidePanel" class="data-card contract-side-card">
          <div class="data-card__head">
            <div>
              <span class="data-card__title">תסקיר חדש</span>
              <div class="contract-side-card__sub">
                {{ activeLinkedContract?.client_name || activeLinkedContract?.counterparty || 'ללא לקוח' }}
              </div>
            </div>
            <div class="data-card__head-actions">
              <button
                  :class="{ 'btn--loading': savingContractSide }"
                  :disabled="savingContractSide"
                  class="btn btn--primary btn--xs"
                  type="button"
                  @click="saveContractSidePanel"
              >
                שמור
              </button>
              <button class="btn btn--ghost btn--xs" type="button" @click="openLinkedContract">
                פתח תסקיר
              </button>
            </div>
          </div>
          <div class="data-card__body">
            <n-form class="contract-side-form" label-placement="top" size="small">
              <n-grid :cols="2" :x-gap="10" :y-gap="2" responsive="screen">
                <n-gi>
                  <n-form-item label="מספר תסקיר">
                    <n-input v-model:value="contractSideForm.contract_number" placeholder="מספר תסקיר"/>
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item label="לקוח">
                    <n-input v-model:value="contractSideForm.client_name" placeholder="שם לקוח"/>
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item label="תאריך בדיקה">
                    <n-input v-model:value="contractSideForm.start_date" placeholder="YYYY-MM-DD"/>
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item label="בתוקף עד">
                    <n-input v-model:value="contractSideForm.expiry_date" placeholder="YYYY-MM-DD"/>
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item label="איש קשר">
                    <n-input v-model:value="contractSideForm.contact_person"/>
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item label="טלפון">
                    <n-input v-model:value="contractSideForm.contact_phone"/>
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item label="אימייל">
                    <n-input v-model:value="contractSideForm.contact_email" dir="ltr" class="email-ltr"/>
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item label="כתובת">
                    <n-input v-model:value="contractSideForm.client_address"/>
                  </n-form-item>
                </n-gi>
              </n-grid>

              <div class="contract-side-section">
                <div class="contract-side-section__title">ציוד שנבדק</div>
                <n-grid :cols="2" :x-gap="10" :y-gap="2" responsive="screen">
                  <n-gi>
                    <n-form-item label="סוג ציוד">
                      <n-input v-model:value="contractSideForm.checked_equipment"/>
                    </n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="מספר רישוי">
                      <n-input v-model:value="contractSideForm.license_number"/>
                    </n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="יצרן">
                      <n-input v-model:value="contractSideForm.manufacturer"/>
                    </n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="דגם">
                      <n-input v-model:value="contractSideForm.model"/>
                    </n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="מספר סידורי">
                      <n-input v-model:value="contractSideForm.serial_number"/>
                    </n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="כושר עבודה">
                      <n-input v-model:value="contractSideForm.load_capacity_work"/>
                    </n-form-item>
                  </n-gi>
                  <n-gi :span="2">
                    <n-form-item label="תיאור ציוד">
                      <n-input v-model:value="contractSideForm.equipment_description" :rows="2" type="textarea"/>
                    </n-form-item>
                  </n-gi>
                </n-grid>
              </div>
            </n-form>
          </div>
        </div>

        <!-- Extracted fields -->
        <div v-else class="data-card">
          <div class="data-card__head">
            <span class="data-card__title">נתונים שחולצו</span>
            <div class="data-card__head-actions">
              <n-tag v-if="extractionRaw" :bordered="false" size="small" type="success">
                {{ extractedFields.filter(f => f.value !== null && f.value !== '').length }} שדות
              </n-tag>
              <template v-if="editingFields">
                <button class="btn btn--ghost btn--xs" type="button" @click="cancelEdit">ביטול</button>
                <button
                    :class="{ 'btn--loading': savingFields }"
                    :disabled="savingFields"
                    class="btn btn--primary btn--xs"
                    type="button"
                    @click="saveFields"
                >
                  שמור
                </button>
              </template>
              <template v-else-if="extractionRaw">
                <button class="btn btn--ghost btn--xs" type="button" @click="showEmptyFields = !showEmptyFields">
                  {{ showEmptyFields ? 'הסתר ריקים' : 'הצג הכל' }}
                </button>
                <button class="btn btn--ghost btn--xs" type="button" @click="startEdit">
                  <n-icon :component="CreateOutline" class="btn-icon"/>
                  ערוך
                </button>
              </template>
            </div>
          </div>
          <div class="data-card__body">
            <div v-if="!extractionRaw" class="data-empty">
              <span>עדיין לא חולצו נתונים מהמסמך</span>
              <button
                  v-if="canExtractDocument"
                  :class="{ 'rbtn--loading': extracting }"
                  :disabled="extracting"
                  class="rbtn rbtn--primary mt-3"
                  type="button"
                  @click="rerunExtract"
              >
                <n-icon :component="FlashOutline" class="btn-icon"/>
                הרץ חילוץ AI
              </button>
            </div>
            <div v-else class="fields-table">
              <div
                v-for="f in extractedFields"
                v-show="shouldShowExtractedField(f)"
                :key="f.key"
                :class="['fields-row', isMissingField(f) ? 'fields-row--missing' : '']"
              >
                <span class="fields-label">{{ f.label }}</span>
                <span :class="['fields-value', isEmailField(f.key) ? 'email-ltr' : '', isMissingField(f) ? 'fields-value--missing' : '']">
                  <template v-if="editingFields && !Array.isArray(f.value) && (f.value === null || typeof f.value !== 'object')">
                    <input
                      v-model="fieldEdits[f.key]"
                      :dir="isEmailField(f.key) ? 'ltr' : undefined"
                      :placeholder="f.label"
                      :class="['fields-input', isEmailField(f.key) ? 'email-ltr' : '']"
                    />
                  </template>
                  <template v-else-if="Array.isArray(f.value)">{{ f.value.join(', ') || '—' }}</template>
                  <template v-else-if="f.value && typeof f.value === 'object'">{{ JSON.stringify(f.value) }}</template>
                  <template v-else>
                    {{ isMissingField(f) ? 'חסר' : displayExtractedValue(f) }}
                    <span v-if="(f as any).fromClient" class="fields-from-client"> (מהלקוח)</span>
                    <span v-if="isExpiredExtractedField(f)" class="fields-expired"> · לא בתוקף</span>
                  </template>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Equipment table -->
        <div v-if="!showContractSidePanel && equipment.length" class="data-card">
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
import {computed, onMounted, reactive, ref} from "vue";
import {useRoute, useRouter} from "vue-router";
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NIcon,
  NInput,
  NScrollbar,
  NSpin,
  NTag,
  useDialog,
  useMessage,
} from "naive-ui";
import {
  ArrowBackOutline,
  CreateOutline,
  DownloadOutline,
  FlashOutline,
  OpenOutline,
  TrashOutline
} from "@vicons/ionicons5";
import {api} from "../services/apiService.js";
import StatusBadge from "../components/StatusBadge.vue";
import PageHeader from "../components/PageHeader.vue";
import ContractCard from "../components/contracts/ContractCard.vue";
import MissingFieldsModal from "../components/MissingFieldsModal.vue";
import type {ContractWithClient, DocTemplate, Document, ReminderWithContext} from "@shared/types.js";
import {listMissingDocumentFields, missingFieldsBlockReminders, type MissingFieldItem} from "@shared/missingDocumentFields.js";
import {resolveMissingFieldInitialValue, normalizeDateForContract} from "@shared/documentDates.js";
import {useAuthStore} from "../stores/auth.js";

const props = defineProps<{ docId?: string }>();

const authStore = useAuthStore();
const message = useMessage();
const dialog = useDialog();
const router = useRouter();

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const route = useRoute();
const resolvedId = () => props.docId ?? (route.params.id as string);
const doc = ref<Document | null>(null);
const extractionRaw = ref<Record<string, any> | null>(null);
const extractionRawText = ref<string | null>(null);
const loading = ref(true);
const previewUrl = ref<string | null>(null);
const previewError = ref<string | null>(null);
const downloading = ref(false);
const extracting = ref(false);
const deleting = ref(false);
const linkedContracts = ref<ContractWithClient[]>([]);
const linkedReminders = ref<ReminderWithContext[]>([]);
const docTemplate = ref<DocTemplate | null>(null);
const missingFieldsList = ref<MissingFieldItem[]>([]);
const showMissingFieldsBanner = ref(false);
const showMissingFieldsModal = ref(false);
const missingFieldsPrompted = ref(false);
const missingFieldInitials = ref<Record<string, string>>({});
const missingExpiryLabel = computed(() =>
  missingFieldsList.value.find((field) => field.critical)?.label ?? "תאריך בתוקף",
);
const missingFieldKeys = computed(() => new Set(missingFieldsList.value.map((f) => f.key)));
const editingFields = ref(false);
const savingFields = ref(false);
const fieldEdits = ref<Record<string, string>>({});
const showEmptyFields = ref(false);
const savingContractSide = ref(false);

const contractSideForm = reactive({
  contract_number: "",
  client_name: "",
  start_date: "",
  expiry_date: "",
  contact_person: "",
  contact_phone: "",
  contact_email: "",
  client_address: "",
  checked_equipment: "",
  license_number: "",
  manufacturer: "",
  model: "",
  serial_number: "",
  load_capacity_work: "",
  equipment_description: "",
});

const isPdf = computed(() => doc.value?.mime_type === "application/pdf");
const isImage = computed(() => doc.value?.mime_type?.startsWith("image/") ?? false);
const isSpreadsheet = computed(() =>
  doc.value?.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
  doc.value?.file_name?.toLowerCase().endsWith(".xlsx") ||
  doc.value?.file_name?.toLowerCase().endsWith(".xls")
);
const canExtractDocument = computed(() => doc.value?.document_source !== "generated");
const activeLinkedContract = computed(() => linkedContracts.value[0] ?? null);
const showContractSidePanel = computed(() =>
    route.query.from === "contracts" &&
    doc.value?.document_source === "generated" &&
    Boolean(activeLinkedContract.value)
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

function downloadEndpoint(id: string) {
  return props.docId
    ? `${SERVER}/api/admin/documents/${id}/download`
    : `${SERVER}/api/documents/${id}/download`;
}

async function loadPreview() {
  if (isSpreadsheet.value) return;
  if (!doc.value?.spaces_key) return;
  try {
    const res = await fetch(downloadEndpoint(String(doc.value.id)), { credentials: "include" });
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
    const res = await fetch(downloadEndpoint(String(doc.value.id)), { credentials: "include" });
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

async function deleteDoc() {
  if (!doc.value) return;
  const currentDoc = doc.value;
  dialog.warning({
    title: "מחיקת מסמך",
    content: `למחוק את המסמך "${currentDoc.file_name}"? פעולה זו אינה ניתנת לביטול.`,
    positiveText: "מחק",
    negativeText: "ביטול",
    onPositiveClick: async () => {
      deleting.value = true;
      try {
        await api.documents.delete(String(currentDoc.id));
        message.success("המסמך נמחק");
        router.push("/documents");
      } catch (e) {
        message.error(String(e));
      } finally {
        deleting.value = false;
      }
    },
  });
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
  const iso = parseDateOnly(d);
  if (iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("he-IL");
  }
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString("he-IL");
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
  { key: "client_email",          label: "מייל" },
  { key: "inspection_date",       label: "תאריך בדיקה" },
  { key: "expiry_date",           label: "בתוקף עד" },
  { key: "date_diff_months",      label: "הפרש בחודשים לבדיקה" },
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

const SKIP_KEYS = new Set(["parties", "tasks", "amount", "currency", "client_address", "po_box", "client_zipcode", "contact_email", "email", "inspection_interval_months", "next_inspection_date"]);
const ALWAYS_VISIBLE_FIELD_KEYS = new Set(["license_number"]);

const extractedFields = computed(() => {
  const raw = extractionRaw.value ?? {};
  const defaultKeys = new Set(DEFAULT_FIELDS.map(f => f.key));
  // Extra keys in raw that aren't in the default list and aren't skipped
  const extraFields = Object.keys(raw)
    .filter(k => !k.startsWith("_") && !SKIP_KEYS.has(k) && !defaultKeys.has(k))
    .map(k => ({ key: k, label: LABEL_MAP[k] ?? k }));
  const contractEmail = activeLinkedContract.value?.contact_email ?? null;
  return [...DEFAULT_FIELDS, ...extraFields].map(f => ({
    key: f.key,
    label: f.label,
    value: f.key === "client_email"
      ? raw.client_email ?? raw.contact_email ?? raw.email ?? contractEmail ?? null
      : f.key === "expiry_date"
        ? raw.expiry_date ?? raw.next_inspection_date ?? null
      : f.key === "date_diff_months"
        ? raw.date_diff_months ?? raw.inspection_interval_months ?? null
      : raw[f.key] ?? null,
    fromClient: f.key === "client_email" && !(raw.client_email ?? raw.contact_email ?? raw.email) && !!contractEmail,
  }));
});

function isEmailField(key: string) {
  return key === "client_email" || key === "contact_email" || key === "email";
}

function parseDateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return normalizeDateForContract(value.trim());
}

function todayDateOnly(today = new Date()): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function isExpiredExtractedField(field: { key: string; value: unknown }): boolean {
  if (field.key !== "expiry_date") return false;
  const iso = parseDateOnly(field.value);
  return Boolean(iso && iso < todayDateOnly());
}

function displayExtractedValue(field: { key: string; value: unknown }): string {
  if (field.value == null || field.value === "") return "—";
  if (field.key === "expiry_date" || field.key === "inspection_date") {
    return formatDate(String(field.value));
  }
  return String(field.value);
}

function isMissingField(field: { key: string; value: unknown }): boolean {
  if (!missingFieldKeys.value.has(field.key)) return false;
  if (field.key === "expiry_date") {
    if (field.value == null || field.value === "") return true;
    if (typeof field.value === "string" && !field.value.trim()) return true;
    return false;
  }
  if (field.value == null || field.value === "") return true;
  if (typeof field.value === "string" && !field.value.trim()) return true;
  return false;
}

function shouldShowExtractedField(field: { key: string; value: unknown }) {
  if (editingFields.value || showEmptyFields.value || ALWAYS_VISIBLE_FIELD_KEYS.has(field.key)) return true;
  if (missingFieldKeys.value.has(field.key)) return true;
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
  const id = resolvedId();
  extractionRaw.value = null;
  extractionRawText.value = null;
  doc.value = props.docId
    ? await api.admin.getDocument(id)
    : await api.documents.get(id);
  await loadLinkedContracts(id);
  const extractionPayload = await fetch(`${SERVER}/api/documents/${id}/extractions`, { credentials: "include" })
    .then((r) => r.ok ? r.json() : null)
    .catch(() => null);
  if (extractionPayload?.fields) {
    extractionRaw.value = extractionPayload.fields;
  } else if ((doc.value as any).extracted_fields) {
    try { extractionRaw.value = JSON.parse((doc.value as any).extracted_fields); } catch {}
  }
  await evaluateMissingFields();
}

async function evaluateMissingFields() {
  if (!doc.value || doc.value.processing_status !== "done") {
    missingFieldsList.value = [];
    showMissingFieldsBanner.value = false;
    return;
  }
  const extracted = extractionRaw.value ?? {};
  if (doc.value.template_id) {
    try {
      docTemplate.value = await api.docTemplates.get(String(doc.value.template_id));
    } catch {
      docTemplate.value = null;
    }
  } else {
    docTemplate.value = null;
  }
  missingFieldsList.value = listMissingDocumentFields(docTemplate.value, extracted);
  missingFieldInitials.value = Object.fromEntries(
    missingFieldsList.value.map((field) => [
      field.key,
      resolveMissingFieldInitialValue(field.key, extracted, docTemplate.value),
    ]),
  );
  showMissingFieldsBanner.value =
    missingFieldsBlockReminders(missingFieldsList.value) && linkedReminders.value.length === 0;
  if (showMissingFieldsBanner.value && !missingFieldsPrompted.value) {
    missingFieldsPrompted.value = true;
    showMissingFieldsModal.value = true;
  }
}

async function onMissingFieldsSaved() {
  await reloadDoc();
  await loadLinkedReminders();
  await evaluateMissingFields();
}

async function loadLinkedContracts(documentId: string) {
  try {
    // Force-refresh: the linked contract's client_name/type is populated as
    // extraction/linking completes, so a cached (often empty) response would
    // leave the header showing dashes.
    linkedContracts.value = await api.contracts.byDocument(documentId, true);
    hydrateContractSidePanel();
    if (linkedContracts.value.length) {
      await loadLinkedReminders();
    }
  } catch {
    linkedContracts.value = [];
  }
}

function hydrateContractSidePanel() {
  const contract = activeLinkedContract.value;
  if (!contract) return;
  const manual = plainRecord(contract.manual_fields);
  const firstEquipment = Array.isArray((contract as any)._equipment)
      ? ((contract as any)._equipment[0] ?? null)
      : Array.isArray(manual._equipment)
          ? (manual._equipment[0] ?? null)
          : null;

  contractSideForm.contract_number = textValue(contract.contract_number ?? manual.report_number ?? manual.document_number);
  contractSideForm.client_name = textValue(contract.client_name ?? contract.counterparty ?? manual.client_company ?? manual.client_name);
  contractSideForm.start_date = dateOnly(contract.start_date ?? manual.inspection_date ?? manual.start_date);
  contractSideForm.expiry_date = dateOnly(contract.expiry_date ?? manual.expiry_date);
  contractSideForm.contact_person = textValue((contract as any).contact_person ?? manual.contact_person);
  contractSideForm.contact_phone = textValue((contract as any).contact_phone ?? manual.contact_phone);
  contractSideForm.contact_email = textValue((contract as any).contact_email ?? manual.contact_email ?? manual.client_email);
  contractSideForm.client_address = textValue((contract as any).client_address ?? manual.client_address);
  contractSideForm.checked_equipment = textValue(firstEquipment?.name ?? manual.checked_equipment ?? manual.name);
  contractSideForm.license_number = textValue(firstEquipment?.license_number ?? manual.license_number);
  contractSideForm.manufacturer = textValue(firstEquipment?.manufacturer ?? manual.manufacturer);
  contractSideForm.model = textValue(firstEquipment?.model ?? manual.model);
  contractSideForm.serial_number = textValue(firstEquipment?.serial_number ?? manual.serial_number);
  contractSideForm.load_capacity_work = textValue(firstArrayValue(firstEquipment?.load_capacity_work) ?? manual.load_capacity_work);
  contractSideForm.equipment_description = textValue((contract as any).equipment_description ?? manual.equipment_description ?? firstEquipment?.description);
}

function plainRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function textValue(value: unknown): string {
  if (Array.isArray(value)) return value.filter(Boolean).join(" / ");
  return value == null ? "" : String(value);
}

function firstArrayValue(value: unknown): string {
  return Array.isArray(value) ? textValue(value[0]) : textValue(value);
}

function dateOnly(value: unknown): string {
  const text = textValue(value);
  return text.includes("T") ? text.slice(0, 10) : text;
}

async function saveContractSidePanel() {
  const contract = activeLinkedContract.value;
  if (!contract) return;
  savingContractSide.value = true;
  try {
    const existingManual = plainRecord(contract.manual_fields);
    const equipmentRow = {
      ...(Array.isArray(existingManual._equipment) ? existingManual._equipment[0] : {}),
      name: contractSideForm.checked_equipment,
      manufacturer: contractSideForm.manufacturer,
      model: contractSideForm.model,
      serial_number: contractSideForm.serial_number,
      license_number: contractSideForm.license_number,
      load_capacity_work: contractSideForm.load_capacity_work ? [contractSideForm.load_capacity_work] : [],
      description: contractSideForm.equipment_description,
      category: (Array.isArray(existingManual._equipment) ? existingManual._equipment[0]?.category : null) ?? "lift",
    };
    const manual_fields = {
      ...existingManual,
      document_number: contractSideForm.contract_number,
      contract_number: contractSideForm.contract_number,
      report_number: contractSideForm.contract_number,
      client_company: contractSideForm.client_name,
      client_name: contractSideForm.client_name,
      contact_person: contractSideForm.contact_person,
      contact_phone: contractSideForm.contact_phone,
      contact_email: contractSideForm.contact_email,
      client_email: contractSideForm.contact_email,
      client_address: contractSideForm.client_address,
      start_date: contractSideForm.start_date,
      inspection_date: contractSideForm.start_date,
      check_date: contractSideForm.start_date,
      expiry_date: contractSideForm.expiry_date,
      checked_equipment: contractSideForm.checked_equipment,
      name: contractSideForm.checked_equipment,
      license_number: contractSideForm.license_number,
      manufacturer: contractSideForm.manufacturer,
      model: contractSideForm.model,
      serial_number: contractSideForm.serial_number,
      load_capacity_work: contractSideForm.load_capacity_work,
      equipment_description: contractSideForm.equipment_description,
      _equipment: [equipmentRow],
    };

    await api.contracts.update(String(contract.id), {
      contract_number: contractSideForm.contract_number || undefined,
      start_date: contractSideForm.start_date || undefined,
      expiry_date: contractSideForm.expiry_date || undefined,
      counterparty: contractSideForm.client_name || undefined,
      summary: contractSideForm.equipment_description || contractSideForm.checked_equipment || undefined,
      manual_fields,
      skip_reminders: true,
    } as any);
    message.success("התסקיר עודכן");
    await loadLinkedContracts(String(doc.value?.id ?? resolvedId()));
  } catch (e) {
    message.error(String(e));
  } finally {
    savingContractSide.value = false;
  }
}

function openLinkedContract() {
  const contract = activeLinkedContract.value;
  if (!contract) return;
  router.push(`/contracts?edit=${encodeURIComponent(String(contract.id))}&returnTo=${encodeURIComponent(route.fullPath)}`);
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

.doc-detail-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
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

.rbtn:hover {
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

.rbtn--danger {
  background: transparent;
  border-color: rgba(208, 48, 80, 0.35);
  color: #d03050;
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

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

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

.contract-side-card {
  direction: rtl;
}

.contract-side-card__sub {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.contract-side-form :deep(.n-form-item) {
  margin-bottom: 0;
}

.contract-side-form :deep(.n-form-item-label) {
  min-height: 18px;
  padding-bottom: 3px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.contract-side-form :deep(.n-input),
.contract-side-form :deep(.n-input .n-input-wrapper) {
  --n-border-radius: 6px;
  min-height: 32px;
  background: var(--bg-card);
}

.contract-side-form :deep(.n-input__input-el),
.contract-side-form :deep(.n-input__textarea-el) {
  font-family: inherit;
  font-size: 13px;
}

.contract-side-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.contract-side-section__title {
  margin-bottom: 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
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
  unicode-bidi: plaintext;
  box-sizing: border-box;
}
.fields-input.email-ltr,
.fields-value.email-ltr {
  direction: ltr;
  unicode-bidi: isolate;
  text-align: left;
}
.fields-expired {
  color: var(--danger, #d03050);
  font-weight: 600;
}
.fields-from-client {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 400;
}
.fields-row--missing {
  background: rgba(208, 48, 80, 0.06);
  border-radius: 4px;
  padding-inline: 8px;
  margin-inline: -8px;
}
.fields-row--missing .fields-label {
  color: var(--color-error, #d03050);
}
.fields-value--missing {
  color: var(--color-error, #d03050);
  font-style: italic;
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

@media (max-width: 720px) {
  .doc-detail-actions,
  .rbtn {
    width: 100%;
  }
}
</style>
