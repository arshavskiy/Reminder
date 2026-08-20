<template>
  <div class="dt-page" dir="rtl">
    <PageHeader
        :count="templates.length"
        subtitle="הגדרת שדות לחילוץ לפי סוג מסמך, כולל מילות מפתח ותזכורות"
        title="תבניות מסמכים"
    >
      <template #actions>
        <div class="dt-actions">
          <button :disabled="loading" class="btn btn--ghost" type="button" @click="refresh">
            <n-icon :class="{ 'dt-spin': loading }" :component="RefreshOutline" :size="16" class="btn-icon"/>
            רענן
          </button>
          <button class="btn btn--ghost" type="button" @click="showGenerate = true">
            <n-icon :component="FlashOutline" :size="16" class="btn-icon"/>
            צור מ-AI
          </button>
          <button class="btn btn--primary" type="button" @click="newTemplate">
            <n-icon :component="AddOutline" :size="16" class="btn-icon"/>
            תבנית חדשה
          </button>
        </div>
      </template>
    </PageHeader>

    <div class="dt-toolbar">
      <n-input
          v-model:value="search"
          class="dt-toolbar__search"
          clearable
          placeholder="חיפוש לפי שם, תיאור או מילת מפתח..."
      >
        <template #prefix>
          <n-icon :component="SearchOutline" :size="16"/>
        </template>
      </n-input>
      <div class="dt-filters">
        <button
            v-for="f in kindFilters"
            :key="f.value"
            :class="{ 'pill--active': kindFilter === f.value }"
            class="pill"
            type="button"
            @click="kindFilter = f.value"
        >
          {{ f.label }}
          <span class="pill__badge">{{ f.count }}</span>
        </button>
      </div>
    </div>

    <n-spin :show="loading">
      <div v-if="filteredTemplates.length" class="dt-grid">
        <article
            v-for="t in filteredTemplates"
            :key="t.id"
            class="dt-card"
            @click="select(t)"
        >
          <header class="dt-card__head">
            <div class="dt-card__icon">
              <n-icon :component="DocumentTextOutline" :size="18"/>
            </div>
            <div class="dt-card__titles">
              <h3 class="dt-card__name">{{ t.name }}</h3>
              <p class="dt-card__desc">{{ t.description || "ללא תיאור" }}</p>
            </div>
            <div class="dt-card__actions" @click.stop>
              <n-tooltip placement="top">
                <template #trigger>
                  <button class="btn btn--ghost btn--xs icon-btn" type="button" @click="select(t)">
                    <n-icon :component="CreateOutline" :size="14" class="btn-icon"/>
                  </button>
                </template>
                עריכה
              </n-tooltip>
              <n-tooltip v-if="!t.is_builtin" placement="top">
                <template #trigger>
                  <button class="btn btn--ghost btn--xs icon-btn" type="button" @click="confirmDelete(t)">
                    <n-icon :component="TrashOutline" :size="14" class="btn-icon"/>
                  </button>
                </template>
                מחיקה
              </n-tooltip>
            </div>
          </header>

          <div class="dt-card__tags">
            <span
                v-if="t.document_kind && t.document_kind !== 'unknown'"
                :class="`dt-chip--${kindTone(t.document_kind)}`"
                class="dt-chip"
            >
              {{ kindLabel(t.document_kind) }}
            </span>
            <span v-if="t.is_builtin" class="dt-chip dt-chip--info">מובנה</span>
            <span v-if="t.is_default" class="dt-chip dt-chip--success">ברירת מחדל</span>
          </div>

          <footer class="dt-card__meta">
            <span>{{ t.fields.length }} שדות</span>
            <span class="dt-card__dot">·</span>
            <span :title="(t.match_keywords || []).join(', ')" class="dt-card__keywords">
              {{ (t.match_keywords || []).join(", ") || "ללא מילות מפתח" }}
            </span>
          </footer>
        </article>
      </div>

      <div v-else-if="!loading" class="dt-empty">
        <n-icon :component="DocumentTextOutline" :size="40" class="dt-empty__icon"/>
        <h3>{{ templates.length ? "אין תוצאות לחיפוש" : "אין עדיין תבניות" }}</h3>
        <p>
          {{
            templates.length
                ? "נסה לשנות את הסינון או החיפוש."
                : "צור תבנית כדי להגדיר אילו שדות לחלץ מסוגי מסמכים שונים."
          }}
        </p>
        <button v-if="!templates.length" class="btn btn--primary" type="button" @click="newTemplate">
          <n-icon :component="AddOutline" :size="16" class="btn-icon"/>
          תבנית חדשה
        </button>
      </div>
    </n-spin>

    <!-- Generate-from-AI modal -->
    <n-modal
        v-model:show="showGenerate"
        :mask-closable="!generating"
        class="dt-modal"
        preset="card"
        style="width: min(640px, 95vw)"
        title="צור תבנית באמצעות AI"
    >
      <p class="dt-modal__lead">
        העלה דוגמה של מסמך, או הדבק את הטקסט שלו — ה-AI יציע תבנית עם שדות מתאימים בעברית. תוכל לערוך לפני שמירה.
      </p>

      <n-tabs v-model:value="genMode" type="line" animated>
        <n-tab-pane name="file" tab="העלאת קובץ">
          <n-upload
            :show-file-list="false"
            :custom-request="onGenFile as any"
            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt"
            :disabled="generating"
          >
            <n-upload-dragger>
              <div class="dt-drop">
                <n-icon :component="CloudUploadOutline" :size="28" class="dt-drop__icon"/>
                <p class="dt-drop__title">לחץ או גרור קובץ לכאן</p>
                <p class="dt-drop__hint">PDF, DOCX, XLSX, תמונה או טקסט</p>
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
            :disabled="generating"
          />
          <button
              :disabled="generating || genText.trim().length < 50"
              class="btn btn--primary"
            style="margin-top: 12px"
              type="button"
            @click="onGenText"
          >
            צור תבנית מהטקסט
          </button>
        </n-tab-pane>
      </n-tabs>

      <div v-if="generating" class="dt-generating">
        <n-spin size="small"/>
        <span>ה-AI מנתח את המסמך ובונה את התבנית...</span>
      </div>
    </n-modal>

    <!-- Create / Edit modal -->
    <n-modal
        v-model:show="showEdit"
        :mask-closable="!saving"
        :title="editing?.id ? 'עריכת תבנית' : 'תבנית חדשה'"
        class="dt-modal dt-edit-modal"
        preset="card"
        style="width: min(920px, 96vw)"
    >
      <div v-if="editing" class="dt-edit">
        <n-form class="dt-edit__form" label-placement="top">
          <div class="dt-edit__grid">
            <n-form-item label="שם" required>
              <n-input v-model:value="editing.name" placeholder="למשל: תסקיר בדיקה"/>
            </n-form-item>
            <n-form-item label="סוג מסמך">
              <n-input-group>
                <n-select
                    v-model:value="editing.document_kind"
                    :options="kindOptions"
                    :virtual-scroll="false"
                    filterable
                    tag
                    placeholder="בחר או הקלד סוג חדש..."
                    style="flex: 1"
                />
                <n-tooltip placement="bottom">
                  <template #trigger>
                    <button
                        :disabled="suggestingKind"
                        class="btn btn--ghost"
                        type="button"
                        @click="suggestKind"
                    >
                      <n-icon
                          :class="{ 'dt-spin': suggestingKind }"
                          :component="FlashOutline"
                          :size="16"
                          class="btn-icon"
                      />
                    </button>
                  </template>
                  AI יציע סוג מסמך לפי שם, תיאור ושדות
                </n-tooltip>
              </n-input-group>
            </n-form-item>
          </div>

          <n-form-item label="תיאור">
            <n-input v-model:value="editing.description" type="textarea" :rows="2" />
          </n-form-item>
          <n-form-item label="מילות מפתח לזיהוי אוטומטי (מופרדות בפסיק)">
            <n-input
              :value="(editing.match_keywords || []).join(', ')"
              placeholder="תסקיר, בדיקה תקופתית"
              @update:value="(v) => (editing!.match_keywords = v.split(',').map((s) => s.trim()).filter(Boolean))"
            />
          </n-form-item>

          <div class="dt-fields-head">
            <div>
              <h4 class="dt-fields-head__title">שדות לחילוץ</h4>
              <p class="dt-fields-head__hint">
                כל שדה יחולץ מהמסמך באמצעות AI. שדה התאריך ב"שדה תזכורת" מפעיל את התזכורת.
              </p>
            </div>
            <button class="btn btn--ghost btn--xs" type="button" @click="addField">
              <n-icon :component="AddOutline" :size="14" class="btn-icon"/>
              הוסף שדה
            </button>
          </div>

          <div v-for="(f, i) in editing.fields" :key="i" class="dt-field">
            <div class="dt-field__row">
              <n-input v-model:value="f.key" class="dt-field__key" dir="ltr" placeholder="key" size="small"/>
              <n-input v-model:value="f.label_he" class="dt-field__label" placeholder="תווית עברית" size="small"/>
              <n-select
                  v-model:value="f.type"
                  size="small"
                  :options="typeOptions"
                  :virtual-scroll="false"
                  class="dt-field__type"
              />
              <label class="dt-field__req">
                <n-checkbox v-model:checked="f.required as any" size="small"/>
                חובה
              </label>
              <n-tooltip placement="top">
                <template #trigger>
                  <button
                      class="btn btn--ghost btn--xs icon-btn"
                      type="button"
                      @click="editing!.fields.splice(i, 1)"
                  >
                    <n-icon :component="TrashOutline" :size="14" class="btn-icon"/>
                  </button>
                </template>
                הסר שדה
              </n-tooltip>
            </div>
            <n-input
              v-model:value="f.hint_he"
              placeholder="רמז ל-AI — מה לחפש, מה להתעלם (אופציונלי)"
              size="small"
            />
          </div>

          <div v-if="!editing.fields.length" class="dt-fields-empty">אין שדות עדיין</div>

          <n-form-item label="שדה תזכורת — איזה תאריך מפעיל את התזכורת" style="margin-top: 8px">
            <n-select
              v-model:value="editing.expiry_field"
              :options="dateFieldOptions"
              placeholder="בחר שדה תאריך..."
              clearable
              :virtual-scroll="false"
            />
          </n-form-item>

          <label class="dt-default-check">
            <n-checkbox v-model:checked="editing.is_default as any"/>
            תבנית ברירת מחדל
          </label>
        </n-form>

        <section class="dt-test">
          <div class="dt-test__head">
            <h4>בדוק חילוץ על מסמך לדוגמה</h4>
            <span class="dt-chip dt-chip--warning">לא נשמר</span>
          </div>
          <n-upload
            :show-file-list="false"
            :custom-request="onTestFile as any"
            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt"
          >
            <button :disabled="testing" class="btn btn--ghost dt-test__upload" type="button">
              <n-icon
                  :class="{ 'dt-spin': testing }"
                  :component="testFile ? DocumentOutline : CloudUploadOutline"
                  :size="16"
                  class="btn-icon"
              />
              {{ testFile ? testFile.name : "העלה קובץ לבדיקה" }}
            </button>
          </n-upload>

          <div v-if="testResult" class="dt-test__result">
            <div class="dt-test__meta">מודל: {{ testResult.model }} · {{ testResult.exec_ms }}ms</div>
            <div v-if="testResult.error" class="dt-test__error">שגיאה: {{ testResult.error }}</div>
            <div v-else-if="testResult.fields" class="dt-test__fields">
              <div
                  v-for="[k, v] in Object.entries(testResult.fields).filter(([, val]) => val !== null && val !== '')"
                :key="k"
                  class="dt-test__row"
              >
                <span class="dt-test__key">{{ editing?.fields.find((f) => f.key === k)?.label_he ?? k }}</span>
                <span class="dt-test__val">{{ Array.isArray(v) ? v.join(", ") : String(v) }}</span>
              </div>
              <div
                  v-if="!Object.values(testResult.fields).some((v) => v !== null && v !== '')"
                  class="dt-test__empty"
              >
                לא חולצו שדות
              </div>
            </div>
          </div>
        </section>
      </div>

      <template #footer>
        <div class="dt-edit__footer">
          <button
              v-if="editing?.id && !editing.is_builtin"
              :disabled="saving"
              class="btn btn--danger-ghost"
              type="button"
              @click="deleteTpl"
          >
            <n-icon :component="TrashOutline" :size="16" class="btn-icon"/>
            מחק
          </button>
          <div class="dt-edit__footer-end">
            <button :disabled="saving" class="btn btn--ghost" type="button" @click="showEdit = false">
              ביטול
            </button>
            <button :disabled="saving" class="btn btn--primary" type="button" @click="save">
              {{ saving ? "שומר..." : "שמור" }}
            </button>
          </div>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from "vue";
