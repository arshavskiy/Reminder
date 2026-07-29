<template>
  <div class="doc-templates-page">
    <n-space class="doc-templates-head" justify="space-between" align="center" style="margin-bottom: 16px">
<!--      <h2 style="margin: 0">תבניות מסמכים</h2>-->
      <span></span>
      <n-space>
        <n-button @click="showGenerate = true">✨ צור תבנית מ-AI</n-button>
        <n-button type="primary" @click="newTemplate">+ תבנית חדשה</n-button>
      </n-space>
    </n-space>

    <!-- Generate-from-AI modal -->
    <n-modal v-model:show="showGenerate" preset="card" title="צור תבנית באמצעות AI" style="width: 640px; max-width: 95vw">
      <n-alert type="info" :show-icon="false" style="margin-bottom: 12px; font-size: 13px">
        העלה דוגמה של מסמך, או הדבק את הטקסט שלו — ה-AI יציע תבנית עם שדות מתאימים בעברית. תוכל לערוך לפני שמירה.
      </n-alert>

      <n-tabs v-model:value="genMode" type="line" animated>
        <n-tab-pane name="file" tab="העלאת קובץ">
          <n-upload
            :show-file-list="false"
            :custom-request="onGenFile as any"
            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt"
          >
            <n-upload-dragger>
              <div style="padding: 24px; text-align: center">
                <p style="margin: 0; font-size: 15px">לחץ או גרור קובץ לכאן</p>
                <p style="margin: 4px 0 0; color: var(--text-muted); font-size: 12px">
                  PDF, DOCX, XLSX, תמונה או טקסט
                </p>
              </div>
            </n-upload-dragger>
          </n-upload>
        </n-tab-pane>

        <n-tab-pane name="text" tab="הדבקת טקסט">
          <n-input
            v-model:value="genText"
            type="textarea"
            :rows="10"
            placeholder="הדבק כאן את תוכן המסמך לדוגמה..."
          />
          <n-button
            type="primary"
            :loading="generating"
            :disabled="genText.trim().length < 50"
            style="margin-top: 12px"
            @click="onGenText"
          >צור תבנית מהטקסט</n-button>
        </n-tab-pane>
      </n-tabs>

      <n-spin v-if="generating" :show="true">
        <div style="height: 80px; display: flex; align-items: center; justify-content: center">
          ה-AI מנתח את המסמך ובונה את התבנית...
        </div>
      </n-spin>
    </n-modal>

    <n-alert v-if="!templates.length" type="info" :show-icon="false">
      אין עדיין תבניות. צור תבנית כדי להגדיר אילו שדות לחלץ מסוגי מסמכים שונים.
    </n-alert>

    <n-grid v-else :cols="templateGridCols" :x-gap="16" :y-gap="16">
      <n-gi v-for="t in templates" :key="t.id">
        <n-card hoverable :title="t.name" @click="select(t)" style="cursor:pointer">
          <template #header-extra>
            <n-space :size="4">
              <n-tag v-if="t.document_kind && t.document_kind !== 'unknown'" :type="kindTagType(t.document_kind)" size="small">
                {{ kindLabel(t.document_kind) }}
              </n-tag>
              <n-tag v-if="t.is_builtin" size="small" type="info">מובנה</n-tag>
              <n-tag v-if="t.is_default" size="small" type="success">ברירת מחדל</n-tag>
            </n-space>
          </template>
          <p style="font-size: 13px; color: var(--text-secondary); margin: 0 0 8px">
            {{ t.description || "—" }}
          </p>
          <p style="font-size: 12px; color: var(--text-muted); margin: 0">
            {{ t.fields.length }} שדות · מילות מפתח: {{ (t.match_keywords || []).join(", ") || "—" }}
          </p>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- Editor drawer -->
    <n-drawer v-model:show="showEdit" :width="drawerWidth" placement="left">
      <n-drawer-content :title="editing?.id ? 'עריכת תבנית' : 'תבנית חדשה'" closable>
        <n-form v-if="editing" label-placement="top">
          <n-grid :cols="2" :x-gap="16">
            <n-gi>
              <n-form-item label="שם" required>
                <n-input v-model:value="editing.name" placeholder="למשל: תסקיר בדיקה" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="סוג מסמך">
                <n-select
                  v-model:value="editing.document_kind"
                  :options="kindOptions"
                  :virtual-scroll="false"
                />
              </n-form-item>
            </n-gi>
          </n-grid>

          <n-form-item label="תיאור">
            <n-input v-model:value="editing.description" type="textarea" :rows="2" />
          </n-form-item>
          <n-form-item label="מילות מפתח לזיהוי אוטומטי (מופרדות בפסיק)">
            <n-input
              :value="(editing.match_keywords || []).join(', ')"
              @update:value="v => editing!.match_keywords = v.split(',').map(s => s.trim()).filter(Boolean)"
              placeholder="תסקיר, בדיקה תקופתית"
            />
          </n-form-item>

          <n-divider style="margin: 16px 0 12px" />
          <n-space align="center" justify="space-between" style="margin-bottom: 8px">
            <span style="font-weight: 600">שדות לחילוץ</span>
            <n-button ghost size="small" type="primary" @click="addField">+ הוסף שדה</n-button>
          </n-space>
          <n-alert type="info" :show-icon="false" style="margin-bottom: 12px; font-size: 12px">
            כל שדה יחולץ מהמסמך באמצעות AI. שדה התאריך שמופיע למטה ב"שדה תזכורת" הוא זה שמפעיל את התזכורת.
          </n-alert>

          <div v-for="(f, i) in editing.fields" :key="i" class="field-row">
            <n-grid :cols="12" :x-gap="8" align="center">
              <n-gi :span="3">
                <n-input v-model:value="f.key" placeholder="key" size="small" />
              </n-gi>
              <n-gi :span="4">
                <n-input v-model:value="f.label_he" placeholder="תווית עברית" size="small" />
              </n-gi>
              <n-gi :span="3">
                <n-select
                  v-model:value="f.type"
                  size="small"
                  :options="typeOptions"
                  :virtual-scroll="false"
                />
              </n-gi>
              <n-gi :span="1">
                <n-checkbox v-model:checked="f.required as any" size="small">חובה</n-checkbox>
              </n-gi>
              <n-gi :span="1" style="text-align: center">
                <n-button circle quaternary size="small" @click="editing!.fields.splice(i, 1)">✕</n-button>
              </n-gi>
            </n-grid>
            <n-input
              v-model:value="f.hint_he"
              placeholder="רמז ל-AI — מה לחפש, מה להתעלם (אופציונלי)"
              size="small"
              style="margin-top: 4px"
            />
          </div>

          <n-empty v-if="!editing.fields.length" description="אין שדות עדיין" size="small" style="margin: 12px 0" />

          <n-divider style="margin: 16px 0 12px" />

          <n-form-item label="שדה תזכורת — איזה תאריך מפעיל את התזכורת">
            <n-select
              v-model:value="editing.expiry_field"
              :options="dateFieldOptions"
              placeholder="בחר שדה תאריך..."
              clearable
              :virtual-scroll="false"
            />
          </n-form-item>

          <n-form-item>
            <n-checkbox v-model:checked="editing.is_default as any">תבנית ברירת מחדל</n-checkbox>
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space>
            <n-button @click="showEdit = false">ביטול</n-button>
            <n-button
              v-if="editing?.id && !editing.is_builtin"
              type="error"
              @click="deleteTpl"
            >מחק</n-button>
            <n-button type="primary" :loading="saving" @click="save">שמור</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NDivider,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NSpin,
  NTabPane,
  NTabs,
  NTag,
  NUpload,
  NUploadDragger,
  useMessage,
} from "naive-ui";
import {api} from "../services/apiService.js";
import type {DocTemplate, DocumentKind, FieldType, TemplateField} from "@shared/types.js";

