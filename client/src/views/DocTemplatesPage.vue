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

          <n-divider style="margin: 16px 0 12px" />

          <n-collapse>
            <n-collapse-item name="ai" title="AI ו-Pipeline (מתקדם)">
              <n-alert :show-icon="false" style="margin-bottom: 12px; font-size: 12px" type="info">
                השאר ריק כדי להשתמש בהגדרות המערכת. ערכים כאן גוברים על הגדרות המערכת רק עבור תבנית זו.
              </n-alert>

              <n-grid :cols="2" :x-gap="16">
                <n-gi>
                  <n-form-item label="מנוע AI">
                    <n-select
                      v-model:value="editing.ai_backend"
                      :options="aiBackendOptions"
                      :virtual-scroll="false"
                      clearable
                      placeholder="ברירת מחדל (הגדרות מערכת)"
                    />
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item label="מודל AI">
                    <n-input
                      v-model:value="editing.ai_model"
                      placeholder="ברירת מחדל (הגדרות מערכת)"
                    />
                  </n-form-item>
                </n-gi>
              </n-grid>

              <n-grid :cols="2" :x-gap="16">
                <n-gi>
                  <n-form-item label="שפת OCR">
                    <n-input
                      v-model:value="editing.ocr_language"
                      placeholder="למשל: heb+eng"
                    />
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item label="מקסימום תווים לחילוץ">
                    <n-input-number
                      v-model:value="editing.extraction_max_chars"
                      :min="0"
                      clearable
                      placeholder="ברירת מחדל"
                      style="width: 100%"
                    />
                  </n-form-item>
                </n-gi>
              </n-grid>

              <n-form-item label="ימי התראה מראש (מופרדים בפסיק)">
                <n-input
                  :value="(editing.reminder_advance_days || []).join(', ')"
                  placeholder="למשל: 30, 14, 7"
                  @update:value="onAdvanceDaysInput"
                />
              </n-form-item>

              <n-form-item label="כללי פרומפט מותאמים (נוספים לפרומפט האוטומטי)">
                <n-input
                  v-model:value="editing.custom_prompt_rules"
                  :rows="3"
                  placeholder="הוראות נוספות ל-AI עבור תבנית זו..."
                  type="textarea"
                />
              </n-form-item>

              <n-form-item label="דריסת פרומפט מלאה">
                <n-input
                  v-model:value="editing.full_prompt_override"
                  :rows="4"
                  placeholder="השאר ריק כדי להשתמש בפרומפט האוטומטי"
                  type="textarea"
                />
              </n-form-item>
              <n-alert v-if="editing.full_prompt_override" :show-icon="false" style="font-size: 12px" type="warning">
                ⚠️ מחליף את הפרומפט האוטומטי כולו — השדות המוגדרים למעלה לא ישפיעו על הפרומפט.
              </n-alert>

              <n-divider style="margin: 12px 0" />
              <n-form-item label="בדיקת חילוץ (עם הפרומפט והשדות שלמעלה — ללא שמירה)">
                <div style="width: 100%">
                  <n-input
                    v-model:value="tplTestText"
                    :autosize="{ minRows: 3, maxRows: 8 }"
                    placeholder="הדבק טקסט מסמך לדוגמה לבדיקה..."
                    type="textarea"
                  />
                  <n-button
                    :disabled="tplTestText.trim().length < 20"
                    :loading="tplTesting"
                    style="margin-top: 8px"
                    @click="runTemplateTest"
                  >בדוק חילוץ</n-button>
                  <n-alert v-if="tplTestError" :show-icon="false" style="margin-top: 8px; font-size: 12px" type="error">
                    {{ tplTestError }}
                  </n-alert>
                  <div v-if="tplTestResult" style="margin-top: 8px">
                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px">
                      מודל: {{ tplTestModel }} · {{ tplTestMs }}ms
                    </div>
                    <pre class="ai-diff__pre">{{ tplTestResult }}</pre>
                  </div>
                </div>
              </n-form-item>
            </n-collapse-item>
          </n-collapse>
        </n-form>

        <template #footer>
          <n-space>
            <n-button @click="showEdit = false">ביטול</n-button>
            <n-button
              v-if="editing?.id && !editing.is_builtin"
              type="error"
              @click="deleteTpl"
            >מחק</n-button>
            <n-button
              v-if="editing?.id && isAdmin"
              @click="openAiEdit"
            >✨ ערוך עם AI</n-button>
            <n-button type="primary" :loading="saving" @click="save">שמור</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>

    <!-- AI edit modal (admin) -->
    <n-modal v-model:show="showAiEdit" preset="card" style="width: 900px; max-width: 96vw" title="✨ עריכת תבנית עם AI">
      <n-alert :show-icon="false" style="margin-bottom: 12px; font-size: 13px" type="info">
        תאר בשפה חופשית מה לשנות — המודל החכם יעדכן את הפרומפט ואת סכמת השדות יחד, וישמור על עקביות ביניהם.
        התוצאה מוצגת להשוואה לפני החלה. עדיין צריך ללחוץ "שמור" בסוף כדי לשמור לתבנית.
      </n-alert>

      <n-input
        v-model:value="aiInstruction"
        :rows="3"
        placeholder="למשל: הוסף שדה למספר רישוי רכב · הקשח את הכללים למספרים סידוריים · תמוך במקרה חדש של חוזי שכירות"
        type="textarea"
      />
      <n-space align="center" justify="space-between" style="margin: 12px 0">
        <span v-if="aiProposal" style="font-size: 12px; color: var(--text-muted)">
          מודל: {{ aiModelUsed }} · שדות: {{ editing?.fields.length }} → {{ aiProposal.fields.length }}
        </span>
        <span></span>
        <n-button
          :disabled="aiInstruction.trim().length < 3"
          :loading="aiLoading"
          type="primary"
          @click="runAiEdit"
        >{{ aiProposal ? "צור מחדש" : "צור הצעה" }}</n-button>
      </n-space>

      <div v-if="aiProposal">
        <n-alert v-if="aiProposal.change_summary" :show-icon="false" style="margin-bottom: 12px; font-size: 13px" type="success">
          <b>מה השתנה:</b> {{ aiProposal.change_summary }}
        </n-alert>

        <n-tabs animated size="small" type="line">
          <n-tab-pane name="fields" tab="שדות (סכמה)">
            <div class="ai-diff">
              <div class="ai-diff__col">
                <div class="ai-diff__h">לפני ({{ editing?.fields.length }})</div>
                <div v-for="f in editing?.fields || []" :key="'o'+f.key" class="ai-diff__field">
                  <code>{{ f.key }}</code> · {{ f.label_he }} <span class="ai-diff__t">{{ f.type }}</span>
                </div>
              </div>
              <div class="ai-diff__col">
                <div class="ai-diff__h">אחרי ({{ aiProposal.fields.length }})</div>
                <div v-for="f in aiProposal.fields" :key="'n'+f.key" :class="{ 'ai-diff__field--new': !existingKeys.has(f.key) }" class="ai-diff__field">
                  <code>{{ f.key }}</code> · {{ f.label_he }} <span class="ai-diff__t">{{ f.type }}</span>
                </div>
              </div>
            </div>
          </n-tab-pane>
          <n-tab-pane name="prompt" tab="פרומפט מלא">
            <div class="ai-diff">
              <div class="ai-diff__col">
                <div class="ai-diff__h">לפני ({{ (currentPromptForDiff || '').length }} תווים)</div>
                <pre class="ai-diff__pre">{{ currentPromptForDiff || "— (פרומפט נוצר אוטומטית)" }}</pre>
              </div>
              <div class="ai-diff__col">
                <div class="ai-diff__h">אחרי ({{ aiProposal.full_prompt_override.length }} תווים)</div>
                <pre class="ai-diff__pre">{{ aiProposal.full_prompt_override }}</pre>
              </div>
            </div>
          </n-tab-pane>
        </n-tabs>
      </div>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showAiEdit = false">סגור</n-button>
          <n-button v-if="aiProposal" type="primary" @click="applyAiProposal">החל על התבנית</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NCollapse,
  NCollapseItem,
  NDivider,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NInput,
  NInputNumber,
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
import {useAuthStore} from "../stores/auth.js";
import type {DocTemplate, DocumentKind, FieldType, TemplateField} from "@shared/types.js";