import {
  NCheckbox,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputGroup,
  NModal,
  NSelect,
  NSpin,
  NTabPane,
  NTabs,
  NTooltip,
  NUpload,
  NUploadDragger,
  useMessage,
} from "naive-ui";
import {
  AddOutline,
  CloudUploadOutline,
  CreateOutline,
  DocumentOutline,
  DocumentTextOutline,
  FlashOutline,
  RefreshOutline,
  SearchOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import {api} from "../services/apiService.js";
import {useConfirm} from "../composables/useConfirm.js";
import PageHeader from "../components/PageHeader.vue";
import type {DocTemplate, DocumentKind, FieldType, TemplateField} from "@shared/types.js";

const templates = ref<DocTemplate[]>([]);
const loading = ref(false);
const showEdit = ref(false);
const editing = ref<DocTemplate | null>(null);
const saving = ref(false);
const message = useMessage();
const {confirm} = useConfirm();

const search = ref("");
type KindFilter = "all" | string;
const kindFilter = ref<KindFilter>("all");

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

const BUILTIN_KIND_OPTIONS = [
  { label: "תסקיר בדיקה", value: "inspection_report" },
  {label: "חוזה / הסכם", value: "contract"},
  {label: "חשבונית", value: "invoice"},
  { label: "תעודה / הסמכה", value: "certificate" },
  { label: "אחר / לא ידוע", value: "unknown" },
];

const kindOptions = ref([...BUILTIN_KIND_OPTIONS]);

async function loadKinds() {
  try {
    const { kinds } = await api.docTemplates.kinds();
    const builtinValues = new Set(BUILTIN_KIND_OPTIONS.map((o) => o.value));
    const custom = kinds
      .filter((k) => !builtinValues.has(k))
      .map((k) => ({ label: k, value: k }));
    kindOptions.value = [...BUILTIN_KIND_OPTIONS, ...custom];
  } catch { /* fallback to builtins */ }
}

function kindLabel(kind: DocumentKind): string {
  return kindOptions.value.find((o) => o.value === kind)?.label ?? kind;
}

function kindTone(kind: DocumentKind): string {
  const map: Record<string, string> = {
    inspection_report: "warning",
    contract: "info",
    invoice: "success",
    certificate: "error",
    unknown: "muted",
  };
  return map[kind] ?? "info";
}

const filteredTemplates = computed(() => {
  let rows = templates.value;
  if (kindFilter.value !== "all") {
    rows = rows.filter((t) => (t.document_kind || "unknown") === kindFilter.value);
  }
  const q = search.value.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((t) => {
    const hay = [
      t.name,
      t.description,
      t.document_kind,
      ...(t.match_keywords || []),
      ...t.fields.map((f) => f.label_he),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    return hay.includes(q);
  });
});

const kindFilters = computed(() => {
  const counts = new Map<string, number>();
  for (const t of templates.value) {
    const k = t.document_kind || "unknown";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const pills = [{value: "all", label: "הכל", count: templates.value.length}];
  for (const opt of kindOptions.value) {
    const count = counts.get(opt.value) ?? 0;
    if (count || BUILTIN_KIND_OPTIONS.some((b) => b.value === opt.value)) {
      pills.push({value: opt.value, label: opt.label, count});
    }
  }
  // Include custom kinds present in data but not in options yet
  for (const [k, count] of counts) {
    if (!pills.some((p) => p.value === k)) {
      pills.push({value: k, label: k, count});
    }
  }
  return pills.filter((p) => p.value === "all" || p.count > 0 || BUILTIN_KIND_OPTIONS.some((b) => b.value === p.value));
});

const dateFieldOptions = computed(() => {
  if (!editing.value) return [];
  return editing.value.fields
    .filter((f) => f.type === "date")
    .map((f) => ({ label: `${f.label_he} (${f.key})`, value: f.key }));
});

async function load() {
  loading.value = true;
  try {
    templates.value = await api.docTemplates.list();
  } catch (e) {
    message.error(String(e));
  } finally {
    loading.value = false;
  }
}

function refresh() {
  load();
  loadKinds();
}

onMounted(async () => {
  await Promise.all([load(), loadKinds()]);

  const pendingFile = (window as any).__pendingTemplateFile as File | undefined;
  if (pendingFile) {
    delete (window as any).__pendingTemplateFile;
    sessionStorage.removeItem("doc_templates_pending_file_name");
    sessionStorage.removeItem("doc_templates_pending_file_size");
    await openGenerateWithFile(pendingFile);
  }
});

function blankTemplate(): DocTemplate {
  return {
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
}

function select(t: DocTemplate) {
  editing.value = JSON.parse(JSON.stringify(t));
  testFile.value = null;
  testResult.value = null;
  showEdit.value = true;
}

function newTemplate() {
  editing.value = blankTemplate();
  testFile.value = null;
  testResult.value = null;
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
  const kindRaw = String(editing.value.document_kind ?? "").trim();
  if (!kindRaw || kindRaw === "unknown") {
    editing.value.document_kind = editing.value.name.trim() as DocumentKind;
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

function confirmDelete(t: DocTemplate) {
  confirm({
    title: "מחיקת תבנית",
    content: `למחוק את "${t.name}"? פעולה זו אינה הפיכה.`,
    confirmText: "מחק",
    onConfirm: async () => {
      try {
        await api.docTemplates.delete(t.id);
        message.success("נמחקה");
        if (editing.value?.id === t.id) showEdit.value = false;
        await load();
      } catch (e) {
        message.error(String(e));
      }
    },
  });
}

async function deleteTpl() {
  if (!editing.value?.id) return;
  confirmDelete(editing.value);
}

function openDraft(draft: Partial<DocTemplate>) {
  const name = draft.name ?? "";
  const kind = draft.document_kind && draft.document_kind !== "unknown"
    ? draft.document_kind
    : (name || "unknown");
  editing.value = {
    ...blankTemplate(),
    name,
    description: draft.description ?? "",
    document_kind: kind as DocumentKind,
    match_keywords: draft.match_keywords ?? [],
    fields: (draft.fields ?? []) as TemplateField[],
    expiry_field: draft.expiry_field ?? null,
  };
  testFile.value = null;
  testResult.value = null;
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

const suggestingKind = ref(false);

async function suggestKind() {
  if (!editing.value) return;
  suggestingKind.value = true;
  try {
    const { kind } = await api.docTemplates.suggestKind({
      name: editing.value.name,
      description: editing.value.description ?? "",
      fields: editing.value.fields,
      match_keywords: editing.value.match_keywords,
    });
    if (kind) {
      editing.value.document_kind = kind as DocumentKind;
      if (!kindOptions.value.find((o) => o.value === kind)) {
        kindOptions.value = [...kindOptions.value, { label: kind, value: kind }];
      }
      message.success(`AI הציע: ${kind}`);
    }
  } catch (e) {
    message.error(String(e));
  } finally {
    suggestingKind.value = false;
  }
}

const testing = ref(false);
const testFile = ref<File | null>(null);

interface TestResult {
  fields: Record<string, unknown> | null;
  model: string;
  exec_ms: number;
  error: string | null;
}
const testResult = ref<TestResult | null>(null);

async function onTestFile({ file }: { file: { file: File } }) {
  if (!editing.value) return;
  testFile.value = file.file;
  testResult.value = null;
  testing.value = true;
  try {
    const result = await api.docTemplates.testExtract(file.file, editing.value);
    testResult.value = result;
  } catch (e) {
    message.error(String(e));
  } finally {
    testing.value = false;
  }
}

async function openGenerateWithFile(file: File) {
  showGenerate.value = true;
  genMode.value = "file";
  generating.value = true;
  try {
    const { draft } = await api.docTemplates.generateFromFile(file);
    openDraft(draft);
  } catch (e) {
    message.error(String(e));
    showGenerate.value = false;
  } finally {
    generating.value = false;
  }
}

defineExpose({ openGenerateWithFile });
</script>

<style scoped>
.dt-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dt-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.dt-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.dt-toolbar__search {
  flex: 1 1 260px;
  max-width: 420px;
}

.dt-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}

.pill:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.pill--active {
  border-color: color-mix(in srgb, var(--brand-color) 45%, var(--border-color));
  background: color-mix(in srgb, var(--brand-color) 12%, var(--bg-card));
  color: var(--text-primary);
  font-weight: 600;
}

.pill__badge {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--bg-elevated);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.dt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.dt-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.12s, box-shadow 0.12s, background 0.12s;
}

.dt-card:hover {
  border-color: color-mix(in srgb, var(--brand-color) 35%, var(--border-color));
  background: color-mix(in srgb, var(--brand-color) 4%, var(--bg-card));
}

.dt-card__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.dt-card__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand-color) 14%, var(--bg-elevated));
  color: var(--brand-color);
  flex: 0 0 auto;
}

.dt-card__titles {
  min-width: 0;
  flex: 1;
}

.dt-card__name {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
}

.dt-card__desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dt-card__actions {
  display: flex;
  gap: 2px;
  flex: 0 0 auto;
  opacity: 0.7;
}

.dt-card:hover .dt-card__actions {
  opacity: 1;
}

.dt-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dt-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.dt-chip--info {
  background: color-mix(in srgb, #63e2b7 18%, var(--bg-elevated));
  color: var(--brand-color);
}

.dt-chip--success {
  background: color-mix(in srgb, #18a058 16%, var(--bg-elevated));
  color: #18a058;
}

.dt-chip--warning {
  background: color-mix(in srgb, #f0a020 18%, var(--bg-elevated));
  color: #f0a020;
}

.dt-chip--error {
  background: color-mix(in srgb, #d03050 16%, var(--bg-elevated));
  color: #d03050;
}

.dt-chip--muted {
  color: var(--text-muted, var(--text-secondary));
}

.dt-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 0;
}

.dt-card__dot {
  opacity: 0.5;
}

.dt-card__keywords {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.dt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 280px;
  padding: 40px 20px;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  text-align: center;
}

.dt-empty__icon {
  color: var(--brand-color);
  opacity: 0.7;
}

.dt-empty h3 {
  margin: 0;
  font-size: 17px;
}

.dt-empty p {
  margin: 0 0 8px;
  max-width: 420px;
  font-size: 13px;
  color: var(--text-secondary);
}

.dt-modal__lead {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.dt-drop {
  padding: 28px 16px;
  text-align: center;
}

.dt-drop__icon {
  color: var(--brand-color);
  margin-bottom: 8px;
}

.dt-drop__title {
  margin: 0;
  font-size: 15px;
}

.dt-drop__hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.dt-generating {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
  padding: 16px;
  border-radius: 8px;
  background: var(--bg-elevated);
  font-size: 13px;
  color: var(--text-secondary);
}

.dt-edit {
  max-height: min(72vh, 780px);
  overflow-y: auto;
  padding-inline-end: 4px;
}

.dt-edit__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.dt-fields-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin: 8px 0 12px;
}

.dt-fields-head__title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.dt-fields-head__hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  max-width: 520px;
}

.dt-field {
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 8px;
  background: var(--bg-elevated);
}

.dt-field__row {
  display: grid;
  grid-template-columns: minmax(90px, 0.9fr) minmax(120px, 1.2fr) 120px auto auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.dt-field__req {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.dt-fields-empty {
  padding: 20px;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  margin-bottom: 12px;
}

.dt-default-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 8px;
}

.dt-test {
  margin-top: 8px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-elevated);
}

.dt-test__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.dt-test__head h4 {
  margin: 0;
  font-size: 14px;
}

.dt-test__upload {
  width: 100%;
  justify-content: center;
}

.dt-test__result {
  margin-top: 12px;
  border-top: 1px solid var(--border-color);
  padding-top: 10px;
}

.dt-test__meta {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.dt-test__error {
  color: var(--error-color, #d03050);
  font-size: 13px;
}

.dt-test__fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dt-test__row {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.dt-test__key {
  color: var(--text-secondary);
  min-width: 120px;
  flex-shrink: 0;
  font-weight: 500;
}

.dt-test__val {
  color: var(--text-primary);
  word-break: break-word;
}

.dt-test__empty {
  font-size: 12px;
  color: var(--text-secondary);
  font-style: italic;
}

.dt-edit__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dt-edit__footer-end {
  display: flex;
  gap: 8px;
  margin-inline-start: auto;
}

.dt-spin {
  animation: dt-spin 0.8s linear infinite;
}

@keyframes dt-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .dt-toolbar__search {
    max-width: none;
    width: 100%;
  }

  .dt-actions {
    width: 100%;
  }

  .dt-actions .btn {
    flex: 1;
    justify-content: center;
  }

  .dt-edit__grid,
  .dt-field__row {
    grid-template-columns: 1fr;
  }

  .dt-edit__footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .dt-edit__footer-end {
    width: 100%;
    margin: 0;
  }

  .dt-edit__footer-end .btn,
  .dt-edit__footer > .btn {
    flex: 1;
    justify-content: center;
  }
}

:deep(.dt-edit-modal .n-card__content) {
  padding-top: 12px;
}
</style>