const templates = ref<DocTemplate[]>([]);
const showEdit = ref(false);
const editing = ref<DocTemplate | null>(null);
const saving = ref(false);
const message = useMessage();
const isMobile = ref(false);
const templateGridCols = computed(() => isMobile.value ? 1 : 3);
const drawerWidth = computed(() => isMobile.value ? "100vw" : 960);

function updateViewport() {
  isMobile.value = window.innerWidth <= 720;
}

// Generator state
const showGenerate = ref(false);
const genMode = ref<"file" | "text">("file");
const genText = ref("");
const generating = ref(false);

const typeOptions = [
  { label: "טקסט", value: "text" },
  { label: "מספר", value: "number" },
  { label: "תאריך", value: "date" },
  { label: "טלפון", value: "phone" },
  { label: "אימייל", value: "email" },
  { label: "מטבע", value: "currency" },
  { label: "רשימה", value: "list" },
];

const kindOptions = [
  { label: "תסקיר בדיקה", value: "inspection_report" },
  { label: "חוזה / הסכם",  value: "contract" },
  { label: "חשבונית",      value: "invoice" },
  { label: "תעודה / הסמכה", value: "certificate" },
  { label: "אחר / לא ידוע", value: "unknown" },
];

function kindLabel(kind: DocumentKind): string {
  return kindOptions.find((o) => o.value === kind)?.label ?? kind;
}