const templates = ref<DocTemplate[]>([]);
const showEdit = ref(false);
const editing = ref<DocTemplate | null>(null);
const saving = ref(false);
const message = useMessage();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

// AI edit state
const showAiEdit = ref(false);
const aiInstruction = ref("");
const aiLoading = ref(false);
const aiModelUsed = ref("");
const currentPromptForDiff = ref("");
const aiProposal = ref<{
  description: string;
  expiry_field: string | null;
  fields: TemplateField[];
  full_prompt_override: string;
  change_summary: string;
} | null>(null);
const existingKeys = computed(() => new Set((editing.value?.fields || []).map((f) => f.key)));

// Template test-extraction (as-typed prompt + fields, not saved)
const tplTestText = ref("");
const tplTesting = ref(false);
const tplTestResult = ref("");
const tplTestError = ref("");
const tplTestModel = ref("");
const tplTestMs = ref(0);

async function runTemplateTest() {
  if (!editing.value || tplTestText.value.trim().length < 20) return;
  tplTesting.value = true;
  tplTestError.value = "";
  tplTestResult.value = "";
  try {
    const res = await api.docTemplates.testExtraction({
      sampleText: tplTestText.value,
      prompt: editing.value.full_prompt_override || "",
      mode: "template",
      fields: editing.value.fields,
      name: editing.value.name,
      expiry_field: editing.value.expiry_field,
    });
    tplTestModel.value = res.model;
    tplTestMs.value = res.execMs;
    if (res.error) tplTestError.value = res.error;
    else tplTestResult.value = JSON.stringify(res.result, null, 2);
  } catch (e) {
    tplTestError.value = String(e);
  } finally {
    tplTesting.value = false;
  }
}

function openAiEdit() {
  aiInstruction.value = "";
  aiProposal.value = null;
  aiModelUsed.value = "";
  currentPromptForDiff.value = editing.value?.full_prompt_override?.trim() || "";
  showAiEdit.value = true;
}

async function runAiEdit() {
  if (!editing.value?.id || aiInstruction.value.trim().length < 3) return;
  aiLoading.value = true;
  try {
    const res = await api.docTemplates.aiEdit(String(editing.value.id), aiInstruction.value.trim());
    aiProposal.value = res.proposal;
    aiModelUsed.value = res.model;
  } catch (e) {
    message.error(String(e));
  } finally {
    aiLoading.value = false;
  }
}

function applyAiProposal() {
  if (!editing.value || !aiProposal.value) return;
  editing.value.fields = aiProposal.value.fields;
  editing.value.full_prompt_override = aiProposal.value.full_prompt_override;
  if (aiProposal.value.description) editing.value.description = aiProposal.value.description;
  if (aiProposal.value.expiry_field !== undefined) editing.value.expiry_field = aiProposal.value.expiry_field;
  showAiEdit.value = false;
  message.success("ההצעה הוחלה — לחץ שמור כדי לשמור לתבנית");
}
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

const aiBackendOptions = [
  { label: "OpenAI", value: "openai" },
  { label: "Ollama", value: "ollama" },
];

function onAdvanceDaysInput(v: string) {
  if (!editing.value) return;
  const days = v
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  editing.value.reminder_advance_days = days.length ? days : null;
}

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
    ai_backend: null,
    ai_model: null,
    ocr_language: null,
    extraction_max_chars: null,
    reminder_advance_days: null,
    custom_prompt_rules: null,
    full_prompt_override: null,
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
  // Normalize blank overrides to null so they fall back to system settings
  const t = editing.value;
  for (const k of ["ai_backend", "ai_model", "ocr_language", "custom_prompt_rules", "full_prompt_override"] as const) {
    if (typeof t[k] === "string" && !(t[k] as string).trim()) (t as any)[k] = null;
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

.ai-diff {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.ai-diff__h {
  font-weight: 600;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.ai-diff__field {
  font-size: 12px;
  padding: 3px 6px;
  border-bottom: 1px solid var(--border-color);
}
.ai-diff__field--new {
  background: rgba(24, 160, 88, 0.12);
  border-radius: 4px;
}
.ai-diff__t {
  color: var(--text-muted);
  font-size: 11px;
}
.ai-diff__pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 11px;
  max-height: 340px;
  overflow: auto;
  background: var(--code-bg, rgba(128,128,128,0.08));
  padding: 8px;
  border-radius: 6px;
  margin: 0;
}
@media (max-width: 720px) {
  .ai-diff { grid-template-columns: 1fr; }
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