function kindTagType(kind: DocumentKind): "default" | "info" | "success" | "warning" | "error" {
  const map: Record<DocumentKind, "default" | "info" | "success" | "warning" | "error"> = {
    inspection_report: "warning",
    contract: "info",
    invoice: "success",
    certificate: "error",
    unknown: "default",
  };
  return map[kind] ?? "default";
}

const dateFieldOptions = computed(() => {
  if (!editing.value) return [];
  return editing.value.fields
    .filter((f) => f.type === "date")
    .map((f) => ({ label: `${f.label_he} (${f.key})`, value: f.key }));
});

async function load() {
  templates.value = await api.docTemplates.list();
}
onMounted(() => {
  updateViewport();
  window.addEventListener("resize", updateViewport);
  load();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewport);
});

function select(t: DocTemplate) {
  // deep-ish clone so we don't mutate the table row
  editing.value = JSON.parse(JSON.stringify(t));
  showEdit.value = true;
}

function newTemplate() {
  editing.value = {
    id: 0,
    name: "",
    description: "",
    document_kind: "unknown",
    match_keywords: [],
    fields: [],
    expiry_field: null,
    cached_system_prompt: null,
    is_default: 0,
    is_builtin: 0,
    created_at: "",
    updated_at: "",
  };
  showEdit.value = true;
}

function addField() {
  if (!editing.value) return;
  const newField: TemplateField = { key: "", label_he: "", type: "text" as FieldType };
  editing.value.fields.push(newField);
}

async function save() {
  if (!editing.value) return;
  if (!editing.value.name.trim()) {
    message.warning("יש להזין שם");
    return;
  }
  saving.value = true;
  try {
    if (editing.value.id) {
      await api.docTemplates.update(editing.value.id, editing.value);
      message.success("התבנית עודכנה");
    } else {
      await api.docTemplates.create(editing.value);
      message.success("התבנית נוצרה");
    }
    showEdit.value = false;
    await load();
  } catch (e) {
    message.error(String(e));
  } finally {
    saving.value = false;
  }
}

async function deleteTpl() {
  if (!editing.value?.id) return;
  if (!confirm(`למחוק את "${editing.value.name}"?`)) return;
  try {
    await api.docTemplates.delete(editing.value.id);
    message.success("נמחקה");
    showEdit.value = false;
    await load();
  } catch (e) {
    message.error(String(e));
  }
}

// ── Generator: AI builds a template from a sample document/text ─────────────
function openDraft(draft: Partial<DocTemplate>) {
  editing.value = {
    id: 0,
    name: draft.name ?? "",
    description: draft.description ?? "",
    document_kind: draft.document_kind ?? "unknown",
    match_keywords: draft.match_keywords ?? [],
    fields: (draft.fields ?? []) as TemplateField[],
    expiry_field: draft.expiry_field ?? null,
    cached_system_prompt: null,
    is_default: 0,
    is_builtin: 0,
    created_at: "",
    updated_at: "",
  };
  showGenerate.value = false;
  showEdit.value = true;
  message.success(`AI הציע תבנית "${editing.value.name}" עם ${editing.value.fields.length} שדות. ערוך לפני שמירה.`);
}

async function onGenText() {
  if (genText.value.trim().length < 50) return;
  generating.value = true;
  try {
    const { draft } = await api.docTemplates.generateFromText(genText.value);
    openDraft(draft);
    genText.value = "";
  } catch (e) {
    message.error(String(e));
  } finally {
    generating.value = false;
  }
}

async function onGenFile({ file }: { file: { file: File } }) {
  generating.value = true;
  try {
    const { draft } = await api.docTemplates.generateFromFile(file.file);
    openDraft(draft);
  } catch (e) {
    message.error(String(e));
  } finally {
    generating.value = false;
  }
}
</script>

<style scoped>
.field-row {
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin-bottom: 6px;
}

@media (max-width: 720px) {
  .doc-templates-head,
  .doc-templates-head :deep(.n-space) {
    align-items: stretch !important;
    flex-direction: column !important;
    width: 100%;
  }

  .doc-templates-head :deep(.n-button) {
    width: 100%;
  }

  :deep(.n-drawer-body-content-wrapper) {
    padding: 14px;
  }

  :deep(.n-grid) {
    grid-template-columns: 1fr !important;
  }

  :deep(.n-gi) {
    grid-column: span 1 / span 1 !important;
  }

  .field-row {
    border-radius: 8px;
  }

  :deep(.n-drawer-footer .n-space) {
    align-items: stretch;
    flex-direction: column-reverse;
    width: 100%;
  }

  :deep(.n-drawer-footer .n-button) {
    width: 100%;
  }
}
</style>
